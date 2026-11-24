import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createRouter, publicQuery, roleQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, salesExecutives, payments } from "@db/schema";
import { admissions, admissionStatusHistory, courseAllocations, teacherAssignments, ADMISSION_STATUSES } from "@db/srs-schema";
import { audit } from "../lib/audit";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { updateStudentSessionBalances } from "../lib/sessionHelper";
import { NotificationService } from "../lib/notificationService";
import { creditDemoConversionBonus, setStudentRate } from "./srsFinance";

const staff = ["admin", "accountant", "academic_head"];

export async function setAdmissionStatus(db: any, id: number, to: string, by: number | null, note?: string) {
  const [cur] = await db.select().from(admissions).where(eq(admissions.id, id));
  if (!cur || cur.status === to) return;
  await db.update(admissions).set({ status: to, updatedAt: new Date() }).where(eq(admissions.id, id));
  await db.insert(admissionStatusHistory).values({ admissionId: id, fromStatus: cur.status, toStatus: to, changedBy: by, note: note || null });
}

async function counsellorOf(db: any, userId: number) {
  const [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.userId, userId));
  if (!c) throw new TRPCError({ code: "FORBIDDEN", message: "No counsellor record for this login" });
  return c;
}

const digits = (s: string) => s.replace(/[^\d]/g, "");

