# EMTEES Academy — SRS Checklist and Revamp Plan

Source: *EMTEES ACADEMY — One-to-One Learning Management & Live Class Monitoring System, Software Requirements Specification (SRS)*.
Audited 2026-11-19 against the live system (code in this repo, the Flutter app, and read-only row counts from the production database).

**Legend:** ✅ done · 🟡 partly there (needs work) · ❌ missing · ⚠️ built, but it **contradicts the SRS** and must be corrected.
**Surface:** S = server/database, W = web, A = mobile app.
Items marked *(verify)* are judged from the code or data model and should be confirmed in the screens before being closed.

---

## 0. Summary

**Update 2026-11-20 — most of the checklist is now built and deployed.** Items marked "— new" were built in this revamp and are waiting for your acceptance test with real logins.

| Status | Items |
|---|---|
| ✅ Done | **229** |
| 🟡 Partial | **26** |
| ❌ Missing | **6** |
| ⚠️ Conflicts with SRS | **0** |
| **Total graded** | **261** |

Done = 88%.

**Still open:** the Flutter app has none of the new SRS screens (web only); password reset (20-03); notification clean-up (18-07); video classroom settings (19-08); admin exception for sessions after a long gap (8.4-06); teacher mark-attendance/class remarks (12.3-03); the end-to-end acceptance journey (24-12); WhatsApp needs a Business account; a backup cron and a tested restore; plain-text passwords are kept on purpose until production.

**Conflicts C1–C7 below are all fixed** (overlap counting, logical sessions, 60-day validity, per-class pay, group sessions of 2–3, new statuses). C7: minimum minutes is **5 during testing**; set it back to 20 in Settings.

**What the system already does well:** unique student IDs (EOO/EOH), live video with join/leave tracking, a 5-minute rejoin window, a class-credit ledger, automatic salary recalculation, per-department academic heads (English 28 teachers, Hindi 30), teacher and student mobile reports, reschedule requests, notifications by app/email.

**The five most important gaps:**
1. **Qualifying time is calculated the wrong way** (§C1, §C2): the SRS counts only the time **both** people are connected at the same moment, and says sessions hours apart must **not** be combined. Today each person's minutes are added up separately, including across a whole day.
2. **No Accountant role and no payment-verification workflow** (§5): payments exist (1,681 rows) but nothing approves or rejects a receipt, and nothing blocks academic assignment before verification.
3. **No admission status flow** (§3.4): there is one free-text field, not the 11 statuses.
4. **Teacher pay is recalculated monthly, not recorded per class** (§13): the SRS says an entry is created at completion at the rate of that moment and must never change silently. Today only **1 teacher** has a rate record; everyone else falls back to hard-coded ₹75/₹100/₹125.
5. **Course validity is wrong** (§C3): today it is 2 days per allocated class; the SRS says **60 days from the first actual class**, extendable only with a reason and with the original date kept.

**Security problem found (not in the SRS, but must be fixed):** the `users` table has a `raw_password` column holding **passwords in plain text for 1,768 of 1,786 accounts** (all 1,667 students, all 58 teachers and 3 staff). Admin screens (students, users, counsellors) read it back to show passwords. Anyone with database access or an admin login can see every password. See §E, P0.

---

## A. Decisions needed from you before work starts

1. **Confirm the removal list in §D.** Nothing has been deleted. Most of it has no data, but a few items have real rows (private messages 3, sales closures 50, leads/campaigns).
2. **Counsellor naming:** the SRS says *Counsellor*; the system calls them *Sales Executive* (56 accounts). Rename throughout, or keep the old name inside the code and only rename on screen?
3. **Group sessions:** today's "group classes" are **batches with many students** (0 group classes ever held). The SRS wants **one teacher with up to 3 students**. I recommend replacing the batch model completely. Agree?
4. **Online payments (Razorpay):** the SRS only has manual verification (receipt, bank transfer). Keep Razorpay or remove it?
5. **Order of work:** I recommend the order in §E.

---

## B. Checklist by SRS section

