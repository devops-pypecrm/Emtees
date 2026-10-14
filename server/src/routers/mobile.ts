import { Router, Request, Response } from "express";
import { jwtVerify } from "jose";
import { jwtSecret } from "../lib/env";
import { appRouter } from "../router";
import type { TrpcContext } from "../context";
import { and, eq, gte, lt, inArray, ne, desc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { classes, oneToOneSessions, classLedgerTransactions, profiles, users, teacherSalaries, attendance, attendanceEvents } from "@db/schema";
import { recalculateSalaryInternal } from "./admin";

// Plain REST/JSON wrapper around the tRPC router, for the Flutter mobile app
// (which can't speak tRPC's superjson wire format). Each route builds a
// tRPC context from the same Bearer JWT and calls the existing procedure via
// appRouter.createCaller, so all business logic/role checks stay in one place.

export const mobileRouter = Router();

async function buildContext(req: Request): Promise<TrpcContext["user"]> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret, { clockTolerance: 60 });
    return {
      id: payload.sub ? parseInt(payload.sub as string) : 0,
      role: (payload.role as string) || "student",
      name: (payload.name as string) || "",
      sessionToken: (payload.sessionToken as string) || "",
    };
  } catch {
    return null;
  }
}

function caller(req: Request, res: Response, user: TrpcContext["user"]) {
  return appRouter.createCaller({ req: req as any, res: res as any, user });
}

function handleError(res: Response, err: any) {
  const code: string | undefined = err?.code;
  const statusByCode: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    CONFLICT: 409,
  };
  const status = statusByCode[code || ""] || 500;
  res.status(status).json({ error: err?.message || "Internal error", code: code || "INTERNAL_SERVER_ERROR" });
}

// wraps a handler, injecting the caller built from the request's JWT
function wrap(fn: (c: ReturnType<typeof caller>, req: Request) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      const user = await buildContext(req);
      const c = caller(req, res, user);
      const result = await fn(c, req);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  };
}

// ---- Auth ----
mobileRouter.post(
  "/auth/login",
  wrap((c, req) => c.auth.login(req.body))
);
mobileRouter.get(
  "/auth/me",
  wrap((c) => c.auth.me())
);

// ---- Classes (group) ----
mobileRouter.get(
  "/classes",
  wrap((c, req) =>
    c.class.list({
      batchId: req.query.batchId ? Number(req.query.batchId) : undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })
  )
);
mobileRouter.get(
  "/classes/:id/meeting",
  wrap((c, req) => c.class.getMeetingDetails({ classId: Number(req.params.id) }))
);
mobileRouter.post(
  "/classes/:id/start",
  wrap((c, req) => c.class.start({ id: Number(req.params.id) }))
);
mobileRouter.post(
  "/classes/:id/presence",
  wrap((c, req) => c.class.reportPresence({ classId: Number(req.params.id), eventType: req.body?.eventType }))
);
mobileRouter.post(
  "/one-to-one/:id/presence",
  wrap((c, req) => c.class.reportPresence({ sessionId: Number(req.params.id), eventType: req.body?.eventType }))
);
mobileRouter.post(
  "/classes/:id/end",
  wrap((c, req) => c.class.end({ id: Number(req.params.id) }))
);
mobileRouter.get(
  "/classes/:id/join-status",
  wrap((c, req) => c.class.getJoinStatus({ classId: Number(req.params.id) }))
);
mobileRouter.post(
  "/classes/:id/join-requests",
  wrap((c, req) => c.class.requestJoin({ classId: Number(req.params.id) }))
);
mobileRouter.get(
  "/classes/:id/join-requests",
  wrap((c, req) => c.class.listJoinRequests({ classId: Number(req.params.id) }))
);
mobileRouter.post(
  "/classes/:id/join-requests/:studentId/approve",
  wrap((c, req) =>
    c.class.approveJoinRequest({ classId: Number(req.params.id), studentId: Number(req.params.studentId) })
  )
);
mobileRouter.post(
  "/classes/:id/join-requests/:studentId/decline",
  wrap((c, req) =>
    c.class.declineJoinRequest({ classId: Number(req.params.id), studentId: Number(req.params.studentId) })
  )
);
mobileRouter.post(
  "/classes/:id/join-requests/approve-all",
  wrap((c, req) => c.class.approveAllJoinRequests({ classId: Number(req.params.id) }))
);

