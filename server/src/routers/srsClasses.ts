import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { createRouter, authedQuery, roleQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, oneToOneSessions, attendance, demoClasses, salesExecutives, attendanceEvents } from "@db/schema";
import { teacherAssignments, admissions, remunerationEntries } from "@db/srs-schema";
import { audit } from "../lib/audit";
import { evaluateClassCompletion } from "../lib/classEngine";
import { getBalance } from "../lib/balance";
import { NotificationService } from "../lib/notificationService";

const heads = ["admin", "academic_head"];

export const srsClassesRouter = createRouter({
  // ---------------- demo module (SRS 4) ----------------
  demoTeachers: roleQuery("sales_executive", "admin").query(async () => {
    const db = getDb();
    return db.select({ id: users.id, name: users.name, department: users.department }).from(users).where(and(eq(users.role, "teacher"), eq(users.status, "active"))).orderBy(users.name);
  }),
  createDemo: roleQuery("sales_executive", "admin").input(z.object({
    studentName: z.string().trim().min(2), mobile: z.string().trim().min(7), whatsapp: z.string().trim().optional(), course: z.enum(["english", "hindi"]),
    preferredDate: z.string().min(1), preferredTime: z.string().min(1), teacherId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.userId, ctx.user.id));
    if (!c && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "No counsellor record" });
    const scheduledAt = new Date(`${input.preferredDate}T${input.preferredTime}:00+05:30`);
    const room = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [d] = await db.insert(demoClasses).values({
      salesExecId: c?.id ?? 0, teacherId: input.teacherId, studentName: input.studentName, studentPhone: input.mobile, whatsapp: input.whatsapp || input.mobile,
      scheduledAt, jitsiRoom: room, status: "pending", notes: `Course: ${input.course}`,
    } as any).returning();
    await NotificationService.dispatch({ userId: input.teacherId, subject: "New demo class", message: `Demo for ${input.studentName} on ${scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, type: "demo", channels: ["in_app"] }).catch(() => {});
    await audit(db, ctx.user, "demo_created", "demo", d.id, null, { teacherId: input.teacherId, student: input.studentName });
    return { id: d.id };
  }),
  demos: authedQuery.input(z.object({ status: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const conds: any[] = [];
    if (ctx.user.role === "teacher") conds.push(eq(demoClasses.teacherId, ctx.user.id));
    else if (ctx.user.role === "sales_executive") {
      const [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.userId, ctx.user.id));
      conds.push(eq(demoClasses.salesExecId, c?.id ?? -1));
    } else if (!["admin", "super_admin", "academic_head", "accountant"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    if (input?.status) conds.push(eq(demoClasses.status, input.status));
    const rows = await db.select({ d: demoClasses, tn: sql<string>`(select name from users where id=${demoClasses.teacherId})`, cn: sql<string>`(select name from sales_executives where id=${demoClasses.salesExecId})`,
      admStatus: sql<string>`(select status from admissions where demo_id=${demoClasses.id} order by id desc limit 1)` })
      .from(demoClasses).where(conds.length ? and(...conds) : undefined).orderBy(desc(demoClasses.scheduledAt)).limit(500);
    return rows.map((r: any) => ({ ...r.d, teacherName: r.tn, counsellorName: r.cn, admissionStatus: r.admStatus }));
  }),
  acceptDemo: roleQuery("teacher").input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.update(demoClasses).set({ acceptedAt: new Date() }).where(and(eq(demoClasses.id, input.id), eq(demoClasses.teacherId, ctx.user.id)));
    return { ok: true };
  }),
  /** Completes a demo: attended flag, feedback, remarks. Pay (₹50) is credited only if attended. */
  finishDemo: roleQuery("teacher", "admin").input(z.object({ id: z.number(), attended: z.boolean(), feedback: z.string().optional(), remarks: z.string().optional(), durationMinutes: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [d] = await db.select().from(demoClasses).where(eq(demoClasses.id, input.id));
      if (!d) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "teacher" && d.teacherId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.update(demoClasses).set({
        status: input.attended ? "completed" : "cancelled", studentAttended: input.attended, feedback: input.feedback, notes: input.remarks ?? d.notes,
        completedAt: new Date(), durationMinutes: input.durationMinutes ?? d.durationMinutes, updatedAt: new Date(),
      }).where(eq(demoClasses.id, input.id));
      if (input.attended) {
        const { srsFinanceRouter } = await import("./srsFinance");
        await (srsFinanceRouter as any).createCaller({ user: { ...ctx.user, role: "admin" } }).recordDemoPay({ demoId: input.id }).catch((e: any) => console.error("[demo pay]", e));
      }
      return { ok: true };
    }),
  /** Counsellor: turn a completed demo into a registration link, so the bonus can later be linked to the admission. */
  demoToAdmission: roleQuery("sales_executive").input(z.object({ demoId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [c] = await db.select().from(salesExecutives).where(eq(salesExecutives.userId, ctx.user.id));
    if (!c) throw new TRPCError({ code: "FORBIDDEN" });
    const crypto = await import("crypto");
    const token = crypto.randomBytes(12).toString("hex");
    const [row] = await db.insert(admissions).values({ token, counsellorId: c.id, demoId: input.demoId }).returning();
    return { id: row.id, token };
  }),

  // ---------------- Google Meet fallback (SRS 8.5) ----------------
  /** Teacher or admin records a class held outside the app. Marked manual, keeps who entered it, follows the same rules. */
  recordManualClass: roleQuery("teacher", "admin").input(z.object({
    teacherId: z.number().optional(), studentId: z.number(), meetLink: z.string().trim().optional(),
    startedAt: z.date(), endedAt: z.date(), teacherPresent: z.boolean().default(true), studentPresent: z.boolean(), reason: z.string().trim().min(3), remarks: z.string().optional(),
    sessionId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const teacherId = ctx.user.role === "teacher" ? ctx.user.id : input.teacherId;
    if (!teacherId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the teacher" });
    if (input.endedAt <= input.startedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time" });
    const minutes = Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 60000);
    let sessionId = input.sessionId;
    if (!sessionId) {
      const [s] = await db.insert(oneToOneSessions).values({
        teacherId, studentId: input.studentId, title: "Class (Google Meet)", sessionLength: 30, scheduledAt: input.startedAt, startedAt: input.startedAt, endedAt: input.endedAt,
        status: "ongoing", meetingRoomId: `manual-${Date.now()}`, isManual: true, meetLink: input.meetLink || null, manualReason: input.reason, enteredBy: ctx.user.id, remarks: input.remarks,
        createdBy: ctx.user.id,
      } as any).returning();
      sessionId = s.id;
    } else {
      await db.update(oneToOneSessions).set({ startedAt: input.startedAt, endedAt: input.endedAt, isManual: true, meetLink: input.meetLink || null, manualReason: input.reason, enteredBy: ctx.user.id, remarks: input.remarks, status: "ongoing" } as any).where(eq(oneToOneSessions.id, sessionId));
    }
    // Record manual presence as join/leave events so the SAME engine decides (minimum duration, credit, pay).
    const mk = (uid: number, type: string, t: Date) => ({ userId: uid, eventType: type, timestamp: t, oneToOneSessionId: sessionId, source: "manual" } as any);
    const evs: any[] = [];
    if (input.teacherPresent) evs.push(mk(teacherId, "join", input.startedAt), mk(teacherId, "leave", input.endedAt));
    if (input.studentPresent) evs.push(mk(input.studentId, "join", input.startedAt), mk(input.studentId, "leave", input.endedAt));
    if (evs.length) await db.insert(attendanceEvents).values(evs).catch(async () => {
      await db.insert(attendanceEvents).values(evs.map((e) => { const { source, ...rest } = e; return rest; }));
    });
    await db.update(oneToOneSessions).set({ status: "completed", completedAt: input.endedAt, actualDuration: minutes } as any).where(eq(oneToOneSessions.id, sessionId));
    await evaluateClassCompletion(undefined, sessionId);
    await audit(db, ctx.user, "manual_class_recorded", "one_to_one_session", sessionId, null, { minutes, studentPresent: input.studentPresent, meetLink: input.meetLink }, input.reason);
    return { sessionId, minutes };
  }),

  // ---------------- teacher dashboard (SRS 7.2, 12.1) ----------------
  /** Today's schedule split the way SRS 7.2 asks: upcoming first, current highlighted, completed/missed/hold separate. */
  mySchedule: roleQuery("teacher", ...heads).input(z.object({ teacherId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const tid = ctx.user.role === "teacher" ? ctx.user.id : input?.teacherId;
    if (!tid) return { upcoming: [], current: [], completed: [], missed: [], hold: [] };
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const rows = await db.select({ s: oneToOneSessions, sn: sql<string>`(select name from users where id=${oneToOneSessions.studentId})`, phone: sql<string>`(select phone from users where id=${oneToOneSessions.studentId})` })
      .from(oneToOneSessions).where(and(eq(oneToOneSessions.teacherId, tid), gte(oneToOneSessions.scheduledAt, start), lt(oneToOneSessions.scheduledAt, end), ne(oneToOneSessions.status, "cancelled")))
      .orderBy(oneToOneSessions.scheduledAt);
    const now = Date.now();
    const out: any = { upcoming: [], current: [], completed: [], missed: [], hold: [] };
    const held = new Set((await db.execute(sql`select student_user_id from timetable_slots where teacher_id=${tid} and on_hold=true`)).rows.map((r: any) => Number(r.student_user_id)));
    for (const r of rows) {
      const s = r.s, t = new Date(s.scheduledAt).getTime();
      const item = { ...s, studentName: r.sn, studentPhone: r.phone };
      if (held.has(s.studentId)) out.hold.push(item);
      else if (s.status === "completed") out.completed.push(item);
      else if (s.status === "ongoing" || (t <= now && now < t + s.sessionLength * 60000)) out.current.push(item);
      else if (t < now) out.missed.push(item);
      else out.upcoming.push(item);
    }
    return out;
  }),

  teacherSummary: roleQuery("teacher", ...heads).input(z.object({ teacherId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const tid = ctx.user.role === "teacher" ? ctx.user.id : input?.teacherId;
    if (!tid) throw new TRPCError({ code: "BAD_REQUEST" });
    const now = new Date();
    const day = new Date(now); day.setHours(0, 0, 0, 0);
    const wk = new Date(day); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
    const mo = new Date(day); mo.setDate(1);
    const cnt = async (from: Date, status: "completed" | "missed" | "pending") => {
      const base = [eq(oneToOneSessions.teacherId, tid), gte(oneToOneSessions.scheduledAt, from)];
      if (status === "completed") base.push(eq(oneToOneSessions.status, "completed"), sql`(${oneToOneSessions.actualDuration} is null or ${oneToOneSessions.actualDuration} >= 1)`);
      if (status === "missed") base.push(eq(oneToOneSessions.status, "scheduled"), lt(oneToOneSessions.scheduledAt, now));
      if (status === "pending") base.push(eq(oneToOneSessions.status, "scheduled"), gte(oneToOneSessions.scheduledAt, now));
      const [r] = await db.select({ n: sql<number>`count(*)` }).from(oneToOneSessions).where(and(...base));
      return Number(r.n);
    };
    const asg = await db.select({ sid: teacherAssignments.studentUserId, dep: sql<string>`(select department from profiles where user_id=${teacherAssignments.studentUserId} limit 1)` })
      .from(teacherAssignments).where(and(eq(teacherAssignments.teacherId, tid), isNull(teacherAssignments.endedAt)));
    const eng = asg.filter((a: any) => (a.dep || "").toLowerCase().includes("english")).length;
    const hin = asg.filter((a: any) => (a.dep || "").toLowerCase().includes("hindi")).length;
    return {
      activeStudents: asg.length, english: eng, hindi: hin,
      upcomingToday: (await cnt(now, "pending")), completedToday: await cnt(day, "completed"), completedWeek: await cnt(wk, "completed"), completedMonth: await cnt(mo, "completed"),
      missedMonth: await cnt(mo, "missed"),
    };
  }),

  // ---------------- teacher attendance (SRS 16.2) ----------------
  teacherAttendance: roleQuery("admin", "academic_head", "teacher").input(z.object({ teacherId: z.number().optional(), from: z.date(), to: z.date() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const tid = ctx.user.role === "teacher" ? ctx.user.id : input.teacherId;
    const conds: any[] = [gte(oneToOneSessions.scheduledAt, input.from), lte(oneToOneSessions.scheduledAt, input.to), ne(oneToOneSessions.status, "cancelled")];
    if (tid) conds.push(eq(oneToOneSessions.teacherId, tid));
    const sess = await db.select().from(oneToOneSessions).where(and(...conds)).limit(3000);
    const ids = sess.map((s: any) => s.id);
    const evs = ids.length ? await db.select().from(attendanceEvents).where(inArray(attendanceEvents.oneToOneSessionId, ids)) : [];
    const by = new Map<number, Map<number, { first?: Date; last?: Date }>>();
    for (const e of evs as any[]) {
      const s = sess.find((x: any) => x.id === e.oneToOneSessionId); if (!s || e.userId !== s.teacherId) continue;
      const m = by.get(s.id) ?? new Map(); const cur = m.get(e.userId) ?? {};
      const t = new Date(e.timestamp);
      if (e.eventType === "join" && (!cur.first || t < cur.first)) cur.first = t;
      if (e.eventType === "leave" && (!cur.last || t > cur.last)) cur.last = t;
      m.set(e.userId, cur); by.set(s.id, m);
    }
    const rows = sess.map((s: any) => {
      const t = by.get(s.id)?.get(s.teacherId);
      const sched = new Date(s.scheduledAt).getTime();
      const late = t?.first ? Math.max(0, Math.round((t.first.getTime() - sched) / 60000)) : null;
      const planned = sched + s.sessionLength * 60000;
      const early = t?.last ? Math.max(0, Math.round((planned - t.last.getTime()) / 60000)) : null;
      return { sessionId: s.id, teacherId: s.teacherId, scheduledAt: s.scheduledAt, joinedAt: t?.first ?? null, leftAt: t?.last ?? null, attended: !!t?.first, lateMinutes: late, earlyLeaveMinutes: early, status: s.status };
    });
    return { rows, attended: rows.filter((r: any) => r.attended).length, missed: rows.filter((r: any) => !r.attended && new Date(r.scheduledAt) < new Date()).length };
  }),

  // ---------------- academic head dashboard (SRS 15) ----------------
  headDashboard: roleQuery(...heads).query(async ({ ctx }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const d = (me?.department || "").toLowerCase();
    const dep = ctx.user.role === "academic_head" ? (d.includes("hindi") ? "hindi" : d.includes("english") ? "english" : null) : null;
    const like = dep ? `%${dep}%` : "%";
    const q = async (text: any) => Number(((await db.execute(text)).rows[0] as any)?.n || 0);
    const day = new Date(); day.setHours(0, 0, 0, 0);
    return {
      department: dep,
      activeStudents: await q(sql`select count(*) n from profiles p join users u on u.id=p.user_id where u.role='student' and u.status='active' and coalesce(p.department,'') ilike ${like} and p.total_allocated_sessions>0`),
      newAdmissions: await q(sql`select count(*) n from admissions where created_at >= now() - interval '30 days' and coalesce(department,'') ilike ${like}`),
      awaitingAssignment: await q(sql`select count(*) n from admissions where status='awaiting_assignment' and coalesce(department,'') ilike ${like}`),
      completedToday: await q(sql`select count(*) n from one_to_one_sessions where session_status='completed' and scheduled_at >= ${day}`),
      missedToday: await q(sql`select count(*) n from one_to_one_sessions where session_status='scheduled' and scheduled_at >= ${day} and scheduled_at < now()`),
      pendingRequests: await q(sql`select count(*) n from support_requests where status='open' and routed_to='academic_head'`),
      pendingAvailability: await q(sql`select count(*) n from teacher_availability where status='pending'`),
    };
  }),

  /** Teacher workload / performance table for the head (SRS 15). */
  teacherWorkload: roleQuery(...heads).input(z.object({ from: z.date(), to: z.date() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const me = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    const d = (me?.department || "").toLowerCase();
    const dep = ctx.user.role === "academic_head" ? (d.includes("hindi") ? "hindi" : d.includes("english") ? "english" : null) : null;
    const rows = (await db.execute(sql`
      select u.id, u.name, u.department,
        (select count(*) from teacher_assignments ta where ta.teacher_id=u.id and ta.ended_at is null) students,
        count(s.id) filter (where s.session_status='completed') completed,
        count(s.id) filter (where s.session_status='scheduled' and s.scheduled_at < now()) missed,
        coalesce(sum(s.actual_duration) filter (where s.session_status='completed'),0) minutes
      from users u left join one_to_one_sessions s on s.teacher_id=u.id and s.scheduled_at between ${input.from} and ${input.to}
      where u.role='teacher' and u.status='active' and (${dep}::text is null or coalesce(u.department,'') = '' or u.department ilike ${"%" + (dep ?? "") + "%"})
      group by u.id order by completed desc`)).rows as any[];
    return rows.map((r) => ({ ...r, students: Number(r.students), completed: Number(r.completed), missed: Number(r.missed), hours: Math.round((Number(r.minutes) / 60) * 10) / 10 }));
  }),

  // ---------------- student portal helpers (SRS 14) ----------------
  myClasses: roleQuery("student").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select({ s: oneToOneSessions, tn: sql<string>`(select name from users where id=${oneToOneSessions.teacherId})` }).from(oneToOneSessions)
      .where(and(eq(oneToOneSessions.studentId, ctx.user.id), ne(oneToOneSessions.status, "cancelled"))).orderBy(desc(oneToOneSessions.scheduledAt)).limit(100);
    const att = await db.select().from(attendance).where(eq(attendance.studentId, ctx.user.id)).limit(500);
    return rows.map((r: any) => ({ ...r.s, teacherName: r.tn, attendance: att.find((a: any) => a.oneToOneSessionId === r.s.id)?.status ?? null, attendedMinutes: att.find((a: any) => a.oneToOneSessionId === r.s.id)?.duration ?? null }));
  }),
});