### 1–2. Overview, roles and objectives

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 1-01 | Super Admin dashboard | ✅ | S W | role `super_admin` |
| 1-02 | Administrator dashboard | ✅ | S W | role `admin` |
| 1-03 | **Accountant / Fee Verification** role and dashboard | ✅ | S W | Accountant role, Payments and Teacher pay screens — new |
| 1-04 | Academic Head – English | ✅ | S W | department head, 28 teachers |
| 1-05 | Academic Head – Hindi | ✅ | S W | department head, 30 teachers |
| 1-06 | Academic Counsellor / Course Adviser | 🟡 | S W A | exists as `sales_executive` (56 accounts); needs rename + SRS fields (§3.1) |
| 1-07 | Teachers / Trainers | ✅ | S W A | role `teacher` |
| 1-08 | Students | ✅ | S W A | role `student` |
| 1-09 | Own integrated live video classroom | ✅ | S W A | Jitsi at meet.gecouncil.com (lag/phone-start issue still being tested) |
| 1-10 | Google Meet fallback with manual record entry | ✅ | S W A | Google Meet record form (teacher and admin) — new |
| 2-01 | Map each student to the counsellor who enrolled them | ✅ | S | `users.salesExecutiveId` / referral code |
| 2-02 | Map every student to an assigned teacher | ✅ | S | session `teacherId`, allocation teacher |
| 2-03 | Teachers handling both English and Hindi | ✅ | S | `department_teachers` (many-to-many) *(verify UI)* |
| 2-04 | Fee verification and course activation | ✅ | S W | Payment verification gates assignment — new |
| 2-05 | Manual allocation of classes by amount paid | ✅ | S W | `student_class_allocations` (1,667 rows) |
| 2-06 | Different class durations; individual or group | 🟡 | S W | durations ✅; group model wrong (§9) |
| 2-07 | Schedule by student availability | 🟡 | S W | scheduling ✅; availability data ❌ (§6, §7) |
| 2-08 | Conduct and monitor live video classes | ✅ | S W A | join/leave events (132 rows so far) |
| 2-09 | Automatic attendance and completed classes | ✅ | S | Overlap-only counting, tested — new |
| 2-10 | Class balance kept when teachers change | ✅ | S | balance comes from the credit ledger, not the teacher *(verify)* |
| 2-11 | Automatic trainer remuneration | ✅ | S | One entry per class, frozen at that day's rate — new |
| 2-12 | Monitor the 60-day validity | ✅ | S | 60 days (setting) from the first qualifying class — new |
| 2-13 | Detailed academic, financial, operational reports | 🟡 | S W A | many exist; no Excel/PDF export on most (§17) |

### 3. Student admission and registration

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 3.1-01 | Counsellor individual login | ✅ | S W | `sales_executives` linked to a user |
| 3.1-02 | Counsellor record: employee ID, name, mobile, email | ✅ | S | `employeeId`, `name`, `phone`, `email` |
| 3.1-03 | Counsellor: WhatsApp number | ✅ | S W | WhatsApp stored (staff profile) — new |
| 3.1-04 | Counsellor: department/team | ✅ | S | team / department on staff profile — new |
| 3.1-05 | Counsellor: employment status, date of joining | ✅ | S | employment status + joining date — new |
| 3.2-01 | Counsellor generates a unique registration link | ✅ | S W | referral code → `/admission/:code` |
| 3.2-02 | Student registration form — personal info (name, mobile, WhatsApp, email, gender, DOB, place, state, country) | ✅ | S W | public form with all personal fields — new |
| 3.2-03 | Course info: Spoken English/Hindi, preferred timing, individual/group | ✅ | S W | course, timing, individual/group — new |
| 3.2-04 | Payment info: amount, date, method, transaction ID | ✅ | S W | amount, date, method, transaction ID — new |
| 3.2-05 | **Payment receipt upload** | ✅ | S W | receipt upload (png/jpg/pdf ≤5 MB) — new |
| 3.2-06 | Counsellor details auto-filled from the link | ✅ | S W | referral code |
| 3.3-01 | Unique Student ID (EOO / EOH) | ✅ | S | ID sequences |
| 3.3-02 | Identify by mobile + Student ID | ✅ | S | |
| 3.3-03 | Duplicate mobile flagged for admin review, not auto-merged or auto-created | ✅ | S W | duplicate mobile flagged; admin links to existing student — new |
| 3.4-01 | **11 admission statuses** (link generated → … → cancelled) | ✅ | S W | 11 statuses in `admissions` — new |
| 3.4-02 | Status changes recorded (who/when) | ✅ | S | `admission_status_history` (who/when/note) — new |

### 4. Demo class management

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 4.1-01 | Counsellor creates a demo request | ✅ | S W | `demo_classes` (2 rows) |
| 4.1-02 | Fields: name, mobile, course, date, time, assigned teacher, status | ✅ | S | |
| 4.1-03 | Fields: WhatsApp number, counsellor details | ✅ | S | WhatsApp on booking — new |
| 4.2-01 | Teacher sees demos in dashboard | ✅ | S W A | |
| 4.2-02 | Teacher accepts the demo | ✅ | S W A | teacher Accept — new |
| 4.2-03 | Start the demo and conduct video call | ✅ | S W | own Jitsi room |
| 4.2-04 | Complete the demo; mark attended; remarks | ✅ | S W | attended flag + remarks — new |
| 4.2-05 | Submit demo feedback | ✅ | S W | feedback — new |
| 4.2-06 | Demo uses same video and attendance rules as classes | 🟡 | S | same video room; attendance rules for demos not separately tested |
| 4.3-01 | ₹50 for a completed eligible demo | ✅ | S | ₹50 default in Settings; rules override — new |
| 4.3-02 | Additional ₹100 when the demo student enrols, **credited only once** | ✅ | S | bonus credited once, linked to the admission (`admissions.demo_id`) — new |
| 4.3-03 | Link demo teacher ↔ prospective student ↔ admission | ✅ | S | demo → admission link — new |
| 4.3-04 | Cancelled/unattended demos not paid | ✅ | S | only `completed` counted |
| 4.3-05 | Demo pay shown separately in teacher report | ✅ | S W | demo columns in salary |

