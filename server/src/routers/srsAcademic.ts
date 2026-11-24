import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createRouter, authedQuery, roleQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, oneToOneSessions, attendance } from "@db/schema";
import {
  admissions, teacherAssignments, courseExtensions, teacherAvailability, supportRequests, timetableSlots, auditLogs, courseAllocations,
} from "@db/srs-schema";
import { audit } from "../lib/audit";
import { getBalance } from "../lib/balance";
import { getNumberSetting } from "../lib/settings";
import { currentStudentRate, setStudentRate } from "./srsFinance";
import { setAdmissionStatus } from "./srsAdmissions";
import { NotificationService } from "../lib/notificationService";

const heads = ["admin", "academic_head"];
const deptOf = (u: any): "english" | "hindi" | null => {
  const d = (u?.department || "").toLowerCase();
  return d.includes("hindi") ? "hindi" : d.includes("english") ? "english" : null;
};
const CHANGE_REASONS = ["student_request", "teacher_resigned", "teacher_health", "teacher_unavailable", "performance", "administrative", "other"] as const;

/** Academic heads only act inside their own department; admin/super_admin see everything. */
async function guardDepartment(db: any, user: { id: number; role: string }, studentUserId: number) {
  if (user.role !== "academic_head") return;
  const me = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  const st = await db.query.users.findFirst({ where: eq(users.id, studentUserId) });
  const mine = deptOf(me), theirs = deptOf(st);
  if (mine && theirs && mine !== theirs) throw new TRPCError({ code: "FORBIDDEN", message: "This student belongs to the other department" });
}

