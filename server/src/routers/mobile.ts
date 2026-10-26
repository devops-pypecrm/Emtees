import { Router, Request, Response } from "express";
import { jwtVerify } from "jose";
import { jwtSecret } from "../lib/env";
import { appRouter } from "../router";
import type { TrpcContext } from "../context";
import { and, eq, gte, lt, inArray, ne, desc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { classes, oneToOneSessions, classLedgerTransactions, profiles, users, teacherSalaries, attendance, attendanceEvents } from "@db/schema";
import { recalculateSalaryInternal } from "./admin";
import { computeParticipantMinutes, oneToOneMinutes, wholeMinutes } from "../lib/sessionMinutes";

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
// ---- Teacher reschedule requests (1-to-1) ----
mobileRouter.post(
  "/one-to-one/:id/reschedule-request",
  wrap((c, req) =>
    c.class.requestReschedule({
      sessionId: Number(req.params.id),
      proposedScheduledAt: new Date(req.body.proposedScheduledAt),
      reason: String(req.body.reason || ""),
    })
  )
);
mobileRouter.get(
  "/reschedule-requests",
  wrap((c, req) => c.class.listRescheduleRequests(req.query.status ? { status: req.query.status as any } : undefined))
);

// ---- Reports (teachers: own numbers, students: own report; admins/heads are web-only) ----
mobileRouter.get(
  "/reports/daily",
  wrap((c, req) => c.teacherReports.dailyReport({ date: String(req.query.date) }))
);
mobileRouter.get(
  "/reports/range",
  wrap((c, req) =>
    c.teacherReports.rangeReport({ startDate: String(req.query.startDate), endDate: String(req.query.endDate) })
  )
);
mobileRouter.get(
  "/reports/my-salary",
  wrap((c, req) => c.teacherReports.mySalary(req.query.month ? { month: String(req.query.month) } : undefined))
);
mobileRouter.get(
  "/reports/student/:id",
  wrap((c, req) => c.teacherReports.studentReport({ studentId: Number(req.params.id) }))
);

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

// ───────────── Per-session report (teacher) ─────────────

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
  const o2o = only && only.type !== "one_to_one" ? [] : await db.select().from(oneToOneSessions).where(and(...o2oWhere)).orderBy(desc(oneToOneSessions.scheduledAt)).limit(600);
  const grp = only && only.type !== "group" ? [] : await db.select().from(classes).where(and(...grpWhere)).orderBy(desc(classes.scheduledAt)).limit(600);

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
    const { teacher: tMin, student: stMin } = oneToOneMinutes(s, evs);
    const a = attO.find((x) => x.oneToOneSessionId === s.id);
    rows.push({
      type: "one_to_one", id: s.id, title: s.title, scheduledAt: s.scheduledAt, sessionLength: s.sessionLength, status: s.status,
      valid: validO.has(s.id) ? true : (s.status === "completed" ? false : null),
      teacherMinutes: tMin,
      students: [{ id: s.studentId, name: nameOf(s.studentId), minutes: stMin, attendance: a?.status ?? null }],
      events: evs.map((e) => ({ name: e.userId === s.teacherId ? "Teacher" : nameOf(e.userId), eventType: e.eventType, timestamp: e.timestamp })),
    });
  }
  for (const c of grp) {
    const evs = evG.filter((e) => e.classId === c.id);
    const mins = computeParticipantMinutes(evs, c.endedAt || now);
    const atts = attG.filter((a) => a.classId === c.id);
    rows.push({
      type: "group", id: c.id, title: c.title, scheduledAt: c.scheduledAt, sessionLength: c.duration, status: c.status,
      valid: validG.has(c.id) ? true : (c.status === "completed" ? false : null),
      teacherMinutes: wholeMinutes(mins[c.teacherId]),
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