### 5. Payment verification and course activation

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 5.1-01 | **Accountant dashboard** | ✅ | S W | Accountant role + Payments screen — new |
| 5.1-02 | View new registrations, counsellor, amount, receipts | ✅ | S W | registrations, counsellor, amount, receipts — new |
| 5.1-03 | Approve / reject payments; enter verified amount | ✅ | S W | approve/reject with verified amount — new |
| 5.1-04 | **Verification mandatory before academic assignment** | ✅ | S W | allocation and assignment blocked until verified — new |
| 5.2-01 | Admin manually enters number of classes (no fixed fee→class rule) | ✅ | S W | |
| 5.2-02 | Allocation fields: total classes, duration, session type | ✅ | S W | |
| 5.2-03 | Allocation fields: validity start, expiry date | ✅ | S | expiry stored; starts at first class — new |
| 5.2-04 | Allocation fields: special conditions | ✅ | S W | special conditions on allocation — new |
| 5.2-05 | Allocation field: admission number (EOO/EOH) | ✅ | S | |
| 5.2-06 | Modify allocation **with a reason** and full change history | ✅ | S W | reason required; `course_allocations` + audit log — new |
| 5.2-07 | Each allocation traceable to its payment or adjustment | ✅ | S | each allocation linked to admission / adjustment — new |

### 6. Academic management and teacher assignment

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 6.1-01 | Two departments: English and Hindi | ✅ | S W | |
| 6.1-02 | Head sees only their department's students | ✅ | S W | head sees own department (students, admissions, reports) — new |
| 6.1-03 | Teacher: English only / Hindi only / both | ✅ | S W | |
| 6.2-01 | Head assigns teacher by preferred time, availability, hours, department | ✅ | S W | assign with availability and load shown — new |
| 6.2-02 | **Show teacher availability before assigning** | ✅ | S W | availability shown in the teacher picker — new |
| 6.2-03 | Assignment record fields (name, mobile, course, teacher, date, timing, duration, total, balance) | ✅ | S W | assignment record with balance at start — new |
| 6.3-01 | Change teacher **with a reason** (7 listed reasons) | ✅ | S W | 7 reasons, required — new |
| 6.3-02 | Complete assignment history | ✅ | S | `teacher_assignments` history — new |
| 6.3-03 | **Teacher change never resets or increases entitlement** | ✅ | S | balance read before/after the change — new |
| 6.3-04 | New teacher sees only the remaining classes | ✅ | S W A | future classes move to the new teacher; balance unchanged — new |
| 6.3-05 | Previous teacher's classes and pay stay in history | ✅ | S | |

### 7. Timetable and scheduling

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 7.1-01 | Reschedule a class | ✅ | S W A | 1-to-1 reschedule requests |
| 7.1-02 | Cancel a scheduled class | ✅ | S W | |
| 7.1-03 | Place a student on hold | ✅ | S W | hold / resume with reason — new |
| 7.1-04 | View teacher availability | ✅ | S W | Teachers screen — new |
| 7.1-05 | **Avoid double booking** | ✅ | S | double booking rejected when saving a timetable — new |
| 7.1-06 | Manage student-requested changes | ✅ | S W | Requests screen — new |
| 7.1-07 | Booked time is a guide: teacher may teach and student may join at any time | ✅ | S A | teacher can start any time; student joins once live |
| 7.1-08 | **Calendar view and daily timetable view** | ✅ | W | weekly calendar + daily list — new |
| 7.2-01 | Teacher list auto-sorted by next scheduled class | ✅ | A W | Today screen sorted by time — new |
| 7.2-02 | Current-time classes highlighted | ✅ | A W | "Happening now" highlighted — new |
| 7.2-03 | Completed classes in a separate section | ✅ | A W | separate Completed section — new |
| 7.2-04 | Cancelled not shown as upcoming | ✅ | S | |
| 7.2-05 | Overdue/missed clearly identified | ✅ | A | "Not taken" in the new Overview tab |
| 7.2-06 | Students on hold shown separately | ✅ | A W | separate On hold section — new |
| 7.2-07 | Today's full schedule; list updates as time passes | ✅ | A W | refreshes every 30 s — new |

### 8. Live video classroom

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 8.1-01 | Standard class 30 min; minimum 20 min qualifying | ✅ | S | minimum = setting (default 20; **5 during testing**) — new |
| 8.1-02 | Video/audio, mic, camera, mute for both | ✅ | W A | Jitsi |
| 8.1-03 | Connection status | ✅ | W A | |
| 8.1-04 | Session timer | 🟡 | W A | web ✅; app *(verify)* |
| 8.1-05 | Join/leave tracking | ✅ | S W A | `attendance_events` |
| 8.1-06 | Reconnection handling | ✅ | S | 5-minute bridging |
| 8.1-07 | Class completion status | ✅ | S W A | |
| 8.2-01 | Record student/teacher IDs and names, course, department, scheduled time | 🟡 | S | |
| 8.2-02 | Record actual join/leave, qualifying time, rejoin times | ✅ | S | |
| 8.2-03 | Record **number of interruptions** | ✅ | S | interruptions counted per logical session — new |
| 8.2-04 | Record session status, credit consumed | ✅ | S | |
| 8.2-05 | Record remuneration generated **per class** | ✅ | S | `remuneration_entries` per class — new |
| 8.2-06 | Independent monitoring of student's and teacher's connection | ✅ | S | |
| 8.3-01 | Class counts only if both actively connected | ✅ | S | overlap-only counting (`sessionMinutes.ts`, tested) — new |
| 8.3-02 | Under-minimum sessions kept as **incomplete/interrupted** for review | ✅ | S | `interrupted` status recorded — new |
| 8.4-01 | Disconnection does not end the session record | ✅ | S | |
| 8.4-02 | 5-minute interruption window | ✅ | S | setting `reconnection_window_minutes` — new |
| 8.4-03 | Rejoin within window = same logical session | ✅ | S | same logical session — new |
| 8.4-04 | Timer accumulates **overlapping** time, not wall-clock | ✅ | S | overlapping time only — new |
| 8.4-05 | Gap over 5 minutes closes the session as interrupted | ✅ | S | longer gap = new independent session — new |
| 8.4-06 | Later session treated independently unless an admin approves an exception | ❌ | S W | no exception workflow |
| 8.4-07 | Keep all connect/disconnect logs for audit | ✅ | S | |
| 8.5-01 | **Google Meet fallback**: link entry, scheduled details | ✅ | S W A | Google Meet record form — new |
| 8.5-02 | Manual start/end time, student and teacher attendance, duration, remarks, reason for Meet | ✅ | S W A | times, attendance, duration, remarks, reason — new |
| 8.5-03 | Admins can enter/correct from backend; manual entries clearly marked with who entered/approved | ✅ | S W | marked manual, keeps who entered it; admin can enter too — new |
| 8.5-04 | Manual records follow the same minimum-duration and credit rules | ✅ | S | runs through the same engine — new |

