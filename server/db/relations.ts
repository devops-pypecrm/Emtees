import { relations } from "drizzle-orm";
import {
  users,
  profiles,
  modules,
  batches,
  batchEnrollments,
  classes,
  attendance,
  flexibilityRequests,
  payments,
  teacherSalaries,
  notifications,
  oneToOneSessions,
  batchFeeAuditLogs,
  classBatches,
  classJoinRequests,
  batchAuditLogs,
  attendanceAlerts,
  teacherSalaryConfigs,
  teacherSalaryConfigAuditLogs,
  sessionAllocationLogs,
  oneToOneRescheduleRequests,
  salesExecutives,
  studentCourseAuditLogs,
  studentClassAllocations,
  qualifications,
  studentFeeConfigurations,
  departmentTeachers,
  departments,
  departmentModules,
} from "./schema";

export const qualificationsRelations = relations(qualifications, ({ many }) => ({
  users: many(users),
  profiles: many(profiles),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  qualification: one(qualifications, {
    fields: [users.qualificationId],
    references: [qualifications.id],
  }),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  enrollments: many(batchEnrollments),
  attendance: many(attendance),
  notifications: many(notifications),
  salaries: many(teacherSalaries),
  payments: many(payments),
  feeAuditLogs: many(batchFeeAuditLogs),
  joinRequests: many(classJoinRequests),
  auditLogs: many(batchAuditLogs),
  attendanceAlerts: many(attendanceAlerts),
  salaryConfig: one(teacherSalaryConfigs, {
    fields: [users.id],
    references: [teacherSalaryConfigs.teacherId],
  }),
  salaryConfigAuditLogs: many(teacherSalaryConfigAuditLogs),
  createdOneToOneSessions: many(oneToOneSessions, { relationName: "oneToOneCreator" }),
  sessionAllocationLogs: many(sessionAllocationLogs, { relationName: "studentAllocationLogs" }),
  changedSessionAllocationLogs: many(sessionAllocationLogs, { relationName: "adminAllocationLogs" }),
  salesProfile: one(salesExecutives, {
    fields: [users.id],
    references: [salesExecutives.userId],
    relationName: "salesExecutiveUser",
  }),
  assignedSalesExecutive: one(salesExecutives, {
    fields: [users.salesExecutiveId],
    references: [salesExecutives.id],
    relationName: "referredStudents",
  }),
  departmentTeachers: many(departmentTeachers),
  feeConfig: one(studentFeeConfigurations, {
    fields: [users.id],
    references: [studentFeeConfigurations.studentId],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  qualification: one(qualifications, {
    fields: [profiles.qualificationId],
    references: [qualifications.id],
  }),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  batches: many(batches),
  departmentModules: many(departmentModules),
  teacher: one(users, {
    fields: [modules.teacherId],
    references: [users.id],
  }),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  module: one(modules, {
    fields: [batches.moduleId],
    references: [modules.id],
  }),
  teacher: one(users, {
    fields: [batches.teacherId],
    references: [users.id],
  }),
  enrollments: many(batchEnrollments),
  classes: many(classes),
  payments: many(payments),
  feeAuditLogs: many(batchFeeAuditLogs),
  classBatches: many(classBatches),
  auditLogs: many(batchAuditLogs),
  attendanceAlerts: many(attendanceAlerts),
}));

export const batchEnrollmentsRelations = relations(batchEnrollments, ({ one }) => ({
  batch: one(batches, {
    fields: [batchEnrollments.batchId],
    references: [batches.id],
  }),
  student: one(users, {
    fields: [batchEnrollments.studentId],
    references: [users.id],
  }),
  module: one(modules, {
    fields: [batchEnrollments.moduleId],
    references: [modules.id],
  }),
  feeConfig: one(studentFeeConfigurations, {
    fields: [batchEnrollments.studentFeeConfigId],
    references: [studentFeeConfigurations.id],
  }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  batch: one(batches, {
    fields: [classes.batchId],
    references: [batches.id],
  }),
  teacher: one(users, {
    fields: [classes.teacherId],
    references: [users.id],
  }),
  attendance: many(attendance),
  oneToOneSessions: many(oneToOneSessions),
  classBatches: many(classBatches),
  joinRequests: many(classJoinRequests),
}));

export const oneToOneSessionsRelations = relations(oneToOneSessions, ({ one, many }) => ({
  class: one(classes, {
    fields: [oneToOneSessions.classId],
    references: [classes.id],
  }),
  teacher: one(users, {
    fields: [oneToOneSessions.teacherId],
    references: [users.id],
  }),
  student: one(users, {
    fields: [oneToOneSessions.studentId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [oneToOneSessions.createdBy],
    references: [users.id],
    relationName: "oneToOneCreator",
  }),
  rescheduleRequests: many(oneToOneRescheduleRequests),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  class: one(classes, {
    fields: [attendance.classId],
    references: [classes.id],
  }),
  student: one(users, {
    fields: [attendance.studentId],
    references: [users.id],
  }),
  teacher: one(users, {
    fields: [attendance.teacherId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [attendance.batchId],
    references: [batches.id],
  }),
  module: one(modules, {
    fields: [attendance.moduleId],
    references: [modules.id],
  }),
  oneToOneSession: one(oneToOneSessions, {
    fields: [attendance.oneToOneSessionId],
    references: [oneToOneSessions.id],
  }),
}));

export const flexibilityRequestsRelations = relations(flexibilityRequests, ({ one }) => ({
  student: one(users, {
    fields: [flexibilityRequests.studentId],
    references: [users.id],
  }),
  fromBatch: one(batches, {
    fields: [flexibilityRequests.fromBatchId],
    references: [batches.id],
  }),
  toBatch: one(batches, {
    fields: [flexibilityRequests.toBatchId],
    references: [batches.id],
  }),
  resolver: one(users, {
    fields: [flexibilityRequests.resolvedBy],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(users, {
    fields: [payments.studentId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [payments.batchId],
    references: [batches.id],
  }),
  feeConfig: one(studentFeeConfigurations, {
    fields: [payments.studentFeeConfigId],
    references: [studentFeeConfigurations.id],
  }),
}));

export const studentFeeConfigurationsRelations = relations(studentFeeConfigurations, ({ one, many }) => ({
  student: one(users, {
    fields: [studentFeeConfigurations.studentId],
    references: [users.id],
  }),
  enrollments: many(batchEnrollments),
  payments: many(payments),
}));

export const teacherSalariesRelations = relations(teacherSalaries, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaries.teacherId],
    references: [users.id],
  }),
}));

export const teacherSalaryConfigsRelations = relations(teacherSalaryConfigs, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaryConfigs.teacherId],
    references: [users.id],
  }),
}));