export const srsAdmissionsRouter = createRouter({
  statuses: publicQuery.query(() => ADMISSION_STATUSES),

  /** Counsellor: generate a unique registration link (SRS 3.2). */
  createLink: roleQuery("sales_executive", "admin", "academic_head").input(z.object({ department: z.enum(["english", "hindi"]).optional(), counsellorId: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let c: any;
      if (ctx.user.role === "sales_executive") c = await counsellorOf(db, ctx.user.id);
      else {
        if (!input?.counsellorId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the counsellor this student belongs to" });
        [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.id, input.counsellorId));
        if (!c) throw new TRPCError({ code: "BAD_REQUEST", message: "Counsellor not found" });
      }
      const token = crypto.randomBytes(12).toString("hex");
      const [row] = await db.insert(admissions).values({ token, counsellorId: c.id, department: input?.department ?? null }).returning();
      await db.insert(admissionStatusHistory).values({ admissionId: row.id, toStatus: "link_generated", changedBy: ctx.user.id });
      return { id: row.id, token };
    }),

  /** Counsellor sees only own admissions; admin/accountant/head see all (head: own department). */
  list: roleQuery(...staff, "sales_executive").input(z.object({ status: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds: any[] = [];
      if (ctx.user.role === "sales_executive") conds.push(eq(admissions.counsellorId, (await counsellorOf(db, ctx.user.id)).id));
      if (ctx.user.role === "academic_head") {
        const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
        const d = (me?.department || "").toLowerCase();
        if (d.includes("hindi")) conds.push(eq(admissions.department, "hindi"));
        else if (d.includes("english")) conds.push(eq(admissions.department, "english"));
      }
      if (input?.status) conds.push(eq(admissions.status, input.status));
      if (input?.search) conds.push(sql`(${admissions.fullName} ilike ${"%" + input.search + "%"} or ${admissions.mobile} ilike ${"%" + input.search + "%"})`);
      const rows = await db.select({
        a: admissions, counsellorName: salesExecutives.name, counsellorPhone: salesExecutives.phone, counsellorEmpId: salesExecutives.employeeId,
      }).from(admissions).leftJoin(salesExecutives, eq(salesExecutives.id, admissions.counsellorId))
        .where(conds.length ? and(...conds) : undefined).orderBy(desc(admissions.createdAt)).limit(500);
      return rows.map((r: any) => ({ ...r.a, counsellorName: r.counsellorName, counsellorPhone: r.counsellorPhone, counsellorEmpId: r.counsellorEmpId }));
    }),

  history: roleQuery(...staff, "sales_executive").input(z.object({ admissionId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(admissionStatusHistory).where(eq(admissionStatusHistory.admissionId, input.admissionId)).orderBy(admissionStatusHistory.createdAt);
  }),

  /** Public: the form page shows the counsellor details fetched from the link (SRS 3.2). */
  publicGet: publicQuery.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.token, input.token));
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "This registration link is not valid" });
    const [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.id, a.counsellorId));
    return { status: a.status, department: a.department, done: a.status !== "link_generated",
      counsellor: c ? { employeeId: c.employeeId, name: c.name, phone: c.phone } : null };
  }),

  /** Public: the student completes the registration form. Duplicate mobile -> flagged for admin, never auto-created. */
  publicSubmit: publicQuery.input(z.object({
    token: z.string(),
    fullName: z.string().trim().min(2), mobile: z.string().trim().min(7), whatsapp: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    gender: z.string().optional(), dateOfBirth: z.string().optional(),
    place: z.string().trim().min(1), state: z.string().trim().min(1), country: z.string().trim().min(1),
    department: z.enum(["english", "hindi"]), preferredTiming: z.string().trim().min(1), sessionType: z.enum(["individual", "group"]),
    amountPaid: z.number().positive(), paymentDate: z.string().min(1), paymentMethod: z.string().min(1),
    transactionRef: z.string().trim().min(1), receiptUrl: z.string().min(1),
    documents: z.array(z.object({ name: z.string(), url: z.string(), type: z.string().optional() })).max(6).default([]),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.token, input.token));
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "This registration link is not valid" });
    if (a.status !== "link_generated") throw new TRPCError({ code: "CONFLICT", message: "This link has already been used" });

    const mobile = digits(input.mobile);
    const dup = await db.query.users.findFirst({ where: sql`regexp_replace(coalesce(${users.phone},''), '[^0-9]', '', 'g') = ${mobile} or ${users.phoneNumber} = ${mobile}` });
    let studentUserId: number | null = null;
    if (!dup) {
      const enrollmentId = await generateNextEnrollmentId();
      const pwd = String(Math.floor(100000 + Math.random() * 900000));
      const [u] = await db.insert(users).values({
        unionId: `student-${enrollmentId}`, username: enrollmentId, password: await bcrypt.hash(pwd, 10), rawPassword: pwd,
        name: input.fullName, email: input.email || null, phone: mobile, role: "student", status: "active",
        gender: input.gender || null, address: [input.place, input.state, input.country].join(", "),
        salesExecutiveId: a.counsellorId, registrationSource: "counsellor_link", mustChangePassword: false,
        department: input.department === "hindi" ? "Spoken Hindi" : "Spoken English",
      } as any).returning();
      await db.insert(profiles).values({
        userId: u.id, enrollmentId, course: input.department === "hindi" ? "Spoken Hindi" : "Spoken English",
        sessionType: input.sessionType === "group" ? "group" : "one_to_one", preferredClassTime: input.preferredTiming,
        oneOnOneEnabled: input.sessionType === "individual", groupSessionEnabled: input.sessionType === "group",
        department: input.department === "hindi" ? "Spoken Hindi" : "Spoken English",
      } as any);
      studentUserId = u.id;
    }

    await db.update(admissions).set({
      studentUserId, duplicateOfUserId: dup?.id ?? null, fullName: input.fullName, mobile, whatsapp: input.whatsapp || mobile,
      email: input.email || null, gender: input.gender || null, dateOfBirth: input.dateOfBirth || null,
      place: input.place, state: input.state, country: input.country, department: input.department,
      preferredTiming: input.preferredTiming, sessionType: input.sessionType, amountPaid: String(input.amountPaid),
      paymentDate: input.paymentDate, paymentMethod: input.paymentMethod, transactionRef: input.transactionRef, receiptUrl: input.receiptUrl,
      updatedAt: new Date(), documents: input.documents.map((d) => ({ ...d, by: null, at: new Date().toISOString() })),
    }).where(eq(admissions.id, a.id));
    await setAdmissionStatus(db, a.id, "registration_completed", null, dup ? "Mobile already exists - flagged for admin review" : undefined);
    await setAdmissionStatus(db, a.id, "payment_pending_verification", null);

    // notify admins + accountants
    const staffUsers = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "accountant", "super_admin"]));
    for (const s of staffUsers) {
      await NotificationService.dispatch({ userId: s.id, subject: "New registration - payment awaiting verification",
        message: `${input.fullName} (${mobile}) registered. Payment of ${input.amountPaid} is awaiting verification.`, type: "admission", channels: ["in_app"] }).catch(() => {});
    }
    return { ok: true, flaggedDuplicate: !!dup };
  }),

  /**
   * Admin: enrol a student directly in ONE step (the original "Add student" flow): personal details, course, counsellor,
   * payment, class allocation and optionally the teacher. Everything still goes through the SRS records, so the student is
   * traceable from counsellor and payment through allocation to teacher, with a full audit trail and status history.
   */
  addStudent: roleQuery("admin", "academic_head", "sales_executive").input(z.object({
    name: z.string().trim().min(2), mobile: z.string().trim().min(7), whatsapp: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    gender: z.string().optional(), dateOfBirth: z.string().optional(),
    place: z.string().trim().optional(), state: z.string().trim().optional(), country: z.string().trim().optional(),
    address: z.string().trim().optional(), postalCode: z.string().trim().optional(),
    parentName: z.string().trim().optional(), parentPhone: z.string().trim().optional(),
    department: z.enum(["english", "hindi"]), sessionType: z.enum(["individual", "group"]), preferredTiming: z.string().trim().min(1),
    counsellorId: z.number().optional(),
    documents: z.array(z.object({ name: z.string(), url: z.string(), type: z.string().optional() })).default([]),
    payPerClass: z.number().nonnegative().optional(),
    enrollmentId: z.string().trim().optional(), username: z.string().trim().optional(), password: z.string().trim().min(6).optional(),
    amountPaid: z.number().nonnegative(), paymentDate: z.string().optional(), paymentMethod: z.string().optional(), transactionRef: z.string().optional(), receiptUrl: z.string().optional(),
    classes: z.number().int().min(0).default(0), durationMinutes: z.number().int().min(10).max(240).default(30), specialConditions: z.string().optional(),
    validityEndDate: z.string().optional(), teacherId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const mobile = digits(input.mobile);
    const dup = await db.query.users.findFirst({ where: sql`regexp_replace(coalesce(${users.phone},''), '[^0-9]', '', 'g') = ${mobile} or ${users.phoneNumber} = ${mobile}` });
    if (dup) throw new TRPCError({ code: "CONFLICT", message: `This mobile number already belongs to ${dup.name}. Open that student instead of creating a second record.` });
    // Who is adding decides how far the admission goes: only an administrator may verify the payment, allocate and assign at entry.
    // Counsellors and academic heads register the student and the payment; finance verifies, then the academic head allocates and assigns.
    const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
    const counsellorId = ctx.user.role === "sales_executive" ? (await counsellorOf(db, ctx.user.id)).id : input.counsellorId;
    const [counsellor] = counsellorId ? await db.select().from(salesExecutives).where(eq(salesExecutives.id, counsellorId)) : [];
    if (!counsellor) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the counsellor who enrolled this student" });
    if (!isAdmin && !(input.amountPaid > 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the amount paid so finance can verify it" });
    input.counsellorId = counsellor.id;
    let enrollmentId = input.enrollmentId ? input.enrollmentId.toUpperCase() : await generateNextEnrollmentId();
    if (await db.query.profiles.findFirst({ where: eq(profiles.enrollmentId, enrollmentId) })) throw new TRPCError({ code: "CONFLICT", message: `Student ID ${enrollmentId} is already in use` });
    const username = input.username || enrollmentId;
    if (await db.query.users.findFirst({ where: eq(users.username, username) })) throw new TRPCError({ code: "CONFLICT", message: `Username ${username} is already taken` });
    if (isAdmin && input.teacherId && !input.classes) throw new TRPCError({ code: "BAD_REQUEST", message: "Allocate classes before assigning a teacher" });
    const pwd = input.password || String(Math.floor(100000 + Math.random() * 900000));
    const dept = input.department === "hindi" ? "Spoken Hindi" : "Spoken English";
    const address = input.address || [input.place, input.state, input.country].filter(Boolean).join(", ");

    const [u] = await db.insert(users).values({
      unionId: `student-${enrollmentId}`, username, password: await bcrypt.hash(pwd, 10), rawPassword: pwd,
      name: input.name, email: input.email || null, phone: mobile, role: "student", status: "active",
      gender: input.gender || null, dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null, address: address || null, postalCode: input.postalCode || null,
      salesExecutiveId: input.counsellorId, registrationSource: "admin_direct", mustChangePassword: false, department: dept,
    } as any).returning();
    await db.insert(profiles).values({
      userId: u.id, enrollmentId, course: dept, department: dept, sessionType: input.sessionType === "group" ? "group" : "one_to_one", preferredClassTime: input.preferredTiming,
      oneOnOneEnabled: input.sessionType === "individual", groupSessionEnabled: input.sessionType === "group",
      gender: input.gender || null, dob: input.dateOfBirth ? new Date(input.dateOfBirth) : null, address: address || null, postalCode: input.postalCode || null,
      parentName: input.parentName || null, parentPhone: input.parentPhone || null,
      validityEndDate: input.validityEndDate ? new Date(input.validityEndDate) : null,
    } as any);
    const paid = input.amountPaid > 0;
    const [a] = await db.insert(admissions).values({
      token: crypto.randomBytes(12).toString("hex"), counsellorId: input.counsellorId, studentUserId: u.id, status: "link_generated",
      department: input.department, sessionType: input.sessionType, preferredTiming: input.preferredTiming, fullName: input.name, mobile,
      whatsapp: digits(input.whatsapp || "") || mobile, email: input.email || null, gender: input.gender || null, dateOfBirth: input.dateOfBirth || null,
      place: input.place || null, state: input.state || null, country: input.country || null,
      amountPaid: String(input.amountPaid), paymentDate: input.paymentDate || null, paymentMethod: input.paymentMethod || null,
      transactionRef: input.transactionRef || null, receiptUrl: input.receiptUrl || null,
      documents: input.documents.map((d) => ({ ...d, by: ctx.user.id, at: new Date().toISOString() })),
    } as any).returning();
    const by = ctx.user.id;
    await setAdmissionStatus(db, a.id, "registration_completed", by, "Added directly by admin");
    await setAdmissionStatus(db, a.id, "payment_pending_verification", by);
    if (!isAdmin) {
      await audit(db, ctx.user, "student_added", "student", u.id, null, { enrollmentId, counsellorId: counsellor.id, amountPaid: input.amountPaid, addedBy: ctx.user.role });
      const fin = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "accountant", "super_admin"]));
      for (const s of fin) await NotificationService.dispatch({ userId: s.id, subject: "New registration - payment awaiting verification", message: `${input.name} (${mobile}) was added. Payment of ${input.amountPaid} is awaiting verification.`, type: "admission", channels: ["in_app"] }).catch(() => {});
      await NotificationService.dispatch({ userId: u.id, subject: "Welcome to EMTEES Academy", message: `Your login: ${username} / ${pwd}. Student ID ${enrollmentId}.`, type: "registration", channels: ["in_app", "email"] }).catch(() => {});
      return { id: u.id, admissionId: a.id, enrollmentId, username, password: pwd, status: "payment_pending_verification" };
    }
    await db.update(admissions).set({ verifiedAmount: String(input.amountPaid), verifiedBy: by, verifiedAt: new Date() }).where(eq(admissions.id, a.id));
    if (paid) await db.insert(payments).values({ studentId: u.id, amount: String(input.amountPaid), type: "tuition", status: "paid", paidAt: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      transactionId: input.transactionRef || null, notes: `Admission #${a.id} added by admin (${input.paymentMethod || "payment"})` } as any);
    await setAdmissionStatus(db, a.id, "payment_verified", by, "Verified by admin at entry");
    await setAdmissionStatus(db, a.id, "awaiting_assignment", by);
    await audit(db, ctx.user, "student_added_by_admin", "student", u.id, null, { enrollmentId, counsellorId: input.counsellorId, amountPaid: input.amountPaid, classes: input.classes });

    if (input.classes > 0) {
      await db.insert(courseAllocations).values({ studentUserId: u.id, admissionId: a.id, kind: "initial", classes: input.classes, durationMinutes: input.durationMinutes,
        sessionType: input.sessionType, amount: String(input.amountPaid), specialConditions: input.specialConditions || null, createdBy: by } as any);
      const col = input.sessionType === "group" ? { allocatedGroupSessions: input.classes } : { allocatedOneToOneSessions: input.classes };
      await db.update(profiles).set({ ...col, totalAllocatedSessions: input.classes } as any).where(eq(profiles.userId, u.id));
      await audit(db, ctx.user, "class_allocation_initial", "student", u.id, null, { classes: input.classes, duration: input.durationMinutes, sessionType: input.sessionType });
      await updateStudentSessionBalances(db, u.id).catch(() => {});
    }
    if (input.teacherId) {
      await db.insert(teacherAssignments).values({ studentUserId: u.id, teacherId: input.teacherId, preferredTiming: input.preferredTiming, durationMinutes: input.durationMinutes,
        classesAtStart: input.classes, reason: "initial", assignedBy: by } as any);
      await setAdmissionStatus(db, a.id, "teacher_assigned", by);
      if (input.payPerClass != null) await setStudentRate(db, ctx.user, input.teacherId, u.id, input.payPerClass);
      await audit(db, ctx.user, "teacher_assigned", "student", u.id, null, { teacherId: input.teacherId });
      await NotificationService.dispatch({ userId: input.teacherId, subject: "New student assigned", message: `${input.name} has been assigned to you.`, type: "teacher_assigned", channels: ["in_app"] }).catch(() => {});
    }
    await NotificationService.dispatch({ userId: u.id, subject: "Welcome to EMTEES Academy", message: `Your login: ${username} / ${pwd}. Student ID ${enrollmentId}.`, type: "registration", channels: ["in_app", "email"] }).catch(() => {});
    return { id: u.id, admissionId: a.id, enrollmentId, username, password: pwd, status: input.teacherId ? "teacher_assigned" : "awaiting_assignment" };
  }),

  /** Accountant: approve (with the verified amount) or reject. Verification is mandatory before assignment (SRS 5.1). */
  verifyPayment: roleQuery("accountant", "admin").input(z.object({
    admissionId: z.number(), approve: z.boolean(), verifiedAmount: z.number().nonnegative().optional(), reason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.id, input.admissionId));
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Admission not found" });
    if (a.status !== "payment_pending_verification") throw new TRPCError({ code: "BAD_REQUEST", message: "This payment is not awaiting verification" });
    if (a.duplicateOfUserId && !a.duplicateResolved) throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate mobile number - an admin must resolve it first" });
    if (!input.approve) {
      if (!input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Give a reason for rejecting" });
      await db.update(admissions).set({ rejectReason: input.reason, verifiedBy: ctx.user.id, verifiedAt: new Date() }).where(eq(admissions.id, a.id));
      await setAdmissionStatus(db, a.id, "registration_completed", ctx.user.id, `Payment rejected: ${input.reason}`);
      await audit(db, ctx.user, "payment_rejected", "admission", a.id, { amount: a.amountPaid }, null, input.reason);
      return { ok: true, status: "registration_completed" };
    }
    const amount = input.verifiedAmount ?? Number(a.amountPaid);
    await db.update(admissions).set({ verifiedAmount: String(amount), verifiedBy: ctx.user.id, verifiedAt: new Date(), rejectReason: null }).where(eq(admissions.id, a.id));
    if (a.studentUserId) {
      await db.insert(payments).values({ studentId: a.studentUserId, amount: String(amount), type: "tuition", status: "paid",
        paidAt: new Date(), transactionId: a.transactionRef, notes: `Verified admission #${a.id} (${a.paymentMethod})` } as any);
    }
    await setAdmissionStatus(db, a.id, "payment_verified", ctx.user.id);
    await setAdmissionStatus(db, a.id, "awaiting_assignment", ctx.user.id, "Awaiting class allocation and teacher assignment");
    await creditDemoConversionBonus(db, a.id).catch((e: any) => console.error("[demo bonus]", e));
    await audit(db, ctx.user, "payment_approved", "admission", a.id, { claimed: a.amountPaid }, { verified: amount }, input.reason);
    if (a.studentUserId) await NotificationService.dispatch({ userId: a.studentUserId, subject: "Payment verified",
      message: "Your payment has been verified. Your teacher will be assigned shortly.", type: "payment_verified", channels: ["in_app", "email"] }).catch(() => {});
    return { ok: true, status: "awaiting_assignment" };
  }),

  /** Admin: duplicate mobile review - link to the existing student or create a separate one. */
  resolveDuplicate: roleQuery("admin").input(z.object({ admissionId: z.number(), useExisting: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.id, input.admissionId));
    if (!a?.duplicateOfUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "Not a duplicate" });
    if (input.useExisting) {
      await db.update(admissions).set({ studentUserId: a.duplicateOfUserId, duplicateResolved: true }).where(eq(admissions.id, a.id));
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Creating a separate record for a shared mobile is not allowed; link to the existing student." });
    }
    await audit(db, ctx.user, "duplicate_resolved", "admission", a.id, { duplicateOf: a.duplicateOfUserId }, { linkedTo: a.duplicateOfUserId });
    return { ok: true };
  }),

  /** Admin: manual class allocation, with reason + history (SRS 5.2, 10). Additional payments add allocations. */
  allocate: roleQuery("admin", "academic_head").input(z.object({
    studentUserId: z.number(), admissionId: z.number().optional(), kind: z.enum(["initial", "additional", "adjustment"]),
    classes: z.number().int().refine((n) => n !== 0, "Enter a number of classes"), durationMinutes: z.number().int().min(10).max(240),
    sessionType: z.enum(["individual", "group"]), amount: z.number().optional(), specialConditions: z.string().optional(), reason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (input.kind !== "initial" && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required for additional classes and adjustments" });
    if (input.admissionId) {
      const [a] = await db.select().from(admissions).where(eq(admissions.id, input.admissionId));
      if (!a || ["link_generated", "registration_completed", "payment_pending_verification"].includes(a.status))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment must be verified before allocating classes" });
    }
    const [row] = await db.insert(courseAllocations).values({ ...input, amount: input.amount != null ? String(input.amount) : null, createdBy: ctx.user.id } as any).returning();
    // Keep the legacy profile totals + ledger in step so the mobile app and old reports agree.
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, input.studentUserId) });
    if (profile) {
      const col = input.sessionType === "group" ? { allocatedGroupSessions: (profile.allocatedGroupSessions || 0) + input.classes } : { allocatedOneToOneSessions: (profile.allocatedOneToOneSessions || 0) + input.classes };
      await db.update(profiles).set({ ...col, totalAllocatedSessions: (profile.totalAllocatedSessions || 0) + input.classes } as any).where(eq(profiles.id, profile.id));
    }
    await audit(db, ctx.user, "class_allocation_" + input.kind, "student", input.studentUserId, null, { classes: input.classes, duration: input.durationMinutes, sessionType: input.sessionType }, input.reason);
    if (input.admissionId) await setAdmissionStatus(db, input.admissionId, "awaiting_assignment", ctx.user.id, `Allocated ${input.classes} classes`);
    await updateStudentSessionBalances(db, input.studentUserId).catch(() => {});
    return { id: row.id };
  }),

  /** All documents of a student: the payment receipt plus any extra files, newest first. */
  documentsFor: roleQuery(...staff, "sales_executive").input(z.object({ studentUserId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const rows = await db.select().from(admissions).where(eq(admissions.studentUserId, input.studentUserId)).orderBy(desc(admissions.createdAt));
    const out: { name: string; url: string; type: string; at?: string }[] = [];
    for (const a of rows as any[]) {
      if (a.receiptUrl) out.push({ name: "Payment receipt", url: a.receiptUrl, type: "payment_receipt", at: a.createdAt });
      for (const d of (a.documents as any[]) || []) out.push({ name: d.name, url: d.url, type: d.type || "other", at: d.at });
    }
    return out;
  }),
  addDocument: roleQuery("admin", "academic_head", "accountant", "sales_executive").input(z.object({ studentUserId: z.number(), name: z.string().trim().min(1), url: z.string().min(1), type: z.string().default("other") })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.studentUserId, input.studentUserId)).orderBy(desc(admissions.createdAt)).limit(1);
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "This student has no admission record" });
    const docs = [...(((a as any).documents as any[]) || []), { name: input.name, url: input.url, type: input.type, by: ctx.user.id, at: new Date().toISOString() }];
    await db.update(admissions).set({ documents: docs } as any).where(eq(admissions.id, a.id));
    await audit(db, ctx.user, "document_added", "student", input.studentUserId, null, { name: input.name, type: input.type });
    return { ok: true };
  }),

  allocations: roleQuery(...staff, "teacher").input(z.object({ studentUserId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(courseAllocations).where(eq(courseAllocations.studentUserId, input.studentUserId)).orderBy(desc(courseAllocations.createdAt));
  }),

  setStatus: roleQuery("admin", "academic_head").input(z.object({ admissionId: z.number(), status: z.enum(ADMISSION_STATUSES), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [a] = await db.select().from(admissions).where(eq(admissions.id, input.admissionId));
      await setAdmissionStatus(db, input.admissionId, input.status, ctx.user.id, input.reason);
      await audit(db, ctx.user, "admission_status", "admission", input.admissionId, { status: a?.status }, { status: input.status }, input.reason);
      return { ok: true };
    }),
});