// ---- One-to-one sessions ----
mobileRouter.get(
  "/one-to-one",
  wrap((c, req) =>
    c.class.listOneToOne({
      studentId: req.query.studentId ? Number(req.query.studentId) : undefined,
      teacherId: req.query.teacherId ? Number(req.query.teacherId) : undefined,
    })
  )
);
mobileRouter.post(
  "/one-to-one/:id/start",
  wrap((c, req) => c.class.startOneToOne({ sessionId: Number(req.params.id) }))
);
mobileRouter.post(
  "/one-to-one/instant",
  wrap((c, req) => c.class.startInstantOneToOne(req.body))
);
mobileRouter.post(
  "/one-to-one/:id/join",
  wrap((c, req) => c.class.joinOneToOne({ sessionId: Number(req.params.id) }))
);
mobileRouter.post(
  "/one-to-one/:id/heartbeat",
  wrap((c, req) =>
    c.class.trackOneToOneHeartbeat({ sessionId: Number(req.params.id), bothPresent: req.body?.bothPresent })
  )
);

// ---- Notifications ----
mobileRouter.get(
  "/notifications",
  wrap((c, req) =>
    c.notification.list({
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })
  )
);
mobileRouter.post(
  "/notifications/:id/read",
  wrap((c, req) => c.notification.markRead({ id: Number(req.params.id) }))
);
mobileRouter.post(
  "/notifications/read-all",
  wrap((c) => c.notification.markAllRead())
);
mobileRouter.delete(
  "/notifications/:id",
  wrap((c, req) => c.notification.delete({ id: Number(req.params.id) }))
);
mobileRouter.post(
  "/notifications/announcements/:id/dismiss",
  wrap((c, req) => c.notification.dismissAnnouncement({ announcementId: Number(req.params.id) }))
);

// ---- Private messages / chat ----
mobileRouter.get(
  "/messages/conversations",
  wrap((c) => c.privateMessage.listConversations())
);
mobileRouter.get(
  "/messages/contacts",
  wrap((c, req) => c.privateMessage.listAvailableContacts(req.query.search ? { search: String(req.query.search) } : undefined))
);
mobileRouter.get(
  "/messages/with/:userId",
  wrap((c, req) =>
    c.privateMessage.getConversation({
      otherUserId: Number(req.params.userId),
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    })
  )
);
mobileRouter.post(
  "/messages",
  wrap((c, req) => c.privateMessage.sendMessage(req.body))
);

// ---- Student "my" data ----
mobileRouter.get(
  "/me/batches",
  wrap((c) => c.user.myBatches())
);
mobileRouter.get(
  "/me/payments",
  wrap((c) => c.student.myPayments())
);
mobileRouter.get(
  "/me/requests",
  wrap((c) => c.student.myRequests())
);
mobileRouter.post(
  "/me/requests",
  wrap((c, req) => c.student.createRequest(req.body))
);
mobileRouter.post(
  "/me/requests/:id/cancel",
  wrap((c, req) => c.student.cancelRequest({ requestId: Number(req.params.id) }))
);
mobileRouter.get(
  "/me/feedback",
  wrap((c) => c.student.getMyFeedback())
);
mobileRouter.get(
  "/me/attendance",
  wrap((c) => c.class.myAttendance())
);
mobileRouter.get(
  "/me/session-summary",
  wrap((c) => c.class.mySessionSummary())
);
mobileRouter.put(
  "/me/profile",
  wrap((c, req) => c.user.updateMyProfile(req.body))
);
mobileRouter.post(
  "/me/password",
  wrap((c, req) => c.user.changeMyPassword(req.body))
);
mobileRouter.post(
  "/me/feedback",
  wrap((c, req) => c.student.submitFeedback(req.body))
);
mobileRouter.put(
  "/me/feedback/:id",
  wrap((c, req) => c.student.editFeedback({ feedbackId: Number(req.params.id), ...req.body }))
);

