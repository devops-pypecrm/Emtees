import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { createRouter, authedQuery, roleQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, demoClasses } from "@db/schema";
import { remunerationRules, remunerationEntries, admissions } from "@db/srs-schema";
import { audit } from "../lib/audit";
import { resolveRate } from "../lib/remuneration";
import { NotificationService } from "../lib/notificationService";

const fin = ["admin", "accountant"];
const startOf = (d: Date, unit: "day" | "week" | "month") => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  if (unit === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (unit === "month") x.setDate(1);
  return x;
};

/** Pay per class set for ONE teacher and ONE student (the most specific rule, so it wins over teacher-wide or default rates). */
export async function currentStudentRate(db: any, teacherId: number, studentUserId: number): Promise<number | null> {
  const [r] = await db.select().from(remunerationRules).where(and(eq(remunerationRules.teacherId, teacherId), eq(remunerationRules.studentUserId, studentUserId), eq(remunerationRules.kind, "regular"), eq(remunerationRules.active, true))).orderBy(desc(remunerationRules.createdAt)).limit(1);
  return r ? Number(r.amount) : null;
}
/** Sets (replaces) the per-class pay of a teacher for one student. Old rule is kept switched off for history; already-earned entries never change. */
export async function setStudentRate(db: any, user: any, teacherId: number, studentUserId: number, amount: number, reason?: string) {
  const prev = await currentStudentRate(db, teacherId, studentUserId);
  if (prev === amount) return;
  await db.update(remunerationRules).set({ active: false }).where(and(eq(remunerationRules.teacherId, teacherId), eq(remunerationRules.studentUserId, studentUserId), eq(remunerationRules.kind, "regular"), eq(remunerationRules.active, true)));
  const [row] = await db.insert(remunerationRules).values({ teacherId, studentUserId, sessionType: null, kind: "regular", amount: String(amount), active: true, createdBy: user.id } as any).returning();
  await audit(db, user, prev == null ? "remuneration_rule_created" : "remuneration_rule_updated", "remuneration_rule", row.id, prev == null ? null : { amount: prev }, { teacherId, studentUserId, amount }, reason || "Set with teacher assignment");
}

