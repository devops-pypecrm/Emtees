import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  json,
  decimal,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roleEnum = pgEnum("role", ["super_admin", "admin", "academic_head", "teacher", "student", "sales_executive"]);
export const statusEnum = pgEnum("status", ["active", "inactive", "suspended", "on_hold"]);
export const paymentStatusEnum = pgEnum("payment_status", ["paid", "partial", "unpaid", "overdue"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "voice", "image", "video", "pdf"]);
export const classTypeEnum = pgEnum("class_type", ["group", "one_to_one"]);
export const classStatusEnum = pgEnum("class_status", ["scheduled", "ongoing", "completed", "cancelled"]);
export const sessionStatusEnum = pgEnum("session_status", ["scheduled", "ongoing", "completed", "cancelled", "rescheduled", "reschedule_request_pending"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late"]);
export const requestTypeEnum = pgEnum("request_type", ["hold", "rejoin", "batch_change", "batch_removal"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected", "cancelled"]);
export const materialTypeEnum = pgEnum("material_type", ["text", "voice", "image", "video", "pdf"]);

// Qualifications Master Table
export const qualifications = pgTable("qualifications", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Qualification Audit Logs Table
export const qualificationAuditLogs = pgTable("qualification_audit_logs", {
  id: serial("id").primaryKey(),
  qualificationId: integer("qualification_id"),
  action: varchar("action", { length: 50 }).notNull(),
  performedBy: integer("performed_by"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users table
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    unionId: varchar("union_id", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }).unique(),
    password: varchar("password", { length: 255 }),
    rawPassword: varchar("raw_password", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 20 }),
    countryCode: varchar("country_code", { length: 10 }),
    countryISO: varchar("country_iso", { length: 10 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
    fullInternationalNumber: varchar("full_international_number", { length: 50 }),
    role: roleEnum("role").notNull().default("student"),
    status: statusEnum("status").notNull().default("active"),
    avatar: varchar("avatar", { length: 500 }),
    deviceToken: varchar("device_token", { length: 500 }),
    lastLoginAt: timestamp("last_login_at"),
    notificationsPausedUntil: timestamp("notifications_paused_until"),
    canViewSalaryReports: boolean("can_view_salary_reports").default(false).notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    isLocked: boolean("is_locked").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    salesExecutiveId: integer("sales_executive_id"),
    referralCode: varchar("referral_code", { length: 50 }),
    registrationSource: varchar("registration_source", { length: 50 }).default("direct"),
    gender: varchar("gender", { length: 50 }),
    dateOfBirth: timestamp("date_of_birth"),
    educationalQualification: text("educational_qualification"),
    qualificationId: integer("qualification_id").references(() => qualifications.id, { onDelete: "set null" }),
    specialization: varchar("specialization", { length: 255 }),
    teachingExperience: integer("teaching_experience"),
    address: text("address"),
    postalCode: varchar("postal_code", { length: 20 }),
    department: varchar("department", { length: 255 }),
  },
  (table) => ({
    usernameIdx: uniqueIndex("username_idx").on(table.username),
    phoneIdx: index("phone_idx").on(table.phone),
    roleIdx: index("role_idx").on(table.role),
    unionIdIdx: uniqueIndex("union_id_idx").on(table.unionId),
    countryPhoneIdx: uniqueIndex("country_phone_idx").on(table.countryCode, table.phoneNumber),
    fullInternationalNumberIdx: uniqueIndex("full_int_phone_idx").on(table.fullInternationalNumber),
  })
);

// Profiles table
export const profiles = pgTable(
  "profiles",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enrollmentId: varchar("enrollment_id", { length: 255 }),
    course: varchar("course", { length: 255 }),
    batch: varchar("batch", { length: 255 }),
    batchTime: varchar("batch_time", { length: 50 }),
    feesTotal: decimal("fees_total", { precision: 10, scale: 2 }).default("0"),
    feesPaid: decimal("fees_paid", { precision: 10, scale: 2 }).default("0"),
    feesBalance: decimal("fees_balance", { precision: 10, scale: 2 }).default("0"),
    paymentStatus: paymentStatusEnum("payment_status").default("unpaid"),
    minInitialPayment: decimal("min_initial_payment", { precision: 10, scale: 2 }),
    paymentDueDate: timestamp("payment_due_date"),
    gracePeriodDays: integer("grace_period_days").default(7).notNull(),
    admissionDate: timestamp("admission_date").defaultNow(),
    paymentOption: varchar("payment_option", { length: 20 }).default("full_payment"),
    paymentType: varchar("payment_type", { length: 50 }).default("full_payment"),
    oneOnOneEnabled: boolean("one_on_one_enabled").default(false).notNull(),
    groupSessionEnabled: boolean("group_session_enabled").default(false).notNull(),
    sessionType: varchar("session_type", { length: 50 }).default("group"),
    enrollmentStatus: varchar("enrollment_status", { length: 50 }).default("waiting_for_batch"),
    moduleId: bigint("module_id", { mode: "number" }).references(() => modules.id, { onDelete: "set null" }),
    preferredClassTime: varchar("preferred_class_time", { length: 50 }),
    downPayment: decimal("down_payment", { precision: 10, scale: 2 }).default("0"),
    remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }).default("0"),
    totalCourseFee: decimal("total_course_fee", { precision: 10, scale: 2 }).default("0"),
    validityEndDate: timestamp("validity_end_date"),
    completionDate: timestamp("completion_date"),
    activityTimeline: json("activity_timeline"),
    packageConfig: json("package_config").default({
      oneToOne: { total: 0, min30: 0, min45: 0, min60: 0 },
      group: { total: 0, min30: 0, min45: 0, min60: 0 }
    }),
    allocatedOneToOneSessions: integer("allocated_one_to_one_sessions").default(0).notNull(),
    allocatedGroupSessions: integer("allocated_group_sessions").default(0).notNull(),
    totalAllocatedSessions: integer("total_allocated_sessions").default(0).notNull(),
    attendedOneToOneSessions: integer("attended_one_to_one_sessions").default(0).notNull(),
    attendedGroupSessions: integer("attended_group_sessions").default(0).notNull(),
    totalAttendedSessions: integer("total_attended_sessions").default(0).notNull(),
    remainingOneToOneSessions: integer("remaining_one_to_one_sessions").default(0).notNull(),
    remainingGroupSessions: integer("remaining_group_sessions").default(0).notNull(),
    totalRemainingSessions: integer("total_remaining_sessions").default(0).notNull(),
    documents: json("documents").default([]),
    gender: varchar("gender", { length: 50 }),
    dob: timestamp("dob"),
    educationalQualification: text("educational_qualification"),
    qualificationId: integer("qualification_id").references(() => qualifications.id, { onDelete: "set null" }),
    specialization: text("specialization"),
    experience: text("experience"),
    address: text("address"),
    postalCode: varchar("postal_code", { length: 20 }),
    department: varchar("department", { length: 255 }),
    parentName: varchar("parent_name", { length: 255 }),
    parentPhone: varchar("parent_phone", { length: 20 }),
    parentCountryCode: varchar("parent_country_code", { length: 10 }),
    parentCountryISO: varchar("parent_country_iso", { length: 10 }),
    parentPhoneNumber: varchar("parent_phone_number", { length: 20 }),
    parentFullInternationalNumber: varchar("parent_full_international_number", { length: 50 }),
    notes: text("notes"),
    photo: varchar("photo", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enrollmentIdUnique: uniqueIndex("enrollment_id_unique").on(table.enrollmentId),
    userIdIdx: index("profiles_user_id_idx").on(table.userId),
    parentFullPhoneIdx: index("parent_full_phone_idx").on(table.parentFullInternationalNumber),
  })
);

// Modules (Course Groups)
export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  learningObjectives: text("learning_objectives"),
  topics: text("topics"),
  teacherId: bigint("teacher_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  duration: varchar("duration", { length: 255 }),
  maxStudents: integer("max_students").default(50),
  minStudents: integer("min_students").default(5),
  status: varchar("status", { length: 20 }).default("active"),
  courseFee: decimal("course_fee", { precision: 10, scale: 2 }).default("0"),
  minimumDownPayment: decimal("minimum_down_payment", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Batches (Sub Groups)
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  timeSlot: varchar("time_slot", { length: 50 }),
  sessionType: varchar("session_type", { length: 50 }).default("group"),
  teacherId: bigint("teacher_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  maxStudents: integer("max_students").default(30),
  status: varchar("status", { length: 20 }).default("active"),
  isCommunityGroup: boolean("is_community_group").default(false),
  startDate: timestamp("start_date"),
  duration: varchar("duration", { length: 255 }),
  courseFee: decimal("course_fee", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Batch Fee Audit Logs
export const batchFeeAuditLogs = pgTable("batch_fee_audit_logs", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  previousFee: decimal("previous_fee", { precision: 10, scale: 2 }).notNull(),
  updatedFee: decimal("updated_fee", { precision: 10, scale: 2 }).notNull(),
  adminId: bigint("admin_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Batch Audit Logs
export const batchAuditLogs = pgTable("batch_audit_logs", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 255 }).notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Batch Enrollments
export const batchEnrollments = pgTable(
  "batch_enrollments",
  {
    id: serial("id").primaryKey(),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
    status: varchar("status", { length: 20 }).default("active"),
    paymentType: varchar("payment_type", { length: 50 }).default("FULL_PAYMENT").notNull(),
    assignedTeachers: json("assigned_teachers").default([]),
    moduleId: bigint("module_id", { mode: "number" }).references(() => modules.id, { onDelete: "cascade" }),
    oneOnOne30Allocated: integer("one_on_one_30_allocated").default(0).notNull(),
    oneOnOne45Allocated: integer("one_on_one_45_allocated").default(0).notNull(),
    oneOnOne60Allocated: integer("one_on_one_60_allocated").default(0).notNull(),
    group30Allocated: integer("group_30_allocated").default(0).notNull(),
    group45Allocated: integer("group_45_allocated").default(0).notNull(),
    group60Allocated: integer("group_60_allocated").default(0).notNull(),
    oneOnOne30Used: integer("one_on_one_30_used").default(0).notNull(),
    oneOnOne45Used: integer("one_on_one_45_used").default(0).notNull(),
    oneOnOne60Used: integer("one_on_one_60_used").default(0).notNull(),
    group30Used: integer("group_30_used").default(0).notNull(),
    group45Used: integer("group_45_used").default(0).notNull(),
    group60Used: integer("group_60_used").default(0).notNull(),
    isRejoin: boolean("is_rejoin").default(false).notNull(),
    studentFeeConfigId: bigint("student_fee_config_id", { mode: "number" }).references(() => studentFeeConfigurations.id, { onDelete: "set null" }),
  },
  (table) => ({
    uniqueEnrollment: uniqueIndex("unique_enrollment_idx").on(table.batchId, table.studentId),
    studentIdIdx: index("batch_enrollments_student_id_idx").on(table.studentId),
  })
);

// Messages (Chat)
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    senderId: bigint("sender_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: messageTypeEnum("type").notNull().default("text"),
    content: text("content").notNull(),
    mediaUrl: varchar("media_url", { length: 500 }),
    replyToId: bigint("reply_to_id", { mode: "number" }),
    reactions: json("reactions"),
    isAnnouncement: boolean("is_announcement").default(false),
    deletedAt: timestamp("deleted_at"),
    deletedForUsers: json("deleted_for_users"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    batchIdIdx: index("msg_batch_idx").on(table.batchId),
    senderIdIdx: index("msg_sender_idx").on(table.senderId),
    createdAtIdx: index("msg_created_idx").on(table.createdAt),
  })
);

// Classes (Live Sessions)
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  classType: classTypeEnum("class_type").notNull().default("group"),
  status: classStatusEnum("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  duration: integer("duration").default(0),
  actualDuration: integer("actual_duration"),
  meetingUrl: varchar("meeting_url", { length: 500 }),
  meetingRoomId: varchar("meeting_room_id", { length: 255 }),
  recordingUrl: varchar("recording_url", { length: 500 }),
  recordingDeletedAt: timestamp("recording_deleted_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  reminder1DaySentAt: timestamp("reminder_1day_sent_at"),
  reminder1HourSentAt: timestamp("reminder_1hour_sent_at"),
  reminder10MinSentAt: timestamp("reminder_10min_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Class Batches Join Table (Multi-Batch Support)
export const classBatches = pgTable(
  "class_batches",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueClassBatch: uniqueIndex("unique_class_batch_idx").on(table.classId, table.batchId),
  })
);

// One-to-One Class Sessions
export const oneToOneSessions = pgTable("one_to_one_sessions", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  classId: bigint("class_id", { mode: "number" }).references(() => classes.id),
  title: varchar("title", { length: 255 }).default("1-to-1 Session").notNull(),
  remarks: text("remarks"),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  sessionLength: integer("session_length").notNull().default(30),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: sessionStatusEnum("session_status").notNull().default("scheduled"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  actualDuration: integer("actual_duration"),
  teacherDuration: integer("teacher_duration").default(0),
  studentDuration: integer("student_duration").default(0),
  teacherAttendance: varchar("teacher_attendance", { length: 50 }),
  studentAttendance: varchar("student_attendance", { length: 50 }),
  meetingRoomId: varchar("meeting_room_id", { length: 255 }),
  meetingUrl: varchar("meeting_url", { length: 500 }),
  reminder1DaySentAt: timestamp("reminder_1day_sent_at"),
  reminder1HourSentAt: timestamp("reminder_1hour_sent_at"),
  reminder10MinSentAt: timestamp("reminder_10min_sent_at"),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  completedAt: timestamp("completed_at"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  recordingUrl: varchar("recording_url", { length: 500 }),
  recordingDeletedAt: timestamp("recording_deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
},
(table) => ({
  teacherIdIdx: index("one_to_one_sessions_teacher_id_idx").on(table.teacherId),
  studentIdIdx: index("one_to_one_sessions_student_id_idx").on(table.studentId),
})
);

// Attendance
export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .references(() => classes.id, { onDelete: "cascade" }),
    oneToOneSessionId: bigint("one_to_one_session_id", { mode: "number" })
      .references(() => oneToOneSessions.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teacherId: bigint("teacher_id", { mode: "number" })
      .references(() => users.id, { onDelete: "set null" }),
    batchId: bigint("batch_id", { mode: "number" })
      .references(() => batches.id, { onDelete: "set null" }),
    moduleId: bigint("module_id", { mode: "number" })
      .references(() => modules.id, { onDelete: "set null" }),
    chatCount: integer("chat_count").default(0),
    status: attendanceStatusEnum("attendance_status").notNull().default("absent"),
    joinedAt: timestamp("joined_at"),
    leftAt: timestamp("left_at"),
    duration: integer("duration").default(0),
    remarks: text("remarks"),
    meetingId: varchar("meeting_id", { length: 255 }),
    attendanceDate: timestamp("attendance_date"),
    sessionType: varchar("session_type", { length: 50 }).default("group"),
    createdBy: bigint("created_by", { mode: "number" })
      .references(() => users.id, { onDelete: "set null" }),
    updatedBy: bigint("updated_by", { mode: "number" })
      .references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAttendance: uniqueIndex("unique_attendance_idx").on(table.classId, table.studentId),
    uniqueOneToOneAttendance: uniqueIndex("unique_oto_attendance_idx").on(table.oneToOneSessionId, table.studentId),
    teacherIdIdx: index("attendance_teacher_idx").on(table.teacherId),
    studentIdIdx: index("attendance_student_idx").on(table.studentId),
    attendanceDateIdx: index("attendance_date_idx").on(table.attendanceDate),
    batchIdIdx: index("attendance_batch_idx").on(table.batchId),
    moduleIdIdx: index("attendance_module_idx").on(table.moduleId),
  })
);

// Holidays
export const holidays = pgTable(
  "holidays",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    holidayDateIdx: index("holiday_date_idx").on(table.date),
  })
);

export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = typeof holidays.$inferInsert;

// Flexibility Requests (Hold, Rejoin, Batch Change)
export const flexibilityRequests = pgTable("flexibility_requests", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestType: requestTypeEnum("request_type").notNull(),
  fromBatchId: bigint("from_batch_id", { mode: "number" }).references(() => batches.id),
  toBatchId: bigint("to_batch_id", { mode: "number" }).references(() => batches.id),
  reason: text("reason"),
  status: requestStatusEnum("request_status").notNull().default("pending"),
  adminNote: text("admin_note"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
});

// Student Fee Configurations (Single Source of Truth)
export const studentFeeConfigurations = pgTable(
  "student_fee_configurations",
  {
    id: serial("id").primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    totalCourseFee: decimal("total_course_fee", { precision: 10, scale: 2 }).default("0").notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    discountType: varchar("discount_type", { length: 20 }).default("flat").notNull(), // 'flat' | 'percentage'
    finalFee: decimal("final_fee", { precision: 10, scale: 2 }).default("0").notNull(),
    paymentMode: varchar("payment_mode", { length: 50 }).default("FULL_PAYMENT").notNull(), // 'FULL_PAYMENT' | 'INSTALLMENT'
    downPayment: decimal("down_payment", { precision: 10, scale: 2 }).default("0").notNull(),
    numberOfInstallments: integer("number_of_installments").default(1).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueStudentFeeConfig: uniqueIndex("unique_student_fee_config_idx").on(table.studentId),
  })
);

// Payments
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentFeeConfigId: bigint("student_fee_config_id", { mode: "number" }).references(() => studentFeeConfigurations.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: varchar("type", { length: 50 }).default("tuition"),
  status: paymentStatusEnum("payment_status").notNull().default("paid"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  transactionId: varchar("transaction_id", { length: 255 }),
  notes: text("notes"),
  batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, { onDelete: "set null" }),
  installmentNumber: integer("installment_number"),
  paidDate: timestamp("paid_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Teacher Salaries
export const teacherSalaries = pgTable("teacher_salaries", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  groupClassesCount: integer("group_classes_count").default(0),
  oneToOneCount: integer("one_to_one_count").default(0),
  basicSalary: decimal("basic_salary", { precision: 10, scale: 2 }).default("0"),
  group30MinCount: integer("group_30min_count").default(0),
  group45MinCount: integer("group_45min_count").default(0),
  group60MinCount: integer("group_60min_count").default(0),
  oneToOne30MinCount: integer("one_to_one_30min_count").default(0),
  oneToOne45MinCount: integer("one_to_one_45min_count").default(0),
  oneToOne60MinCount: integer("one_to_one_60min_count").default(0),
  group30MinRate: decimal("group_30min_rate", { precision: 10, scale: 2 }).default("0"),
  group45MinRate: decimal("group_45min_rate", { precision: 10, scale: 2 }).default("0"),
  group60MinRate: decimal("group_60min_rate", { precision: 10, scale: 2 }).default("0"),
  oneToOne30MinRate: decimal("one_to_one_30min_rate", { precision: 10, scale: 2 }).default("0"),
  oneToOne45MinRate: decimal("one_to_one_45min_rate", { precision: 10, scale: 2 }).default("0"),
  oneToOne60MinRate: decimal("one_to_one_60min_rate", { precision: 10, scale: 2 }).default("0"),
  demoCount: integer("demo_count").default(0),
  demoBaseRate: decimal("demo_base_rate", { precision: 10, scale: 2 }).default("0"),
  demoConversionCount: integer("demo_conversion_count").default(0),
  demoBonusAmount: decimal("demo_bonus_amount", { precision: 10, scale: 2 }).default("0"),
  netSalary: decimal("net_salary", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("pending"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Teacher Salary Configurations
export const teacherSalaryConfigs = pgTable("teacher_salary_configs", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  basicSalary: decimal("basic_salary", { precision: 10, scale: 2 }).default("0").notNull(),
  group30MinRate: decimal("group_30min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  group45MinRate: decimal("group_45min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  group60MinRate: decimal("group_60min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  oneToOne30MinRate: decimal("one_to_one_30min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  oneToOne45MinRate: decimal("one_to_one_45min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  oneToOne60MinRate: decimal("one_to_one_60min_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  demoBaseRate: decimal("demo_base_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  demoConversionBonus: decimal("demo_conversion_bonus", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teacher Salary Config Audit Logs
export const teacherSalaryConfigAuditLogs = pgTable("teacher_salary_config_audit_logs", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 100 }).notNull(), // 'basicSalary', 'groupClassRate', 'oneToOneRate'
  previousValue: decimal("previous_value", { precision: 10, scale: 2 }),
  newValue: decimal("new_value", { precision: 10, scale: 2 }).notNull(),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Feedback
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  classId: bigint("class_id", { mode: "number" }).references(() => classes.id),
  batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  isRead: boolean("is_read").default(false),
  data: json("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcements
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  audienceType: varchar("audience_type", { length: 50 }).notNull(), // 'all' | 'students' | 'teachers' | 'batch' | 'course'
  audienceId: integer("audience_id"), // holds batchId or courseId if type is 'batch' or 'course'
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcement Dismissals
export const announcementDismissals = pgTable("announcement_dismissals", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id")
    .notNull()
    .references(() => announcements.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
});

// Discipline / Violations
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedBy: bigint("reported_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  type: varchar("type", { length: 100 }).notNull(), // Kept for backward compatibility
  description: text("description").notNull(),
  action: varchar("action", { length: 100 }), // Kept for backward compatibility
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'resolved'
  batch: varchar("batch", { length: 255 }),
  level: varchar("level", { length: 50 }).notNull().default("Warning"), // 'Warning' | 'Final Warning' | 'Suspension'
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// Learning Materials
export const learningMaterials = pgTable("learning_materials", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: materialTypeEnum("material_type").notNull().default("text"),
  contentUrl: varchar("content_url", { length: 500 }),
  scheduledDate: timestamp("scheduled_date"),
  createdBy: bigint("created_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ID Sequences for role-based unique IDs
export const idSequences = pgTable("id_sequences", {
  rolePrefix: varchar("role_prefix", { length: 10 }).primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});

// Student ID Sequence table for Admission Number generation
export const studentIdSequence = pgTable("student_id_sequence", {
  prefix: varchar("prefix", { length: 50 }).primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
  numberLength: integer("number_length").notNull().default(4),
});

export type StudentIdSequence = typeof studentIdSequence.$inferSelect;
export type InsertStudentIdSequence = typeof studentIdSequence.$inferInsert;

// Private Messages Table
export const privateMessages = pgTable(
  "private_messages",
  {
    id: serial("id").primaryKey(),
    senderId: bigint("sender_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: bigint("receiver_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    type: messageTypeEnum("type").notNull().default("text"),
    mediaUrl: varchar("media_url", { length: 500 }),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    senderIdx: index("pm_sender_idx").on(table.senderId),
    receiverIdx: index("pm_receiver_idx").on(table.receiverId),
    createdAtIdx: index("pm_created_idx").on(table.createdAt),
  })
);

// Private Message Audit Logs Table
export const privateMessageAuditLogs = pgTable(
  "private_message_audit_logs",
  {
    id: serial("id").primaryKey(),
    adminId: bigint("admin_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 50 }).notNull(), // 'access' | 'send' | 'edit' | 'delete'
    senderId: bigint("sender_id", { mode: "number" }),
    receiverId: bigint("receiver_id", { mode: "number" }),
    messageId: bigint("message_id", { mode: "number" }),
    details: text("details"),
    performedAt: timestamp("performed_at").defaultNow().notNull(),
  },
  (table) => ({
    adminIdx: index("pm_audit_admin_idx").on(table.adminId),
    performedAtIdx: index("pm_audit_time_idx").on(table.performedAt),
  })
);

export type User = typeof users.$inferSelect;
export type Qualification = typeof qualifications.$inferSelect;
export type InsertQualification = typeof qualifications.$inferInsert;
export type QualificationAuditLog = typeof qualificationAuditLogs.$inferSelect;
export type PrivateMessageAuditLog = typeof privateMessageAuditLogs.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type StudentFeeConfiguration = typeof studentFeeConfigurations.$inferSelect;
export type InsertStudentFeeConfiguration = typeof studentFeeConfigurations.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type FeedbackItem = typeof feedback.$inferSelect;
export type FlexibilityRequest = typeof flexibilityRequests.$inferSelect;
export type BatchFeeAuditLog = typeof batchFeeAuditLogs.$inferSelect;
export type BatchAuditLog = typeof batchAuditLogs.$inferSelect;
export type PrivateMessage = typeof privateMessages.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementDismissal = typeof announcementDismissals.$inferSelect;
export type InsertAnnouncementDismissal = typeof announcementDismissals.$inferInsert;
export type ClassBatch = typeof classBatches.$inferSelect;
export type InsertClassBatch = typeof classBatches.$inferInsert;

// Class Join Requests (Lobby approval)
export const classJoinRequests = pgTable(
  "class_join_requests",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending', 'approved', 'declined'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueClassStudent: uniqueIndex("unique_class_student_join_idx").on(table.classId, table.studentId),
  })
);

export type ClassJoinRequest = typeof classJoinRequests.$inferSelect;
export type InsertClassJoinRequest = typeof classJoinRequests.$inferInsert;

// Attendance Alerts Table
export const attendanceAlerts = pgTable(
  "attendance_alerts",
  {
    id: serial("id").primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    consecutiveAbsences: integer("consecutive_absences").notNull().default(7),
    lastAttendanceDate: timestamp("last_attendance_date"),
    status: varchar("status", { length: 50 }).notNull().default("active"), // 'active' | 'resolved'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    studentIdx: index("att_alert_student_idx").on(table.studentId),
    batchIdx: index("att_alert_batch_idx").on(table.batchId),
  })
);

export type AttendanceAlert = typeof attendanceAlerts.$inferSelect;
export type InsertAttendanceAlert = typeof attendanceAlerts.$inferInsert;

export type TeacherSalary = typeof teacherSalaries.$inferSelect;
export type TeacherSalaryConfig = typeof teacherSalaryConfigs.$inferSelect;
export type TeacherSalaryConfigAuditLog = typeof teacherSalaryConfigAuditLogs.$inferSelect;

// Session Allocation Logs Table
export const sessionAllocationLogs = pgTable("session_allocation_logs", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  previousOneToOne: integer("previous_one_to_one").notNull(),
  newOneToOne: integer("new_one_to_one").notNull(),
  previousGroup: integer("previous_group").notNull(),
  newGroup: integer("new_group").notNull(),
  reason: text("reason"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export type SessionAllocationLog = typeof sessionAllocationLogs.$inferSelect;
export type InsertSessionAllocationLog = typeof sessionAllocationLogs.$inferInsert;

// Student Course Audit Logs Table
export const studentCourseAuditLogs = pgTable("student_course_audit_logs", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changeType: varchar("change_type", { length: 50 }).notNull(), // 'teacher_changed' | 'class_count_updated' | 'session_distribution_updated' | 'batch_changed'
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export type StudentCourseAuditLog = typeof studentCourseAuditLogs.$inferSelect;
export type InsertStudentCourseAuditLog = typeof studentCourseAuditLogs.$inferInsert;

// One-to-One Reschedule Requests Table
export const oneToOneRescheduleRequests = pgTable("one_to_one_reschedule_requests", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number" })
    .notNull()
    .references(() => oneToOneSessions.id, { onDelete: "cascade" }),
  previousScheduledAt: timestamp("previous_scheduled_at").notNull(),
  proposedScheduledAt: timestamp("proposed_scheduled_at").notNull(),
  reason: text("reason").notNull(),
  status: requestStatusEnum("status").notNull().default("pending"),
  adminRemarks: text("admin_remarks"),
  requestedBy: bigint("requested_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" })
    .references(() => users.id, { onDelete: "set null" }),
});

export type OneToOneRescheduleRequest = typeof oneToOneRescheduleRequests.$inferSelect;
export type InsertOneToOneRescheduleRequest = typeof oneToOneRescheduleRequests.$inferInsert;

// System Settings (key-value store for app configuration)
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// Learning Notes
export const learningNotes = pgTable("learning_notes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  fileType: varchar("file_type", { length: 50 }).notNull(), // 'pdf', 'docx', 'ppt', 'pptx'
  uploadedBy: bigint("uploaded_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(), // contains the base64 or file URL
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Learning Videos
export const learningVideos = pgTable("learning_videos", {
  id: serial("id").primaryKey(),
  sessionType: varchar("session_type", { length: 20 }).notNull(), // 'one_to_one' | 'group'
  studentId: bigint("student_id", { mode: "number" })
    .references(() => users.id, { onDelete: "cascade" }), // nullable for group
  batchId: bigint("batch_id", { mode: "number" })
    .references(() => batches.id, { onDelete: "cascade" }), // nullable for 1-to-1
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  sessionDate: timestamp("session_date").notNull(),
  duration: integer("duration").notNull(), // duration in minutes
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  uploadedBy: bigint("uploaded_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Assignments
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date").notNull(),
  attachmentUrl: text("attachment_url"),
  attachmentName: varchar("attachment_name", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Assignment Submissions
export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignmentId: bigint("assignment_id", { mode: "number" })
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  submissionFileUrl: text("submission_file_url").notNull(),
  submissionFileName: varchar("submission_file_name", { length: 255 }),
  submittedDate: timestamp("submitted_date").defaultNow().notNull(),
  marks: integer("marks"),
  feedback: text("feedback"),
  status: varchar("status", { length: 50 }).notNull().default("Submitted"), // 'Submitted', 'Reviewed', 'Completed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LearningNote = typeof learningNotes.$inferSelect;
export type InsertLearningNote = typeof learningNotes.$inferInsert;
export type LearningVideo = typeof learningVideos.$inferSelect;
export type InsertLearningVideo = typeof learningVideos.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type InsertAssignmentSubmission = typeof assignmentSubmissions.$inferInsert;

// Community Lessons
export const communityLessons = pgTable("community_lessons", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // 'pdf' | 'docx' | 'ppt' | 'pptx' | 'video' | 'youtube' | 'text'
  contentUrl: text("content_url"), // base64 or video url
  youtubeUrl: varchar("youtube_url", { length: 255 }),
  textContent: text("text_content"),
  fileName: varchar("file_name", { length: 255 }),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Discussion Posts
export const communityPosts = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  authorId: bigint("author_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isPinned: boolean("is_pinned").default(false).notNull(),
  mediaUrl: text("media_url"),
  mediaName: varchar("media_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Comments (including nested replies)
export const communityComments = pgTable("community_comments", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number" })
    .notNull()
    .references(() => communityPosts.id, { onDelete: "cascade" }),
  authorId: bigint("author_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  parentId: integer("parent_id"), // self-reference using raw integer to avoid circular type ref in drizzle schemas
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Post Reactions (Likes)
export const communityPostReactions = pgTable(
  "community_post_reactions",
  {
    id: serial("id").primaryKey(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reaction: varchar("reaction", { length: 50 }).notNull().default("like"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePostUserReaction: uniqueIndex("unique_post_user_reaction_idx").on(table.postId, table.userId),
  })
);

// Community Career Opportunities
export const communityCareers = pgTable("community_careers", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // 'Job' | 'Internship' | 'Freelance' | 'Guidance'
  location: varchar("location", { length: 255 }).notNull(),
  description: text("description").notNull(),
  link: varchar("link", { length: 500 }),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Saved Career Opportunities
export const communitySavedCareers = pgTable(
  "community_saved_careers",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    careerId: bigint("career_id", { mode: "number" })
      .notNull()
      .references(() => communityCareers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserCareer: uniqueIndex("unique_user_career_idx").on(table.userId, table.careerId),
  })
);

// Community Student Success Stories
export const communitySuccessStories = pgTable("community_success_stories", {
  id: serial("id").primaryKey(),
  studentName: varchar("student_name", { length: 255 }).notNull(),
  courseCompleted: varchar("course_completed", { length: 255 }).notNull(),
  achievement: text("achievement").notNull(),
  photoUrl: text("photo_url"),
  testimonial: text("testimonial").notNull(),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Lesson Views (for analytics)
export const communityLessonViews = pgTable(
  "community_lesson_views",
  {
    id: serial("id").primaryKey(),
    lessonId: bigint("lesson_id", { mode: "number" })
      .notNull()
      .references(() => communityLessons.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueLessonUserView: uniqueIndex("unique_lesson_user_view_idx").on(table.lessonId, table.userId),
  })
);

// Community Daily Active Users (for analytics)
export const communityActiveUsers = pgTable(
  "community_active_users",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeDate: varchar("active_date", { length: 10 }).notNull(), // 'YYYY-MM-DD'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserActiveDate: uniqueIndex("unique_user_active_date_idx").on(table.userId, table.activeDate),
  })
);

export type CommunityLesson = typeof communityLessons.$inferSelect;
export type InsertCommunityLesson = typeof communityLessons.$inferInsert;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type InsertCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityComment = typeof communityComments.$inferSelect;
export type InsertCommunityComment = typeof communityComments.$inferInsert;
export type CommunityPostReaction = typeof communityPostReactions.$inferSelect;
export type InsertCommunityPostReaction = typeof communityPostReactions.$inferInsert;
export type CommunityCareer = typeof communityCareers.$inferSelect;
export type InsertCommunityCareer = typeof communityCareers.$inferInsert;
export type CommunitySavedCareer = typeof communitySavedCareers.$inferSelect;
export type InsertCommunitySavedCareer = typeof communitySavedCareers.$inferInsert;
export type CommunitySuccessStory = typeof communitySuccessStories.$inferSelect;
export type InsertCommunitySuccessStory = typeof communitySuccessStories.$inferInsert;
export type CommunityLessonView = typeof communityLessonViews.$inferSelect;
export type CommunityActiveUser = typeof communityActiveUsers.$inferSelect;

// Sales Executives Table
export const salesExecutives = pgTable(
  "sales_executives",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeId: varchar("employee_id", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 50 }),
    countryCode: varchar("country_code", { length: 10 }),
    countryISO: varchar("country_iso", { length: 10 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
    fullInternationalNumber: varchar("full_international_number", { length: 50 }),
    username: varchar("username", { length: 100 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    referralCode: varchar("referral_code", { length: 50 }).notNull().unique(),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    groupId: bigint("group_id", { mode: "number" }), // references salesGroups.id (added below)
    isASM: boolean("is_asm").default(false).notNull(),
    designation: varchar("designation", { length: 50 }).default("Sales User").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    referralCodeIdx: uniqueIndex("referral_code_idx").on(table.referralCode),
    employeeIdIdx: uniqueIndex("employee_id_idx").on(table.employeeId),
    execPhoneIdx: uniqueIndex("exec_full_phone_idx").on(table.fullInternationalNumber),
  })
);

// Sales Groups / Teams (ASM Hierarchy)
export const salesGroups = pgTable("sales_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  asmId: bigint("asm_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  managerId: bigint("manager_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SalesGroup = typeof salesGroups.$inferSelect;
export type InsertSalesGroup = typeof salesGroups.$inferInsert;

export type SalesExecutive = typeof salesExecutives.$inferSelect;
export type InsertSalesExecutive = typeof salesExecutives.$inferInsert;

// Student Class Allocations
export const studentClassAllocations = pgTable("student_class_allocations", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  allocation: json("allocation").default({
    oneToOne: {
      teacherId: null,
      designatedTime: "",
      sessions30: 0,
      sessions45: 0,
      sessions60: 0,
      completed30: 0,
      completed45: 0,
      completed60: 0,
      remaining30: 0,
      remaining45: 0,
      remaining60: 0
    },
    group: {
      teacherId: null,
      batchId: null,
      designatedTime: "",
      sessions30: 0,
      sessions45: 0,
      sessions60: 0,
      completed30: 0,
      completed45: 0,
      completed60: 0,
      remaining30: 0,
      remaining45: 0,
      remaining60: 0
    }
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StudentClassAllocation = typeof studentClassAllocations.$inferSelect;
export type InsertStudentClassAllocation = typeof studentClassAllocations.$inferInsert;

// Performance configurations (criteria/weightage templates)
export const performanceConfigs = pgTable("performance_configs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(), // 'student' or 'teacher'
  name: varchar("name", { length: 255 }).notNull(),
  criteria: json("criteria").notNull(), // weightages, qualitative items, etc.
  isDefault: boolean("is_default").default(false).notNull(),
  createdBy: bigint("created_by", { mode: "number" })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Performance reports (assessments)
export const performanceReports = pgTable("performance_reports", {
  id: serial("id").primaryKey(),
  parentReportId: integer("parent_report_id").references((): any => performanceReports.id, { onDelete: "set null" }),
  version: integer("version").default(1).notNull(),
  isLatest: boolean("is_latest").default(true).notNull(),
  targetUserId: bigint("target_user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // 'student' or 'teacher'
  configId: bigint("config_id", { mode: "number" })
    .references(() => performanceConfigs.id, { onDelete: "set null" }),
  assessmentPeriod: varchar("assessment_period", { length: 50 }).notNull(), // 'monthly', 'quarterly', 'semester', 'yearly', 'custom'
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft', 'published', 'archived'
  autoMetrics: json("auto_metrics").notNull(),
  qualitativeScores: json("qualitative_scores").notNull(), // empty if not used, or for custom qualitative criteria (optional)
  totalScore: decimal("total_score", { precision: 5, scale: 2 }).notNull(),
  grade: varchar("grade", { length: 10 }),
  remarks: text("remarks"),
  createdBy: bigint("created_by", { mode: "number" })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PerformanceConfig = typeof performanceConfigs.$inferSelect;
export type InsertPerformanceConfig = typeof performanceConfigs.$inferInsert;
export type PerformanceReport = typeof performanceReports.$inferSelect;
export type InsertPerformanceReport = typeof performanceReports.$inferInsert;

// Sales Closures (Single Source of Truth for Sales)
export const salesClosures = pgTable("sales_closures", {
  id: serial("id").primaryKey(),
  closingDate: timestamp("closing_date").notNull(),
  monthStr: varchar("month_str", { length: 20 }), // e.g. "August 2025" (computed)
  cleanMonthStr: varchar("clean_month_str", { length: 20 }), // e.g. "August" (computed)
  caCategory: varchar("ca_category", { length: 100 }), // e.g. "CORE_STRENGTH"
  caId: bigint("ca_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  asmId: bigint("asm_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  groupId: bigint("group_id", { mode: "number" }).references(() => salesGroups.id, { onDelete: "set null" }),
  courseName: varchar("course_name", { length: 255 }), // e.g. "HINDI_O_TO_O"
  admNo: varchar("adm_no", { length: 50 }),
  studentId: bigint("student_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }), // link if exists
  studentName: varchar("student_name", { length: 255 }),
  type: varchar("type", { length: 50 }), // 'New Closure', 'Old Balance', 'Renewal'
  totalFee: decimal("total_fee", { precision: 10, scale: 2 }).default("0").notNull(),
  firstInst: decimal("first_inst", { precision: 10, scale: 2 }).default("0").notNull(),
  secondInst: decimal("second_inst", { precision: 10, scale: 2 }).default("0").notNull(),
  thirdInst: decimal("third_inst", { precision: 10, scale: 2 }).default("0").notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0").notNull(), // auto-calculated
  points: decimal("points", { precision: 10, scale: 2 }).default("0").notNull(), // auto-calculated
  baseAmountForPoints: decimal("base_amount_for_points", { precision: 10, scale: 2 }).default("0").notNull(),
  bank: varchar("bank", { length: 255 }),
  isVerified: boolean("is_verified").default(false),
  verificationStatus: varchar("verification_status", { length: 50 }), // 'NOT', 'Verified', etc
  courseChangeStatus: varchar("course_change_status", { length: 100 }),
  obNumber: varchar("ob_number", { length: 100 }),
  leadStatus: varchar("lead_status", { length: 100 }),
  remarks: text("remarks"),
  isDeleted: boolean("is_deleted").default(false),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  caIdx: index("sc_ca_idx").on(table.caId),
  asmIdx: index("sc_asm_idx").on(table.asmId),
  dateIdx: index("sc_date_idx").on(table.closingDate),
}));
export type SalesClosure = typeof salesClosures.$inferSelect;
export type InsertSalesClosure = typeof salesClosures.$inferInsert;

export const salesClosuresRelations = relations(salesClosures, ({ one }) => ({
  salesExecutive: one(salesExecutives, {
    fields: [salesClosures.caId],
    references: [salesExecutives.id],
  }),
  asm: one(salesExecutives, {
    fields: [salesClosures.asmId],
    references: [salesExecutives.id],
  }),
  group: one(salesGroups, {
    fields: [salesClosures.groupId],
    references: [salesGroups.id],
  }),
  student: one(users, {
    fields: [salesClosures.studentId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [salesClosures.createdBy],
    references: [users.id],
  }),
}));

// Sales Points Engine Rules
export const salesPointsRules = pgTable("sales_points_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  caCategoryMatch: varchar("ca_category_match", { length: 100 }), // null means any
  courseMatch: varchar("course_match", { length: 255 }), // null means any, or "O_TO_O"
  minTotalFee: decimal("min_total_fee", { precision: 10, scale: 2 }),
  maxTotalFee: decimal("max_total_fee", { precision: 10, scale: 2 }),
  minPaymentPercent: decimal("min_payment_percent", { precision: 5, scale: 2 }), // e.g. 100 for full, 50 for half
  fixedPointsAward: decimal("fixed_points_award", { precision: 10, scale: 2 }),
  formula: text("formula"), // e.g. "(paymentAmount / totalFee) * 5"
  priority: integer("priority").default(0).notNull(), // higher priority runs first
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type SalesPointsRule = typeof salesPointsRules.$inferSelect;
export type InsertSalesPointsRule = typeof salesPointsRules.$inferInsert;

// Sales Leads (Deprecated but kept for historical data and to avoid migration issues)
export const salesLeads = pgTable("sales_leads", {
  id: serial("id").primaryKey(),
  studentName: varchar("student_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  remarks: text("remarks"),
  status: varchar("status", { length: 50 }).default("New").notNull(),
  caId: bigint("ca_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type SalesLead = typeof salesLeads.$inferSelect;
export type InsertSalesLead = typeof salesLeads.$inferInsert;

export const salesLeadsRelations = relations(salesLeads, ({ one }) => ({
  salesExecutive: one(salesExecutives, {
    fields: [salesLeads.caId],
    references: [salesExecutives.id],
  }),
}));

// Lead Campaigns (Replaces old salesLeads)
export const leadCampaigns = pgTable("lead_campaigns", {
  id: serial("id").primaryKey(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  month: varchar("month", { length: 50 }).notNull(),
  caId: bigint("ca_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  asmId: bigint("asm_id", { mode: "number" }).references(() => salesExecutives.id, { onDelete: "set null" }),
  course: varchar("course", { length: 255 }).notNull(),
  noOfLeads: integer("no_of_leads").default(0).notNull(),
  amountSpent: decimal("amount_spent", { precision: 10, scale: 2 }).default("0").notNull(),
  dailyBudget: decimal("daily_budget", { precision: 10, scale: 2 }).default("0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type LeadCampaign = typeof leadCampaigns.$inferSelect;
export type InsertLeadCampaign = typeof leadCampaigns.$inferInsert;

export const leadCampaignsRelations = relations(leadCampaigns, ({ one }) => ({
  courseAdvisor: one(salesExecutives, {
    fields: [leadCampaigns.caId],
    references: [salesExecutives.id],
    relationName: "courseAdvisor",
  }),
  asm: one(salesExecutives, {
    fields: [leadCampaigns.asmId],
    references: [salesExecutives.id],
    relationName: "asmManager",
  }),
}));

// Class Ledger Transactions (Single Source of Truth for class entitlement)
export const classLedgerTransactions = pgTable("class_ledger_transactions", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).references(() => batchEnrollments.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // 'credit', 'debit', 'expired', 'adjustment'
  amount: integer("amount").notNull(),
  referenceClassId: bigint("reference_class_id", { mode: "number" }).references(() => classes.id, { onDelete: "set null" }),
  referenceOneToOneId: bigint("reference_one_to_one_id", { mode: "number" }).references(() => oneToOneSessions.id, { onDelete: "set null" }),
  remarks: text("remarks"),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ClassLedgerTransaction = typeof classLedgerTransactions.$inferSelect;
export type InsertClassLedgerTransaction = typeof classLedgerTransactions.$inferInsert;

// Attendance Events (for 20-minute cumulative rule)
export const attendanceEvents = pgTable("attendance_events", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  classId: bigint("class_id", { mode: "number" }).references(() => classes.id, { onDelete: "cascade" }),
  oneToOneSessionId: bigint("one_to_one_session_id", { mode: "number" }).references(() => oneToOneSessions.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 20 }).notNull(), // 'join', 'leave'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: json("metadata"),
});
export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type InsertAttendanceEvent = typeof attendanceEvents.$inferInsert;

export const classLedgerRelations = relations(classLedgerTransactions, ({ one }) => ({
  student: one(users, { fields: [classLedgerTransactions.studentId], references: [users.id] }),
  enrollment: one(batchEnrollments, { fields: [classLedgerTransactions.enrollmentId], references: [batchEnrollments.id] }),
  creator: one(users, { fields: [classLedgerTransactions.createdBy], references: [users.id] }),
}));

export const attendanceEventsRelations = relations(attendanceEvents, ({ one }) => ({
  user: one(users, { fields: [attendanceEvents.userId], references: [users.id] }),
}));

// Custom Report Templates / Configs
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'sales_dashboard', 'weekly_report'
  config: json("config").notNull(), // stores columns, week definitions, filters
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  isGlobal: boolean("is_global").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = typeof reportTemplates.$inferInsert;

// ─── Departments (Academic Teams) ────────────────────────────────────────────
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  headUserId: bigint("head_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;

// Department ↔ Module (Course) assignments
export const departmentModules = pgTable(
  "department_modules",
  {
    id: serial("id").primaryKey(),
    departmentId: bigint("department_id", { mode: "number" })
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    moduleId: bigint("module_id", { mode: "number" })
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueDeptModule: uniqueIndex("unique_dept_module_idx").on(table.departmentId, table.moduleId),
  })
);
export type DepartmentModule = typeof departmentModules.$inferSelect;
export type InsertDepartmentModule = typeof departmentModules.$inferInsert;

// Department ↔ Teacher assignments
export const departmentTeachers = pgTable(
  "department_teachers",
  {
    id: serial("id").primaryKey(),
    departmentId: bigint("department_id", { mode: "number" })
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    teacherId: bigint("teacher_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueDeptTeacher: uniqueIndex("unique_dept_teacher_idx").on(table.departmentId, table.teacherId),
  })
);
export type DepartmentTeacher = typeof departmentTeachers.$inferSelect;
export type InsertDepartmentTeacher = typeof departmentTeachers.$inferInsert;

// Drizzle Relations for departments
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  head: one(users, { fields: [departments.headUserId], references: [users.id] }),
  departmentModules: many(departmentModules),
  departmentTeachers: many(departmentTeachers),
}));
export const departmentModulesRelations = relations(departmentModules, ({ one }) => ({
  department: one(departments, { fields: [departmentModules.departmentId], references: [departments.id] }),
  module: one(modules, { fields: [departmentModules.moduleId], references: [modules.id] }),
}));
export const departmentTeachersRelations = relations(departmentTeachers, ({ one }) => ({
  department: one(departments, { fields: [departmentTeachers.departmentId], references: [departments.id] }),
  teacher: one(users, { fields: [departmentTeachers.teacherId], references: [users.id] }),
}));

// ─── Demo Classes (Sales Executive → Teacher → Prospective Student) ──────────
export const demoClasses = pgTable("demo_classes", {
  id: serial("id").primaryKey(),
  salesExecId: bigint("sales_exec_id", { mode: "number" })
    .notNull()
    .references(() => salesExecutives.id, { onDelete: "cascade" }),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentName: varchar("student_name", { length: 255 }).notNull(),
  studentPhone: varchar("student_phone", { length: 50 }),
  studentEmail: varchar("student_email", { length: 320 }),
  moduleId: bigint("module_id", { mode: "number" }).references(() => modules.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at"),
  jitsiRoom: varchar("jitsi_room", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | completed | cancelled
  convertedToEnrollment: boolean("converted_to_enrollment").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type DemoClass = typeof demoClasses.$inferSelect;
export type InsertDemoClass = typeof demoClasses.$inferInsert;

export const demoClassesRelations = relations(demoClasses, ({ one }) => ({
  salesExec: one(salesExecutives, { fields: [demoClasses.salesExecId], references: [salesExecutives.id] }),
  teacher: one(users, { fields: [demoClasses.teacherId], references: [users.id] }),
  module: one(modules, { fields: [demoClasses.moduleId], references: [modules.id] }),
}));
