# EMTEES Academy — Database design (SRS 21.3 / 24.3)

PostgreSQL. Tables are created and extended by `server/db/apply-migrations.ts` when the API starts (safe to run repeatedly). Table definitions: `server/db/schema.ts` (core) and `server/db/srs-schema.ts` (SRS records).

## How the 24 suggested entities map to tables

| SRS entity | Table(s) | Notes |
|---|---|---|
| 1 Users, 2 Roles | `users` (`role`) | roles: super_admin, admin, accountant, academic_head, sales_executive (shown as *Academic Counsellor*), teacher, student |
| 3 Students | `users` + `profiles` | Student ID = `profiles.enrollment_id` (EOO / EOH …) |
| 4 Counsellors | `sales_executives`, `staff_profiles` | employee ID, WhatsApp, team, joining date |
| 5 Teachers | `users`, `staff_profiles`, `teacher_availability` | departments: english / hindi / both |
| 6 Departments, 7 Courses | `users.department`, `profiles.department`, `modules` | Spoken English, Spoken Hindi |
| 8 Admissions | `admissions`, `admission_status_history` | the 11 statuses; duplicate-mobile flag |
| 9 Payments | `admissions` (claimed + verified amount, receipt), `payments` | receipt files in `server/uploads/receipts` |
| 10 Course allocations | `course_allocations` | initial / additional / adjustment, each with reason and link to the admission |
| 11 Teacher assignments | `teacher_assignments` | full history; never touches the balance |
| 12 Timetables | `timetable_slots` | sessions are generated from it |
| 13 Class sessions | `one_to_one_sessions`, `classes` (+ `batches`, `batch_enrollments` for groups of 2–3) | `is_manual`, `meet_link`, `manual_reason`, `entered_by` for Google Meet records |
| 14 Participants, 15 Connection events | `attendance_events` | every join / leave, kept for audit |
| 16 Attendance | `attendance` | present, absent, late, interrupted, technical_issue … |
| 17 Class credit transactions | `class_ledger_transactions` | credit / debit / expired / adjustment |
| 18 Demo bookings | `demo_classes` | accepted_at, student_attended, feedback, link to admission via `admissions.demo_id` |
| 19 Remuneration rules | `remuneration_rules` | most specific rule wins |
| 20 Remuneration transactions | `remuneration_entries` | one per class at the rate of that day; corrections are separate rows |
| 21 Course extensions | `course_extensions` | original and revised expiry |
| 22 Notifications | `notifications` | in-app; email / WhatsApp sent by the API |
| 23 Support requests | `support_requests` | routed to the academic head or admin |
| 24 Audit logs | `audit_logs` | who, when, previous value, new value, reason |

Other: `system_settings` (all admin-configurable rules, see Settings screen), `holidays`, `id_sequences`.

## The counting rules (one place: `server/src/lib/sessionMinutes.ts`)
Only time **both** people are connected counts. Gaps up to the reconnection window (default 5 min) continue the same logical session; longer gaps close it as *interrupted* and the next session is independent. One logical session must reach the minimum (setting `class_duration_threshold`) to count. Tests: `npx tsx server/tests/sessionMinutes.test.ts`.

## Backup and recovery
* Backup: `bash scripts/backup_db.sh` (on the API server). Writes `emtees-<date>.sql.gz` and the receipt images to `/home/ubuntu/backups`, keeps 14 days. Schedule it with cron (line at the top of the script).
* Restore into an empty database:  
  `gunzip -c emtees-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"`  
  then `tar -xzf emtees-...-uploads.tar.gz -C /home/ubuntu/emtees-api/server` and `pm2 restart emtees-api`.
* Test a restore on a spare database before you need it.

## Existing student data
On the first start after this release, existing students were given: an `admissions` record (status from their data: expired / active / awaiting assignment / registration completed, counsellor from their old link), an *initial* `course_allocations` entry equal to their old total classes, and a current `teacher_assignments` row from their latest teacher. Nothing was deleted or overwritten. Admin can correct any of it on **Students → Edit** (course, session type, timing, counsellor, expiry date) and **Students → open → Add / adjust classes**.