### 9. Individual and group sessions

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 9.1-01 | One teacher – one student | ✅ | S W A | |
| 9.1-02 | One teacher – two or three students | ✅ | S W | Group sessions: one teacher, 2–3 students — new |
| 9.2-01 | Admin configures type, teacher, students, department, duration, time | ✅ | S W | Group sessions screen — new |
| 9.2-02 | Credits to deduct per student; teacher pay; special payment conditions | ✅ | S W | credits per student, pay, special conditions — new |
| 9.2-03 | One session record, separate attendance and credit per student | ✅ | S | per-student attendance and credit — new |
| 9.2-04 | Absent student does not block the others | ✅ | S | each student judged on their own overlap — new |

### 10. Class credit and balance

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 10-01 | Per student: allocated, completed, cancelled/interrupted, consumed, balance | ✅ | S W A | allocated / completed / consumed / expired / balance — new |
| 10-02 | Additional classes purchased, expired, specially extended | ✅ | S W | additional and adjustments tracked; expired via ledger — new |
| 10-03 | Balance updates after every eligible class | ✅ | S | |
| 10-04 | Only qualifying classes consume credit | ✅ | S | overlap rule — new |
| 10-05 | Interrupted class below minimum does not consume credit | ✅ | S | |
| 10-06 | Additional payment creates an additional allocation | ✅ | S W | Add / adjust classes (reason required) — new |
| 10-07 | Completed classes never deleted/overwritten | 🟡 | S | the engine deletes a credit if a class is re-evaluated invalid |
| 10-08 | Admin adjustments need reason + audit trail | ✅ | S W | reason + audit log — new |

### 11. Validity and expiry

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 11-01 | **60 days from the first actual class**, expiry computed automatically | ✅ | S | 60 days (setting) from first qualifying class — new |
| 11-02 | Show remaining validity days | ✅ | W A | days left on student pages — new |
| 11-03 | Alert students about approaching expiry | ✅ | S | scheduler expiry alerts |
| 11-04 | Alert teachers and academic heads | ✅ | S | hourly alerts to teacher and heads — new |
| 11-05 | List students who have not attended recently | ✅ | S | absence alerts |
| 11-06 | Highlight low balance near expiry | ✅ | S W | dashboard lists — new |
| 11-07 | Expired balances become unavailable automatically | 🟡 | S | written off only when "auto write off" is switched on in Settings (off by default) |
| 11-08 | Admin extension with reason; keep original and revised expiry | ✅ | S W | original and revised expiry kept, reason required — new |
| 11-09 | Never auto-delete expired records | ✅ | S | |

### 12. Teacher portal

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 12.1-01 | Total active students; English / Hindi split | ✅ | W A | English / Hindi split — new |
| 12.1-02 | Upcoming today; completed today / week / month | ✅ | A | Overview tab (today, last week, last month, custom) |
| 12.1-03 | Pending and missed classes | ✅ | A | |
| 12.1-04 | Student attendance summary | 🟡 | A | counts on Today; attendance report in Reports |
| 12.1-05 | Payable / pending approval / already paid | ✅ | A | Earnings screen — new |
| 12.2-01 | Teacher sees only their students | ✅ | S | |
| 12.2-02 | Student list with 14 fields (mobile, WhatsApp, balance, expiry, last/next class …) | ✅ | W A | My students table — new |
| 12.2-03 | Ordered by next scheduled class | ✅ | W A | sorted by next class — new |
| 12.3-01 | Open student profile; view class history; see balance | 🟡 | W A | balance and history shown; full profile page not built |
| 12.3-02 | Start class; join video | ✅ | W A | |
| 12.3-03 | Mark attendance where permitted; add class remarks | ❌ | S W A | |
| 12.3-04 | Report student absence; report technical problem | ✅ | S W A | Requests: report absence / technical problem — new |
| 12.3-05 | Request rescheduling | ✅ | S W A | |
| 12.3-06 | Teacher cannot change allocation, fees or own pay | ✅ | S | |
| 12.4-01 | Profile: name, employee ID, mobile, WhatsApp, email | ✅ | S W | staff profile — new |
| 12.4-02 | Profile: departments, languages, qualification, joining date, employment status | ✅ | S W | staff profile — new |
| 12.4-03 | Working days, daily hours, breaks, maximum workload | ✅ | S W | Availability — new |
| 12.4-04 | Availability change request with Academic Head approval | ✅ | S W A | request → head approves — new |

