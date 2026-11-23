import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createRouter, roleQuery, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, salesExecutives, systemSettings, profiles } from "@db/schema";
import { staffProfiles, admissions } from "@db/srs-schema";
import { audit } from "../lib/audit";
import { getNextUniqueId } from "../lib/idGenerator";

/** SRS 19: every admin-configurable value, with its default. Numbers and yes/no switches. */
export const CONFIG = {
  class_duration_threshold: { label: "Minimum qualifying minutes for one class", def: "20", type: "number" },
  default_class_duration: { label: "Standard class duration (minutes)", def: "30", type: "number" },
  reconnection_window_minutes: { label: "Reconnection time limit (minutes)", def: "5", type: "number" },
  course_validity_days: { label: "Course validity (days from first class)", def: "60", type: "number" },
  rate_regular_30min: { label: "Default pay for a 30-minute individual class (₹)", def: "75", type: "number" },
  rate_demo: { label: "Demo pay — completed demo (₹)", def: "50", type: "number" },
  rate_demo_bonus: { label: "Demo conversion bonus (₹, paid once)", def: "100", type: "number" },
  expiry_alert_days: { label: "Warn about expiry this many days before", def: "7", type: "number" },
  low_balance_threshold: { label: "Low class balance (classes left)", def: "3", type: "number" },
  absent_consecutive_threshold: { label: "Consecutive absences before alert", def: "7", type: "number" },
  auto_expire_classes: { label: "Automatically write off unused classes after validity ends", def: "no", type: "toggle" },
  meet_fallback_enabled: { label: "Allow Google Meet fallback (manual class records)", def: "yes", type: "toggle" },
  notify_email: { label: "Send email notifications", def: "yes", type: "toggle" },
  notify_whatsapp: { label: "Send WhatsApp notifications (needs API access)", def: "no", type: "toggle" },
  video_start_muted: { label: "Video classroom: join with microphone muted", def: "no", type: "toggle" },
  video_start_camera_off: { label: "Video classroom: join with camera off", def: "no", type: "toggle" },
  support_phone: { label: "Support phone / WhatsApp number shown to students", def: "", type: "text" },
  support_email: { label: "Support email shown to students", def: "", type: "text" },
} as const;

const ROLES = ["teacher", "accountant", "academic_head", "admin", "counsellor"] as const;
const deptLabel = (d: string[]) => d.map((x) => (x === "hindi" ? "Spoken Hindi" : "Spoken English")).join(", ");