// ---- Learning materials ----
mobileRouter.get(
  "/materials",
  wrap((c, req) => c.learning.listMaterials({ batchId: Number(req.query.batchId) }))
);
mobileRouter.post(
  "/materials",
  wrap((c, req) => c.learning.createMaterial(req.body))
);

// ---- Performance ----
mobileRouter.get(
  "/performance",
  wrap((c, req) =>
    c.performance.listReports({
      type: req.query.type as "student" | "teacher" | undefined,
      targetUserId: req.query.targetUserId ? Number(req.query.targetUserId) : undefined,
      assessmentPeriod: req.query.assessmentPeriod as string | undefined,
      status: req.query.status as "draft" | "published" | "archived" | undefined,
      batchId: req.query.batchId ? Number(req.query.batchId) : undefined,
    })
  )
);
mobileRouter.get(
  "/performance/:id/history",
  wrap((c, req) => c.performance.getReportHistory({ reportId: Number(req.params.id) }))
);

// ---- Discipline ----
mobileRouter.get(
  "/discipline",
  wrap((c) => c.discipline.list())
);
mobileRouter.post(
  "/discipline",
  wrap((c, req) => c.discipline.create(req.body))
);
mobileRouter.get(
  "/discipline/stats",
  wrap((c) => c.discipline.getStats())
);

// ---- Community ----
mobileRouter.get(
  "/community/posts",
  wrap((c) => c.community.listPosts())
);
mobileRouter.post(
  "/community/posts",
  wrap((c, req) => c.community.createPost(req.body))
);
mobileRouter.delete(
  "/community/posts/:id",
  wrap((c, req) => c.community.deletePost({ id: Number(req.params.id) }))
);
mobileRouter.post(
  "/community/posts/:id/like",
  wrap((c, req) => c.community.likePost({ postId: Number(req.params.id) }))
);
mobileRouter.get(
  "/community/posts/:id/comments",
  wrap((c, req) => c.community.listComments({ postId: Number(req.params.id) }))
);
mobileRouter.post(
  "/community/posts/:id/comments",
  wrap((c, req) => c.community.createComment({ postId: Number(req.params.id), ...req.body }))
);
mobileRouter.delete(
  "/community/comments/:id",
  wrap((c, req) => c.community.deleteComment({ id: Number(req.params.id) }))
);

// ---- App release / update check (see pypecrm-style OTA update system) ----
import { appReleaseRouterExpress } from "./appRelease";
mobileRouter.use("/app-releases", appReleaseRouterExpress);


// ───────────── Reports (role-scoped; teacher + student only on mobile) ─────────────
// Admin / Academic Head reports are web-only.

const IST_MS = 5.5 * 3600 * 1000;
const istKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istDayStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const isYmd = (v: any) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function reportUser(req: Request, res: Response, allowed: string[]) {
  const user = await buildContext(req);
  if (!user || !user.id) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return null;
  }
  if (!allowed.includes(user.role)) {
    const web = ["super_admin", "admin", "academic_head"].includes(user.role);
    res.status(403).json({
      error: web ? "Admin and Academic Head reports are available on the web portal." : "Not allowed",
      code: "FORBIDDEN",
    });
    return null;
  }
  return user;
}

type DayRow = { date: string; assigned: number; completed: number; pending: number; ongoing: number; invalid: number; absent: boolean };