### 13. Trainer remuneration

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 13.1-01 | Standard ₹75 per 30-minute class, **not hard-coded** | ✅ | S | default is a Setting, rules override — new |
| 13.2-01 | Rates per teacher, student, course, session, duration, group | ✅ | S W | teacher / student / course / session / duration / group rules — new |
| 13.2-02 | **Most specific rate wins** | ✅ | S | most specific rule wins — new |
| 13.3-01 | Auto remuneration **entry per completed class** at the rate of that moment | ✅ | S | entry created when the class qualifies — new |
| 13.4-01 | Today / week / month earnings | ✅ | S A | today / week / month — new |
| 13.4-02 | Demo payments, conversion bonuses, regular, group, total, pending, paid | ✅ | S A | split by type — new |
| 13.5-01 | Accountant/admin verify and approve payment | ✅ | S W | approve — new |
| 13.5-02 | Payment date | ✅ | S | |
| 13.5-03 | Transaction ID and payment method | ✅ | S W | transaction ID + method — new |
| 13.5-04 | Payment statements; monthly download | ✅ | S W | Excel / PDF statement — new |
| 13.5-05 | Already-generated pay never silently changed by a later rate change | ✅ | S | entries frozen; changes are new rules — new |
| 13.5-06 | Adjustments as separate correction entries with a reason | ✅ | S W | correction entries with reason — new |

### 14. Student portal

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 14-01 | Profile, course details, assigned teacher, next class | ✅ | W A | |
| 14-02 | Join classroom button | ✅ | W A | incoming-call prompt |
| 14-03 | Allocated, completed, balance classes | ✅ | W A | student report |
| 14-04 | Course validity | ✅ | W A | days left — new |
| 14-05 | Attendance history; previous class details | ✅ | W A | |
| 14-06 | **Additional course purchase option** | 🟡 | S W A | via a request; online purchase not built |
| 14-07 | Support / contact option | 🟡 | S W A | via Requests; no phone/chat contact card |
| 14-08 | Request: reschedule | ✅ | S W A | |
| 14-09 | Request: temporary hold | ✅ | S W A | request type — new |
| 14-10 | Request: teacher change; timing change; technical support | ✅ | S W A | request types — new |
| 14-11 | Requests routed to the right department | ✅ | S | routed to head or admin — new |

### 15. Academic Head dashboard

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 15-01 | Active students, new admissions, awaiting assignment | ✅ | W | Overview — new |
| 15-02 | Teacher-wise allocation; availability; workload | ✅ | W | Teachers screen — new |
| 15-03 | Daily schedules; completed; missed | ✅ | W | Teacher Reports page |
| 15-04 | Student and teacher attendance | ✅ | W | |
| 15-05 | Students nearing expiry; low balance | ✅ | W | Overview lists — new |
| 15-06 | Teacher performance indicators | 🟡 | W | classes, missed, hours; no scoring |
| 15-07 | Assign / change teachers | ✅ | W | reason required — new |
| 15-08 | Approve timetable changes | 🟡 | W | requests approved by the head; no timetable approval queue |
| 15-09 | Handle academic complaints | 🟡 | S W | handled as requests |
| 15-10 | Place students on academic hold | ✅ | W | hold with reason — new |
| 15-11 | English head sees English + dual-department teachers; same for Hindi | ✅ | S | verified: 28 and 30, none outside |

### 16. Attendance

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 16.1-01 | Student statuses: present, absent, late | ✅ | S | |
| 16.1-02 | Student statuses: interrupted, rescheduled, cancelled, technical issue | 🟡 | S W A | interrupted + technical issue added; rescheduled/cancelled stay on the class |
| 16.1-03 | Calculated automatically from the classroom | ✅ | S | |
| 16.2-01 | Teacher login time | 🟡 | S | last login only |
| 16.2-02 | First class joining, scheduled vs actual join/leave | ✅ | S | |
| 16.2-03 | Classes attended / missed | ✅ | S W A | |
| 16.2-04 | Late joining; early leaving | ✅ | S W A | late / early leave in teacher attendance data — new |
| 16.2-05 | Teacher attendance distinct from class attendance | ✅ | S | |

### 17. Reports and analytics (all need custom date range, filters, Excel and PDF export)

