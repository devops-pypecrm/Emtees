import { and, eq, sql } from "drizzle-orm";
import { classLedgerTransactions, profiles } from "@db/schema";
import { courseAllocations } from "@db/srs-schema";

/**
 * SRS 10: one clear balance for a student.
 *  allocated  = every allocation entry (initial + additional + adjustments). Older students who have no entries
 *               yet fall back to the total stored on their profile.
 *  consumed   = qualifying completed classes (ledger debits)
 *  expired    = classes written off after the validity period
 *  balance    = allocated - consumed - expired
 * Teacher changes never touch these numbers.
 */
export async function getBalance(db: any, studentUserId: number) {
  const [a] = await db.select({
    total: sql<number>`coalesce(sum(${courseAllocations.classes}),0)`,
    additional: sql<number>`coalesce(sum(case when ${courseAllocations.kind}='additional' then ${courseAllocations.classes} else 0 end),0)`,
    n: sql<number>`count(*)`,
  }).from(courseAllocations).where(eq(courseAllocations.studentUserId, studentUserId));
  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, studentUserId) });
  const allocated = Number(a.n) > 0 ? Number(a.total) : (profile?.totalAllocatedSessions || 0);

  const rows = await db.select({ type: classLedgerTransactions.type, n: sql<number>`coalesce(sum(${classLedgerTransactions.amount}),0)` })
    .from(classLedgerTransactions).where(eq(classLedgerTransactions.studentId, studentUserId)).groupBy(classLedgerTransactions.type);
  const by = (t: string) => Number(rows.find((r: any) => r.type === t)?.n || 0);
  const consumed = by("debit");
  const expired = by("expired");
  return {
    allocated, additional: Number(a.additional), consumed, expired,
    balance: Math.max(0, allocated - consumed - expired),
    validityEndDate: profile?.validityEndDate ?? null,
  };
}
