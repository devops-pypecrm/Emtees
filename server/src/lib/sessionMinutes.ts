import { inArray } from "drizzle-orm";
import { attendanceEvents } from "@db/schema";

/** A dropped participant who rejoins within this many minutes is treated as never having left. */
export const REJOIN_GRACE_MINUTES = 5;

type Ev = { userId: number; eventType: string; timestamp: Date };

/**
 * THE one place that decides how many minutes each person spent in a class.
 * Used by the class engine (valid/invalid), the teacher's Sessions report and the student's report,
 * so every screen shows the same number for the same person.
 *
 *  - Time between a join and the next leave counts.
 *  - A rejoin within REJOIN_GRACE_MINUTES of a leave counts the gap too (network blips don't penalise anyone).
 *  - Nothing after `endAt` (the moment the class ended) counts, and anyone still in the call at that moment
 *    is counted up to `endAt`.
 * Returns minutes (fractional) per userId.
 */
export function computeParticipantMinutes(events: Ev[], endAt: Date): Record<number, number> {
  const endMs = endAt.getTime();
  const total: Record<number, number> = {};
  const activeFrom: Record<number, number> = {};
  const lastLeave: Record<number, number> = {};
  const add = (uid: number, fromMs: number, toMs: number) => {
    const to = Math.min(toMs, endMs);
    if (to > fromMs) total[uid] = (total[uid] || 0) + (to - fromMs) / 60000;
  };
  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const e of sorted) {
    const uid = e.userId;
    const t = e.timestamp.getTime();
    if (e.eventType === "join") {
      if (activeFrom[uid] === undefined) {
        activeFrom[uid] = t;
        const prev = lastLeave[uid];
        if (prev !== undefined && (t - prev) / 60000 <= REJOIN_GRACE_MINUTES) add(uid, prev, t);
      }
    } else if (e.eventType === "leave" && activeFrom[uid] !== undefined) {
      add(uid, activeFrom[uid], t);
      delete activeFrom[uid];
      lastLeave[uid] = t;
    }
  }
  for (const uid of Object.keys(activeFrom)) add(Number(uid), activeFrom[Number(uid)], endMs);
  return total;
}

/** Whole minutes as shown to users and stored on the session (always rounded down). */
export const wholeMinutes = (m: number | undefined | null) => Math.floor((m || 0) + 1e-9);

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
 * Minutes for one 1-to-1 session: from the recorded join/leave events when there are any,
 * otherwise from the per-minute heartbeat counters kept on the session (older sessions).
 */
export function oneToOneMinutes(
  s: { teacherId: number; studentId: number; endedAt: Date | null; completedAt: Date | null; teacherDuration?: number | null; studentDuration?: number | null },
  events: Ev[] | undefined
) {
  if (events && events.length) {
    const m = computeParticipantMinutes(events, s.endedAt || s.completedAt || new Date());
    return { teacher: wholeMinutes(m[s.teacherId]), student: wholeMinutes(m[s.studentId]), fromEvents: true };
  }
  return { teacher: s.teacherDuration || 0, student: s.studentDuration || 0, fromEvents: false };
}