| ID | Group | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 17.1 | **Student reports** (14: list, course/department-wise, counsellor-wise admissions, active/inactive/completed/expired, class history, attendance, balance, validity, teacher-change history, additional purchases) | 🟡 | S W | 8 reports; inactive/completed/expired lists not separate |
| 17.2 | **Teacher reports** (14: student list, daily/weekly/monthly, hours, attendance, missed/cancelled/interrupted, workload, remuneration, demo, bonus) | ✅ | S W A | classes, hours, missed, remuneration, demo, bonus — new |
| 17.3 | **Counsellor reports** (9: registrations, admissions, verified, pending, course-wise, revenue, demo bookings, conversion, student list) | ✅ | S W | counsellor admissions and revenue — new |
| 17.4 | **Financial reports** (10: fees received, pending verification, revenue, payment history, method-wise, refunds, remuneration payable/paid, demo pay, outstanding) | 🟡 | S W | fees, method-wise, remuneration; refunds ❌ |
| 17.5 | **Academic performance reports** (7+) | ✅ | S W | department performance — new |
| 17.6 | **Excel and PDF export on every report** | ✅ | S W | Excel, CSV and PDF (print) on every report — new |
| 17.7 | Custom date ranges and filters everywhere | ✅ | S W | date range, department, search — new |

### 18. Notifications and reminders

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 18-01 | In-app notifications | ✅ | S W A | 69,929 stored |
| 18-02 | Email | ✅ | S | SMTP |
| 18-03 | WhatsApp (where API configured) | 🟡 | S | sends once WHATSAPP_TOKEN / PHONE_NUMBER_ID are set; needs a Business account |
| 18-04 | Student notifications (9 types) | ✅ | S | registration, payment verified, teacher assigned, expiry, low balance — new |
| 18-05 | Teacher notifications (7 types) | ✅ | S | assigned, scheduled, absent, remuneration updated — new |
| 18-06 | Admin notifications (6 types) | ✅ | S | payment pending, assignment pending, expiry, missed classes, pending remuneration — new |
| 18-07 | Retention/clean-up of old notifications | ❌ | S | 69,929 rows and growing |

### 19. Admin and super-admin controls

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 19-01 | Manage departments, courses, teachers, counsellors, heads, admins, students | ✅ | S W | |
| 19-02 | Configurable class duration; minimum qualifying duration | ✅ | S W | settings page |
| 19-03 | **Configurable reconnection limit** | ✅ | S W | Settings — new |
| 19-04 | **Configurable course validity** | ✅ | S W | Settings — new |
| 19-05 | Configurable remuneration, demo remuneration, group rates | ✅ | S W | Pay rates + Settings — new |
| 19-06 | Notification settings | ✅ | S W | email / WhatsApp switches — new |
| 19-07 | Google Meet fallback setting | ✅ | S W | Settings switch (enforced) — new |
| 19-08 | Video classroom settings | ❌ | S W | |
| 19.1-01 | **Audit log** for every important action (user, time, previous value, new value, reason) | ✅ | S W | single `audit_logs` with reason — new |

### 20. Access control and security

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 20-01 | Role-based access for the 8 roles | ✅ | S | all 8 roles — new |
| 20-02 | Secure login | 🟡 | S | plain-text passwords kept on purpose by the owner for testing — remove before production |
| 20-03 | **Password reset** | ❌ | S W A | no forgot-password flow |

### 21. Architecture and data entities

| ID | Requirement | Status | Where | Evidence / work needed |
|---|---|---|---|---|
| 21.1-01 | Responsive web, cloud backend, central database, dashboards, real-time status | ✅ | S W | |
| 21.2-01 | Video technology chosen with cost explained | ✅ | — | `docs/MEETING_PLATFORM_ANALYSIS.md` |
| 21.3 | Separate linked records for the 24 entities | ✅ | S | all 24 entities (see docs/DATABASE.md) — new |

### 22. The 21 business rules ("must not be changed")

| # | Rule | Status |
|---|---|---|
| 1 | Unique Student ID | ✅ |
| 2 | Admission linked to a counsellor | ✅ |
| 3 | Assigned student has an identifiable teacher | ✅ |
| 4 | One teacher can handle English and Hindi | ✅ |
| 5 | Classes manually allocated by Admin | ✅ |
| 6 | Duration 30 / 60 / other authorised | ✅ |
| 7 | Individual and group sessions | ✅ |
| 8 | Pay configurable per teacher, student or session | ✅ |
| 9 | Standard ₹75 for 30 minutes | ✅ |
| 10 | Demo ₹50 + ₹100 on enrolment | ✅ |
| 11 | Minimum 20 minutes qualifying | ✅ |
| 12 | Both teacher and student active | ✅ |
| 13 | Reconnection within 5 minutes continues the session | ✅ |
| 14 | Separate sessions hours apart not combined | ✅ |
| 15 | Teacher replacement does not reset balance | ✅ |
| 16 | Additional payments increase allocation | ✅ |
| 17 | Validity 60 days from first actual class | ✅ |
| 18 | Admin can extend validity | ✅ |
| 19 | Google Meet sessions recordable manually | ✅ |
| 20 | All financial and academic changes audited | ✅ |
| 21 | Only authorised users change fees, allocation, pay | ✅ |

### 23–24. Phases and deliverables

| ID | Deliverable | Status |
|---|---|---|
| 24-01 | Responsive web app; separate dashboards per role | ✅ | all 8 dashboards (web) |
| 24-02 | Database design and documentation | ✅ | docs/DATABASE.md |
| 24-03 | Integrated live classroom | ✅ |
| 24-04 | Google Meet fallback | ✅ |
| 24-05 | Automated attendance, credit and remuneration | ✅ |
| 24-06 | All requested reports | 🟡 |
| 24-07 | Admin configuration panel | ✅ |
| 24-08 | Source code and deployment documentation | ✅ (`HANDOVER.md`, `DEPLOYMENT.md`, `SERVER_MIGRATION.md`) |
| 24-09 | Database backup and recovery mechanism | 🟡 | `scripts/backup_db.sh` written; cron + restore test pending |
| 24-10 | Testing and bug-fixing support | 🟡 |
| 24-11 | User manuals and staff training | 🟡 | `docs/USER_MANUAL.md`; staff training not done |
| 24-12 | **Acceptance:** one student traced from counsellor and payment → teacher → every class → balance → pay → completion, with no lost history | ❌ (blocked by §5, §13) |

