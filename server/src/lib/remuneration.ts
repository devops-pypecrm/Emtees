import { and, eq } from "drizzle-orm";
import { remunerationRules, remunerationEntries } from "@db/srs-schema";
import { getNumberSetting } from "./settings";

type Query = {
  teacherId: number;
  studentUserId?: number | null;
  course?: string | null;
  sessionType?: "individual" | "group";
  groupSize?: number | null;
  durationMinutes?: number | null;
  kind: "regular" | "demo" | "demo_bonus";
};

/**
 * SRS 13.2: the most specific active rule wins. A rule matches when every field it sets equals the query;
 * specificity = number of fields it sets. With no rule, the admin-set default applies (never hard-coded in
 * code paths): regular = rate_regular_30min scaled by duration/30, demo = rate_demo, bonus = rate_demo_bonus.
 */
export async function resolveRate(db: any, q: Query): Promise<{ amount: number; ruleId: number | null }> {
  const rules = await db.select().from(remunerationRules).where(and(eq(remunerationRules.active, true), eq(remunerationRules.kind, q.kind)));
  let best: any = null, bestScore = -1;
  for (const r of rules) {
    let score = 0, ok = true;
    const chk = (set: any, want: any) => { if (set == null) return; if (set !== want) ok = false; else score++; };
    chk(r.teacherId, q.teacherId);
    chk(r.studentUserId, q.studentUserId ?? null);
    chk(r.course, q.course ?? null);
    chk(r.sessionType, q.sessionType ?? null);
    chk(r.groupSize, q.groupSize ?? null);
    chk(r.durationMinutes, q.durationMinutes ?? null);
    if (ok && score > bestScore) { best = r; bestScore = score; }
  }
  if (best) return { amount: Number(best.amount), ruleId: best.id };
  if (q.kind === "demo") return { amount: await getNumberSetting(db, "rate_demo"), ruleId: null };
  if (q.kind === "demo_bonus") return { amount: await getNumberSetting(db, "rate_demo_bonus"), ruleId: null };
  const base = await getNumberSetting(db, "rate_regular_30min");
  return { amount: Math.round((base * (q.durationMinutes || 30)) / 30), ruleId: null };
}

/** One entry per qualifying 1-to-1 session or class, frozen at today's rate (SRS 13.3). Idempotent. */
export async function recordClassRemuneration(db: any, p: {
  teacherId: number; studentUserId: number; course?: string | null; durationMinutes: number;
  oneToOneSessionId?: number | null; classId?: number | null; groupSize?: number; payOverride?: number | null;
}) {
  const kind = p.classId ? "group" : "regular";
  const where = p.classId
    ? and(eq(remunerationEntries.classId, p.classId), eq(remunerationEntries.kind, "group"))
    : and(eq(remunerationEntries.oneToOneSessionId, p.oneToOneSessionId!), eq(remunerationEntries.kind, "regular"));
  const [exists] = await db.select({ id: remunerationEntries.id }).from(remunerationEntries).where(where).limit(1);
  if (exists) return;
  const { amount, ruleId } = p.payOverride != null ? { amount: p.payOverride, ruleId: null } : await resolveRate(db, {
    teacherId: p.teacherId, studentUserId: p.studentUserId, course: p.course,
    sessionType: p.classId ? "group" : "individual", groupSize: p.groupSize ?? null,
    durationMinutes: p.durationMinutes, kind: "regular",
  });
  await db.insert(remunerationEntries).values({
    teacherId: p.teacherId, kind, oneToOneSessionId: p.oneToOneSessionId ?? null, classId: p.classId ?? null,
    studentUserId: p.studentUserId, ruleId, amount: String(amount),
  }).onConflictDoNothing();
}
