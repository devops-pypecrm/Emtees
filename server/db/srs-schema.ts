import { pgTable, serial, varchar, text, timestamp, integer, bigint, decimal, boolean, jsonb } from "drizzle-orm/pg-core";

/** SRS §3.4 – the 11 admission statuses, in order. */
export const ADMISSION_STATUSES = [
  "link_generated", "registration_completed", "payment_pending_verification", "payment_verified",
  "awaiting_assignment", "teacher_assigned", "active", "on_hold", "completed", "expired", "cancelled",
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

/** SRS §3 – one admission per student journey: counsellor -> registration -> payment -> assignment. */
export const admissions = pgTable("admissions", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  counsellorId: bigint("counsellor_id", { mode: "number" }).notNull(), // sales_executives.id
  studentUserId: bigint("student_user_id", { mode: "number" }),        // users.id once registered
  status: varchar("status", { length: 40 }).notNull().default("link_generated"),
  department: varchar("department", { length: 20 }),                   // english | hindi
  sessionType: varchar("session_type", { length: 20 }),                // individual | group
  preferredTiming: varchar("preferred_timing", { length: 100 }),
  fullName: varchar("full_name", { length: 255 }),
  mobile: varchar("mobile", { length: 30 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 320 }),
  gender: varchar("gender", { length: 20 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  place: varchar("place", { length: 255 }),
  state: varchar("state", { length: 255 }),
  country: varchar("country", { length: 255 }),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }),
  paymentDate: varchar("payment_date", { length: 20 }),
  paymentMethod: varchar("payment_method", { length: 50 }),
  transactionRef: varchar("transaction_ref", { length: 255 }),
  receiptUrl: varchar("receipt_url", { length: 500 }),
  verifiedAmount: decimal("verified_amount", { precision: 10, scale: 2 }),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  rejectReason: text("reject_reason"),
  duplicateOfUserId: bigint("duplicate_of_user_id", { mode: "number" }), // same mobile already exists -> admin review
  duplicateResolved: boolean("duplicate_resolved").default(false).notNull(),
  demoId: bigint("demo_id", { mode: "number" }),                        // demo that led to this admission
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const admissionStatusHistory = pgTable("admission_status_history", {
  id: serial("id").primaryKey(),
  admissionId: bigint("admission_id", { mode: "number" }).notNull(),
  fromStatus: varchar("from_status", { length: 40 }),
  toStatus: varchar("to_status", { length: 40 }).notNull(),
  changedBy: bigint("changed_by", { mode: "number" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §19.1 – every important action: who, when, previous value, new value, reason. */
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }),
  userName: varchar("user_name", { length: 255 }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 60 }),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §5.2 / §10 – each class allocation, traceable to its payment or an authorised adjustment. */
export const courseAllocations = pgTable("course_allocations", {
  id: serial("id").primaryKey(),
  studentUserId: bigint("student_user_id", { mode: "number" }).notNull(),
  admissionId: bigint("admission_id", { mode: "number" }),
  kind: varchar("kind", { length: 20 }).notNull().default("initial"), // initial | additional | adjustment
  classes: integer("classes").notNull(),                               // may be negative for an adjustment
  durationMinutes: integer("duration_minutes").notNull().default(30),
  sessionType: varchar("session_type", { length: 20 }).notNull().default("individual"),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  specialConditions: text("special_conditions"),
  reason: text("reason"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §6.3 – full teacher assignment history. Changing teacher never touches the balance. */
export const teacherAssignments = pgTable("teacher_assignments", {
  id: serial("id").primaryKey(),
  studentUserId: bigint("student_user_id", { mode: "number" }).notNull(),
  teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
  department: varchar("department", { length: 20 }),
  preferredTiming: varchar("preferred_timing", { length: 100 }),
  durationMinutes: integer("duration_minutes"),
  classesAtStart: integer("classes_at_start"),      // balance when this teacher took over
  reason: varchar("reason", { length: 50 }),         // student_request | teacher_resigned | ... | initial
  reasonNote: text("reason_note"),
  assignedBy: bigint("assigned_by", { mode: "number" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

/** SRS §11 – validity extensions keep original and revised expiry. */
export const courseExtensions = pgTable("course_extensions", {
  id: serial("id").primaryKey(),
  studentUserId: bigint("student_user_id", { mode: "number" }).notNull(),
  originalExpiry: timestamp("original_expiry"),
  revisedExpiry: timestamp("revised_expiry").notNull(),
  daysAdded: integer("days_added"),
  reactivatedClasses: integer("reactivated_classes").default(0),
  reason: text("reason").notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §13.2 – configurable remuneration; the most specific matching rule wins. */
export const remunerationRules = pgTable("remuneration_rules", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" }),
  studentUserId: bigint("student_user_id", { mode: "number" }),
  course: varchar("course", { length: 20 }),          // english | hindi
  sessionType: varchar("session_type", { length: 20 }), // individual | group
  groupSize: integer("group_size"),                    // 2 | 3 for group sessions
  durationMinutes: integer("duration_minutes"),
  kind: varchar("kind", { length: 20 }).notNull().default("regular"), // regular | demo | demo_bonus
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §13.3 / §13.5 – one entry per qualifying class, frozen at the rate of that moment. */
export const remunerationEntries = pgTable("remuneration_entries", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
  kind: varchar("kind", { length: 20 }).notNull(),    // regular | group | demo | demo_bonus | correction
  oneToOneSessionId: bigint("one_to_one_session_id", { mode: "number" }),
  classId: bigint("class_id", { mode: "number" }),
  demoId: bigint("demo_id", { mode: "number" }),
  studentUserId: bigint("student_user_id", { mode: "number" }),
  ruleId: bigint("rule_id", { mode: "number" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | paid
  approvedBy: bigint("approved_by", { mode: "number" }),
  paidAt: timestamp("paid_at"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  transactionId: varchar("transaction_id", { length: 255 }),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
});

/** SRS §12.4 – teacher availability, changed only through an approved request. */
export const teacherAvailability = pgTable("teacher_availability", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
  workingDays: varchar("working_days", { length: 40 }).notNull().default("1,2,3,4,5,6"), // 0=Sun..6=Sat
  startTime: varchar("start_time", { length: 5 }).notNull().default("09:00"),
  endTime: varchar("end_time", { length: 5 }).notNull().default("18:00"),
  breakStart: varchar("break_start", { length: 5 }),
  breakEnd: varchar("break_end", { length: 5 }),
  maxWorkload: integer("max_workload"),
  status: varchar("status", { length: 20 }).notNull().default("approved"), // approved | pending | rejected
  decidedBy: bigint("decided_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §14 / §12.3 – requests from students and teachers, routed to the right department. */
export const supportRequests = pgTable("support_requests", {
  id: serial("id").primaryKey(),
  fromUserId: bigint("from_user_id", { mode: "number" }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // reschedule | teacher_change | timing_change | hold | technical | absence | other
  department: varchar("department", { length: 20 }),
  routedTo: varchar("routed_to", { length: 30 }).notNull().default("academic_head"),
  message: text("message"),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open | resolved | rejected
  response: text("response"),
  resolvedBy: bigint("resolved_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §7 – a student's recurring class time with their current teacher. Sessions are generated from it. */
export const timetableSlots = pgTable("timetable_slots", {
  id: serial("id").primaryKey(),
  studentUserId: bigint("student_user_id", { mode: "number" }).notNull(),
  teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
  weekdays: varchar("weekdays", { length: 20 }).notNull(), // "1,3,5" (0=Sun)
  timeOfDay: varchar("time_of_day", { length: 5 }).notNull(), // "15:30" IST
  durationMinutes: integer("duration_minutes").notNull().default(30),
  startsOn: timestamp("starts_on").defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
  onHold: boolean("on_hold").default(false).notNull(),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** SRS §3.1 / §12.4 – the HR-style details kept for every counsellor, teacher, head, accountant and admin. */
export const staffProfiles = pgTable("staff_profiles", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().unique(),
  employeeId: varchar("employee_id", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  departments: varchar("departments", { length: 40 }), // "english" | "hindi" | "english,hindi"
  languages: varchar("languages", { length: 255 }),
  qualification: varchar("qualification", { length: 255 }),
  team: varchar("team", { length: 100 }),
  joiningDate: varchar("joining_date", { length: 20 }),
  employmentStatus: varchar("employment_status", { length: 30 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