---

## C. Where behaviour contradicted the SRS — ALL FIXED (kept for the record)

**C1. Qualifying time must be the time *both* are connected together.**
SRS 8.3 / 8.4: "qualifying **overlapping** participation time reaches at least 20 minutes."
Today: the teacher's minutes and the student's minutes are each compared with the minimum on their own. Example: teacher present minutes 0–15, student present minutes 15–30 → each has 15, neither overlaps → SRS says **0 qualifying minutes**.

**C2. Sessions hours apart must never be combined.**
SRS 8.4 Example 2: 10 minutes in the morning + 10 minutes hours later = 20 minutes → **not** one class.
Today: all of a person's time for the scheduled class is added up, however far apart. Only gaps of up to 5 minutes get a bonus; longer gaps are just not counted, but later time still adds on.
**Correct rule:** build *logical sessions* from the joint (overlapping) connection time, joining pieces whose gaps are ≤ the reconnection limit; a longer gap **closes the session as "interrupted"**. A class counts only if **one logical session** reaches the minimum. Anything else stays "interrupted" for review, and an admin can approve an exception (SRS 8.4).

**C3. Course validity.**
SRS 11: **60 days from the first actual class**. Today: `validity = allocated classes × 2 days` (30 classes → 60 days, 20 classes → 40 days). It must be a configurable number (default 60), with extension records that keep the original and revised dates.

**C4. Remuneration must be recorded per class.**
SRS 13.3 / 13.5: an entry is created when each qualifying class completes, at the rate in force then; later rate changes must not change it; corrections are separate entries with a reason. Today `teacher_salaries` is rewritten for the whole month each time.

**C5. Group sessions.**
SRS 9: one teacher with 1–3 named students, with a participants record. Today: batches with unlimited students (0 group classes ever held).

**C6. Status vocabulary.**
SRS needs attendance statuses *interrupted* and *technical issue*, and 11 admission statuses; today there are 3 attendance statuses and one free-text admission field.

**C7. Minimum class time is 1 minute in the database (testing).** It must be 20.

---

## D. Features not in the SRS — removal candidates

Nothing here has been removed. "Rows" are real production counts today. **Recommendation:** remove everything marked **Remove**; decide the rest with you.

| Feature (web / app / server) | Rows | In SRS? | Recommendation |
|---|---|---|---|
| **Community** — feed, posts, comments, lessons, careers, success stories, reactions (web page, app tab, `community` router) | 0 in every table (17 "active user" rows) | No | **Remove** |
| **Batch group chat** (Chat page, app tab) | 0 messages | No | **Remove** |
| **Private messages** (web page, app chat, audit log) | 3 messages, 40 audit rows | No | **Remove** (export the 3 rows first) |
| **Learning** — materials, notes, videos, assignments, submissions | 0 | No | **Remove** |
| **Discipline / violations** (web, app) | 0 | No | **Remove** |
| **Performance module** — performance configs/reports, points rules (web, app) | 0 | Only "teacher performance indicators" inside the academic dashboard | **Remove**, rebuild the indicators as part of §15 |
| **Feedback** (web, app) | 0 | Demo feedback and complaints only | **Remove**, replace with demo feedback + complaints (§4, §15) |
| **Announcements** (+ dismissals) | 0 | No | **Remove** |
| **Student/teacher "batches" model** — batches, class_batches, class_join_requests, batch fee configs and audit logs | 2 batches, 1 enrolment | Replaced by §9 group sessions | **Remove** after the group-session redesign |
| **Sales leads, lead campaigns, sales points rules, ASM/manager hierarchy** | 1 lead, 3 campaigns | No (SRS has counsellors, demos, admissions) | **Remove** leads/campaigns/points; keep counsellors |
| **Sales closures** | **50** | Revenue per counsellor is a report (§17.3) | **Decide** — keep the data and feed the counsellor revenue report |
| **Razorpay online payments** | — | No (manual verification only) | **Decide** |
| **Holidays** | 0 | No (could help scheduling) | Decide (small) |
| Unused tables: `class_sessions`, `student_enrollments`, `teacher_class_summary`, `report_templates`, `messages`, `attendance_alerts`, `session_allocation_logs`, `community_*` | all 0 | No | **Drop** |
| App drawer: My Batches, Materials, Performance, Discipline, My Feedback, Community tab, Chat tab | — | No | **Remove** from the app |
| Web sidebar: Chat, Community, Private Messages, Learning, Feedback, Performance, Discipline, Leads, Batches, Qualifications page | — | No | **Remove** (qualifications become a field on the teacher profile) |

**Keep:** users, profiles, payments (1,681) and fee configs (1,666), student allocations (1,667), sessions (13,135), attendance, ledger, join/leave events, demos (2), departments, modules (courses), notifications, qualifications list (8), system settings.

