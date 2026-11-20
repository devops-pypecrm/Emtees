import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { createRouter, roleQuery } from "../middleware";
import { getDb } from "../queries/connection";

type Def = { title: string; group: string; roles: string[]; cols: [string, string][]; sql: (p: { from: Date; to: Date; dep: string; q: string }) => any };
const all = ["admin", "academic_head", "accountant", "sales_executive", "teacher"];
const mgmt = ["admin", "academic_head"];
const money = ["admin", "accountant"];

/** SRS 17: every report is a SQL query returning columns + rows; the screen offers date range, search and Excel/PDF export. */
const REPORTS: Record<string, Def> = {
  // ---- 17.1 student ----
  "student-list": { title: "Complete student list", group: "Student", roles: mgmt, cols: [["enrollment_id", "Student ID"], ["name", "Name"], ["phone", "Mobile"], ["course", "Course"], ["department", "Department"], ["status", "Status"], ["counsellor", "Counsellor"], ["teacher", "Teacher"]],
    sql: ({ dep, q }) => sql`select p.enrollment_id, u.name, u.phone, p.course, p.department, u.status, (select name from sales_executives where id=u.sales_executive_id) counsellor,
      (select t.name from teacher_assignments a join users t on t.id=a.teacher_id where a.student_user_id=u.id and a.ended_at is null limit 1) teacher
      from users u left join profiles p on p.user_id=u.id where u.role='student' and coalesce(p.department,'') ilike ${"%" + dep + "%"} and (u.name ilike ${"%" + q + "%"} or coalesce(u.phone,'') ilike ${"%" + q + "%"} or coalesce(p.enrollment_id,'') ilike ${"%" + q + "%"}) order by u.name limit 5000` },
  "student-balance": { title: "Student class balance & validity", group: "Student", roles: mgmt, cols: [["enrollment_id", "Student ID"], ["name", "Name"], ["allocated", "Allocated"], ["consumed", "Completed"], ["balance", "Balance"], ["validity_end", "Expiry"], ["days_left", "Days left"]],
    sql: ({ dep, q }) => sql`select p.enrollment_id, u.name, p.total_allocated_sessions allocated, (select count(*) from class_ledger_transactions l where l.student_id=u.id and l.type='debit') consumed,
      greatest(0, p.total_allocated_sessions - (select count(*) from class_ledger_transactions l where l.student_id=u.id and l.type in ('debit','expired'))) balance,
      to_char(p.validity_end_date,'YYYY-MM-DD') validity_end, case when p.validity_end_date is null then null else (p.validity_end_date::date - current_date) end days_left
      from profiles p join users u on u.id=p.user_id where u.role='student' and p.total_allocated_sessions>0 and coalesce(p.department,'') ilike ${"%" + dep + "%"} and u.name ilike ${"%" + q + "%"} order by days_left nulls last limit 5000` },
  "student-attendance": { title: "Student attendance", group: "Student", roles: mgmt, cols: [["student", "Student"], ["present", "Present"], ["absent", "Absent"], ["interrupted", "Interrupted"], ["total", "Total"], ["pct", "Attendance %"]],
    sql: ({ from, to, q }) => sql`select u.name student, count(*) filter (where a.status='present') present, count(*) filter (where a.status='absent') absent, count(*) filter (where a.status='interrupted') interrupted, count(*) total,
      round(100.0*count(*) filter (where a.status='present')/nullif(count(*),0),1) pct from attendance a join users u on u.id=a.student_id where a.attendance_date between ${from} and ${to} and u.name ilike ${"%" + q + "%"} group by u.id,u.name order by u.name limit 5000` },
  "student-classes": { title: "Student class history", group: "Student", roles: mgmt, cols: [["when", "Date & time"], ["student", "Student"], ["teacher", "Teacher"], ["status", "Status"], ["minutes", "Qualifying minutes"], ["manual", "Manual (Meet)"]],
    sql: ({ from, to, q }) => sql`select to_char(s.scheduled_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI') "when", st.name student, t.name teacher, s.session_status status, coalesce(s.student_duration,0) minutes, case when s.is_manual then 'Yes' else '' end manual
      from one_to_one_sessions s join users st on st.id=s.student_id join users t on t.id=s.teacher_id where s.scheduled_at between ${from} and ${to} and st.name ilike ${"%" + q + "%"} order by s.scheduled_at desc limit 5000` },
  "teacher-change-history": { title: "Teacher change history", group: "Student", roles: mgmt, cols: [["student", "Student"], ["teacher", "Teacher"], ["reason", "Reason"], ["note", "Note"], ["started", "From"], ["ended", "Until"], ["classes_at_start", "Balance at start"]],
    sql: ({ from, to, q }) => sql`select st.name student, t.name teacher, a.reason, a.reason_note note, to_char(a.started_at,'YYYY-MM-DD') started, to_char(a.ended_at,'YYYY-MM-DD') ended, a.classes_at_start
      from teacher_assignments a join users st on st.id=a.student_user_id join users t on t.id=a.teacher_id where a.started_at between ${from} and ${to} and st.name ilike ${"%" + q + "%"} order by a.started_at desc limit 5000` },
  "purchase-history": { title: "Additional course purchase history", group: "Student", roles: [...mgmt, "accountant"], cols: [["when", "Date"], ["student", "Student"], ["kind", "Type"], ["classes", "Classes"], ["amount", "Amount"], ["reason", "Reason"]],
    sql: ({ from, to, q }) => sql`select to_char(c.created_at,'YYYY-MM-DD') "when", u.name student, c.kind, c.classes, c.amount, c.reason from course_allocations c join users u on u.id=c.student_user_id where c.created_at between ${from} and ${to} and u.name ilike ${"%" + q + "%"} order by c.created_at desc limit 5000` },
  // ---- 17.2 teacher ----
  "teacher-students": { title: "Teacher-wise student list", group: "Teacher", roles: mgmt, cols: [["teacher", "Teacher"], ["student", "Student"], ["department", "Department"], ["since", "Assigned since"]],
    sql: ({ dep, q }) => sql`select t.name teacher, s.name student, p.department, to_char(a.started_at,'YYYY-MM-DD') since from teacher_assignments a join users t on t.id=a.teacher_id join users s on s.id=a.student_user_id left join profiles p on p.user_id=s.id
      where a.ended_at is null and coalesce(p.department,'') ilike ${"%" + dep + "%"} and t.name ilike ${"%" + q + "%"} order by t.name, s.name limit 5000` },
  "teacher-classes": { title: "Teacher classes, hours & missed", group: "Teacher", roles: mgmt, cols: [["teacher", "Teacher"], ["completed", "Completed"], ["missed", "Missed"], ["cancelled", "Cancelled"], ["interrupted", "Interrupted"], ["hours", "Teaching hours"]],
    sql: ({ from, to, q }) => sql`select t.name teacher, count(*) filter (where s.session_status='completed') completed, count(*) filter (where s.session_status='scheduled' and s.scheduled_at<now()) missed,
      count(*) filter (where s.session_status='cancelled') cancelled, count(*) filter (where s.session_status='completed' and s.student_duration < 1) interrupted,
      round(coalesce(sum(s.actual_duration) filter (where s.session_status='completed'),0)/60.0,1) hours
      from one_to_one_sessions s join users t on t.id=s.teacher_id where s.scheduled_at between ${from} and ${to} and t.name ilike ${"%" + q + "%"} group by t.id,t.name order by completed desc limit 5000` },
  "teacher-remuneration": { title: "Teacher remuneration", group: "Teacher", roles: [...money, "teacher"], cols: [["teacher", "Teacher"], ["regular", "Regular"], ["grp", "Group"], ["demo", "Demo"], ["bonus", "Demo bonus"], ["corrections", "Corrections"], ["total", "Total"], ["paid", "Paid"], ["due", "Outstanding"]],
    sql: ({ from, to, q }) => sql`select t.name teacher,
      sum(e.amount) filter (where e.kind='regular') regular, sum(e.amount) filter (where e.kind='group') grp, sum(e.amount) filter (where e.kind='demo') demo,
      sum(e.amount) filter (where e.kind='demo_bonus') bonus, sum(e.amount) filter (where e.kind='correction') corrections, sum(e.amount) total,
      coalesce(sum(e.amount) filter (where e.status='paid'),0) paid, coalesce(sum(e.amount) filter (where e.status<>'paid'),0) due
      from remuneration_entries e join users t on t.id=e.teacher_id where e.earned_at between ${from} and ${to} and t.name ilike ${"%" + q + "%"} group by t.id,t.name order by t.name limit 5000` },
  "demo-sessions": { title: "Demo sessions & conversion bonuses", group: "Teacher", roles: [...mgmt, "accountant", "sales_executive"], cols: [["when", "Date"], ["student", "Prospect"], ["teacher", "Teacher"], ["status", "Status"], ["attended", "Attended"], ["converted", "Enrolled"], ["pay", "Demo pay"], ["bonus", "Bonus"]],
    sql: ({ from, to, q }) => sql`select to_char(d.scheduled_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI') "when", d.student_name student, t.name teacher, d.status, case when d.student_attended then 'Yes' when d.student_attended is false then 'No' else '' end attended,
      case when d.converted_to_enrollment then 'Yes' else '' end converted,
      (select sum(amount) from remuneration_entries e where e.demo_id=d.id and e.kind='demo') pay, (select sum(amount) from remuneration_entries e where e.demo_id=d.id and e.kind='demo_bonus') bonus
      from demo_classes d join users t on t.id=d.teacher_id where d.scheduled_at between ${from} and ${to} and d.student_name ilike ${"%" + q + "%"} order by d.scheduled_at desc limit 5000` },
  // ---- 17.3 counsellor ----
  "counsellor-admissions": { title: "Counsellor-wise admissions & revenue", group: "Counsellor", roles: [...mgmt, "accountant", "sales_executive"], cols: [["counsellor", "Counsellor"], ["registrations", "Registrations"], ["verified", "Payment verified"], ["pending", "Pending"], ["revenue", "Revenue"], ["demos", "Demo bookings"]],
    sql: ({ from, to, q }) => sql`select c.name counsellor, count(a.id) filter (where a.status<>'link_generated') registrations,
      count(a.id) filter (where a.verified_at is not null) verified, count(a.id) filter (where a.status='payment_pending_verification') pending, coalesce(sum(a.verified_amount),0) revenue,
      (select count(*) from demo_classes d where d.sales_exec_id=c.id and d.scheduled_at between ${from} and ${to}) demos
      from sales_executives c left join admissions a on a.counsellor_id=c.id and a.created_at between ${from} and ${to} where c.name ilike ${"%" + q + "%"} group by c.id,c.name order by revenue desc limit 5000` },
  // ---- 17.4 financial ----
  "fees-received": { title: "Fees received (payment-wise)", group: "Financial", roles: money, cols: [["when", "Date"], ["student", "Student"], ["method", "Method"], ["ref", "Reference"], ["claimed", "Claimed"], ["verified", "Verified"], ["course", "Course"], ["status", "Status"]],
    sql: ({ from, to, dep, q }) => sql`select to_char(a.created_at,'YYYY-MM-DD') "when", a.full_name student, a.payment_method method, a.transaction_ref ref, a.amount_paid claimed, a.verified_amount verified, a.department course, a.status
      from admissions a where a.created_at between ${from} and ${to} and coalesce(a.department,'') ilike ${"%" + dep + "%"} and coalesce(a.full_name,'') ilike ${"%" + q + "%"} and a.status<>'link_generated' order by a.created_at desc limit 5000` },
  "revenue-by-method": { title: "Collections by payment method & course", group: "Financial", roles: money, cols: [["method", "Method"], ["course", "Course"], ["payments", "Payments"], ["total", "Verified total"]],
    sql: ({ from, to }) => sql`select coalesce(payment_method,'-') method, coalesce(department,'-') course, count(*) payments, coalesce(sum(verified_amount),0) total from admissions where verified_at between ${from} and ${to} group by 1,2 order by total desc` },
  // ---- 17.5 academic ----
  "academic-performance": { title: "Academic performance by department", group: "Academic", roles: mgmt, cols: [["department", "Department"], ["conducted", "Classes conducted"], ["completed", "Completed"], ["missed", "Missed"], ["attendance_pct", "Student attendance %"]],
    sql: ({ from, to }) => sql`select coalesce(p.department,'-') department, count(s.id) conducted, count(s.id) filter (where s.session_status='completed') completed, count(s.id) filter (where s.session_status='scheduled' and s.scheduled_at<now()) missed,
      round(100.0*count(s.id) filter (where s.session_status='completed')/nullif(count(s.id) filter (where s.session_status in ('completed','scheduled') and s.scheduled_at<now()),0),1) attendance_pct
      from one_to_one_sessions s left join profiles p on p.user_id=s.student_id where s.scheduled_at between ${from} and ${to} group by 1 order by 1` },
  "audit-report": { title: "Audit report", group: "Audit", roles: ["admin"], cols: [["when", "When"], ["user", "User"], ["action", "Action"], ["entity", "Entity"], ["entity_id", "Id"], ["previous", "Previous"], ["new", "New"], ["reason", "Reason"]],
    sql: ({ from, to, q }) => sql`select to_char(created_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI') "when", user_name "user", action, entity, entity_id, previous_value::text previous, new_value::text new, reason
      from audit_logs where created_at between ${from} and ${to} and (action ilike ${"%" + q + "%"} or entity ilike ${"%" + q + "%"} or coalesce(user_name,'') ilike ${"%" + q + "%"}) order by created_at desc limit 5000` },
};

