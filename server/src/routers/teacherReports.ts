import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte, inArray, ne, or, sql } from "drizzle-orm";
import { createRouter, authedQuery, strictAdminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  users,
  profiles,
  classes,
  oneToOneSessions,
  classLedgerTransactions,
  departments,
  departmentTeachers,
  studentClassAllocations,
  teacherSalaries,
} from "@db/schema";
import { recalculateSalaryInternal } from "./admin";
import { updateStudentSessionBalances } from "../lib/sessionHelper";

// Each 1-to-1 student is entitled to this many classes (e.g. 10 students => 200 classes).
export const CLASSES_PER_STUDENT = 20;
// Reports bucket days in IST (Emtees operates in India).
const IST_OFFSET_MIN = 330;

type Ctx = { user: { id: number; role: string; name: string }; req: any };

const dayKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60000).toISOString().substring(0, 10);
const dayStart = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - IST_OFFSET_MIN * 60000);
const dayEnd = (ymd: string) => new Date(dayStart(ymd).getTime() + 24 * 3600 * 1000 - 1);

/** Admin / academic-head reports are web-only; the mobile app identifies itself via x-client-platform. */
function assertWebForManagers(ctx: Ctx) {
  const platform = String(ctx.req?.headers?.["x-client-platform"] || "").toLowerCase();
  if (platform === "mobile" && ["super_admin", "admin", "academic_head"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin and Academic Head reports are available on the web portal only." });
  }
}

/**
 * Teachers visible to the caller: admins see everyone, an academic head sees only the teachers of
 * their own department (Hindi head -> Hindi teachers, English head -> English teachers).
 */
async function resolveScopedTeachers(db: ReturnType<typeof getDb>, ctx: Ctx): Promise<number[]> {
  assertWebForManagers(ctx);
  if (["super_admin", "admin"].includes(ctx.user.role)) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "teacher"));
    return rows.map((r) => r.id);
  }
  if (ctx.user.role === "academic_head") {
    const dept = await db.query.departments.findFirst({ where: eq(departments.headUserId, ctx.user.id) });
    if (!dept) return [];
    const rows = await db.select({ id: departmentTeachers.teacherId }).from(departmentTeachers)
      .where(eq(departmentTeachers.departmentId, dept.id));
    return rows.map((r) => r.id);
  }
  if (ctx.user.role === "teacher") return [ctx.user.id]; // teachers only ever see their own numbers
  throw new TRPCError({ code: "FORBIDDEN", message: "Report access denied" });
}

async function teacherNames(db: ReturnType<typeof getDb>, ids: number[]) {
  const map: Record<number, string> = {};
  if (ids.length === 0) return map;
  const rows = await db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, ids));
  for (const r of rows) map[r.id] = r.name || r.username || `Teacher #${r.id}`;
  return map;
}

type DayStat = { assigned: number; completed: number; invalid: number; ongoing: number; cancelled: number; pending: number };
const emptyDay = (): DayStat => ({ assigned: 0, completed: 0, invalid: 0, ongoing: 0, cancelled: 0, pending: 0 });

/**
 * Loads per-teacher / per-day session stats for [startYmd, endYmd].
 * "completed" = a VALID class (it produced a ledger debit, i.e. both sides stayed >= threshold).
 * "invalid"   = the session ended but did not meet the minimum duration, so it does not count.
 * "pending"   = scheduled/ongoing sessions that have not yet produced a valid class.
 */
