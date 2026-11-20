import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { users, profiles, notifications, classLedgerTransactions } from "@db/schema";
import { admissions, teacherAssignments, remunerationEntries } from "@db/srs-schema";
import { NotificationService } from "./notificationService";
import { getNumberSetting, getStringSetting } from "./settings";
import { getBalance } from "./balance";
import { audit } from "./audit";
import { setAdmissionStatus } from "../routers/srsAdmissions";

/** Send at most one notification per user and key per day, so hourly jobs never spam. */
async function once(db: any, userId: number, type: string, subject: string, message: string, channels: ("in_app" | "email" | "whatsapp")[] = ["in_app", "email"]) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [dup] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, type), gte(notifications.createdAt, since), sql`${notifications.message} = ${message}`)).limit(1);
  if (dup) return;
  await NotificationService.dispatch({ userId, subject, message, type, channels }).catch(() => {});
}

/**
 * SRS 11 + 18: expiry handling and the alert matrix, run hourly from the scheduler.
 *  - expiry/low-balance alerts to students, teachers and heads
 *  - pending payment verification, pending assignment, pending remuneration approval to the people who act on them
 *  - classes are written off after validity only when "auto_expire_classes" is switched on in Settings (never deleted)
 */
export async function runSrsJobs(db: any) {
  const warn = await getNumberSetting(db, "expiry_alert_days");
  const low = await getNumberSetting(db, "low_balance_threshold");
  const autoExpire = (await getStringSetting(db, "auto_expire_classes", "no")) === "yes";
  const now = new Date();

  const rows = await db.select({ userId: profiles.userId, name: users.name, validityEndDate: profiles.validityEndDate, total: profiles.totalAllocatedSessions })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(users.role, "student"), eq(users.status, "active"), sql`${profiles.totalAllocatedSessions} > 0`));
  const heads = await db.select({ id: users.id, department: users.department }).from(users).where(eq(users.role, "academic_head"));
  const headsFor = (dept: string | null) => heads.filter((h: any) => !dept || !h.department || (h.department || "").toLowerCase().includes(dept));

  for (const r of rows) {
    const days = r.validityEndDate ? Math.ceil((new Date(r.validityEndDate).getTime() - now.getTime()) / 86400000) : null;
    if (days === null) continue;
    const bal = await getBalance(db, r.userId);
    if (days >= 0 && days <= warn && bal.balance > 0) {
      await once(db, r.userId, "expiry_alert", "Course expiry reminder", `Your course expires in ${days} day(s) and you still have ${bal.balance} class(es) left.`, ["in_app", "email", "whatsapp"]);
      const [t] = await db.select().from(teacherAssignments).where(and(eq(teacherAssignments.studentUserId, r.userId), isNull(teacherAssignments.endedAt)));
      if (t) await once(db, t.teacherId, "expiry_alert", "Student nearing expiry", `${r.name}: ${days} day(s) left, ${bal.balance} class(es) unused.`, ["in_app"]);
      for (const h of heads) await once(db, h.id, "expiry_alert", "Student nearing expiry", `${r.name}: ${days} day(s) left, ${bal.balance} class(es) unused.`, ["in_app"]);
    }
    if (bal.balance > 0 && bal.balance <= low) await once(db, r.userId, "low_balance", "Low class balance", `You have ${bal.balance} class(es) left.`, ["in_app", "email"]);

    if (autoExpire && days < 0 && bal.balance > 0) {
      const [done] = await db.select({ id: classLedgerTransactions.id }).from(classLedgerTransactions).where(and(eq(classLedgerTransactions.studentId, r.userId), eq(classLedgerTransactions.type, "expired"))).limit(1);
      if (!done) {
        await db.insert(classLedgerTransactions).values({ studentId: r.userId, type: "expired", amount: bal.balance, remarks: "Validity period ended - unused classes marked unavailable" });
        const [a] = await db.select().from(admissions).where(eq(admissions.studentUserId, r.userId)).limit(1);
        if (a) await setAdmissionStatus(db, a.id, "expired", null, "Validity ended");
        await audit(db, null as any, "classes_expired", "student", r.userId, { balance: bal.balance }, { balance: 0 }, "Automatic: validity period ended");
      }
    }
  }

  // staff digests
  const staffOf = async (roles: string[]) => (await db.select({ id: users.id }).from(users).where(and(inArray(users.role, roles as any), eq(users.status, "active")))).map((u: any) => u.id);
  const pay = Number(((await db.execute(sql`select count(*) n from admissions where status='payment_pending_verification'`)).rows[0] as any).n);
  if (pay) for (const id of await staffOf(["accountant", "admin"])) await once(db, id, "payment_pending", "Payments awaiting verification", `${pay} payment(s) are waiting for verification.`, ["in_app"]);
  const asg = Number(((await db.execute(sql`select count(*) n from admissions where status='awaiting_assignment'`)).rows[0] as any).n);
  if (asg) for (const h of heads) await once(db, h.id, "assignment_pending", "Teacher assignment pending", `${asg} student(s) are waiting for a teacher.`, ["in_app"]);
  const rem = Number(((await db.execute(sql`select count(*) n from remuneration_entries where status='pending' and earned_at < now() - interval '1 day'`)).rows[0] as any).n);
  if (rem) for (const id of await staffOf(["accountant", "admin"])) await once(db, id, "remuneration_pending", "Remuneration awaiting approval", `${rem} remuneration entr${rem === 1 ? "y is" : "ies are"} waiting for approval.`, ["in_app"]);
  const missed = Number(((await db.execute(sql`select count(*) n from one_to_one_sessions where session_status='scheduled' and scheduled_at < now() - interval '30 minutes' and scheduled_at > now() - interval '1 day'`)).rows[0] as any).n);
  if (missed) for (const id of await staffOf(["admin", "academic_head"])) await once(db, id, "missed_classes", "Missed classes", `${missed} class(es) were scheduled but did not start in the last 24 hours.`, ["in_app"]);
}