// Classifies every non-cancelled class/session of a teacher in [startYmd, endYmd] (IST days) by day.
async function teacherDays(teacherId: number, startYmd: string, endYmd: string): Promise<DayRow[]> {
  const db = getDb();
  const from = istDayStart(startYmd);
  const to = new Date(istDayStart(endYmd).getTime() + 24 * 3600 * 1000);

  const grp = await db.select({ id: classes.id, status: classes.status, at: classes.scheduledAt })
    .from(classes)
    .where(and(eq(classes.teacherId, teacherId), gte(classes.scheduledAt, from), lt(classes.scheduledAt, to), ne(classes.status, "cancelled")));
  const o2o = await db.select({ id: oneToOneSessions.id, status: oneToOneSessions.status, at: oneToOneSessions.scheduledAt })
    .from(oneToOneSessions)
    .where(and(eq(oneToOneSessions.teacherId, teacherId), gte(oneToOneSessions.scheduledAt, from), lt(oneToOneSessions.scheduledAt, to), ne(oneToOneSessions.status, "cancelled")));

  const validGroup = new Set<number>();
  if (grp.length) {
    const r = await db.select({ id: classLedgerTransactions.referenceClassId }).from(classLedgerTransactions)
      .where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceClassId, grp.map((g) => g.id))));
    r.forEach((x) => x.id && validGroup.add(x.id));
  }
  const validO2o = new Set<number>();
  if (o2o.length) {
    const r = await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions)
      .where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceOneToOneId, o2o.map((g) => g.id))));
    r.forEach((x) => x.id && validO2o.add(x.id));
  }

  const days = new Map<string, DayRow>();
  for (let t = from.getTime(); t < to.getTime(); t += 24 * 3600 * 1000) {
    const k = istKey(new Date(t + 12 * 3600 * 1000));
    days.set(k, { date: k, assigned: 0, completed: 0, pending: 0, ongoing: 0, invalid: 0, absent: false });
  }
  const add = (at: Date, status: string, valid: boolean) => {
    const d = days.get(istKey(at));
    if (!d) return;
    d.assigned++;
    if (status === "completed") valid ? d.completed++ : d.invalid++;
    else if (status === "ongoing") d.ongoing++;
    else d.pending++;
  };
  grp.forEach((g) => add(g.at, g.status, validGroup.has(g.id)));
  o2o.forEach((s) => add(s.at, s.status, validO2o.has(s.id)));

  const today = istKey(new Date());
  for (const d of days.values()) d.absent = d.assigned > 0 && d.date < today && d.completed === 0 && d.ongoing === 0;
  return Array.from(days.values());
}

mobileRouter.get("/reports/daily", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["teacher"]);
    if (!user) return;
    const date = isYmd(req.query.date) ? (req.query.date as string) : istKey(new Date());
    const [row] = await teacherDays(user.id, date, date);
    res.json([row]);
  } catch (err) { handleError(res, err); }
});

mobileRouter.get("/reports/range", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["teacher"]);
    if (!user) return;
    if (!isYmd(req.query.startDate) || !isYmd(req.query.endDate)) {
      return res.status(400).json({ error: "startDate and endDate (YYYY-MM-DD) required", code: "BAD_REQUEST" });
    }
    const start = req.query.startDate as string;
    const end = req.query.endDate as string;
    if (end < start || (istDayStart(end).getTime() - istDayStart(start).getTime()) / 86400000 > 400) {
      return res.status(400).json({ error: "Invalid date range", code: "BAD_REQUEST" });
    }
    const days = await teacherDays(user.id, start, end);

    // Overall load: each assigned student needs their allocated classes (default 20)
    const db = getDb();
    const mine = await db.select({ studentId: oneToOneSessions.studentId, id: oneToOneSessions.id })
      .from(oneToOneSessions)
      .where(and(eq(oneToOneSessions.teacherId, user.id), ne(oneToOneSessions.status, "cancelled")));
    const studentIds = Array.from(new Set(mine.map((m) => m.studentId)));
    let entitled = 0, alreadyTaken = 0;
    if (studentIds.length) {
      const profs = await db.select({ userId: profiles.userId, alloc: profiles.totalAllocatedSessions, taken: profiles.alreadyTakenSessions })
        .from(profiles).where(inArray(profiles.userId, studentIds));
      for (const sid of studentIds) {
        const p = profs.find((x) => x.userId === sid);
        entitled += p?.alloc && p.alloc > 0 ? p.alloc : 20;
        alreadyTaken += p?.taken || 0;
      }
    }
    let validAllTime = 0;
    if (mine.length) {
      const r = await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions)
        .where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceOneToOneId, mine.map((m) => m.id))));
      validAllTime = new Set(r.map((x) => x.id)).size;
    }
    const completed = validAllTime + alreadyTaken;
    res.json([{
      studentCount: studentIds.length,
      totalClassesEntitled: entitled,
      completed,
      pending: Math.max(entitled - completed, 0),
      days,
    }]);
  } catch (err) { handleError(res, err); }
});