async function loadDayStats(db: ReturnType<typeof getDb>, teacherIds: number[], startYmd: string, endYmd: string) {
  const result = new Map<number, Map<string, DayStat>>();
  if (teacherIds.length === 0) return result;
  const from = dayStart(startYmd);
  const to = dayEnd(endYmd);

  const [otos, groups] = await Promise.all([
    db.select({ id: oneToOneSessions.id, teacherId: oneToOneSessions.teacherId, status: oneToOneSessions.status, scheduledAt: oneToOneSessions.scheduledAt })
      .from(oneToOneSessions)
      .where(and(inArray(oneToOneSessions.teacherId, teacherIds), gte(oneToOneSessions.scheduledAt, from), lte(oneToOneSessions.scheduledAt, to))),
    db.select({ id: classes.id, teacherId: classes.teacherId, status: classes.status, scheduledAt: classes.scheduledAt })
      .from(classes)
      .where(and(inArray(classes.teacherId, teacherIds), gte(classes.scheduledAt, from), lte(classes.scheduledAt, to))),
  ]);

  const otoIds = otos.map((o) => o.id);
  const groupIds = groups.map((g) => g.id);
  const validOto = new Set<number>();
  const validGroup = new Set<number>();
  if (otoIds.length) {
    const rows = await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions)
      .where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceOneToOneId, otoIds)));
    rows.forEach((r) => r.id && validOto.add(r.id));
  }
  if (groupIds.length) {
    const rows = await db.select({ id: classLedgerTransactions.referenceClassId }).from(classLedgerTransactions)
      .where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceClassId, groupIds)));
    rows.forEach((r) => r.id && validGroup.add(r.id));
  }

  const bump = (teacherId: number, at: Date, status: string, valid: boolean) => {
    if (!result.has(teacherId)) result.set(teacherId, new Map());
    const days = result.get(teacherId)!;
    const key = dayKey(at);
    if (!days.has(key)) days.set(key, emptyDay());
    const d = days.get(key)!;
    if (status === "cancelled") { d.cancelled++; return; }
    d.assigned++;
    if (status === "completed") { if (valid) d.completed++; else d.invalid++; }
    else if (status === "ongoing") d.ongoing++;
    else d.pending++;
  };
  otos.forEach((o) => bump(o.teacherId, o.scheduledAt, o.status, validOto.has(o.id)));
  groups.forEach((g) => g.teacherId && bump(g.teacherId, g.scheduledAt, g.status, validGroup.has(g.id)));
  return result;
}