export const srsReportsRouter = createRouter({
  catalog: roleQuery(...all).query(({ ctx }) =>
    Object.entries(REPORTS).filter(([, d]) => ctx.user.role === "super_admin" || d.roles.includes(ctx.user.role)).map(([key, d]) => ({ key, title: d.title, group: d.group }))),

  run: roleQuery(...all).input(z.object({ key: z.string(), from: z.date(), to: z.date(), department: z.enum(["english", "hindi", "all"]).default("all"), search: z.string().default("") }))
    .query(async ({ ctx, input }) => {
      const def = REPORTS[input.key];
      if (!def || (ctx.user.role !== "super_admin" && !def.roles.includes(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot open this report" });
      const db = getDb();
      let dep = input.department === "all" ? "" : input.department;
      if (ctx.user.role === "academic_head") { // heads only ever see their own department
        const me: any = (await db.execute(sql`select department from users where id=${ctx.user.id}`)).rows[0];
        const d = (me?.department || "").toLowerCase();
        dep = d.includes("hindi") ? "hindi" : d.includes("english") ? "english" : dep;
      }
      const to = new Date(input.to); to.setHours(23, 59, 59, 999);
      const rows = (await db.execute(def.sql({ from: input.from, to, dep, q: input.search }))).rows as any[];
      return { title: def.title, columns: def.cols.map(([key, label]) => ({ key, label })), rows };
    }),
});
