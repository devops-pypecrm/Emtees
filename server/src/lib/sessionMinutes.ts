import { inArray } from "drizzle-orm";
import { attendanceEvents } from "@db/schema";

/**
 * THE one place that decides how long a teacher and a student were really in a class together.
 * Used by the class engine (counted / not counted), the live "minimum reached" check, the teacher's
 * Sessions report and the student's report, so every screen shows the same numbers.
 *
 * Rules (SRS section 8):
 *  - Only the time BOTH people are connected at the same moment counts (their "overlap").
 *  - The timer adds up overlapping time, not wall-clock time: gaps are never counted.
 *  - If the overlap resumes within the reconnection window (default 5 minutes) it is the SAME logical
 *    session. A longer gap closes the session as interrupted and the next one is independent.
 *  - Sessions are never added together. The class counts only if ONE logical session reaches the minimum;
 *    the best session is the one reported.
 *  - Nothing after `endAt` (when the class ended) counts; someone still connected at that moment is counted
 *    up to `endAt`.
 */

type Ev = { userId: number; eventType: string; timestamp: Date };
export type Interval = { start: number; end: number };

/** Default reconnection window in minutes (the real value is the admin setting `reconnection_window_minutes`). */
export const DEFAULT_RECONNECTION_MINUTES = 5;
/** Kept for older imports. */
export const REJOIN_GRACE_MINUTES = DEFAULT_RECONNECTION_MINUTES;

const MIN = 60000;

/** One person's connected periods, from join/leave events, clamped to `endMs`, sorted and non-overlapping. */
export function presenceIntervals(events: Ev[], userId: number, endMs: number): Interval[] {
  const mine = events.filter((e) => e.userId === userId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const out: Interval[] = [];
  let open: number | undefined;
  for (const e of mine) {
    const t = e.timestamp.getTime();
    if (e.eventType === "join") {
      if (open === undefined) open = t;
    } else if (e.eventType === "leave" && open !== undefined) {
      const end = Math.min(t, endMs);
      if (end > open) out.push({ start: open, end });
      open = undefined;
    }
  }
  if (open !== undefined && endMs > open) out.push({ start: open, end: endMs });
  return out;
}

const sumMinutes = (iv: Interval[]) => iv.reduce((n, i) => n + (i.end - i.start) / MIN, 0);

/** Time both people are connected at once. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) out.push({ start, end });
    if (a[i].end < b[j].end) i++; else j++;
  }
  return out;
}

export type LogicalSession = { start: Date; end: Date; minutes: number; gaps: number };

export type PairResult = {
  /** Minutes of the best logical session (this is what is compared with the minimum). */
  qualifyingMinutes: number;
  /** Every logical session, in time order. More than one means the class was interrupted. */
  sessions: LogicalSession[];
  /** Reconnections (gaps within the window) inside the best session. */
  interruptions: number;
  /** Times the connection resumed after a gap, across all sessions (for the audit trail). */
  rejoinTimes: Date[];
  /** Each person's own total connected time (no overlap needed). */
  teacherMinutes: number;
  studentMinutes: number;
  /** Did the two ever share the call at all? */
  hadOverlap: boolean;
};

export function computePair(
  events: Ev[],
  teacherId: number,
  studentId: number,
  endAt: Date,
  reconnectionMinutes: number = DEFAULT_RECONNECTION_MINUTES
): PairResult {
  const endMs = endAt.getTime();
  const t = presenceIntervals(events, teacherId, endMs);
  const s = presenceIntervals(events, studentId, endMs);
  const overlap = intersect(t, s);
  const graceMs = reconnectionMinutes * MIN;

  const sessions: LogicalSession[] = [];
  const rejoinTimes: Date[] = [];
  let cur: { start: number; end: number; minutes: number; gaps: number } | null = null;
  for (const iv of overlap) {
    if (cur && iv.start - cur.end <= graceMs) {
      cur.gaps++;
      cur.minutes += (iv.end - iv.start) / MIN;
      cur.end = iv.end;
      rejoinTimes.push(new Date(iv.start));
    } else {
      if (cur) sessions.push({ start: new Date(cur.start), end: new Date(cur.end), minutes: cur.minutes, gaps: cur.gaps });
      cur = { start: iv.start, end: iv.end, minutes: (iv.end - iv.start) / MIN, gaps: 0 };
      if (sessions.length > 0) rejoinTimes.push(new Date(iv.start));
    }
  }
  if (cur) sessions.push({ start: new Date(cur.start), end: new Date(cur.end), minutes: cur.minutes, gaps: cur.gaps });

  const best = sessions.reduce<LogicalSession | null>((b, x) => (!b || x.minutes > b.minutes ? x : b), null);
  return {
    qualifyingMinutes: best ? best.minutes : 0,
    sessions,
    interruptions: best ? best.gaps : 0,
    rejoinTimes,
    teacherMinutes: sumMinutes(t),
    studentMinutes: sumMinutes(s),
    hadOverlap: overlap.length > 0,
  };
}

/** Whole minutes as shown to users and stored (always rounded down). */
export const wholeMinutes = (m: number | undefined | null) => Math.floor((m || 0) + 1e-9);

/** Per-person connected minutes (no overlap rule). Used where only one person's time is needed. */
export function computeParticipantMinutes(events: Ev[], endAt: Date): Record<number, number> {
  const endMs = endAt.getTime();
  const out: Record<number, number> = {};
  for (const uid of new Set(events.map((e) => e.userId))) out[uid] = sumMinutes(presenceIntervals(events, uid, endMs));
  return out;
}

/** Loads join/leave events for several 1-to-1 sessions at once, grouped by session id. */
export async function loadOneToOneEvents(db: any, sessionIds: number[]) {
  const bySession = new Map<number, Ev[]>();
  if (!sessionIds.length) return bySession;
  const rows = await db.select().from(attendanceEvents).where(inArray(attendanceEvents.oneToOneSessionId, sessionIds));
  for (const r of rows) {
    const k = r.oneToOneSessionId as number;
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k)!.push(r);
  }
  return bySession;
}

/**
 * Numbers for one 1-to-1 session: from the recorded join/leave events when there are any, otherwise from the
 * per-minute heartbeat counters kept on the session (older sessions). `student` is the time the two were
 * together (the qualifying time), which is what both the teacher's and the student's report show.
 */
export function oneToOneMinutes(
  s: { teacherId: number; studentId: number; endedAt: Date | null; completedAt: Date | null; teacherDuration?: number | null; studentDuration?: number | null },
  events: Ev[] | undefined,
  reconnectionMinutes: number = DEFAULT_RECONNECTION_MINUTES
) {
  if (events && events.length) {
    const r = computePair(events, s.teacherId, s.studentId, s.endedAt || s.completedAt || new Date(), reconnectionMinutes);
    return {
      teacher: wholeMinutes(r.teacherMinutes),
      student: wholeMinutes(r.qualifyingMinutes), // together
      studentOwn: wholeMinutes(r.studentMinutes),
      interruptions: r.interruptions,
      sessionsCount: r.sessions.length,
      fromEvents: true,
    };
  }
  const t = s.teacherDuration || 0, st = s.studentDuration || 0;
  return { teacher: t, student: Math.min(t, st), studentOwn: st, interruptions: 0, sessionsCount: t || st ? 1 : 0, fromEvents: false };
}