mobileRouter.get("/reports/my-salary", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["teacher"]);
    if (!user) return;
    const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : istKey(new Date()).slice(0, 7);
    const db = getDb();
    await recalculateSalaryInternal(db, user.id, month).catch(() => {});
    const row = await db.query.teacherSalaries.findFirst({ where: and(eq(teacherSalaries.teacherId, user.id), eq(teacherSalaries.month, month)) });
    res.json({
      month,
      classesTaken: (row?.groupClassesCount || 0) + (row?.oneToOneCount || 0),
      count30: (row?.group30MinCount || 0) + (row?.oneToOne30MinCount || 0),
      count45: (row?.group45MinCount || 0) + (row?.oneToOne45MinCount || 0),
      count60: (row?.group60MinCount || 0) + (row?.oneToOne60MinCount || 0),
      totalAmount: row ? parseFloat(row.totalAmount as any) || 0 : 0,
    });
  } catch (err) { handleError(res, err); }
});

mobileRouter.get("/reports/student/:id", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["student", "teacher"]);
    if (!user) return;
    const studentId = Number(req.params.id);
    if (!studentId) return res.status(400).json({ error: "Invalid student", code: "BAD_REQUEST" });
    const db = getDb();
    if (user.role === "student" && studentId !== user.id) {
      return res.status(403).json({ error: "You can only view your own report", code: "FORBIDDEN" });
    }
    if (user.role === "teacher") {
      const link = await db.select({ id: oneToOneSessions.id }).from(oneToOneSessions)
        .where(and(eq(oneToOneSessions.teacherId, user.id), eq(oneToOneSessions.studentId, studentId))).limit(1);
      if (!link.length) return res.status(403).json({ error: "Not your student", code: "FORBIDDEN" });
    }
    const u = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!u) return res.status(404).json({ error: "Student not found", code: "NOT_FOUND" });
    const prof = await db.query.profiles.findFirst({ where: eq(profiles.userId, studentId) });

    const debits = await db.select({ amount: classLedgerTransactions.amount, o2o: classLedgerTransactions.referenceOneToOneId, cls: classLedgerTransactions.referenceClassId })
      .from(classLedgerTransactions).where(and(eq(classLedgerTransactions.studentId, studentId), eq(classLedgerTransactions.type, "debit")));
    const completedInLms = debits.reduce((n, d) => n + (Number(d.amount) || 1), 0);
    const alreadyTaken = prof?.alreadyTakenSessions || 0;
    const allocated = prof?.totalAllocatedSessions && prof.totalAllocatedSessions > 0 ? prof.totalAllocatedSessions : 20;
    const validO2o = new Set(debits.map((d) => d.o2o).filter(Boolean));
    const validCls = new Set(debits.map((d) => d.cls).filter(Boolean));

    const o2o = await db.select().from(oneToOneSessions).where(eq(oneToOneSessions.studentId, studentId))
      .orderBy(desc(oneToOneSessions.scheduledAt)).limit(60);
    const grp = await db.select({ classId: attendance.classId, at: classes.scheduledAt, len: classes.duration, dur: attendance.duration, st: classes.status })
      .from(attendance).innerJoin(classes, eq(attendance.classId, classes.id))
      .where(eq(attendance.studentId, studentId)).orderBy(desc(classes.scheduledAt)).limit(60);

    const sessions = [
      ...o2o.filter((s) => s.status !== "cancelled").map((s) => ({
        scheduledAt: s.scheduledAt, sessionLength: s.sessionLength, actualDuration: s.actualDuration, status: s.status,
        valid: s.status === "completed" ? validO2o.has(s.id) : null, type: "one_to_one",
      })),
      ...grp.map((g) => ({
        scheduledAt: g.at, sessionLength: g.len, actualDuration: g.dur, status: g.st,
        valid: g.st === "completed" ? validCls.has(g.classId as number) : null, type: "group",
      })),
    ].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

    res.json({
      name: u.name,
      isActive: u.status === "active",
      totalCompleted: completedInLms + alreadyTaken,
      totalRemaining: Math.max(allocated - completedInLms - alreadyTaken, 0),
      completedInLms,
      alreadyTaken,
      sessions,
    });
  } catch (err) { handleError(res, err); }
});


