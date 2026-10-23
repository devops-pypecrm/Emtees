// One-off: recompute the stored per-person minutes of completed 1-to-1 sessions with the shared calculation
// (lib/sessionMinutes.ts), so old sessions agree with what the reports now show.
// It only updates minute columns (session teacher/student/actual duration, attendance.duration).
// It never changes validity, class credits or salary — sessions whose validity WOULD change are listed instead.
//
//   npx tsx db/refresh_durations.ts            -> dry run (prints what would change)
//   npx tsx db/refresh_durations.ts --apply    -> writes the changes
import { eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../src/queries/connection";
import { attendanceEvents, oneToOneSessions, attendance, classLedgerTransactions, systemSettings } from "./schema";
import { computeParticipantMinutes, wholeMinutes } from "../src/lib/sessionMinutes";

const APPLY = process.argv.includes("--apply");
async function main() {
  const db = getDb();
  const th = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, "class_duration_threshold") });
  const threshold = th ? parseInt(th.value) || 20 : 20;
  const evs = await db.select().from(attendanceEvents).where(isNotNull(attendanceEvents.oneToOneSessionId)).orderBy(attendanceEvents.timestamp);
  const ids = [...new Set(evs.map((e) => e.oneToOneSessionId as number))];
  const sessions = ids.length ? await db.select().from(oneToOneSessions).where(inArray(oneToOneSessions.id, ids)) : [];
  const atts = ids.length ? await db.select().from(attendance).where(inArray(attendance.oneToOneSessionId, ids)) : [];
  const debs = ids.length ? await db.select({ id: classLedgerTransactions.referenceOneToOneId }).from(classLedgerTransactions).where(inArray(classLedgerTransactions.referenceOneToOneId, ids)) : [];
  const valid = new Set(debs.map((d) => d.id));
  let changed = 0, validityWould = 0;
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const e = evs.filter((x) => x.oneToOneSessionId === s.id);
    const m = computeParticipantMinutes(e, s.endedAt || s.completedAt || new Date());
    const t = wholeMinutes(m[s.teacherId]), st = wholeMinutes(m[s.studentId]);
    const a = atts.find((x) => x.oneToOneSessionId === s.id);
    const diff = t !== (s.teacherDuration ?? 0) || st !== (s.studentDuration ?? 0) || (a && a.duration !== st);
    const wouldBeValid = t >= threshold && st >= threshold, isValid = valid.has(s.id);
    if (!diff && wouldBeValid === isValid) continue;
    changed += diff ? 1 : 0;
    console.log(`#${s.id}: teacher ${s.teacherDuration ?? 0}->${t}, student ${s.studentDuration ?? 0}->${st}, attendance ${a?.duration ?? "-"}->${st}` + (wouldBeValid !== isValid ? `   !! validity: now ${isValid ? "valid" : "invalid"}, by minutes would be ${wouldBeValid ? "valid" : "invalid"} (NOT changed)` : ""));
    if (wouldBeValid !== isValid) validityWould++;
    if (APPLY && diff) {
      await db.update(oneToOneSessions).set({ teacherDuration: t, studentDuration: st, actualDuration: t }).where(eq(oneToOneSessions.id, s.id));
      if (a) await db.update(attendance).set({ duration: st }).where(eq(attendance.id, a.id));
    }
  }
  console.log(`\n${APPLY ? "UPDATED" : "WOULD UPDATE"} ${changed} session(s); validity differences (left untouched): ${validityWould}; threshold ${threshold} min`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