export const srsStaffRouter = createRouter({
  /** Values every signed-in user may read (classroom behaviour and the support contact card). */
  publicConfig: authedQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(systemSettings);
    const m = new Map(rows.map((r: any) => [r.key, r.value]));
    const g = (k: keyof typeof CONFIG) => m.get(k) ?? CONFIG[k].def;
    return { videoStartMuted: g("video_start_muted") === "yes", videoStartCameraOff: g("video_start_camera_off") === "yes", supportPhone: g("support_phone") as string, supportEmail: g("support_email") as string };
  }),
  configGet: roleQuery("admin").query(async () => {
    const db = getDb();
    const rows = await db.select().from(systemSettings);
    const m = new Map(rows.map((r: any) => [r.key, r.value]));
    return Object.entries(CONFIG).map(([key, c]) => ({ key, label: c.label, type: c.type, value: m.get(key) ?? c.def }));
  }),
  configSave: roleQuery("admin").input(z.object({ values: z.record(z.string(), z.string()), reason: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const prevRows = await db.select().from(systemSettings);
    const prev = new Map(prevRows.map((r: any) => [r.key, r.value]));
    const changed: Record<string, { from: string | undefined; to: string }> = {};
    for (const [k, v] of Object.entries(input.values)) {
      const c = (CONFIG as any)[k];
      if (!c) continue;
      if (c.type === "number" && !(Number(v) > 0)) throw new TRPCError({ code: "BAD_REQUEST", message: `${c.label}: enter a number above 0` });
      if (c.type === "toggle" && !["yes", "no"].includes(v)) continue;
      if ((prev.get(k) ?? c.def) === v) continue;
      const ex = prev.has(k);
      if (ex) await db.update(systemSettings).set({ value: v, updatedAt: new Date() }).where(eq(systemSettings.key, k));
      else await db.insert(systemSettings).values({ key: k, value: v });
      changed[k] = { from: prev.get(k) ?? c.def, to: v };
    }
    if (Object.keys(changed).length) await audit(db, ctx.user, "settings_changed", "settings", null, Object.fromEntries(Object.entries(changed).map(([k, x]) => [k, x.from])), Object.fromEntries(Object.entries(changed).map(([k, x]) => [k, x.to])), input.reason);
    return { changed: Object.keys(changed).length };
  }),

  /** All staff accounts (everyone except students), with their SRS profile. */
  list: roleQuery("admin", "academic_head").input(z.object({ role: z.string().optional(), search: z.string().optional(), includeStudents: z.boolean().optional() }).optional()).query(async ({ input }) => {
    const db = getDb();
    const conds: any[] = input?.includeStudents ? [] : [ne_student()];
    if (input?.role) conds.push(eq(users.role, input.role === "counsellor" ? "sales_executive" : (input.role as any)));
    if (input?.search) conds.push(or(ilike(users.name, `%${input.search}%`), ilike(users.phone, `%${input.search}%`), ilike(users.username, `%${input.search}%`)));
    const rows = await db.select({ u: users, p: staffProfiles, se: salesExecutives.id }).from(users).leftJoin(staffProfiles, eq(staffProfiles.userId, users.id)).leftJoin(salesExecutives, eq(salesExecutives.userId, users.id)).where(and(...conds)).orderBy(users.role, users.name).limit(1000);
    return rows.map((r: any) => ({
      ...(r.p ?? {}), id: r.u.id, name: r.u.name, username: r.u.username, rawPassword: r.u.rawPassword, role: r.u.role === "sales_executive" ? "counsellor" : r.u.role,
      phone: r.u.phone, email: r.u.email, status: r.u.status, department: r.u.department, id2: r.se ?? undefined,
    }));
  }),

  create: roleQuery("admin").input(z.object({
    role: z.enum(ROLES), name: z.string().trim().min(2), username: z.string().trim().min(3), password: z.string().trim().min(6),
    phone: z.string().trim().min(7), whatsapp: z.string().trim().optional(), email: z.string().trim().email().optional().or(z.literal("")),
    departments: z.array(z.enum(["english", "hindi"])).default([]), qualification: z.string().optional(), languages: z.string().optional(),
    team: z.string().optional(), joiningDate: z.string().optional(), employeeId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (await db.query.users.findFirst({ where: eq(users.username, input.username) })) throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
    if ((input.role === "teacher" || input.role === "academic_head") && !input.departments.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one department" });
    if (input.role === "academic_head" && input.departments.length !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "An Academic Head belongs to exactly one department" });
    const dbRole = input.role === "counsellor" ? "sales_executive" : input.role;
    const employeeId = input.employeeId || (await getNextUniqueId(dbRole));
    const [u] = await db.insert(users).values({
      unionId: `${dbRole}-${employeeId}-${Date.now()}`, username: input.username, password: await bcrypt.hash(input.password, 10), rawPassword: input.password,
      name: input.name, email: input.email || null, phone: input.phone.replace(/[^\d+]/g, ""), role: dbRole as any, status: "active",
      department: input.departments.length ? deptLabel(input.departments) : null,
    } as any).returning();
    if (input.role === "counsellor") {
      await db.insert(salesExecutives).values({
        userId: u.id, employeeId, name: input.name, email: input.email || null, phone: input.phone, username: input.username,
        password: await bcrypt.hash(input.password, 10), referralCode: `REF${crypto.randomBytes(4).toString("hex").toUpperCase()}`, status: "active",
      } as any);
    }
    await db.insert(staffProfiles).values({
      userId: u.id, employeeId, whatsapp: input.whatsapp || input.phone, departments: input.departments.join(","), languages: input.languages, qualification: input.qualification,
      team: input.team, joiningDate: input.joiningDate, employmentStatus: "active",
    });
    await audit(db, ctx.user, "staff_created", "user", u.id, null, { role: input.role, name: input.name });
    return { id: u.id, employeeId };
  }),

  update: roleQuery("admin").input(z.object({
    id: z.number(), name: z.string().trim().min(2).optional(), phone: z.string().optional(), whatsapp: z.string().optional(), email: z.string().optional(),
    password: z.string().min(6).optional(), status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(),
    departments: z.array(z.enum(["english", "hindi"])).optional(), qualification: z.string().optional(), languages: z.string().optional(),
    team: z.string().optional(), joiningDate: z.string().optional(), employmentStatus: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { id, whatsapp, departments, qualification, languages, team, joiningDate, employmentStatus, password, ...base } = input;
    const prev = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!prev) throw new TRPCError({ code: "NOT_FOUND" });
    const set: any = { ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)), updatedAt: new Date() };
    if (departments) set.department = deptLabel(departments);
    if (password) { set.password = await bcrypt.hash(password, 10); set.rawPassword = password; }
    await db.update(users).set(set).where(eq(users.id, id));
    const sp: any = Object.fromEntries(Object.entries({ whatsapp, qualification, languages, team, joiningDate, employmentStatus, departments: departments?.join(",") }).filter(([, v]) => v !== undefined));
    if (Object.keys(sp).length) {
      const ex = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, id));
      if (ex.length) await db.update(staffProfiles).set(sp).where(eq(staffProfiles.userId, id)); else await db.insert(staffProfiles).values({ userId: id, ...sp });
    }
    if (prev.role === "sales_executive") {
      const se: any = {}; if (input.name) se.name = input.name; if (input.phone) se.phone = input.phone; if (input.email !== undefined) se.email = input.email; if (input.status) se.status = input.status === "active" ? "active" : "inactive";
      if (Object.keys(se).length) await db.update(salesExecutives).set(se).where(eq(salesExecutives.userId, id));
    }
    await audit(db, ctx.user, "staff_updated", "user", id, { name: prev.name, status: prev.status }, { ...input, password: password ? "(changed)" : undefined });
    return { ok: true };
  }),

  /** Admin student-account management (SRS 19): search, edit basics, reset password. Passwords stay visible by design (test phase). */
  students: roleQuery("admin", "academic_head", "accountant", "sales_executive").input(z.object({ search: z.string().optional(), limit: z.number().max(300).default(100) }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const conds: any[] = [sql`u.role = 'student'`];
    if (input?.search) { const like = "%" + input.search + "%"; conds.push(sql`(u.name ilike ${like} or u.phone ilike ${like} or exists (select 1 from profiles p2 where p2.user_id=u.id and p2.enrollment_id ilike ${like}))`); }
    if (ctx.user.role === "sales_executive") conds.push(sql`u.sales_executive_id = (select id from sales_executives where user_id=${ctx.user.id})`);
    const rows = await db.execute(sql`select u.id, u.name, u.phone, u.email, u.status, u.username, u.raw_password, p.enrollment_id, p.course, p.department, p.session_type, p.preferred_class_time, p.validity_end_date, u.sales_executive_id counsellor_id, p.total_allocated_sessions allocated,
      (select name from sales_executives where id=u.sales_executive_id) counsellor,
      (select t.name from teacher_assignments a join users t on t.id=a.teacher_id where a.student_user_id=u.id and a.ended_at is null limit 1) teacher
      from users u left join profiles p on p.user_id=u.id where ${and(...conds)} order by u.created_at desc limit ${input?.limit ?? 100}`);
    const showPw = ["admin", "super_admin"].includes(ctx.user.role);
    return (rows.rows as any[]).map((r) => ({ ...r, raw_password: showPw ? r.raw_password : undefined }));
  }),
  updateStudent: roleQuery("admin").input(z.object({ id: z.number(), name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(), password: z.string().min(6).optional(), reason: z.string().optional(),
    department: z.enum(["english", "hindi"]).optional(), sessionType: z.enum(["individual", "group"]).optional(), preferredTiming: z.string().optional(), counsellorId: z.number().optional(), validityEndDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, reason, password, department, sessionType, preferredTiming, counsellorId, validityEndDate, ...rest } = input;
      const pset: any = {};
      if (department) { pset.department = department === "hindi" ? "Spoken Hindi" : "Spoken English"; pset.course = pset.department; }
      if (sessionType) { pset.sessionType = sessionType === "group" ? "group" : "one_to_one"; pset.oneOnOneEnabled = sessionType === "individual"; pset.groupSessionEnabled = sessionType === "group"; }
      if (preferredTiming !== undefined) pset.preferredClassTime = preferredTiming;
      if (validityEndDate) pset.validityEndDate = new Date(validityEndDate);
      if (Object.keys(pset).length) await db.update(profiles).set(pset).where(eq(profiles.userId, id));
      if (department) await db.update(users).set({ department: pset.department }).where(eq(users.id, id));
      if (counsellorId) { await db.update(users).set({ salesExecutiveId: counsellorId }).where(eq(users.id, id)); await db.update(admissions).set({ counsellorId }).where(eq(admissions.studentUserId, id)); }
      if (department || sessionType || preferredTiming !== undefined) await db.update(admissions).set({ ...(department ? { department } : {}), ...(sessionType ? { sessionType } : {}), ...(preferredTiming !== undefined ? { preferredTiming } : {}), updatedAt: new Date() }).where(eq(admissions.studentUserId, id));
      const prev = await db.query.users.findFirst({ where: eq(users.id, id) });
      const set: any = { ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), updatedAt: new Date() };
      if (password) { set.password = await bcrypt.hash(password, 10); set.rawPassword = password; }
      await db.update(users).set(set).where(eq(users.id, id));
      await audit(db, ctx.user, "student_details_modified", "student", id, { name: prev?.name, phone: prev?.phone, email: prev?.email, status: prev?.status }, { ...rest, department, sessionType, preferredTiming, counsellorId, validityEndDate, password: password ? "(changed)" : undefined }, reason);
      return { ok: true };
    }),
});

function ne_student() { return sql`${users.role} <> 'student'`; }