// ───────────── Per-session report (teacher) ─────────────

// Pairs join/leave events into minutes per user; anyone still "in" is counted until endAt.
function minutesByUser(evs: { userId: number; eventType: string; timestamp: Date }[], endAt: Date) {
  const total: Record<number, number> = {};
  const open: Record<number, Date> = {};
  for (const e of evs) {
    if (e.eventType === "join") { if (!open[e.userId]) open[e.userId] = e.timestamp; }
    else if (open[e.userId]) {
      total[e.userId] = (total[e.userId] || 0) + (e.timestamp.getTime() - open[e.userId].getTime()) / 60000;
      delete open[e.userId];
    }
  }
  for (const uid of Object.keys(open)) {
    const id = Number(uid);
    total[id] = (total[id] || 0) + Math.max(0, endAt.getTime() - open[id].getTime()) / 60000;
  }
  for (const k of Object.keys(total)) total[Number(k)] = Math.round(total[Number(k)] * 10) / 10;
  return total;
}

async function buildSessionRows(teacherId: number, from: Date, to: Date, only?: { type: string; id: number }) {
  const db = getDb();
  const o2oWhere = [eq(oneToOneSessions.teacherId, teacherId), ne(oneToOneSessions.status, "cancelled")];
  const grpWhere = [eq(classes.teacherId, teacherId), ne(classes.status, "cancelled")];
  if (only) {
    if (only.type === "one_to_one") o2oWhere.push(eq(oneToOneSessions.id, only.id));
    else grpWhere.push(eq(classes.id, only.id));
  } else {
    o2oWhere.push(gte(oneToOneSessions.scheduledAt, from), lt(oneToOneSessions.scheduledAt, to));
    grpWhere.push(gte(classes.scheduledAt, from), lt(classes.scheduledAt, to));
  }
  const o2o = only && only.type !== "one_to_one" ? [] : await db.select().from(oneToOneSessions).where(and(...o2oWhere)).orderBy(desc(oneToOneSessions.scheduledAt)).limit(200);
  const grp = only && only.type !== "group" ? [] : await db.select().from(classes).where(and(...grpWhere)).orderBy(desc(classes.scheduledAt)).limit(200);

  const o2oIds = o2o.map((x) => x.id);
  const grpIds = grp.map((x) => x.id);
  const evO = o2oIds.length ? await db.select().from(attendanceEvents).where(inArray(attendanceEvents.oneToOneSessionId, o2oIds)).orderBy(attendanceEvents.timestamp) : [];
  const evG = grpIds.length ? await db.select().from(attendanceEvents).where(inArray(attendanceEvents.classId, grpIds)).orderBy(attendanceEvents.timestamp) : [];
  const attO = o2oIds.length ? await db.select().from(attendance).where(inArray(attendance.oneToOneSessionId, o2oIds)) : [];
  const attG = grpIds.length ? await db.select().from(attendance).where(inArray(attendance.classId, grpIds)) : [];
  const debO = o2oIds.length ? await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions).where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceOneToOneId, o2oIds))) : [];
  const debG = grpIds.length ? await db.select({ id: classLedgerTransactions.referenceClassId }).from(classLedgerTransactions).where(and(eq(classLedgerTransactions.type, "debit"), inArray(classLedgerTransactions.referenceClassId, grpIds))) : [];
  const validO = new Set(debO.map((d) => d.id)), validG = new Set(debG.map((d) => d.id));

  const userIds = Array.from(new Set([...o2o.map((x) => x.studentId), ...attG.map((a) => a.studentId), ...evO.map((e) => e.userId), ...evG.map((e) => e.userId)]));
  const us = userIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
  const nameOf = (id: number) => us.find((u) => u.id === id)?.name || `User #${id}`;
  const now = new Date();

  const rows: any[] = [];
  for (const s of o2o) {
    const evs = evO.filter((e) => e.oneToOneSessionId === s.id);
    const mins = minutesByUser(evs, s.endedAt || s.completedAt || now);
    const tMin = mins[s.teacherId] ?? (s.teacherDuration || 0);
    const stMin = mins[s.studentId] ?? (s.studentDuration || 0);
    const a = attO.find((x) => x.oneToOneSessionId === s.id);
    rows.push({
      type: "one_to_one", id: s.id, title: s.title, scheduledAt: s.scheduledAt, sessionLength: s.sessionLength, status: s.status,
      valid: s.status === "completed" ? validO.has(s.id) : null,
      teacherMinutes: tMin,
      students: [{ id: s.studentId, name: nameOf(s.studentId), minutes: stMin, attendance: a?.status ?? null }],
      events: evs.map((e) => ({ name: e.userId === s.teacherId ? "Teacher" : nameOf(e.userId), eventType: e.eventType, timestamp: e.timestamp })),
    });
  }
  for (const c of grp) {
    const evs = evG.filter((e) => e.classId === c.id);
    const mins = minutesByUser(evs, c.endedAt || now);
    const atts = attG.filter((a) => a.classId === c.id);
    rows.push({
      type: "group", id: c.id, title: c.title, scheduledAt: c.scheduledAt, sessionLength: c.duration, status: c.status,
      valid: c.status === "completed" ? validG.has(c.id) : null,
      teacherMinutes: mins[c.teacherId] ?? 0,
      students: atts.map((a) => ({ id: a.studentId, name: nameOf(a.studentId), minutes: mins[a.studentId] ?? (a.duration || 0), attendance: a.status })),
      events: evs.map((e) => ({ name: e.userId === c.teacherId ? "Teacher" : nameOf(e.userId), eventType: e.eventType, timestamp: e.timestamp })),
    });
  }
  rows.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  return rows;
}