export const srsFinanceRouter = createRouter({
  /** Per-student pay for the student's current teacher (shown on the student page). */
  studentRate: roleQuery("admin", "academic_head", "accountant").input(z.object({ teacherId: z.number(), studentUserId: z.number() })).query(async ({ input }) => ({ amount: await currentStudentRate(getDb(), input.teacherId, input.studentUserId) })),
  setStudentRate: roleQuery("admin", "academic_head").input(z.object({ teacherId: z.number(), studentUserId: z.number(), amount: z.number().nonnegative(), reason: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await setStudentRate(getDb(), ctx.user, input.teacherId, input.studentUserId, input.amount, input.reason);
    return { ok: true };
  }),
  // ---- rules (SRS 13.2): only admin changes them ----
  rules: roleQuery(...fin).query(async () => {
    const db = getDb();
    const rows = await db.select({ r: remunerationRules, tn: sql<string>`(select name from users where id=${remunerationRules.teacherId})`, sn: sql<string>`(select name from users where id=${remunerationRules.studentUserId})` })
      .from(remunerationRules).orderBy(desc(remunerationRules.createdAt));
    return rows.map((x: any) => ({ ...x.r, teacherName: x.tn, studentName: x.sn }));
  }),
  saveRule: roleQuery("admin").input(z.object({
    id: z.number().optional(), teacherId: z.number().nullish(), studentUserId: z.number().nullish(), course: z.enum(["english", "hindi"]).nullish(),
    sessionType: z.enum(["individual", "group"]).nullish(), groupSize: z.number().int().min(2).max(3).nullish(), durationMinutes: z.number().int().nullish(),
    kind: z.enum(["regular", "demo", "demo_bonus"]).default("regular"), amount: z.number().nonnegative(), active: z.boolean().default(true), reason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { id, reason, ...vals } = input;
    const data: any = { ...vals, amount: String(vals.amount), createdBy: ctx.user.id };
    if (id) {
      const [prev] = await db.select().from(remunerationRules).where(eq(remunerationRules.id, id));
      await db.update(remunerationRules).set(data).where(eq(remunerationRules.id, id));
      await audit(db, ctx.user, "remuneration_rule_updated", "remuneration_rule", id, prev, data, reason);
      return { id };
    }
    const [row] = await db.insert(remunerationRules).values(data).returning();
    await audit(db, ctx.user, "remuneration_rule_created", "remuneration_rule", row.id, null, data, reason);
    return { id: row.id };
  }),
  previewRate: roleQuery(...fin).input(z.object({ teacherId: z.number(), studentUserId: z.number().optional(), durationMinutes: z.number().default(30), sessionType: z.enum(["individual", "group"]).default("individual"), kind: z.enum(["regular", "demo", "demo_bonus"]).default("regular") }))
    .query(async ({ input }) => resolveRate(getDb(), input as any)),

  // ---- entries ----
  /** Teacher dashboard (SRS 13.4): today / week / month earnings, split by type, payable / pending / paid. */
  myDashboard: roleQuery("teacher").input(z.object({ teacherId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = getDb();
    const tid = ctx.user.role === "teacher" ? ctx.user.id : input?.teacherId ?? ctx.user.id;
    const rows = await db.select().from(remunerationEntries).where(eq(remunerationEntries.teacherId, tid));
    const now = new Date();
    const sum = (f: (r: any) => boolean) => rows.filter(f).reduce((n: number, r: any) => n + Number(r.amount), 0);
    const since = (u: "day" | "week" | "month") => startOf(now, u).getTime();
    const at = (r: any) => new Date(r.earnedAt).getTime();
    return {
      today: sum((r) => at(r) >= since("day")), week: sum((r) => at(r) >= since("week")), month: sum((r) => at(r) >= since("month")),
      completedClasses: rows.filter((r: any) => r.kind === "regular" || r.kind === "group").length,
      regular: sum((r) => r.kind === "regular"), group: sum((r) => r.kind === "group"),
      demo: sum((r) => r.kind === "demo"), demoBonus: sum((r) => r.kind === "demo_bonus"), corrections: sum((r) => r.kind === "correction"),
      totalPayable: sum(() => true), pendingApproval: sum((r) => r.status === "pending"), approved: sum((r) => r.status === "approved"), paid: sum((r) => r.status === "paid"),
    };
  }),

  entries: authedQuery.input(z.object({ teacherId: z.number().optional(), from: z.date().optional(), to: z.date().optional(), status: z.string().optional(), kind: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds: any[] = [];
      if (ctx.user.role === "teacher") conds.push(eq(remunerationEntries.teacherId, ctx.user.id));
      else if (fin.includes(ctx.user.role) || ctx.user.role === "super_admin") { if (input?.teacherId) conds.push(eq(remunerationEntries.teacherId, input.teacherId)); }
      else throw new TRPCError({ code: "FORBIDDEN" });
      if (input?.from) conds.push(gte(remunerationEntries.earnedAt, input.from));
      if (input?.to) conds.push(lte(remunerationEntries.earnedAt, input.to));
      if (input?.status) conds.push(eq(remunerationEntries.status, input.status));
      if (input?.kind) conds.push(eq(remunerationEntries.kind, input.kind));
      const rows = await db.select({ e: remunerationEntries, tn: sql<string>`(select name from users where id=${remunerationEntries.teacherId})`, sn: sql<string>`(select name from users where id=${remunerationEntries.studentUserId})` })
        .from(remunerationEntries).where(conds.length ? and(...conds) : undefined).orderBy(desc(remunerationEntries.earnedAt)).limit(1000);
      return rows.map((x: any) => ({ ...x.e, teacherName: x.tn, studentName: x.sn }));
    }),

  /** Per-teacher payable summary for the accountant settlement screen. */
  settlementSummary: roleQuery(...fin).input(z.object({ from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ input }) => {
    const db = getDb();
    const conds: any[] = [];
    if (input?.from) conds.push(gte(remunerationEntries.earnedAt, input.from));
    if (input?.to) conds.push(lte(remunerationEntries.earnedAt, input.to));
    const rows = await db.select({
      teacherId: remunerationEntries.teacherId, name: sql<string>`(select name from users where id=${remunerationEntries.teacherId})`,
      pending: sql<number>`coalesce(sum(case when ${remunerationEntries.status}='pending' then ${remunerationEntries.amount} else 0 end),0)`,
      approved: sql<number>`coalesce(sum(case when ${remunerationEntries.status}='approved' then ${remunerationEntries.amount} else 0 end),0)`,
      paid: sql<number>`coalesce(sum(case when ${remunerationEntries.status}='paid' then ${remunerationEntries.amount} else 0 end),0)`,
      classes: sql<number>`count(*) filter (where ${remunerationEntries.kind} in ('regular','group'))`,
    }).from(remunerationEntries).where(conds.length ? and(...conds) : undefined).groupBy(remunerationEntries.teacherId);
    return rows.map((r: any) => ({ ...r, pending: Number(r.pending), approved: Number(r.approved), paid: Number(r.paid), classes: Number(r.classes) }));
  }),

  /** Accountant/admin: verify -> approve -> record payment (SRS 13.5). Entries are never edited; corrections are new entries. */
  approveEntries: roleQuery(...fin).input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await db.update(remunerationEntries).set({ status: "approved", approvedBy: ctx.user.id }).where(and(inArray(remunerationEntries.id, input.ids), eq(remunerationEntries.status, "pending")));
    await audit(db, ctx.user, "remuneration_approved", "remuneration_entry", input.ids.join(","), null, { count: input.ids.length });
    return { ok: true };
  }),
  markPaid: roleQuery(...fin).input(z.object({ teacherId: z.number(), ids: z.array(z.number()).optional(), paymentDate: z.string(), transactionId: z.string().trim().min(1), paymentMethod: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const where = input.ids?.length
        ? and(inArray(remunerationEntries.id, input.ids), eq(remunerationEntries.teacherId, input.teacherId), eq(remunerationEntries.status, "approved"))
        : and(eq(remunerationEntries.teacherId, input.teacherId), eq(remunerationEntries.status, "approved"));
      const upd = await db.update(remunerationEntries).set({ status: "paid", paidAt: new Date(input.paymentDate), transactionId: input.transactionId, paymentMethod: input.paymentMethod }).where(where).returning({ id: remunerationEntries.id, amount: remunerationEntries.amount });
      const total = upd.reduce((n: number, r: any) => n + Number(r.amount), 0);
      await audit(db, ctx.user, "remuneration_paid", "teacher", input.teacherId, null, { entries: upd.length, total, transactionId: input.transactionId, method: input.paymentMethod });
      await NotificationService.dispatch({ userId: input.teacherId, subject: "Payment recorded", message: `A payment of ₹${total} was recorded (ref ${input.transactionId}).`, type: "remuneration", channels: ["in_app", "email"] }).catch(() => {});
      return { paidEntries: upd.length, total };
    }),
  /** Corrections never rewrite history: they are separate entries with a reason (SRS 13.5). */
  addCorrection: roleQuery(...fin).input(z.object({ teacherId: z.number(), amount: z.number().refine((n) => n !== 0, "Amount cannot be zero"), reason: z.string().trim().min(3), relatedEntryId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.insert(remunerationEntries).values({ teacherId: input.teacherId, kind: "correction", amount: String(input.amount), reason: input.reason, status: "pending" }).returning();
      await audit(db, ctx.user, "remuneration_correction", "remuneration_entry", row.id, null, { amount: input.amount, relatedEntryId: input.relatedEntryId }, input.reason);
      await NotificationService.dispatch({ userId: input.teacherId, subject: "Remuneration updated", message: `A correction of ₹${input.amount} was added: ${input.reason}`, type: "remuneration", channels: ["in_app"] }).catch(() => {});
      return { id: row.id };
    }),

  // ---- demo remuneration (SRS 4.3) ----
  /** Called when a demo is completed AND the student attended: ₹50 (rule-driven), once. */
  recordDemoPay: roleQuery("admin", "accountant", "teacher").input(z.object({ demoId: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    const [d] = await db.select().from(demoClasses).where(eq(demoClasses.id, input.demoId));
    if (!d || d.status !== "completed" || d.studentAttended === false) return { created: false };
    const { amount, ruleId } = await resolveRate(db, { teacherId: d.teacherId, kind: "demo", durationMinutes: d.durationMinutes ?? 30 } as any);
    const r = await db.insert(remunerationEntries).values({ teacherId: d.teacherId, kind: "demo", demoId: d.id, ruleId, amount: String(amount) }).onConflictDoNothing().returning();
    return { created: r.length > 0 };
  }),
});

/** Called from the admission flow: when a demo student's admission becomes active, credit the bonus once. */
export async function creditDemoConversionBonus(db: any, admissionId: number) {
  const [a] = await db.select().from(admissions).where(eq(admissions.id, admissionId));
  if (!a?.demoId) return;
  const [d] = await db.select().from(demoClasses).where(eq(demoClasses.id, a.demoId));
  if (!d || d.status !== "completed") return;
  const { amount, ruleId } = await resolveRate(db, { teacherId: d.teacherId, kind: "demo_bonus" } as any);
  const r = await db.insert(remunerationEntries).values({ teacherId: d.teacherId, kind: "demo_bonus", demoId: d.id, studentUserId: a.studentUserId, ruleId, amount: String(amount) }).onConflictDoNothing().returning();
  if (r.length) await db.update(demoClasses).set({ convertedToEnrollment: true }).where(eq(demoClasses.id, d.id));
}