export const srsAcademicRouter = createRouter({
  /** Students awaiting assignment (payment verified) for the head's department. */
  awaitingAssignment: roleQuery(...heads).query(async ({ ctx }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const d = ctx.user.role === "academic_head" ? deptOf(me) : null;
    const rows = await db.select().from(admissions).where(and(eq(admissions.status, "awaiting_assignment"), d ? eq(admissions.department, d) : undefined)).orderBy(admissions.createdAt);
    return rows;
  }),

  /** Teachers of a department (dual-department teachers included) with availability and current load (SRS 6.2, 15). */
  teachersForDepartment: roleQuery(...heads).input(z.object({ department: z.enum(["english", "hindi"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
      const dep = input?.department || (ctx.user.role === "academic_head" ? deptOf(me) : null);
      const teachers = await db.select().from(users).where(and(eq(users.role, "teacher"), eq(users.status, "active")));
      const wanted = teachers.filter((t: any) => {
        if (!dep) return true;
        const d = (t.department || "").toLowerCase();
        return !d || d.includes(dep) || d.includes("both"); // unknown dept = available to both
      });
      const ids = wanted.map((t: any) => t.id);
      if (!ids.length) return [];
      const avail = await db.select().from(teacherAvailability).where(and(inArray(teacherAvailability.teacherId, ids), eq(teacherAvailability.status, "approved")));
      const load = await db.select({ teacherId: teacherAssignments.teacherId, n: sql<number>`count(*)` }).from(teacherAssignments)
        .where(and(inArray(teacherAssignments.teacherId, ids), isNull(teacherAssignments.endedAt))).groupBy(teacherAssignments.teacherId);
      return wanted.map((t: any) => ({
        id: t.id, name: t.name, phone: t.phone, department: t.department,
        availability: avail.filter((a: any) => a.teacherId === t.id).slice(-1)[0] || null,
        students: Number(load.find((l: any) => l.teacherId === t.id)?.n || 0),
      }));
    }),

  /** First assignment. Needs a verified payment for admission-based students (SRS 5.1). */
  assignTeacher: roleQuery(...heads).input(z.object({
    studentUserId: z.number(), teacherId: z.number(), admissionId: z.number().optional(),
    preferredTiming: z.string().optional(), durationMinutes: z.number().int().optional(), payPerClass: z.number().nonnegative().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await guardDepartment(db, ctx.user, input.studentUserId);
    if (input.admissionId) {
      const [a] = await db.select().from(admissions).where(eq(admissions.id, input.admissionId));
      if (!a || !["awaiting_assignment", "payment_verified", "teacher_assigned", "active"].includes(a.status))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment must be verified before a teacher can be assigned" });
    }
    const bal = await getBalance(db, input.studentUserId);
    await db.update(teacherAssignments).set({ endedAt: new Date() }).where(and(eq(teacherAssignments.studentUserId, input.studentUserId), isNull(teacherAssignments.endedAt)));
    await db.insert(teacherAssignments).values({
      studentUserId: input.studentUserId, teacherId: input.teacherId, preferredTiming: input.preferredTiming, durationMinutes: input.durationMinutes,
      classesAtStart: bal.balance, reason: "initial", assignedBy: ctx.user.id,
    });
    if (input.payPerClass != null) await setStudentRate(db, ctx.user, input.teacherId, input.studentUserId, input.payPerClass);
    if (input.admissionId) await setAdmissionStatus(db, input.admissionId, "teacher_assigned", ctx.user.id);
    await audit(db, ctx.user, "teacher_assigned", "student", input.studentUserId, null, { teacherId: input.teacherId });
    const t = await db.query.users.findFirst({ where: eq(users.id, input.teacherId) });
    await NotificationService.dispatch({ userId: input.studentUserId, subject: "Teacher assigned", message: `Your teacher is ${t?.name}.`, type: "teacher_assigned", channels: ["in_app", "email"] }).catch(() => {});
    await NotificationService.dispatch({ userId: input.teacherId, subject: "New student assigned", message: "A new student has been assigned to you.", type: "teacher_assigned", channels: ["in_app"] }).catch(() => {});
    return { ok: true };
  }),

  /** SRS 6.3: replacing the teacher keeps the same course, ID and balance. Only the teacher on future classes changes. */
  changeTeacher: roleQuery(...heads).input(z.object({
    studentUserId: z.number(), newTeacherId: z.number(), reason: z.enum(CHANGE_REASONS), reasonNote: z.string().optional(), payPerClass: z.number().nonnegative().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await guardDepartment(db, ctx.user, input.studentUserId);
    const [cur] = await db.select().from(teacherAssignments).where(and(eq(teacherAssignments.studentUserId, input.studentUserId), isNull(teacherAssignments.endedAt)));
    if (cur?.teacherId === input.newTeacherId) throw new TRPCError({ code: "BAD_REQUEST", message: "This teacher is already assigned" });
    const before = await getBalance(db, input.studentUserId);
    await db.update(teacherAssignments).set({ endedAt: new Date() }).where(and(eq(teacherAssignments.studentUserId, input.studentUserId), isNull(teacherAssignments.endedAt)));
    await db.insert(teacherAssignments).values({
      studentUserId: input.studentUserId, teacherId: input.newTeacherId, department: cur?.department, preferredTiming: cur?.preferredTiming,
      durationMinutes: cur?.durationMinutes, classesAtStart: before.balance, reason: input.reason, reasonNote: input.reasonNote, assignedBy: ctx.user.id,
    });
    if (input.payPerClass != null) await setStudentRate(db, ctx.user, input.newTeacherId, input.studentUserId, input.payPerClass);
    // future scheduled sessions and timetable move to the new teacher; completed ones stay with the old teacher
    await db.update(oneToOneSessions).set({ teacherId: input.newTeacherId })
      .where(and(eq(oneToOneSessions.studentId, input.studentUserId), eq(oneToOneSessions.status, "scheduled"), gte(oneToOneSessions.scheduledAt, new Date())));
    await db.update(timetableSlots).set({ teacherId: input.newTeacherId }).where(and(eq(timetableSlots.studentUserId, input.studentUserId), eq(timetableSlots.active, true)));
    const after = await getBalance(db, input.studentUserId);
    await audit(db, ctx.user, "teacher_changed", "student", input.studentUserId, { teacherId: cur?.teacherId, balance: before.balance }, { teacherId: input.newTeacherId, balance: after.balance }, `${input.reason}${input.reasonNote ? ": " + input.reasonNote : ""}`);
    return { ok: true, balance: after.balance };
  }),

  /** Every teacher assignment ever made (SRS 6.3), for the Teacher changes page: a log and a per-student view. Heads see their own department. */
  changeHistory: roleQuery(...heads, "accountant").query(async ({ ctx }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const dep = ctx.user.role === "academic_head" ? deptOf(me) : null;
    const rows = (await db.execute(sql`select a.id, a.student_user_id "studentId", st.name student, p.enrollment_id "enrollmentId", p.department, a.teacher_id "teacherId", t.name teacher,
        a.reason, a.reason_note "reasonNote", a.classes_at_start "classesAtStart", a.started_at "startedAt", a.ended_at "endedAt", ab.name "assignedBy"
      from teacher_assignments a join users st on st.id=a.student_user_id join users t on t.id=a.teacher_id left join profiles p on p.user_id=st.id left join users ab on ab.id=a.assigned_by
      where ${dep ? sql`coalesce(p.department,'') ilike ${"%" + dep + "%"}` : sql`true`} order by a.started_at desc limit 5000`)).rows;
    return rows as any[];
  }),

  assignmentHistory: authedQuery.input(z.object({ studentUserId: z.number() })).query(async ({ ctx, input }) => {
    if (ctx.user.role === "student" && ctx.user.id !== input.studentUserId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = getDb();
    const rows = await db.select({ a: teacherAssignments, teacherName: users.name }).from(teacherAssignments)
      .leftJoin(users, eq(users.id, teacherAssignments.teacherId)).where(eq(teacherAssignments.studentUserId, input.studentUserId)).orderBy(desc(teacherAssignments.startedAt));
    return rows.map((r: any) => ({ ...r.a, teacherName: r.teacherName }));
  }),

  /** One student's full picture: course record, balance, validity, assignment, last/next class (SRS 12.2, 14). */
  studentOverview: authedQuery.input(z.object({ studentUserId: z.number() })).query(async ({ ctx, input }) => {
    if (ctx.user.role === "student" && ctx.user.id !== input.studentUserId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = getDb();
    const u = await db.query.users.findFirst({ where: eq(users.id, input.studentUserId) });
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, input.studentUserId) });
    if (!u) throw new TRPCError({ code: "NOT_FOUND" });
    const bal = await getBalance(db, input.studentUserId);
    const [cur] = await db.select({ a: teacherAssignments, tn: users.name }).from(teacherAssignments).leftJoin(users, eq(users.id, teacherAssignments.teacherId))
      .where(and(eq(teacherAssignments.studentUserId, input.studentUserId), isNull(teacherAssignments.endedAt)));
    const [next] = await db.select().from(oneToOneSessions).where(and(eq(oneToOneSessions.studentId, input.studentUserId), eq(oneToOneSessions.status, "scheduled"), gte(oneToOneSessions.scheduledAt, new Date()))).orderBy(oneToOneSessions.scheduledAt).limit(1);
    const [last] = await db.select().from(attendance).where(and(eq(attendance.studentId, input.studentUserId), eq(attendance.status, "present"))).orderBy(desc(attendance.attendanceDate)).limit(1);
    const [ad] = await db.select().from(admissions).where(eq(admissions.studentUserId, input.studentUserId)).orderBy(desc(admissions.createdAt)).limit(1);
    const days = bal.validityEndDate ? Math.ceil((new Date(bal.validityEndDate).getTime() - Date.now()) / 86400000) : null;
    const threshold = await getNumberSetting(db, "absent_consecutive_threshold");
    const activity = ((await db.execute(sql`select student_activity(${input.studentUserId}::bigint, ${threshold}::int) a`)).rows[0] as any)?.a || "Active";
    const rate = cur ? await currentStudentRate(db, cur.a.teacherId, input.studentUserId) : null;
    return {
      activity, payPerClass: rate,
      id: u.id, name: u.name, phone: u.phone, email: u.email, enrollmentId: p?.enrollmentId, course: p?.course, department: p?.department || u.department,
      sessionType: p?.sessionType, preferredTiming: p?.preferredClassTime, admissionStatus: ad?.status || null, admissionId: ad?.id || null,
      teacher: cur ? { id: cur.a.teacherId, name: cur.tn } : null, ...bal, remainingDays: days,
      nextClassAt: next?.scheduledAt || null, lastAttendedAt: last?.attendanceDate || null,
    };
  }),

  /** Students of a teacher (SRS 12.2), earliest next class first. */
  myStudents: roleQuery("teacher", "academic_head", "admin").input(z.object({ teacherId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const tid = ctx.user.role === "teacher" ? ctx.user.id : input?.teacherId;
    if (!tid) return [];
    const rows = await db.select({ studentUserId: teacherAssignments.studentUserId }).from(teacherAssignments).where(and(eq(teacherAssignments.teacherId, tid), isNull(teacherAssignments.endedAt)));
    const ids = rows.map((r: any) => r.studentUserId);
    // students assigned the older way (sessions with this teacher) are included too
    const legacy = await db.selectDistinct({ studentUserId: oneToOneSessions.studentId }).from(oneToOneSessions).where(eq(oneToOneSessions.teacherId, tid));
    const all = Array.from(new Set([...ids, ...legacy.map((r: any) => r.studentUserId)]));
    const out: any[] = [];
    for (const sid of all) out.push(await (srsAcademicRouter as any).createCaller({ user: ctx.user }).studentOverview({ studentUserId: sid }).catch(() => null));
    return out.filter(Boolean).sort((a, b) => (a.nextClassAt ? new Date(a.nextClassAt).getTime() : Infinity) - (b.nextClassAt ? new Date(b.nextClassAt).getTime() : Infinity));
  }),

  // ---------- validity (SRS 11) ----------
  extendValidity: roleQuery("admin").input(z.object({
    studentUserId: z.number(), daysToAdd: z.number().int().min(1).max(730), reactivateClasses: z.number().int().min(0).default(0), reason: z.string().trim().min(3),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, input.studentUserId) });
    if (!p) throw new TRPCError({ code: "NOT_FOUND" });
    const base = p.validityEndDate && new Date(p.validityEndDate) > new Date() ? new Date(p.validityEndDate) : new Date();
    const revised = new Date(base.getTime() + input.daysToAdd * 86400000);
    await db.insert(courseExtensions).values({ studentUserId: input.studentUserId, originalExpiry: p.validityEndDate, revisedExpiry: revised, daysAdded: input.daysToAdd, reactivatedClasses: input.reactivateClasses, reason: input.reason, approvedBy: ctx.user.id });
    await db.update(profiles).set({ validityEndDate: revised }).where(eq(profiles.id, p.id));
    if (input.reactivateClasses > 0) {
      await db.insert(courseAllocations).values({ studentUserId: input.studentUserId, kind: "adjustment", classes: input.reactivateClasses, reason: `Reactivated expired classes: ${input.reason}`, createdBy: ctx.user.id } as any);
    }
    await audit(db, ctx.user, "validity_extended", "student", input.studentUserId, { expiry: p.validityEndDate }, { expiry: revised }, input.reason);
    return { revisedExpiry: revised };
  }),
  extensions: roleQuery(...heads, "accountant").input(z.object({ studentUserId: z.number() })).query(async ({ input }) =>
    getDb().select().from(courseExtensions).where(eq(courseExtensions.studentUserId, input.studentUserId)).orderBy(desc(courseExtensions.createdAt))),

  /** Students near expiry / low balance / not attending recently - used by dashboards and alerts. */
  attention: roleQuery(...heads, "teacher").query(async ({ ctx }) => {
    const db = getDb();
    const warn = await getNumberSetting(db, "expiry_alert_days");
    const low = await getNumberSetting(db, "low_balance_threshold");
    const rows = await db.select({ userId: profiles.userId, name: users.name, validityEndDate: profiles.validityEndDate, total: profiles.totalAllocatedSessions, remaining: profiles.totalRemainingSessions, dept: profiles.department })
      .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(and(eq(users.role, "student"), eq(users.status, "active")));
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const dep = ctx.user.role === "academic_head" ? deptOf(me) : null;
    const nearExpiry: any[] = [], lowBalance: any[] = [];
    for (const r of rows) {
      if (dep && deptOf({ department: r.dept }) && deptOf({ department: r.dept }) !== dep) continue;
      const days = r.validityEndDate ? Math.ceil((new Date(r.validityEndDate).getTime() - Date.now()) / 86400000) : null;
      if (days !== null && days <= warn && days >= 0 && (r.total || 0) > 0) nearExpiry.push({ id: r.userId, name: r.name, days });
      if ((r.total || 0) > 0 && (r.remaining || 0) <= low && (r.remaining || 0) > 0) lowBalance.push({ id: r.userId, name: r.name, remaining: r.remaining });
    }
    return { nearExpiry, lowBalance, lowBalanceThreshold: low };
  }),

  // ---------- timetable (SRS 7) ----------
  setTimetable: roleQuery(...heads).input(z.object({
    studentUserId: z.number(), teacherId: z.number(), weekdays: z.array(z.number().min(0).max(6)).min(1), timeOfDay: z.string().regex(/^\d{2}:\d{2}$/), durationMinutes: z.number().int().default(30),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await guardDepartment(db, ctx.user, input.studentUserId);
    // avoid double booking: the same teacher, overlapping time on a shared weekday
    const others = await db.select().from(timetableSlots).where(and(eq(timetableSlots.teacherId, input.teacherId), eq(timetableSlots.active, true)));
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (const o of others) {
      if (o.studentUserId === input.studentUserId) continue;
      const shared = o.weekdays.split(",").map(Number).some((d: number) => input.weekdays.includes(d));
      if (shared && toMin(o.timeOfDay) < toMin(input.timeOfDay) + input.durationMinutes && toMin(input.timeOfDay) < toMin(o.timeOfDay) + o.durationMinutes)
        throw new TRPCError({ code: "CONFLICT", message: `Teacher is already booked at ${o.timeOfDay} on a selected day` });
    }
    await db.update(timetableSlots).set({ active: false }).where(and(eq(timetableSlots.studentUserId, input.studentUserId), eq(timetableSlots.active, true)));
    await db.insert(timetableSlots).values({ studentUserId: input.studentUserId, teacherId: input.teacherId, weekdays: input.weekdays.join(","), timeOfDay: input.timeOfDay, durationMinutes: input.durationMinutes, createdBy: ctx.user.id });
    await audit(db, ctx.user, "timetable_set", "student", input.studentUserId, null, input);
    return { ok: true };
  }),
  holdStudent: roleQuery(...heads).input(z.object({ studentUserId: z.number(), hold: z.boolean(), reason: z.string().trim().min(3) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await guardDepartment(db, ctx.user, input.studentUserId);
    await db.update(timetableSlots).set({ onHold: input.hold }).where(eq(timetableSlots.studentUserId, input.studentUserId));
    const [ad] = await db.select().from(admissions).where(eq(admissions.studentUserId, input.studentUserId)).orderBy(desc(admissions.createdAt)).limit(1);
    if (ad) await setAdmissionStatus(db, ad.id, input.hold ? "on_hold" : "active", ctx.user.id, input.reason);
    await audit(db, ctx.user, input.hold ? "student_on_hold" : "student_resumed", "student", input.studentUserId, null, null, input.reason);
    return { ok: true };
  }),
  timetable: authedQuery.input(z.object({ studentUserId: z.number().optional(), teacherId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const conds: any[] = [eq(timetableSlots.active, true)];
    if (ctx.user.role === "student") conds.push(eq(timetableSlots.studentUserId, ctx.user.id));
    else if (ctx.user.role === "teacher") conds.push(eq(timetableSlots.teacherId, ctx.user.id));
    else { if (input?.studentUserId) conds.push(eq(timetableSlots.studentUserId, input.studentUserId)); if (input?.teacherId) conds.push(eq(timetableSlots.teacherId, input.teacherId)); }
    const rows = await db.select({ s: timetableSlots, sn: sql<string>`(select name from users where id=${timetableSlots.studentUserId})`, tn: sql<string>`(select name from users where id=${timetableSlots.teacherId})` })
      .from(timetableSlots).where(and(...conds)).limit(1000);
    return rows.map((r: any) => ({ ...r.s, studentName: r.sn, teacherName: r.tn }));
  }),

  // ---------- teacher availability (SRS 12.4) ----------
  myAvailability: roleQuery("teacher").query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(teacherAvailability).where(eq(teacherAvailability.teacherId, ctx.user.id)).orderBy(desc(teacherAvailability.createdAt)).limit(5);
  }),
  requestAvailability: roleQuery("teacher").input(z.object({
    workingDays: z.array(z.number().min(0).max(6)), startTime: z.string(), endTime: z.string(), breakStart: z.string().optional(), breakEnd: z.string().optional(), maxWorkload: z.number().int().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.insert(teacherAvailability).values({ teacherId: ctx.user.id, ...input, workingDays: input.workingDays.join(","), status: "pending" } as any);
    return { ok: true };
  }),
  pendingAvailability: roleQuery(...heads).query(async () => {
    const db = getDb();
    const rows = await db.select({ a: teacherAvailability, name: users.name }).from(teacherAvailability).leftJoin(users, eq(users.id, teacherAvailability.teacherId)).where(eq(teacherAvailability.status, "pending"));
    return rows.map((r: any) => ({ ...r.a, teacherName: r.name }));
  }),
  decideAvailability: roleQuery(...heads).input(z.object({ id: z.number(), approve: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.update(teacherAvailability).set({ status: input.approve ? "approved" : "rejected", decidedBy: ctx.user.id }).where(eq(teacherAvailability.id, input.id));
    await audit(db, ctx.user, input.approve ? "availability_approved" : "availability_rejected", "teacher_availability", input.id, null, null);
    return { ok: true };
  }),
  setAvailabilityDirect: roleQuery(...heads).input(z.object({
    teacherId: z.number(), workingDays: z.array(z.number()), startTime: z.string(), endTime: z.string(), breakStart: z.string().optional(), breakEnd: z.string().optional(), maxWorkload: z.number().int().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.insert(teacherAvailability).values({ ...input, workingDays: input.workingDays.join(","), status: "approved", decidedBy: ctx.user.id } as any);
    return { ok: true };
  }),

  // ---------- requests (SRS 12.3, 14) ----------
  createRequest: roleQuery("student", "teacher").input(z.object({
    type: z.enum(["reschedule", "teacher_change", "timing_change", "hold", "technical", "absence", "other"]), message: z.string().trim().min(3),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    let dep = deptOf(me);
    if (ctx.user.role === "student") { const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, ctx.user.id) }); dep = deptOf({ department: p?.department }) || dep; }
    const routedTo = input.type === "technical" ? "admin" : "academic_head";
    await db.insert(supportRequests).values({ fromUserId: ctx.user.id, type: input.type, department: dep, routedTo, message: input.message });
    const targets = await db.select().from(users).where(inArray(users.role, routedTo === "admin" ? ["admin", "super_admin"] : ["academic_head"]));
    for (const t of targets) {
      if (routedTo === "academic_head" && dep && deptOf(t) && deptOf(t) !== dep) continue;
      await NotificationService.dispatch({ userId: t.id, subject: `New request: ${input.type.replace("_", " ")}`, message: `${me?.name}: ${input.message}`, type: "request", channels: ["in_app"] }).catch(() => {});
    }
    return { ok: true };
  }),
  myRequests: authedQuery.query(async ({ ctx }) => getDb().select().from(supportRequests).where(eq(supportRequests.fromUserId, ctx.user.id)).orderBy(desc(supportRequests.createdAt)).limit(100)),
  requests: roleQuery(...heads).input(z.object({ status: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const dep = ctx.user.role === "academic_head" ? deptOf(me) : null;
    const conds: any[] = [];
    if (input?.status) conds.push(eq(supportRequests.status, input.status));
    if (dep) conds.push(sql`(${supportRequests.department} = ${dep} or ${supportRequests.department} is null)`);
    if (ctx.user.role === "academic_head") conds.push(eq(supportRequests.routedTo, "academic_head"));
    const rows = await db.select({ r: supportRequests, name: users.name, role: users.role }).from(supportRequests).leftJoin(users, eq(users.id, supportRequests.fromUserId))
      .where(conds.length ? and(...conds) : undefined).orderBy(desc(supportRequests.createdAt)).limit(300);
    return rows.map((x: any) => ({ ...x.r, fromName: x.name, fromRole: x.role }));
  }),
  resolveRequest: roleQuery(...heads).input(z.object({ id: z.number(), status: z.enum(["resolved", "rejected"]), response: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.update(supportRequests).set({ status: input.status, response: input.response, resolvedBy: ctx.user.id }).where(eq(supportRequests.id, input.id));
    const [r] = await db.select().from(supportRequests).where(eq(supportRequests.id, input.id));
    if (r) await NotificationService.dispatch({ userId: r.fromUserId, subject: `Your request was ${input.status}`, message: input.response || "", type: "request", channels: ["in_app"] }).catch(() => {});
    return { ok: true };
  }),

  /** SRS 19.1 audit log viewer. */
  auditLog: roleQuery("admin").input(z.object({ entity: z.string().optional(), entityId: z.string().optional(), limit: z.number().max(500).default(200) }).optional()).query(async ({ input }) => {
    const db = getDb();
    const conds: any[] = [];
    if (input?.entity) conds.push(eq(auditLogs.entity, input.entity));
    if (input?.entityId) conds.push(eq(auditLogs.entityId, input.entityId));
    return db.select().from(auditLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLogs.createdAt)).limit(input?.limit ?? 200);
  }),
});