mobileRouter.get("/reports/sessions", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["teacher"]);
    if (!user) return;
    if (!isYmd(req.query.startDate) || !isYmd(req.query.endDate)) {
      return res.status(400).json({ error: "startDate and endDate (YYYY-MM-DD) required", code: "BAD_REQUEST" });
    }
    const from = istDayStart(req.query.startDate as string);
    const to = new Date(istDayStart(req.query.endDate as string).getTime() + 24 * 3600 * 1000);
    if (to <= from || (to.getTime() - from.getTime()) / 86400000 > 400) {
      return res.status(400).json({ error: "Invalid date range", code: "BAD_REQUEST" });
    }
    const rows = await buildSessionRows(user.id, from, to);
    res.json(rows.map(({ events, ...r }) => r));
  } catch (err) { handleError(res, err); }
});

mobileRouter.get("/reports/session/:type/:id", async (req: Request, res: Response) => {
  try {
    const user = await reportUser(req, res, ["teacher"]);
    if (!user) return;
    const type = req.params.type === "group" ? "group" : "one_to_one";
    const rows = await buildSessionRows(user.id, new Date(0), new Date(), { type, id: Number(req.params.id) });
    if (!rows.length) return res.status(404).json({ error: "Session not found", code: "NOT_FOUND" });
    res.json(rows[0]);
  } catch (err) { handleError(res, err); }
});
