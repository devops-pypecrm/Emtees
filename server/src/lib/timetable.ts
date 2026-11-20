import { and, eq, gte, lte, ne } from "drizzle-orm";
import { oneToOneSessions, users } from "@db/schema";
import { timetableSlots } from "@db/srs-schema";
import { getBalance } from "./balance";

const IST_OFFSET_MIN = 330;

/**
 * SRS 7: turns each student's recurring timetable into real scheduled sessions for the next few days.
 * Skips students on hold or with no balance, and never creates a session twice for the same time.
 */
export async function generateSessionsFromTimetable(db: any, daysAhead = 3): Promise<number> {
  const slots = await db.select().from(timetableSlots).where(and(eq(timetableSlots.active, true), eq(timetableSlots.onHold, false)));
  let created = 0;
  const now = Date.now();
  for (const s of slots) {
    const days = s.weekdays.split(",").map(Number);
    const bal = await getBalance(db, s.studentUserId);
    if (bal.balance <= 0) continue;
    for (let i = 0; i <= daysAhead; i++) {
      // The slot time is IST wall-clock; build the UTC instant for that IST day.
      const istNow = new Date(now + IST_OFFSET_MIN * 60000 + i * 86400000);
      if (!days.includes(istNow.getUTCDay())) continue;
      const [hh, mm] = s.timeOfDay.split(":").map(Number);
      const when = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hh, mm) - IST_OFFSET_MIN * 60000);
      if (when.getTime() < now - 10 * 60000 || when < new Date(s.startsOn)) continue;
      const lo = new Date(when.getTime() - 5 * 60000), hi = new Date(when.getTime() + 5 * 60000);
      const dup = await db.select({ id: oneToOneSessions.id }).from(oneToOneSessions).where(and(
        eq(oneToOneSessions.studentId, s.studentUserId), gte(oneToOneSessions.scheduledAt, lo), lte(oneToOneSessions.scheduledAt, hi), ne(oneToOneSessions.status, "cancelled"),
      )).limit(1);
      if (dup.length) continue;
      const room = `emtees-1to1-t${s.id}-${when.getTime()}`;
      const until = new Date(when.getTime() + 60 * 86400000);
      await db.insert(oneToOneSessions).values({
        teacherId: s.teacherId, studentId: s.studentUserId, title: "Class", sessionLength: s.durationMinutes, scheduledAt: when,
        createdBy: s.createdBy ?? null, validFrom: when, validUntil: until, meetingRoomId: room, meetingUrl: `https://meet.gecouncil.com/${room}`, status: "scheduled",
      });
      created++;
    }
  }
  return created;
}