export const teacherSalaryConfigAuditLogsRelations = relations(teacherSalaryConfigAuditLogs, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaryConfigAuditLogs.teacherId],
    references: [users.id],
  }),
  changedByUser: one(users, {
    fields: [teacherSalaryConfigAuditLogs.changedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const batchFeeAuditLogsRelations = relations(batchFeeAuditLogs, ({ one }) => ({
  batch: one(batches, {
    fields: [batchFeeAuditLogs.batchId],
    references: [batches.id],
  }),
  admin: one(users, {
    fields: [batchFeeAuditLogs.adminId],
    references: [users.id],
  }),
}));

export const batchAuditLogsRelations = relations(batchAuditLogs, ({ one }) => ({
  batch: one(batches, {
    fields: [batchAuditLogs.batchId],
    references: [batches.id],
  }),
  changedByUser: one(users, {
    fields: [batchAuditLogs.changedBy],
    references: [users.id],
  }),
}));
export const classBatchesRelations = relations(classBatches, ({ one }) => ({
  class: one(classes, {
    fields: [classBatches.classId],
    references: [classes.id],
  }),
  batch: one(batches, {
    fields: [classBatches.batchId],
    references: [batches.id],
  }),
}));

export const classJoinRequestsRelations = relations(classJoinRequests, ({ one }) => ({
  class: one(classes, {
    fields: [classJoinRequests.classId],
    references: [classes.id],
  }),
  student: one(users, {
    fields: [classJoinRequests.studentId],
    references: [users.id],
  }),
}));

export const attendanceAlertsRelations = relations(attendanceAlerts, ({ one }) => ({
  student: one(users, {
    fields: [attendanceAlerts.studentId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [attendanceAlerts.batchId],
    references: [batches.id],
  }),
}));

export const sessionAllocationLogsRelations = relations(sessionAllocationLogs, ({ one }) => ({
  student: one(users, {
    fields: [sessionAllocationLogs.studentId],
    references: [users.id],
    relationName: "studentAllocationLogs",
  }),
  changedByUser: one(users, {
    fields: [sessionAllocationLogs.changedBy],
    references: [users.id],
    relationName: "adminAllocationLogs",
  }),
}));

export const oneToOneRescheduleRequestsRelations = relations(oneToOneRescheduleRequests, ({ one }) => ({
  session: one(oneToOneSessions, {
    fields: [oneToOneRescheduleRequests.sessionId],
    references: [oneToOneSessions.id],
  }),
  requestedByUser: one(users, {
    fields: [oneToOneRescheduleRequests.requestedBy],
    references: [users.id],
  }),
  resolvedByUser: one(users, {
    fields: [oneToOneRescheduleRequests.resolvedBy],
    references: [users.id],
  }),
}));

export const salesExecutivesRelations = relations(salesExecutives, ({ one, many }) => ({
  user: one(users, {
    fields: [salesExecutives.userId],
    references: [users.id],
    relationName: "salesExecutiveUser",
  }),
  referredStudents: many(users, {
    relationName: "referredStudents",
  }),
}));


export const studentCourseAuditLogsRelations = relations(studentCourseAuditLogs, ({ one }) => ({
  student: one(users, {
    fields: [studentCourseAuditLogs.studentId],
    references: [users.id],
  }),
  changedByUser: one(users, {
    fields: [studentCourseAuditLogs.changedBy],
    references: [users.id],
  }),
}));

export const studentClassAllocationsRelations = relations(studentClassAllocations, ({ one }) => ({
  student: one(users, {
    fields: [studentClassAllocations.studentId],
    references: [users.id],
  }),
}));

export const departmentTeachersRelations = relations(departmentTeachers, ({ one }) => ({ teacher: one(users, { fields: [departmentTeachers.teacherId], references: [users.id] }), department: one(departments, { fields: [departmentTeachers.departmentId], references: [departments.id] }) }));