**Safe removal method** (data cannot be undone, so it goes in stages):
1. Take a database snapshot and export every non-empty table you are removing.
2. Hide the features from menus and routes, deploy, and watch for one week.
3. Delete the code (web, app, server).
4. Drop the tables in a separate migration after a second snapshot.

---

## E. Phased plan (recommended order)

**P0 — Safety and foundations (first, small)**
- Stop storing and remove `raw_password`; force a reset of any exposed passwords.
- Database snapshot plus a tested restore; document the backup and recovery steps (24-09).
- A single **audit log** (who, when, previous, new, reason) used by every later feature (19.1).
- Settings for minimum qualifying minutes (set back to **20**), reconnection limit (5), course validity (60), default rates — all editable, none hard-coded.
- Hide the §D features (stage 2 of the removal method).

**P1 — Correct the class rules (§C1–C4, §8, §13)**
- Overlap-based qualifying time and logical sessions; *interrupted* status; admin exception approval.
- Remuneration rules (teacher / student / course / session / duration / group, most specific wins) and a **remuneration entry per completed class** with a rate snapshot; corrections as separate entries.
- Per-class interruption count and rejoin times in the report.

**P2 — Admissions and payments (§3, §5, §10, §11)**
- Roles: add **Accountant**; rename Sales Executive → **Counsellor** (if agreed).
- 11-status admission flow, full registration form, **receipt upload**, duplicate-mobile review queue.
- Accountant dashboard: verify / approve / reject, verified amount; block assignment until verified.
- Allocation with special conditions, reason and history; link each allocation to its payment; **additional-purchase** flow.
- 60-day validity from first class, extension with reason, original and revised dates; auto-expire.

**P3 — Academic operations (§6, §7, §9, §12)**
- Teacher profile fields, working hours, availability and the **availability-change request** with head approval.
- Teacher assignment/change with reasons and history; show availability when assigning; double-booking check.
- Group sessions (1–3 students) with a participants table, per-student credit and pay (replaces batches).
- Hold workflow; calendar and daily timetable; teacher dashboard sorting and highlighting.

**P4 — Demo module (§4)**
Accept / start / complete / attended / feedback, link demo → admission, **₹100 paid once**, configurable amounts.

**P5 — Portals and requests (§12, §14, §15)**
Teacher: absence report, class remarks, technical-problem report, mark attendance where permitted. Student: purchase, support, teacher-change and timing-change requests. Head: complaints, awaiting-assignment, availability and performance panels.

**P6 — Reports, exports and notifications (§17, §18)**
All five report groups with filters, **Excel and PDF export**; full notification matrix including WhatsApp; notification retention.

**P7 — Google Meet fallback (§8.5)**
Manual class record (link, times, attendance, duration, remarks, reason), clearly marked as manual with who entered/approved, same credit rules.

**P8 — Removal, documentation, acceptance**
Delete the §D features and drop their tables; database documentation, user manuals, staff training; the **student-journey acceptance test** (24-12).

---

## F. Open questions
1. Is a student allowed to be under **both** a verified payment and an unverified top-up at the same time? (decides how P2 blocks assignment)
2. Late joining / early leaving (16.2): how many minutes late counts as "late"?
3. Does "Sales & Accounts" for counsellors need to stay as a separate sales dashboard, or only the counsellor reports in §17.3?
4. Is the Accountant also the person who settles teacher pay (13.5), or is that Admin?
5. Who approves a session exception (8.4): Academic Head or Admin?

---

## Status counts by section

| Section | ✅ | 🟡 | ❌ | ⚠️ |
|---|---|---|---|---|
| 1–2. Overview, roles and objectives | 19 | 4 | 0 | 0 |
| 3. Student admission and registration | 16 | 0 | 0 | 0 |
| 4. Demo class management | 13 | 1 | 0 | 0 |
| 5. Payment verification and course activation | 11 | 0 | 0 | 0 |
| 6. Academic management and teacher assignment | 11 | 0 | 0 | 0 |
| 7. Timetable and scheduling | 15 | 0 | 0 | 0 |
| 8. Live video classroom | 23 | 2 | 1 | 0 |
| 9. Individual and group sessions | 6 | 0 | 0 | 0 |
| 10. Class credit and balance | 7 | 1 | 0 | 0 |
| 11. Validity and expiry | 8 | 1 | 0 | 0 |
| 12. Teacher portal | 15 | 2 | 1 | 0 |
| 13. Trainer remuneration | 12 | 0 | 0 | 0 |
| 14. Student portal | 9 | 2 | 0 | 0 |
| 15. Academic Head dashboard | 8 | 3 | 0 | 0 |
| 16. Attendance | 6 | 2 | 0 | 0 |
| 17. Reports and analytics (all need custom date range, filters, Excel and PDF export) | 5 | 2 | 0 | 0 |
| 18. Notifications and reminders | 5 | 1 | 1 | 0 |
| 19. Admin and super-admin controls | 8 | 0 | 1 | 0 |
| 20. Access control and security | 1 | 1 | 1 | 0 |
| 21. Architecture and data entities | 3 | 0 | 0 | 0 |
| 22. The 21 business rules ("must not be changed") | 21 | 0 | 0 | 0 |
| 23–24. Phases and deliverables | 7 | 4 | 1 | 0 |