function listDays(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  let guard = 0;
  while (cur <= end && guard++ < 366) {
    out.push(cur.toISOString().substring(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function teacherStudentCounts(db: ReturnType<typeof getDb>, teacherIds: number[]) {
  const counts: Record<number, Set<number>> = {};
  teacherIds.forEach((t) => (counts[t] = new Set()));
  if (teacherIds.length === 0) return counts;
  const fromSessions = await db.select({ t: oneToOneSessions.teacherId, s: oneToOneSessions.studentId })
    .from(oneToOneSessions).where(and(inArray(oneToOneSessions.teacherId, teacherIds), ne(oneToOneSessions.status, "cancelled")));
  fromSessions.forEach((r) => counts[r.t]?.add(r.s));
  const fromAlloc = await db.select({
    t: sql<number>`CAST(${studentClassAllocations.allocation}->'oneToOne'->>'teacherId' AS INTEGER)`,
    s: studentClassAllocations.studentId,
  }).from(studentClassAllocations)
    .where(inArray(sql`CAST(${studentClassAllocations.allocation}->'oneToOne'->>'teacherId' AS INTEGER)`, teacherIds));
  fromAlloc.forEach((r) => r.t && counts[Number(r.t)]?.add(r.s));
  return counts;
}

export const teacherReportsRouter = createRouter({
  /** Today's (or any day's) completed vs pending classes for every teacher in the caller's scope. */
  dailyReport: authedQuery
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const teacherIds = await resolveScopedTeachers(db, ctx as Ctx);
      const [stats, names] = await Promise.all([loadDayStats(db, teacherIds, input.date, input.date), teacherNames(db, teacherIds)]);
      const todayYmd = dayKey(new Date());
      return teacherIds
        .map((tid) => {
          const d = stats.get(tid)?.get(input.date) || emptyDay();
          // Absent = classes were assigned for a day that is over, yet none of them was taken
          const absent = d.assigned > 0 && d.completed === 0 && d.ongoing === 0 && input.date < todayYmd;
          return { teacherId: tid, teacherName: names[tid] || `Teacher #${tid}`, ...d, absent };
        })
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
    }),

  /** Custom date range (e.g. 1st–25th): per-teacher totals, per-day breakdown and absent days. */
  rangeReport: authedQuery
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      teacherId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      let teacherIds = await resolveScopedTeachers(db, ctx as Ctx);
      if (input.teacherId) {
        if (!teacherIds.includes(input.teacherId)) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher is outside your scope" });
        teacherIds = [input.teacherId];
      }
      const [stats, names, studentSets] = await Promise.all([
        loadDayStats(db, teacherIds, input.startDate, input.endDate),
        teacherNames(db, teacherIds),
        teacherStudentCounts(db, teacherIds),
      ]);
      const days = listDays(input.startDate, input.endDate);
      const todayYmd = dayKey(new Date());

      return teacherIds.map((tid) => {
        const perDay = days.map((date) => {
          const d = stats.get(tid)?.get(date) || emptyDay();
          const absent = d.assigned > 0 && d.completed === 0 && d.ongoing === 0 && date < todayYmd;
          return { date, ...d, absent };
        });
        const totals = perDay.reduce(
          (a, d) => ({ assigned: a.assigned + d.assigned, completed: a.completed + d.completed, invalid: a.invalid + d.invalid, pending: a.pending + d.pending + d.ongoing }),
          { assigned: 0, completed: 0, invalid: 0, pending: 0 }
        );
        const studentCount = studentSets[tid]?.size || 0;
        return {
          teacherId: tid,
          teacherName: names[tid] || `Teacher #${tid}`,
          studentCount,
          totalClassesEntitled: studentCount * CLASSES_PER_STUDENT,
          ...totals,
          absentDays: perDay.filter((d) => d.absent).map((d) => d.date),
          days: perDay,
        };
      }).sort((a, b) => a.teacherName.localeCompare(b.teacherName));
    }),

  /** Individual student report incl. whether the account is currently active or inactive. */
  studentReport: authedQuery
    .input(z.object({ studentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const isSelf = ctx.user.role === "student";
      if (isSelf && input.studentId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own report" });
      const scopedTeachers = isSelf ? [] : await resolveScopedTeachers(db, ctx as Ctx);
      const student = await db.query.users.findFirst({ where: and(eq(users.id, input.studentId), eq(users.role, "student")) });
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });

      const sessions = await db.select().from(oneToOneSessions)
        .where(eq(oneToOneSessions.studentId, input.studentId));
      const alloc = await db.query.studentClassAllocations.findFirst({ where: eq(studentClassAllocations.studentId, input.studentId) });
      const allocTeacher = Number((alloc?.allocation as any)?.oneToOne?.teacherId) || null;

      // Scope: academic heads may only open students taught by their department's teachers
      if (ctx.user.role === "academic_head" || ctx.user.role === "teacher") {
        const inScope = sessions.some((s) => scopedTeachers.includes(s.teacherId)) || (allocTeacher && scopedTeachers.includes(allocTeacher));
        if (!inScope) throw new TRPCError({ code: "FORBIDDEN", message: "Student is outside your scope" });
      }

      const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, input.studentId) });
      const ledgerRows = await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions)
        .where(and(eq(classLedgerTransactions.studentId, input.studentId), eq(classLedgerTransactions.type, "debit")));
      const validIds = new Set(ledgerRows.map((r) => r.id));

      const completed = sessions.filter((s) => s.status === "completed" && validIds.has(s.id)).length;
      const invalid = sessions.filter((s) => s.status === "completed" && !validIds.has(s.id)).length;
      const pending = sessions.filter((s) => ["scheduled", "ongoing", "rescheduled", "reschedule_request_pending"].includes(s.status)).length;
      const a = (alloc?.allocation as any)?.oneToOne || {};
      const alreadyTaken = (a.alreadyTaken30 || 0) + (a.alreadyTaken45 || 0) + (a.alreadyTaken60 || 0);

      const isActive = student.status === "active";
      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        isActive,
        accountStatus: isActive ? "active" : "inactive",
        accountState: student.status,
        totalAllocated: profile?.totalAllocatedSessions ?? 0,
        totalRemaining: profile?.totalRemainingSessions ?? 0,
        alreadyTaken,
        completedInLms: completed,
        totalCompleted: completed + alreadyTaken,
        invalid,
        pending,
        sessions: sessions
          .sort((x, y) => y.scheduledAt.getTime() - x.scheduledAt.getTime())
          .slice(0, 100)
          .map((s) => ({
            id: s.id, teacherId: s.teacherId, scheduledAt: s.scheduledAt, status: s.status,
            sessionLength: s.sessionLength, actualDuration: s.actualDuration,
            valid: s.status === "completed" ? validIds.has(s.id) : null,
          })),
      };
    }),

  /** Admin: global salary report. Academic head: only their department's teachers + totals. */
  salarySummary: authedQuery
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const teacherIds = await resolveScopedTeachers(db, ctx as Ctx);
      // Recompute on read so the report is always current even if a class finished moments ago
      for (const tid of teacherIds) await recalculateSalaryInternal(db, tid, input.month, true);
      const rows = teacherIds.length
        ? await db.select().from(teacherSalaries).where(and(inArray(teacherSalaries.teacherId, teacherIds), eq(teacherSalaries.month, input.month)))
        : [];
      const names = await teacherNames(db, teacherIds);
      const teachers = rows.map((r) => ({
        teacherId: r.teacherId,
        teacherName: names[r.teacherId] || `Teacher #${r.teacherId}`,
        classesTaken: (r.groupClassesCount || 0) + (r.oneToOneCount || 0),
        count30: (r.group30MinCount || 0) + (r.oneToOne30MinCount || 0),
        count45: (r.group45MinCount || 0) + (r.oneToOne45MinCount || 0),
        count60: (r.group60MinCount || 0) + (r.oneToOne60MinCount || 0),
        netSalary: Number(r.netSalary || 0),
        totalAmount: Number(r.totalAmount || 0),
        status: r.status,
      })).sort((a, b) => a.teacherName.localeCompare(b.teacherName));
      return {
        month: input.month,
        scope: ctx.user.role === "academic_head" ? "department" : "global",
        teachers,
        totals: {
          classesTaken: teachers.reduce((s, t) => s + t.classesTaken, 0),
          totalAmount: teachers.reduce((s, t) => s + t.totalAmount, 0),
        },
      };
    }),

  /** Teacher (mobile app): own earnings and completed-class count for a month. */
  mySalary: authedQuery
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "teacher") throw new TRPCError({ code: "FORBIDDEN", message: "Teachers only" });
      const db = getDb();
      const month = input?.month || new Date().toISOString().substring(0, 7);
      const r = await recalculateSalaryInternal(db, ctx.user.id, month, true);
      return {
        month,
        classesTaken: (r?.groupClassesCount || 0) + (r?.oneToOneCount || 0),
        count30: (r?.group30MinCount || 0) + (r?.oneToOne30MinCount || 0),
        count45: (r?.group45MinCount || 0) + (r?.oneToOne45MinCount || 0),
        count60: (r?.group60MinCount || 0) + (r?.oneToOne60MinCount || 0),
        netSalary: Number(r?.netSalary || 0),
        totalAmount: Number(r?.totalAmount || 0),
        status: r?.status || "pending",
      };
    }),

  /** Legacy data transition: classes already completed (tracked on WhatsApp) before the LMS. */
  setAlreadyTaken: strictAdminQuery
    .input(z.object({
      studentId: z.number(),
      type: z.enum(["oneToOne", "group"]).default("oneToOne"),
      min30: z.number().int().nonnegative().default(0),
      min45: z.number().int().nonnegative().default(0),
      min60: z.number().int().nonnegative().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      assertWebForManagers(ctx as Ctx);
      const db = getDb();
      const existing = await db.query.studentClassAllocations.findFirst({ where: eq(studentClassAllocations.studentId, input.studentId) });
      if (!existing) {
        // Create the allocation row (and balances) first
        await updateStudentSessionBalances(db, input.studentId);
      }
      const row = await db.query.studentClassAllocations.findFirst({ where: eq(studentClassAllocations.studentId, input.studentId) });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Student has no class allocation" });
      const allocation: any = row.allocation || {};
      allocation[input.type] = {
        ...(allocation[input.type] || {}),
        alreadyTaken30: input.min30,
        alreadyTaken45: input.min45,
        alreadyTaken60: input.min60,
      };
      await db.update(studentClassAllocations).set({ allocation, updatedAt: new Date() }).where(eq(studentClassAllocations.studentId, input.studentId));
      await updateStudentSessionBalances(db, input.studentId);
      return { success: true };
    }),
});
