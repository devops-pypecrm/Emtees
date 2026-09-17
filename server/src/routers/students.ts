import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, count, inArray, ne, or, isNull, isNotNull, asc } from "drizzle-orm";
import XLSX from "xlsx";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, batchEnrollments, batches, classes, modules, payments, attendance, privateMessages, feedback, sessionAllocationLogs, oneToOneSessions, studentCourseAuditLogs, studentClassAllocations, attendanceAlerts, qualifications, departments, departmentTeachers } from "@db/schema";
import { updateStudentSessionBalances } from "../lib/sessionHelper";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getNextUniqueId } from "../lib/idGenerator";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { env } from "../lib/env";
import { isStudentFeeRestricted, recalculateStudentFees } from "../lib/feeHelper";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE, getCountryISOFromDialCode } from "@contracts/validation";
import { sendUserCredentialsEmail } from "../lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { EnrollmentPaymentService } from "../lib/EnrollmentPaymentService";
import { StudentAdmissionService, parseSafeDate } from "../lib/StudentAdmissionService";


export const studentsRouter = createRouter({
  list: teacherQuery
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive", "pending_enrollment", "waiting_for_batch", "alumni"]).default("all"),
        courseId: z.number().optional(),
        batchId: z.number().optional(),
        sessionType: z.enum(["all", "one_on_one", "group", "both"]).optional(),
        preferredClassTime: z.string().optional(),
        paymentType: z.string().optional(),
        qualificationId: z.number().optional(),
        postalCode: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const filters = [eq(users.role, "student")];

      // Enforce assigned student restrictions for Teachers and Academic Heads
      let allowedTeacherIds: number[] | null = null;
      let allowedModuleIds: number[] | null = null;

      if (ctx.user.role === "teacher") {
        allowedTeacherIds = [ctx.user.id];
      } else if (ctx.user.role === "academic_head") {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.headUserId, ctx.user.id),
          with: { 
            departmentTeachers: true,
            departmentModules: true
          }
        });
        if (dept) {
          allowedTeacherIds = dept.departmentTeachers.map((dt: any) => dt.teacherId);
          allowedModuleIds = dept.departmentModules.map((dm: any) => dm.moduleId);
        } else {
          allowedTeacherIds = []; // No department assigned, see no students
          allowedModuleIds = [];
        }
      }

      if (allowedTeacherIds !== null) {
        if (allowedTeacherIds.length === 0 && (!allowedModuleIds || allowedModuleIds.length === 0)) {
          return { items: [], total: 0 };
        }

        const teacherBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(inArray(batches.teacherId, allowedTeacherIds));
        const batchIds = teacherBatches.map((b) => b.id);

        let groupStudentIds: number[] = [];
        if (batchIds.length > 0) {
          const enrolledStudents = await db.selectDistinct({ studentId: batchEnrollments.studentId })
            .from(batchEnrollments)
            .where(and(
              inArray(batchEnrollments.batchId, batchIds),
              eq(batchEnrollments.status, "active")
            ));
          groupStudentIds = enrolledStudents.map((e) => e.studentId);
        }

        // Fetch 1-to-1 assigned students
        const o2oAllocations = await db
          .select({ studentId: studentClassAllocations.studentId, allocation: studentClassAllocations.allocation })
          .from(studentClassAllocations);

        const o2oStudentIds = o2oAllocations
          .filter((row: any) => {
            const alloc = typeof row.allocation === "string" ? JSON.parse(row.allocation) : row.allocation;
            return alloc?.oneToOne?.teacherId && allowedTeacherIds!.includes(Number(alloc.oneToOne.teacherId));
          })
          .map(row => row.studentId);

        let moduleStudentIds: number[] = [];
        if (allowedModuleIds && allowedModuleIds.length > 0) {
          const modStudents = await db.selectDistinct({ userId: profiles.userId })
            .from(profiles)
            .leftJoin(users, eq(users.id, profiles.userId))
            .where(and(inArray(profiles.moduleId, allowedModuleIds), eq(users.role, "student")));
            
          moduleStudentIds = modStudents.filter((s: any) => s.userId !== null).map((s: any) => Number(s.userId));
        }

        const allStudentIds = Array.from(new Set([...groupStudentIds, ...o2oStudentIds, ...moduleStudentIds]));

        if (allStudentIds.length === 0) {
          return { items: [], total: 0 };
        }

        filters.push(inArray(users.id, allStudentIds));
      }

      // Search filters
      if (input?.search) {
        filters.push(
          sql`(${users.name} ILIKE ${"%" + input.search + "%"} OR ${users.phone} ILIKE ${"%" + input.search + "%"} OR ${users.email} ILIKE ${"%" + input.search + "%"} OR ${users.unionId} ILIKE ${"%" + input.search + "%"} OR ${profiles.enrollmentId} ILIKE ${"%" + input.search + "%"} OR ${users.address} ILIKE ${"%" + input.search + "%"} OR ${profiles.address} ILIKE ${"%" + input.search + "%"} OR ${users.postalCode} ILIKE ${"%" + input.search + "%"} OR ${qualifications.name} ILIKE ${"%" + input.search + "%"})`
        );
      }

      if (input?.qualificationId) {
        const qf = or(eq(users.qualificationId, input.qualificationId), eq(profiles.qualificationId, input.qualificationId));
        if (qf) filters.push(qf);
      }

      if (input?.postalCode) {
        const pf = or(sql`${users.postalCode} ILIKE ${"%" + input.postalCode + "%"}`, sql`${profiles.postalCode} ILIKE ${"%" + input.postalCode + "%"}`);
        if (pf) filters.push(pf);
      }

      // Session type filter
      if (input?.sessionType && input.sessionType !== "all") {
        if (input.sessionType === "one_on_one") {
          filters.push(eq(profiles.oneOnOneEnabled, true));
          filters.push(eq(profiles.groupSessionEnabled, false));
        } else if (input.sessionType === "group") {
          filters.push(eq(profiles.oneOnOneEnabled, false));
          filters.push(eq(profiles.groupSessionEnabled, true));
        } else if (input.sessionType === "both") {
          filters.push(eq(profiles.oneOnOneEnabled, true));
          filters.push(eq(profiles.groupSessionEnabled, true));
        }
      }

      if (input?.preferredClassTime) {
        filters.push(eq(profiles.preferredClassTime, input.preferredClassTime));
      }

      if (input?.paymentType) {
        filters.push(eq(profiles.paymentType, input.paymentType));
      }

      // Status filters
      if (input?.status === "active") {
        filters.push(eq(users.status, "active"));
        filters.push(isNull(profiles.completionDate));
      } else if (input?.status === "inactive") {
        filters.push(eq(users.status, "inactive"));
      } else if (input?.status === "pending_enrollment" || input?.status === "waiting_for_batch") {
        filters.push(eq(users.status, "active"));
        filters.push(sql`NOT EXISTS (
          SELECT 1 FROM batch_enrollments
          WHERE batch_enrollments.student_id = ${users.id}
          AND batch_enrollments.status = 'active'
        )`);
      } else if (input?.status === "alumni") {
        filters.push(isNotNull(profiles.completionDate));
      }

      // Course and batch ID filters
      if (input?.batchId) {
        const batchUsers = await db.select({ studentId: batchEnrollments.studentId })
          .from(batchEnrollments)
          .where(and(
            eq(batchEnrollments.batchId, input.batchId),
            eq(batchEnrollments.status, "active")
          ));
        const batchUserIds = batchUsers.map((bu) => bu.studentId);
        if (batchUserIds.length === 0) {
          return { items: [], total: 0 };
        }
        filters.push(inArray(users.id, batchUserIds));
      } else if (input?.courseId) {
        const courseBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(eq(batches.moduleId, input.courseId));
        const courseBatchIds = courseBatches.map((cb) => cb.id);
        
        let courseUserIds: number[] = [];
        if (courseBatchIds.length > 0) {
          const courseUsers = await db.select({ studentId: batchEnrollments.studentId })
            .from(batchEnrollments)
            .where(and(
              inArray(batchEnrollments.batchId, courseBatchIds),
              eq(batchEnrollments.status, "active")
            ));
          courseUserIds = courseUsers.map((cu) => cu.studentId);
        }
        
        if (courseUserIds.length > 0) {
          const cf = or(
            inArray(users.id, courseUserIds),
            eq(profiles.moduleId, input.courseId)
          );
          if (cf) filters.push(cf);
        } else {
          filters.push(eq(profiles.moduleId, input.courseId));
        }
      }

      const where = and(...filters);

      // Query total count
      const totalRes = await db
        .select({ value: count() })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId))
        .leftJoin(qualifications, eq(users.qualificationId, qualifications.id))
        .where(where);
      const total = totalRes[0]?.value || 0;

      const items = await db
        .select({
          id: users.id,
          unionId: users.unionId,
          username: users.username,
          password: users.password,
          rawPassword: users.rawPassword,
          name: users.name,
          email: users.email,
          phone: users.phone,
          countryCode: users.countryCode,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          avatar: users.avatar,
          address: users.address,
          postalCode: users.postalCode,
          qualificationId: users.qualificationId,
          qualificationName: qualifications.name,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          batchId: batchEnrollments.batchId,
          courseId: sql<number | null>`COALESCE(${profiles.moduleId}, ${batches.moduleId})`,
          classAllocation: studentClassAllocations.allocation,
          profile: {
            id: profiles.id,
            enrollmentId: profiles.enrollmentId,
            course: profiles.course,
            batch: profiles.batch,
            batchTime: profiles.batchTime,
            feesTotal: profiles.feesTotal,
            feesPaid: profiles.feesPaid,
            feesBalance: profiles.feesBalance,
            paymentStatus: profiles.paymentStatus,
            paymentType: profiles.paymentType,
            oneOnOneEnabled: profiles.oneOnOneEnabled,
            groupSessionEnabled: profiles.groupSessionEnabled,
            preferredClassTime: profiles.preferredClassTime,
            minInitialPayment: profiles.minInitialPayment,
            paymentDueDate: profiles.paymentDueDate,
            gracePeriodDays: profiles.gracePeriodDays,
            admissionDate: profiles.admissionDate,
            completionDate: profiles.completionDate,
            allocatedOneToOneSessions: profiles.allocatedOneToOneSessions,
            allocatedGroupSessions: profiles.allocatedGroupSessions,
            totalAllocatedSessions: profiles.totalAllocatedSessions,
            attendedOneToOneSessions: profiles.attendedOneToOneSessions,
            attendedGroupSessions: profiles.attendedGroupSessions,
            totalAttendedSessions: profiles.totalAttendedSessions,
            remainingOneToOneSessions: profiles.remainingOneToOneSessions,
            remainingGroupSessions: profiles.remainingGroupSessions,
            totalRemainingSessions: profiles.totalRemainingSessions,
            documents: profiles.documents,
            activityTimeline: profiles.activityTimeline,
            gender: profiles.gender,
            dob: profiles.dob,
            address: profiles.address,
            postalCode: profiles.postalCode,
            qualificationId: profiles.qualificationId,
            educationalQualification: profiles.educationalQualification,
            parentName: profiles.parentName,
            parentPhone: profiles.parentPhone,
            notes: profiles.notes,
            photo: profiles.photo,
          }
        })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId))
        .leftJoin(qualifications, eq(users.qualificationId, qualifications.id))
        .leftJoin(batchEnrollments, and(eq(users.id, batchEnrollments.studentId), eq(batchEnrollments.status, "active")))
        .leftJoin(batches, eq(batchEnrollments.batchId, batches.id))
        .leftJoin(studentClassAllocations, eq(users.id, studentClassAllocations.studentId))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.id));

      return {
        items: items.map(item => ({
          ...item,
          courseId: item.courseId ? Number(item.courseId) : null
        })),
        total,
      };
    }),

  getProfile: teacherQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = input.id;

      // Guard: id=0 means not yet loaded on client — return null gracefully
      if (!userId || userId <= 0) {
        return null;
      }

      // Permission check: Students can only view their own profile
      if (ctx.user.role === "student" && ctx.user.id !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Students can only access their own profile." });
      }

      // Enforce assigned student checks for Teachers
      if (ctx.user.role === "teacher") {
        const teacherBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, ctx.user.id));
        const batchIds = teacherBatches.map((b) => b.id);

        if (batchIds.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this student." });
        }

        const enrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, userId),
            inArray(batchEnrollments.batchId, batchIds),
            eq(batchEnrollments.status, "active")
          ),
        });

        if (!enrollment) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this student." });
        }
      }

      const student = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.role, "student")),
        with: {
          profile: true,
        },
      });

      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      let qualificationObj = null;
      const qualId = student.qualificationId || student.profile?.qualificationId;
      if (qualId) {
        qualificationObj = await db.query.qualifications.findFirst({
          where: eq(qualifications.id, qualId),
        });
      }

      const studentWithQual = {
        ...student,
        qualification: qualificationObj,
        profile: student.profile ? {
          ...student.profile,
          qualification: qualificationObj,
        } : null,
      };

      // 1. Fetch Attendance History
      const attendanceList = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
        orderBy: desc(attendance.recordedAt),
        with: {
          class: true,
        },
      });

      // 2. Fetch Payments History
      const paymentsList = await db.query.payments.findMany({
        where: eq(payments.studentId, userId),
        orderBy: desc(payments.createdAt),
        with: {
          batch: true,
        },
      });

      // 3. Fetch Feedback / Performance reports
      const feedbackList = await db.query.feedback.findMany({
        where: eq(feedback.studentId, userId),
        orderBy: desc(feedback.createdAt),
        with: {
          teacher: true,
        },
      });

      // 4. Fetch Session Allocation Logs
      const sessionLogs = await db.query.sessionAllocationLogs.findMany({
        where: eq(sessionAllocationLogs.studentId, userId),
        orderBy: desc(sessionAllocationLogs.changedAt),
        with: {
          changedByUser: true,
        },
      });

      // 5. Fetch Communication History (Private Messages)
      const chatHistory = await db.query.privateMessages.findMany({
        where: and(
          or(
            eq(privateMessages.senderId, userId),
            eq(privateMessages.receiverId, userId)
          ),
          isNull(privateMessages.deletedAt)
        ),
        orderBy: desc(privateMessages.createdAt),
        limit: 100,
        with: {
          sender: true,
          receiver: true,
        },
      });

      // Fetch Enrollments & resolved teachers
      const enrollmentsList = await db.query.batchEnrollments.findMany({
        where: eq(batchEnrollments.studentId, userId),
        orderBy: desc(batchEnrollments.joinedAt),
        with: {
          batch: {
            with: {
              module: true,
              teacher: {
                columns: { id: true, name: true }
              }
            }
          }
        }
      });

      const resolvedEnrollments = await Promise.all(enrollmentsList.map(async (e) => {
        let teacherIds: number[] = [];
        if (e.assignedTeachers && Array.isArray(e.assignedTeachers)) {
          teacherIds = e.assignedTeachers as number[];
        }
        
        let resolvedTeachers: { id: number, name: string }[] = [];
        if (teacherIds.length > 0) {
          resolvedTeachers = await db.select({
            id: users.id,
            name: users.name
          })
          .from(users)
          .where(and(
            inArray(users.id, teacherIds),
            eq(users.role, "teacher")
          ));
        }
        
        return {
          ...e,
          resolvedTeachers
        };
      }));

      // Fetch One-to-One Sessions for combined history
      const o2oSessions = await db.query.oneToOneSessions.findMany({
        where: eq(oneToOneSessions.studentId, userId),
        orderBy: desc(oneToOneSessions.scheduledAt),
        with: {
          teacher: {
            columns: { id: true, name: true }
          }
        }
      });

      // Fetch Group Attendance list for combined history
      const groupAttendances = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
        orderBy: desc(attendance.recordedAt),
        with: {
          class: {
            with: {
              teacher: {
                columns: { id: true, name: true }
              }
            }
          }
        }
      });

      // Fetch Student Course Audit Logs
      const auditLogsList = await db.query.studentCourseAuditLogs.findMany({
        where: eq(studentCourseAuditLogs.studentId, userId),
        orderBy: desc(studentCourseAuditLogs.changedAt),
        with: {
          changedByUser: {
            columns: { id: true, name: true }
          }
        }
      });

      const classAllocRecord = await db.query.studentClassAllocations.findFirst({
        where: eq(studentClassAllocations.studentId, userId),
      });

      const formattedO2O = o2oSessions.map((s) => ({
        id: `o2o_${s.id}`,
        sessionType: "one_to_one",
        title: s.title || "1-to-1 Session",
        duration: s.sessionLength || 30,
        teacherName: s.teacher?.name || "Unassigned",
        teacherId: s.teacherId,
        date: s.scheduledAt,
        status: s.status === "completed" 
          ? (s.studentAttendance === "present" ? "completed" : "absent")
          : (s.status === "cancelled" ? "cancelled" : (s.status === "rescheduled" ? "rescheduled" : "scheduled")),
        notes: s.remarks || "",
      }));

      const formattedGroup = groupAttendances.map((a) => ({
        id: `group_${a.id}`,
        sessionType: "group",
        title: a.class?.title || "Group Class",
        duration: a.class?.duration || a.duration || 0,
        teacherName: a.class?.teacher?.name || "Unassigned",
        teacherId: a.class?.teacherId,
        date: a.class?.scheduledAt || a.recordedAt,
        status: a.class?.status === "cancelled" 
          ? "cancelled"
          : (a.status === "present" ? "completed" : (a.status === "late" ? "completed" : "absent")),
        notes: a.class?.description || "",
      }));

      const combinedHistory = [...formattedO2O, ...formattedGroup].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const activeEnrollment = resolvedEnrollments.find((e: any) => e.status === "active") || resolvedEnrollments[0];
      
      let classAllocation = null;
      if (classAllocRecord && classAllocRecord.allocation) {
        classAllocation = classAllocRecord.allocation;
        // Optionally merge with activeEnrollment live counts if desired, but studentClassAllocations should be updated in sync.
      } else if (activeEnrollment) {
        classAllocation = {
          oneToOne: {
            teacherId: (activeEnrollment.assignedTeachers as any)?.[0] || null,
            designatedTime: "",
            sessions30: activeEnrollment.oneOnOne30Allocated,
            sessions45: activeEnrollment.oneOnOne45Allocated,
            sessions60: activeEnrollment.oneOnOne60Allocated,
            completed30: activeEnrollment.oneOnOne30Used,
            completed45: activeEnrollment.oneOnOne45Used,
            completed60: activeEnrollment.oneOnOne60Used,
            remaining30: Math.max(0, activeEnrollment.oneOnOne30Allocated - activeEnrollment.oneOnOne30Used),
            remaining45: Math.max(0, activeEnrollment.oneOnOne45Allocated - activeEnrollment.oneOnOne45Used),
            remaining60: Math.max(0, activeEnrollment.oneOnOne60Allocated - activeEnrollment.oneOnOne60Used),
          },
          group: {
            teacherId: (activeEnrollment.assignedTeachers as any)?.[1] || (activeEnrollment.assignedTeachers as any)?.[0] || null,
            batchId: activeEnrollment.batchId,
            designatedTime: "",
            sessions30: activeEnrollment.group30Allocated,
            sessions45: activeEnrollment.group45Allocated,
            sessions60: activeEnrollment.group60Allocated,
            completed30: activeEnrollment.group30Used,
            completed45: activeEnrollment.group45Used,
            completed60: activeEnrollment.group60Used,
            remaining30: Math.max(0, activeEnrollment.group30Allocated - activeEnrollment.group30Used),
            remaining45: Math.max(0, activeEnrollment.group45Allocated - activeEnrollment.group45Used),
            remaining60: Math.max(0, activeEnrollment.group60Allocated - activeEnrollment.group60Used),
          }
        };
      }

      return {
        student: studentWithQual,
        attendance: attendanceList,
        payments: paymentsList,
        feedback: feedbackList,
        sessionAllocationLogs: sessionLogs,
        chatHistory,
        enrollments: resolvedEnrollments,
        classHistory: combinedHistory,
        studentCourseAuditLogs: auditLogsList,
        classAllocation,
      };
    }),

  create: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        countryCode: z.string(),
        countryISO: z.string().optional(),
        phoneNumber: z.string(),
        email: z.string().email().optional(),
        username: z.string().trim().min(3),
        password: z.string().trim().min(6),
        enrollmentId: z.string().optional(),
        courseId: z.number(),
        batchId: z.number().optional(),
        preferredClassTime: z.string().optional(),
        sessionType: z.enum(["one_on_one", "group", "both"]).default("group"),
        feesTotal: z.number(),
        allocatedOneToOneSessions: z.number().default(0),
        allocatedGroupSessions: z.number().default(0),
        paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).default("FULL_PAYMENT"),
        installments: z.array(
          z.object({
            installmentNumber: z.number(),
            amount: z.number(),
            dueDate: z.string().optional(),
          })
        ).optional(),
        // Personal Details
        gender: z.string().optional(),
        dob: z.string().optional(),
        address: z.string().optional(),
        postalCode: z.string().optional(),
        qualificationId: z.number().optional(),
        educationalQualification: z.string().optional(),
        parentName: z.string().optional(),
        parentCountryCode: z.string().optional(),
        parentCountryISO: z.string().optional(),
        parentPhoneNumber: z.string().optional(),
        parentPhone: z.string().optional(),
        notes: z.string().optional(),
        // Structured Class Allocation
        classAllocation: z.object({
          oneToOne: z.object({
            teacherId: z.number().nullable().optional(),
            sessions30: z.number().default(0),
            sessions45: z.number().default(0),
            sessions60: z.number().default(0),
          }),
          group: z.object({
            teacherId: z.number().nullable().optional(),
            batchId: z.number().nullable().optional(),
            sessions30: z.number().default(0),
            sessions45: z.number().default(0),
            sessions60: z.number().default(0),
          }),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let userId: number;
      let unionId: string;
      let emailError: string | null = null;

      try {
        const result = await db.transaction(async (tx) => {
          return await StudentAdmissionService.admitStudent(tx, input, ctx.user.id);
        });
        userId = result.id;
        unionId = result.unionId;
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message || "Failed to register student",
        });
      }

      // Handle capacity warnings
      if (input.batchId) {
        try {
          const [batch] = await db.select().from(batches).where(eq(batches.id, input.batchId)).limit(1);
          if (batch) {
            const [{ value: activeCount }] = await db
              .select({ value: count() })
              .from(batchEnrollments)
              .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

            if (batch.maxStudents != null && activeCount > batch.maxStudents) {
              const adminIds = await getAdminUserIds();
              await sendBulkNotification(
                adminIds,
                "Batch Overcrowded",
                `Batch "${batch.name}" has exceeded its maximum capacity (${activeCount}/${batch.maxStudents}).`,
                "capacity_alert",
                { batchId: input.batchId, activeCount, maxStudents: batch.maxStudents }
              );
            }
          }
        } catch (err) {
          console.error("Failed to check batch capacity warning:", err);
        }
      }

      // Send credential email
      if (input.email) {
        try {
          const origin = ctx.req.get("origin") || "https://your-lms-domain.com";
          const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : `${origin}/login`;
          const emailResult = await sendUserCredentialsEmail({
            email: input.email,
            name: input.name,
            username: input.username,
            password: input.password,
            loginUrl,
          });
          if (!emailResult.success) {
            emailError = emailResult.error || "Email delivery failed";
          }
        } catch (e: any) {
          emailError = e.message || String(e);
        }
      }

      return {
        id: userId,
        unionId,
        emailError,
      };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        countryCode: z.string().optional(),
        countryISO: z.string().optional(),
        phoneNumber: z.string().optional(),
        email: z.string().email().optional(),
        status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(),
        // Profile details
        course: z.string().optional(),
        batch: z.string().optional(),
        courseId: z.number().optional(),
        batchId: z.number().optional(),
        oneOnOneEnabled: z.boolean().optional(),
        groupSessionEnabled: z.boolean().optional(),
        preferredClassTime: z.string().optional(),
        feesTotal: z.number().optional(),
        paymentType: z.string().optional(),
        completionDate: z.string().nullable().optional(),
        // Personal details
        gender: z.string().optional(),
        dob: z.string().nullable().optional(),
        address: z.string().optional(),
        postalCode: z.string().optional(),
        qualificationId: z.number().nullable().optional(),
        educationalQualification: z.string().optional(),
        parentName: z.string().optional(),
        parentCountryCode: z.string().optional(),
        parentCountryISO: z.string().optional(),
        parentPhoneNumber: z.string().optional(),
        parentPhone: z.string().optional(),
        notes: z.string().optional(),
        enrollmentId: z.string().optional(),
        username: z.string().trim().optional(),
        password: z.string().trim().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, course, batch, courseId, batchId, oneOnOneEnabled, groupSessionEnabled, preferredClassTime, feesTotal, completionDate, gender, dob, address, postalCode, qualificationId, educationalQualification, parentName, parentPhone, notes, enrollmentId, paymentType, ...userData } = input;

      const currentStudent = await db.query.users.findFirst({
        where: eq(users.id, id),
      });

      if (!currentStudent || currentStudent.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, id),
      });

      // Build the user update data object from non-profile fields
      const updateData: any = { ...userData };
      
      // Prevent overwriting password with empty string if not changed
      if (!input.password) {
        delete updateData.password;
      } else {
        updateData.password = await bcrypt.hash(input.password, 10);
        updateData.rawPassword = input.password;
      }

      if (input.username) {
        const existingUsername = await db.query.users.findFirst({
          where: and(
            eq(users.username, input.username),
            ne(users.id, id)
          )
        });
        if (existingUsername) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
        }
        updateData.username = input.username;
      }

      let countryISO = input.countryISO;
      if (input.countryCode || input.phoneNumber) {
        const countryCode = input.countryCode || currentStudent.countryCode || "";
        const phoneNumber = input.phoneNumber || currentStudent.phoneNumber || "";
        if (!countryISO) {
          countryISO = input.countryISO || currentStudent.countryISO || getCountryISOFromDialCode(countryCode) || "IN";
        }
        const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
        if (valError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: valError });
        }
        const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
        const existingPhone = await db.query.users.findFirst({
          where: and(
            eq(users.fullInternationalNumber, fullIntNum),
            ne(users.id, id)
          ),
        });
        if (existingPhone) {
          throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
        }

        updateData.countryCode = countryCode;
        updateData.countryISO = countryISO;
        updateData.phoneNumber = phoneNumber;
        updateData.fullInternationalNumber = fullIntNum;
        updateData.phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      }

      let parentCountryCode = input.parentCountryCode;
      let parentCountryISO = input.parentCountryISO;
      let parentPhoneNumber = input.parentPhoneNumber;
      let parentFullInt = "";

      if (parentCountryCode || parentPhoneNumber) {
        parentCountryCode = parentCountryCode || existingProfile?.parentCountryCode || "";
        parentPhoneNumber = parentPhoneNumber || existingProfile?.parentPhoneNumber || "";
        parentCountryISO = parentCountryISO || existingProfile?.parentCountryISO || getCountryISOFromDialCode(parentCountryCode) || "IN";

        if (parentCountryCode && parentPhoneNumber) {
          const parentValError = validatePhoneNumber(parentCountryCode, parentPhoneNumber, parentCountryISO);
          if (parentValError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Parent phone: ${parentValError}` });
          }
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      } else if (input.parentPhone) {
        const parsedParent = parseFullPhone(input.parentPhone);
        if (parsedParent) {
          parentCountryCode = parsedParent.countryCode;
          parentCountryISO = parsedParent.countryISO;
          parentPhoneNumber = parsedParent.phoneNumber;
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      }

      const profileUpdate: any = {};
      if (gender !== undefined) profileUpdate.gender = gender;
      if (parentName !== undefined) profileUpdate.parentName = parentName;
      if (notes !== undefined) profileUpdate.notes = notes;

      if (address !== undefined) {
        updateData.address = address;
        profileUpdate.address = address;
      }
      if (postalCode !== undefined) {
        const trimmedCode = postalCode ? postalCode.trim() : null;
        updateData.postalCode = trimmedCode;
        profileUpdate.postalCode = trimmedCode;
      }
      if (qualificationId !== undefined) {
        updateData.qualificationId = qualificationId;
        profileUpdate.qualificationId = qualificationId;
      }
      if (educationalQualification !== undefined) {
        updateData.educationalQualification = educationalQualification;
        profileUpdate.educationalQualification = educationalQualification;
      }

      if (course !== undefined) profileUpdate.course = course;
      if (batch !== undefined) profileUpdate.batch = batch;
      if (oneOnOneEnabled !== undefined) profileUpdate.oneOnOneEnabled = oneOnOneEnabled;
      if (groupSessionEnabled !== undefined) profileUpdate.groupSessionEnabled = groupSessionEnabled;
      if (preferredClassTime !== undefined) profileUpdate.preferredClassTime = preferredClassTime;
      if (paymentType !== undefined) profileUpdate.paymentType = paymentType;

      if (parentCountryCode !== undefined) profileUpdate.parentCountryCode = parentCountryCode;
      if (parentCountryISO !== undefined) profileUpdate.parentCountryISO = parentCountryISO;
      if (parentPhoneNumber !== undefined) profileUpdate.parentPhoneNumber = parentPhoneNumber;
      if (parentFullInt !== "") profileUpdate.parentFullInternationalNumber = parentFullInt;
      if (input.parentPhone !== undefined) {
        profileUpdate.parentPhone = parentCountryCode && parentPhoneNumber ? `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "") : (input.parentPhone ? input.parentPhone.replace(/[^\d+]/g, "") : input.parentPhone);
      }

      if (enrollmentId !== undefined) {
        const trimmedId = enrollmentId?.trim() || "";
        if (trimmedId !== "") {
          const existingEnrollmentId = await db.query.profiles.findFirst({
            where: and(
              eq(profiles.enrollmentId, trimmedId),
              ne(profiles.userId, id)
            ),
          });
          if (existingEnrollmentId) {
            throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" is already taken.` });
          }
          const existingUser = await db.query.users.findFirst({
            where: and(eq(users.unionId, trimmedId), eq(users.role, "student"), ne(users.id, id)),
          });
          if (existingUser) {
            throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" conflicts with an existing Student ID.` });
          }
          profileUpdate.enrollmentId = trimmedId;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enrollment ID cannot be empty." });
        }
      }

      if (dob !== undefined) {
        profileUpdate.dob = dob ? new Date(dob) : null;
      }

      if (completionDate !== undefined) {
        profileUpdate.completionDate = completionDate ? new Date(completionDate) : null;
      }

      // Validate selected Course & Batch if provided
      let selectedCourse = null;
      let selectedBatch = null;

      if (courseId) {
        selectedCourse = await db.query.modules.findFirst({
          where: eq(modules.id, courseId),
        });
        if (!selectedCourse) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected course not found." });
        }
        if (selectedCourse.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected course is inactive." });
        }
        profileUpdate.course = selectedCourse.name;
      }

      if (batchId) {
        selectedBatch = await db.query.batches.findFirst({
          where: eq(batches.id, batchId),
          with: { module: true, teacher: true },
        });
        if (!selectedBatch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected batch not found." });
        }
        if (selectedBatch.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected batch is inactive or archived/deleted." });
        }
        if (courseId && Number(selectedBatch.moduleId) !== courseId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected batch does not match the selected course." });
        }
        profileUpdate.batch = selectedBatch.name;
        profileUpdate.batchTime = selectedBatch.timeSlot || "";
      }

      // Fetch active batch enrollment before transaction
      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, id),
          eq(batchEnrollments.status, "active")
        ),
      });

      const isBatchChanged = batchId !== undefined && (!activeEnrollment || activeEnrollment.batchId !== batchId);

      await db.transaction(async (tx) => {
        // Apply user table update
        if (Object.keys(updateData).length > 0) {
          await tx.update(users).set(updateData).where(eq(users.id, id));
        }

        // If batch is changing, handle transfer logic
        if (isBatchChanged && batchId && selectedBatch) {
          let oldBatchName = "-";
          let oldBatchId: number | null = null;

          if (activeEnrollment) {
            oldBatchId = activeEnrollment.batchId;
            const oldBatch = await tx.query.batches.findFirst({
              where: eq(batches.id, oldBatchId),
            });
            oldBatchName = oldBatch ? oldBatch.name : "-";

            // Mark previous enrollment as inactive
            await tx.update(batchEnrollments)
              .set({ status: "inactive", leftAt: new Date() })
              .where(eq(batchEnrollments.id, activeEnrollment.id));
          }

          // Insert new active enrollment
          await tx.insert(batchEnrollments).values({
            batchId: batchId,
            studentId: id,
            status: "active",
            joinedAt: new Date(),
            assignedTeachers: selectedBatch.teacherId ? [selectedBatch.teacherId] : [],
          });

          // Resolve active attendance alerts for previous batch
          if (oldBatchId) {
            await tx.update(attendanceAlerts)
              .set({ status: "resolved", resolvedAt: new Date() })
              .where(and(
                eq(attendanceAlerts.studentId, id),
                eq(attendanceAlerts.batchId, oldBatchId),
                eq(attendanceAlerts.status, "active")
              ));
          }

          // Update studentClassAllocations
          const classAllocRecord = await tx.query.studentClassAllocations.findFirst({
            where: eq(studentClassAllocations.studentId, id),
          });

          if (classAllocRecord) {
            const alloc = classAllocRecord.allocation as any;
            const updatedAlloc = {
              ...alloc,
              group: {
                ...(alloc?.group || {}),
                batchId: batchId,
                teacherId: selectedBatch.teacherId || null,
              },
            };
            await tx.update(studentClassAllocations)
              .set({ allocation: updatedAlloc, updatedAt: new Date() })
              .where(eq(studentClassAllocations.studentId, id));
          } else {
            const newAlloc = {
              oneToOne: { teacherId: null, designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0, completed30: 0, completed45: 0, completed60: 0, remaining30: 0, remaining45: 0, remaining60: 0 },
              group: {
                teacherId: selectedBatch.teacherId || null,
                batchId: batchId,
                designatedTime: "",
                sessions30: 0,
                sessions45: 0,
                sessions60: 0,
                completed30: 0,
                completed45: 0,
                completed60: 0,
                remaining30: 0,
                remaining45: 0,
                remaining60: 0,
              },
            };
            await tx.insert(studentClassAllocations).values({
              studentId: id,
              allocation: newAlloc,
            });
          }

          // Recalculate session balances
          await updateStudentSessionBalances(tx, id);

          // Audit batch changes
          if (selectedCourse && existingProfile && existingProfile.course !== selectedCourse.name) {
            await tx.insert(studentCourseAuditLogs).values({
              studentId: id,
              changedBy: ctx.user.id,
              changeType: "course_changed",
              oldValue: `Course: ${existingProfile.course || "None"}`,
              newValue: `Course: ${selectedCourse.name}`,
            });
          }

          await tx.insert(studentCourseAuditLogs).values({
            studentId: id,
            changedBy: ctx.user.id,
            changeType: "batch_changed",
            oldValue: `Batch: ${oldBatchName}`,
            newValue: `Batch: ${selectedBatch.name}`,
          });

          // Course fee adjustments
          let diff = 0;
          if (activeEnrollment && oldBatchId) {
            const oldBatch = await tx.query.batches.findFirst({
              where: eq(batches.id, oldBatchId),
            });
            const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
            const newFee = parseFloat(selectedBatch.courseFee ?? "0");
            diff = newFee - oldFee;
          } else {
            diff = parseFloat(selectedBatch.courseFee ?? "0");
          }

          const currentTotal = feesTotal !== undefined ? feesTotal : parseFloat(profileUpdate.feesTotal || existingProfile?.feesTotal || "0");
          const currentPaid = parseFloat(existingProfile?.feesPaid ?? "0");
          const nextTotal = Math.max(0, currentTotal + diff);
          const nextBalance = Math.max(0, nextTotal - currentPaid);
          const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

          profileUpdate.feesTotal = String(nextTotal);
          profileUpdate.feesBalance = String(nextBalance);
          profileUpdate.paymentStatus = nextPaymentStatus;
        } else if (feesTotal !== undefined) {
          profileUpdate.feesTotal = String(feesTotal);
          if (existingProfile) {
            const feesPaid = parseFloat(existingProfile.feesPaid ?? "0");
            profileUpdate.feesBalance = String(feesTotal - feesPaid);
          }
        }

        if (profileUpdate.feesTotal !== undefined) {
          profileUpdate.totalCourseFee = profileUpdate.feesTotal;
        }
        if (profileUpdate.feesBalance !== undefined) {
          profileUpdate.remainingBalance = profileUpdate.feesBalance;
        }
        if (input.paymentType !== undefined) {
          profileUpdate.paymentOption = input.paymentType === "INSTALLMENT" ? "installment" : "full_payment";
        }

        // Audit student profile details changes
        if (address !== undefined && address !== currentStudent.address) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId: id,
            changedBy: ctx.user.id,
            changeType: "address_changed",
            oldValue: currentStudent.address || "None",
            newValue: address || "None",
          });
        }
        if (postalCode !== undefined && postalCode?.trim() !== currentStudent.postalCode) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId: id,
            changedBy: ctx.user.id,
            changeType: "postal_code_changed",
            oldValue: currentStudent.postalCode || "None",
            newValue: postalCode ? postalCode.trim() : "None",
          });
        }
        if (qualificationId !== undefined && qualificationId !== currentStudent.qualificationId) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId: id,
            changedBy: ctx.user.id,
            changeType: "qualification_changed",
            oldValue: String(currentStudent.qualificationId || "None"),
            newValue: String(qualificationId || "None"),
          });
        }

        // Apply profile table updates
        if (existingProfile) {
          if (Object.keys(profileUpdate).length > 0) {
            await tx.update(profiles).set(profileUpdate).where(eq(profiles.userId, id));
          }
        } else {
          await tx.insert(profiles).values({
            userId: id,
            course: profileUpdate.course || "",
            batch: profileUpdate.batch || "",
            feesTotal: profileUpdate.feesTotal || "0",
            feesBalance: profileUpdate.feesBalance || "0",
            totalCourseFee: profileUpdate.feesTotal || "0",
            remainingBalance: profileUpdate.feesBalance || "0",
            paymentOption: input.paymentType === "INSTALLMENT" ? "installment" : "full_payment",
            ...profileUpdate,
          });
        }

        // Community enrollment on course completion
        if (completionDate) {
          const communityBatch = await tx.query.batches.findFirst({
            where: eq(batches.isCommunityGroup, true),
          });
          if (communityBatch) {
            const existingEnrollment = await tx.query.batchEnrollments.findFirst({
              where: and(
                eq(batchEnrollments.batchId, communityBatch.id),
                eq(batchEnrollments.studentId, id)
              ),
            });
            if (!existingEnrollment) {
              await tx.insert(batchEnrollments).values({
                batchId: communityBatch.id,
                studentId: id,
                status: "active",
              });
              await sendNotification(
                id,
                "Welcome to the Community Group",
                `Congratulations on completing your course! You have been enrolled in the community group: ${communityBatch.name}.`,
                "community_group_welcome"
              );
            }
          }
        }
      });

      await recalculateStudentFees(id);

      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const student = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });

      if (!student || student.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student record not found" });
      }

      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  import: adminQuery
    .input(
      z.object({
        fileData: z.string(), // base64 encoded data
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      function validateTimeSlot(timeSlotStr: string): string | null {
        if (!timeSlotStr || timeSlotStr.trim() === "") {
          return "Preferred Time is required.";
        }
        if (timeSlotStr.length > 100) {
          return "Preferred Time cannot exceed 100 characters.";
        }
        if (/[<>{}]/.test(timeSlotStr)) {
          return "Preferred Time contains invalid characters.";
        }
        return null;
      }

      function mapSessionType(typeStr: string): "group" | "one_on_one" | "both" {
        const clean = typeStr.trim().toLowerCase();
        if (clean === "group") return "group";
        if (clean === "1 on 1" || clean === "1-on-1" || clean === "one_on_one" || clean === "one-on-one") return "one_on_one";
        if (clean === "both") return "both";
        return "group";
      }

      function mapPaymentOption(optStr: string): "FULL_PAYMENT" | "INSTALLMENT" {
        const clean = optStr.trim().toLowerCase();
        if (clean === "installment" || clean === "installments") return "INSTALLMENT";
        return "FULL_PAYMENT";
      }

      let workbook;
      try {
        workbook = XLSX.read(input.fileData, { type: "base64" });
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to parse spreadsheet file: " + (err.message || String(err)),
        });
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

      if (jsonData.length <= 1) {
        return {
          imported: 0,
          totalRows: 0,
          successfulImports: 0,
          failedRows: 0,
          errors: [{ row: 1, errors: ["The file is empty or only contains headers."] }],
        };
      }

      // Header mapping
      const rawHeaders = jsonData[0] || [];
      const headers = rawHeaders.map((h: any) => String(h).trim().toLowerCase().replace(/\s*\(optional\)$/, ""));

      const fullNameIndex = headers.indexOf("full name");
      const phoneIndex = headers.indexOf("phone number");
      const usernameIndex = headers.indexOf("username");
      const passwordIndex = headers.indexOf("password");
      const enrollmentIdIndex = headers.indexOf("student enrollment id");
      const moduleIndex = headers.indexOf("module");
      const preferredTimeIndex = headers.indexOf("preferred time");
      const typeIndex = headers.indexOf("type");

      const emailIndex = headers.indexOf("email");
      const genderIndex = headers.indexOf("gender");
      const dobIndex = headers.indexOf("dob");
      const addressIndex = headers.indexOf("address");
      const postalCodeIndex = headers.indexOf("postal code");
      const qualificationIndex = headers.indexOf("education qualification");
      const parentNameIndex = headers.indexOf("parent name");
      const parentPhoneIndex = headers.indexOf("parent phone number");
      const feesTotalIndex = headers.indexOf("total course fee");
      const paymentOptionIndex = headers.indexOf("payment option");

      const totalClassAssignedIndex = headers.indexOf("total class assigned");
      const classesCompletedIndex = headers.indexOf("classes completed");
      const assignedTeacherIndex = headers.indexOf("assigned teacher");
      const dateOfJoiningIndex = headers.indexOf("date of joining");

      // Check if all mandatory header columns are present
      const missingHeaders = [];
      if (fullNameIndex === -1) missingHeaders.push("Full Name");
      if (phoneIndex === -1) missingHeaders.push("Phone Number");
      if (moduleIndex === -1) missingHeaders.push("Module");

      if (missingHeaders.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required columns in template: ${missingHeaders.join(", ")}`,
        });
      }

      const getVal = (row: any[], index: number): string => {
        if (index === -1 || row[index] === undefined || row[index] === null) return "";
        return String(row[index]).trim();
      };

      // Fetch all active teachers for lookups
      const allTeachers = await db.query.users.findMany({
        where: eq(users.role, "teacher"),
      });
      const teacherMap = new Map<string, number>();
      allTeachers.forEach(t => {
        if (t.username) teacherMap.set(t.username.toLowerCase(), t.id);
        teacherMap.set(t.name.toLowerCase(), t.id);
      });

      // 1. Collect candidates for validation
      const candidates = [];
      const sheetUsernames = new Set<string>();
      const sheetPhones = new Set<string>();
      const sheetEnrollmentIds = new Set<string>();
      const sheetEmails = new Set<string>();

      for (let r = 1; r < jsonData.length; r++) {
        const row = jsonData[r];
        if (!row || row.length === 0) continue;

        const name = getVal(row, fullNameIndex);
        const phone = getVal(row, phoneIndex);
        let username = getVal(row, usernameIndex);
        const enrollmentId = getVal(row, enrollmentIdIndex);
        const email = getVal(row, emailIndex);

        const parsedPhoneGen = parseFullPhone(phone);
        if (parsedPhoneGen && !username) {
          username = `${parsedPhoneGen.countryCode}${parsedPhoneGen.phoneNumber}`.replace(/\s+/g, "");
        }

        // Skip purely empty rows
        if (!name && !phone && !username) continue;

        candidates.push({
          rowNumber: r + 1,
          name,
          phone,
          username,
          enrollmentId,
          email,
          row,
        });

        if (username) sheetUsernames.add(username.toLowerCase());
        if (enrollmentId) sheetEnrollmentIds.add(enrollmentId.toLowerCase());
        if (email) sheetEmails.add(email.toLowerCase());

        const parsed = parseFullPhone(phone);
        if (parsed) {
          const fullIntNum = `${parsed.countryCode}${parsed.phoneNumber}`.replace(/\s+/g, "");
          sheetPhones.add(fullIntNum);
        }
      }

      // 2. Batch query database for duplicate checks
      const dbUsernames = new Map<string, number>();
      const dbPhones = new Map<string, number>();
      const dbEmails = new Map<string, number>();
      const dbStudentIds = new Map<string, number>();
      const dbEnrollmentIds = new Map<string, number>();

      if (sheetUsernames.size > 0) {
        const usersWithUsernames = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, Array.from(sheetUsernames)));
        usersWithUsernames.forEach((u) => u.username && dbUsernames.set(u.username.toLowerCase(), u.id));
      }

      if (sheetPhones.size > 0) {
        const usersWithPhones = await db
          .select({ id: users.id, fullInternationalNumber: users.fullInternationalNumber })
          .from(users)
          .where(inArray(users.fullInternationalNumber, Array.from(sheetPhones)));
        usersWithPhones.forEach((u) => u.fullInternationalNumber && dbPhones.set(u.fullInternationalNumber, u.id));
      }

      if (sheetEmails.size > 0) {
        const usersWithEmails = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.email, Array.from(sheetEmails)));
        usersWithEmails.forEach((u) => u.email && dbEmails.set(u.email.toLowerCase(), u.id));
      }

      if (sheetEnrollmentIds.size > 0) {
        const profilesWithEnrollments = await db
          .select({ userId: profiles.userId, enrollmentId: profiles.enrollmentId })
          .from(profiles)
          .where(inArray(profiles.enrollmentId, Array.from(sheetEnrollmentIds)));
        profilesWithEnrollments.forEach((p) => p.enrollmentId && p.userId && dbEnrollmentIds.set(p.enrollmentId.toLowerCase(), p.userId));

        const usersWithUnionIds = await db
          .select({ id: users.id, unionId: users.unionId })
          .from(users)
          .where(and(eq(users.role, "student"), inArray(users.unionId, Array.from(sheetEnrollmentIds))));
        usersWithUnionIds.forEach((u) => u.unionId && dbStudentIds.set(u.unionId.toLowerCase(), u.id));
      }

      // 3. Fetch active modules, active qualifications, and active batches
      const activeModules = await db.select().from(modules).where(eq(modules.status, "active"));
      const activeQualifications = await db.select().from(qualifications).where(eq(qualifications.isActive, true));
      const activeBatches = await db.select().from(batches).where(eq(batches.status, "active"));

      const modulesMap = new Map<string, any>();
      activeModules.forEach((m) => {
        modulesMap.set(String(m.id), m);
        modulesMap.set(m.name.toLowerCase().trim(), m);
      });

      const qualificationsMap = new Map<string, any>();
      activeQualifications.forEach((q) => {
        qualificationsMap.set(String(q.id), q);
        qualificationsMap.set(q.name.toLowerCase().trim(), q);
      });

      const batchesByModule = new Map<number, any[]>();
      activeBatches.forEach((b) => {
        const mId = Number(b.moduleId);
        if (!batchesByModule.has(mId)) {
          batchesByModule.set(mId, []);
        }
        batchesByModule.get(mId)!.push(b);
      });

      // allowedTimeSlots checks removed per user requirements

      // Track duplicates inside the file
      const seenUsernames = new Set<string>();
      const seenPhones = new Set<string>();
      const seenEnrollmentIds = new Set<string>();
      const seenEmails = new Set<string>();

      const errorsList: { row: number; name?: string; errors: string[] }[] = [];
      const successfulRows: any[] = [];

      // 4. In-Memory Validation & Duplicate Detection
      for (const cand of candidates) {
        const { rowNumber, name, phone, username, enrollmentId, email, row } = cand;
        const rowErrors: string[] = [];
        let existingUserId: number | undefined = undefined;

        // Check mandatory fields
        if (!name) rowErrors.push("Full Name is required.");
        if (!phone) rowErrors.push("Phone Number is required.");
        if (!username) rowErrors.push("Username is required.");
        let password = getVal(row, passwordIndex);
        if (!password) password = "student123";
        else if (password.length < 6) rowErrors.push("Password must be at least 6 characters long.");

        const moduleNameOrId = getVal(row, moduleIndex);
        if (!moduleNameOrId) rowErrors.push("Module is required.");

        let preferredTime = getVal(row, preferredTimeIndex);
        if (!preferredTime) preferredTime = "To Be Decided";

        let typeStr = getVal(row, typeIndex);
        if (!typeStr) typeStr = "Group";

        // Skip duplicate check if mandatory fields are missing
        if (rowErrors.length > 0) {
          errorsList.push({ row: rowNumber, name: name || undefined, errors: rowErrors });
          continue;
        }

        // Preferred time slot check
        const timeError = validateTimeSlot(preferredTime);
        if (timeError) rowErrors.push(timeError);

        // Type value check
        const typeClean = typeStr.trim().toLowerCase();
        if (typeClean !== "group" && typeClean !== "1 on 1" && typeClean !== "1-on-1" && typeClean !== "both") {
          rowErrors.push("Invalid Type. Must be 'Group', '1 on 1', or 'Both'.");
        }

        // Username duplicate checks
        const userLower = username.toLowerCase();
        if (seenUsernames.has(userLower)) {
          rowErrors.push(`Duplicate username '${username}' inside the uploaded file.`);
        } else if (dbUsernames.has(userLower)) {
          existingUserId = existingUserId || dbUsernames.get(userLower);
        }
        seenUsernames.add(userLower);

        // Phone duplicate checks
        const parsedPhone = parseFullPhone(phone);
        if (!parsedPhone) {
          rowErrors.push("Invalid phone number format.");
        } else {
          const phValError = validatePhoneNumber(parsedPhone.countryCode, parsedPhone.phoneNumber, parsedPhone.countryISO);
          if (phValError) {
            rowErrors.push(phValError);
          } else {
            const phoneFullInt = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
            if (seenPhones.has(phoneFullInt)) {
              rowErrors.push(`Duplicate phone number '${phone}' inside the uploaded file.`);
            } else if (dbPhones.has(phoneFullInt)) {
              existingUserId = existingUserId || dbPhones.get(phoneFullInt);
            }
            seenPhones.add(phoneFullInt);
          }
        }

        // Enrollment ID duplicate checks
        if (enrollmentId) {
          const enrollLower = enrollmentId.toLowerCase();
          if (seenEnrollmentIds.has(enrollLower)) {
            rowErrors.push(`Duplicate Enrollment ID '${enrollmentId}' inside the uploaded file.`);
          } else if (dbEnrollmentIds.has(enrollLower) || dbStudentIds.has(enrollLower)) {
            existingUserId = existingUserId || dbEnrollmentIds.get(enrollLower) || dbStudentIds.get(enrollLower);
          }
          seenEnrollmentIds.add(enrollLower);
        }

        // Email duplicate checks
        if (email) {
          const emailLower = email.toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            rowErrors.push("Invalid email format.");
          } else {
            if (seenEmails.has(emailLower)) {
              rowErrors.push(`Duplicate email '${email}' inside the uploaded file.`);
            } else if (dbEmails.has(emailLower)) {
              existingUserId = existingUserId || dbEmails.get(emailLower);
            }
            seenEmails.add(emailLower);
          }
        }

        // Module check
        const courseRecord = modulesMap.get(moduleNameOrId.toLowerCase().trim());
        if (!courseRecord) {
          rowErrors.push(`Module '${moduleNameOrId}' does not exist or is inactive.`);
        }

        // Optional Qualification check
        const qualificationNameOrId = getVal(row, qualificationIndex);
        let qualRecord = null;
        if (qualificationNameOrId) {
          qualRecord = qualificationsMap.get(qualificationNameOrId.toLowerCase().trim());
          if (!qualRecord) {
            rowErrors.push(`Qualification '${qualificationNameOrId}' does not exist.`);
          }
        }

        // Optional Gender check
        const gender = getVal(row, genderIndex);
        if (gender) {
          const gClean = gender.trim().toLowerCase();
          if (gClean !== "male" && gClean !== "female" && gClean !== "other") {
            rowErrors.push("Gender must be 'Male', 'Female', or 'Other'.");
          }
        }

        // Optional Payment Option check
        const paymentOptStr = getVal(row, paymentOptionIndex);
        if (paymentOptStr) {
          const pClean = paymentOptStr.trim().toLowerCase();
          if (pClean !== "full payment" && pClean !== "installment") {
            rowErrors.push("Payment Option must be 'Full Payment' or 'Installment'.");
          }
        }

        // Optional course fee check
        const feesTotalStr = getVal(row, feesTotalIndex);
        if (feesTotalStr && isNaN(parseFloat(feesTotalStr))) {
          rowErrors.push("Total Course Fee must be a valid number.");
        }

        // Optional Assigned Teacher check
        const assignedTeacher = getVal(row, assignedTeacherIndex);
        if (assignedTeacher) {
          const tId = teacherMap.get(assignedTeacher.toLowerCase().trim());
          if (!tId) {
            rowErrors.push(`Assigned Teacher '${assignedTeacher}' not found.`);
          }
        }

        // Optional Date of Joining check
        const dateOfJoiningStr = getVal(row, dateOfJoiningIndex);
        if (dateOfJoiningStr) {
          const parsed = parseSafeDate(dateOfJoiningStr);
          if (!parsed || isNaN(parsed.getTime())) {
            rowErrors.push(`Date of Joining '${dateOfJoiningStr}' is not a valid date.`);
          }
        }

        // Optional Class Counts check
        const totalClassAssignedStr = getVal(row, totalClassAssignedIndex);
        if (totalClassAssignedStr && isNaN(parseInt(totalClassAssignedStr, 10))) {
          rowErrors.push(`Total Class Assigned must be a valid number.`);
        }

        const classesCompletedStr = getVal(row, classesCompletedIndex);
        if (classesCompletedStr && isNaN(parseInt(classesCompletedStr, 10))) {
          rowErrors.push(`Classes Completed must be a valid number.`);
        }

        if (rowErrors.length > 0) {
          errorsList.push({ row: rowNumber, name, errors: rowErrors });
        } else {
          successfulRows.push({
            rowNumber,
            name,
            phone,
            parsedPhone,
            username,
            password,
            enrollmentId,
            courseRecord,
            preferredTime,
            typeStr,
            email: email || null,
            gender: gender || null,
            dobStr: getVal(row, dobIndex) || null,
            address: getVal(row, addressIndex) || null,
            postalCode: getVal(row, postalCodeIndex) || null,
            qualRecord,
            parentName: getVal(row, parentNameIndex) || null,
            parentPhone: getVal(row, parentPhoneIndex) || null,
            feesTotalStr,
            paymentOptStr,
            totalClassAssigned: totalClassAssignedStr,
            classesCompleted: classesCompletedStr,
            assignedTeacher,
            dateOfJoining: dateOfJoiningStr || null,
            existingUserId,
          });
        }
      }

      // 5. Database Transactions per student row
      let importedCount = 0;

      for (const data of successfulRows) {
        const {
          rowNumber,
          name,
          parsedPhone,
          username,
          password,
          enrollmentId,
          courseRecord,
          preferredTime,
          typeStr,
          email,
          gender,
          dobStr,
          address,
          postalCode,
          qualRecord,
          parentName,
          parentPhone,
          feesTotalStr,
          paymentOptStr,
          totalClassAssigned,
          classesCompleted,
          assignedTeacher,
          dateOfJoining,
        } = data;

        // Do NOT assign to batch during bulk import based on Preferred Time
        const matchedBatchId: number | null = null;

        // Prepare fees and installments
        const feesTotal = feesTotalStr ? parseFloat(feesTotalStr) : null;
        const paymentType = paymentOptStr ? mapPaymentOption(paymentOptStr) : undefined;

        // Prepare bulk allocation overrides
        const bulkTotalClassAssigned = totalClassAssigned ? parseInt(totalClassAssigned, 10) : undefined;
        const bulkClassesCompleted = classesCompleted ? parseInt(classesCompleted, 10) : undefined;
        let bulkAssignedTeacherId: number | undefined = undefined;
        if (assignedTeacher) {
          const tId = teacherMap.get(assignedTeacher.toLowerCase().trim());
          if (tId) bulkAssignedTeacherId = tId;
        }

        let existingUserId = data.existingUserId;
        let txCompleted = false;
        let userId = 0;
        let unionId = "";

        try {
          const result = await db.transaction(async (tx) => {
            if (existingUserId) {
              // UPSERT logic
              // Update preferredClassTime in profiles
              if (preferredTime) {
                await tx.update(profiles)
                  .set({ preferredClassTime: preferredTime })
                  .where(eq(profiles.userId, existingUserId));
              }

              // Update dateOfJoining in users
              if (dateOfJoining) {
                const parsedDate = parseSafeDate(dateOfJoining);
                if (parsedDate) {
                  await tx.update(users)
                    .set({ createdAt: parsedDate })
                    .where(eq(users.id, existingUserId));
                }
              }

              // Update studentClassAllocations
              if (bulkAssignedTeacherId || preferredTime) {
                const existingAlloc = await tx.select().from(studentClassAllocations).where(eq(studentClassAllocations.studentId, existingUserId)).limit(1);
                
                const sessionTypeVal = mapSessionType(typeStr);
                const isOneToOne = sessionTypeVal === "one_on_one" || sessionTypeVal === "both";
                const isGroup = sessionTypeVal === "group" || sessionTypeVal === "both";

                if (existingAlloc.length > 0) {
                  const alloc: any = existingAlloc[0].allocation || { oneToOne: {}, group: {} };
                  if (!alloc.oneToOne) alloc.oneToOne = {};
                  if (!alloc.group) alloc.group = {};

                  if (bulkAssignedTeacherId) {
                    if (isOneToOne) alloc.oneToOne.teacherId = bulkAssignedTeacherId;
                    if (isGroup) alloc.group.teacherId = bulkAssignedTeacherId;
                  }
                  if (preferredTime) {
                    if (isOneToOne && alloc.oneToOne.teacherId) alloc.oneToOne.designatedTime = preferredTime;
                    if (isGroup && alloc.group.teacherId) alloc.group.designatedTime = preferredTime;
                  }
                  if (bulkTotalClassAssigned !== undefined) {
                    if (isOneToOne) {
                      alloc.oneToOne.sessions30 = bulkTotalClassAssigned;
                      alloc.oneToOne.remaining30 = Math.max(0, bulkTotalClassAssigned - (alloc.oneToOne.completed30 || 0));
                    }
                    if (isGroup) {
                      alloc.group.sessions30 = bulkTotalClassAssigned;
                      alloc.group.remaining30 = Math.max(0, bulkTotalClassAssigned - (alloc.group.completed30 || 0));
                    }
                  }
                  if (bulkClassesCompleted !== undefined) {
                    if (isOneToOne) {
                      alloc.oneToOne.completed30 = bulkClassesCompleted;
                      alloc.oneToOne.remaining30 = Math.max(0, (alloc.oneToOne.sessions30 || 0) - bulkClassesCompleted);
                    }
                    if (isGroup) {
                      alloc.group.completed30 = bulkClassesCompleted;
                      alloc.group.remaining30 = Math.max(0, (alloc.group.sessions30 || 0) - bulkClassesCompleted);
                    }
                  }

                  await tx.update(studentClassAllocations)
                    .set({ allocation: alloc, updatedAt: new Date() })
                    .where(eq(studentClassAllocations.studentId, existingUserId));
                }
              }

              const existingUserRecord = await tx.select({ unionId: users.unionId }).from(users).where(eq(users.id, existingUserId)).limit(1);

              return {
                id: existingUserId,
                unionId: existingUserRecord[0]?.unionId || `S${existingUserId}`,
              };
            } else {
              // Create new student
              return await StudentAdmissionService.admitStudent(tx, {
                name,
                countryCode: parsedPhone.countryCode,
                countryISO: parsedPhone.countryISO,
                phoneNumber: parsedPhone.phoneNumber,
                email,
                username,
                password,
                enrollmentId,
                courseId: courseRecord.id,
                batchId: matchedBatchId,
                preferredClassTime: preferredTime,
                sessionType: mapSessionType(typeStr),
                feesTotal,
                paymentType,
                gender,
                dob: dobStr || undefined,
                address,
                postalCode,
                qualificationId: qualRecord?.id || null,
                educationalQualification: qualRecord?.name || null,
                parentName,
                parentPhone,
                registrationSource: "direct",
                isBulkImport: true,
                bulkTotalClassAssigned: isNaN(bulkTotalClassAssigned as any) ? undefined : bulkTotalClassAssigned,
                bulkClassesCompleted: isNaN(bulkClassesCompleted as any) ? undefined : bulkClassesCompleted,
                bulkAssignedTeacherId,
                dateOfJoining,
              });
            }
          });
          userId = result.id;
          unionId = result.unionId;
          txCompleted = true;
        } catch (txErr: any) {
          errorsList.push({
            row: rowNumber,
            name,
            errors: [`Database transaction failed: ${txErr.message || String(txErr)}`],
          });
        }

        if (txCompleted) {
          importedCount++;

          // 6. Post-Commit credentials email
          if (email && !existingUserId) {
            try {
              const origin = ctx.req.get("origin") || "https://your-lms-domain.com";
              const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : `${origin}/login`;
              const emailResult = await sendUserCredentialsEmail({
                email,
                name,
                username,
                password,
                loginUrl,
              });
              if (!emailResult.success) {
                errorsList.push({
                  row: rowNumber,
                  name,
                  errors: [`Welcome email delivery failed: ${emailResult.error || "Unknown SMTP error"}`],
                });
              }
            } catch (mailErr: any) {
              console.error(`[importEmail] Welcome email failed for row ${rowNumber}:`, mailErr);
              errorsList.push({
                row: rowNumber,
                name,
                errors: [`Welcome email failed: ${mailErr.message || String(mailErr)}`],
              });
            }
          }
        }
      }

      // Sort errors by row number
      errorsList.sort((a, b) => a.row - b.row);

      return {
        imported: importedCount, // backward compatibility
        totalRows: candidates.length,
        successfulImports: importedCount,
        failedRows: candidates.length - importedCount,
        errors: errorsList,
      };
    }),

  addDocument: adminQuery
    .input(z.object({
      studentId: z.number(),
      name: z.string(),
      url: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      const currentDocs = Array.isArray(profile.documents) ? profile.documents as any[] : [];
      const newDoc = {
        id: Math.random().toString(36).substring(2, 9),
        name: input.name,
        url: input.url,
        uploadedAt: new Date().toISOString(),
      };
      currentDocs.push(newDoc);
      await db.update(profiles)
        .set({ documents: currentDocs })
        .where(eq(profiles.userId, input.studentId));
      return { success: true, document: newDoc };
    }),

  deleteDocument: adminQuery
    .input(z.object({
      studentId: z.number(),
      documentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      const currentDocs = Array.isArray(profile.documents) ? profile.documents as any[] : [];
      const filteredDocs = currentDocs.filter((d: any) => d.id !== input.documentId);
      await db.update(profiles)
        .set({ documents: filteredDocs })
        .where(eq(profiles.userId, input.studentId));
      return { success: true };
    }),

  getTeachersAvailability: adminQuery
    .query(async () => {
      const db = getDb();
      const teachersList = await db.query.users.findMany({
        where: and(
          eq(users.role, "teacher"),
          eq(users.status, "active")
        ),
      });

      const teachersWithWorkload = await Promise.all(teachersList.map(async (t) => {
        const activeEnrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.status, "active"),
          with: {
            batch: true
          }
        });

        const teacherActiveStudents = activeEnrollments.filter((e: any) => {
          if (e.batch?.teacherId === t.id) return true;
          if (e.assignedTeachers && Array.isArray(e.assignedTeachers)) {
            const list = e.assignedTeachers as number[];
            return list.includes(t.id);
          }
          return false;
        });

        const activeStudentsCount = teacherActiveStudents.length;

        const scheduledGroupClasses = await db.select({ count: sql<number>`count(*)` })
          .from(classes)
          .where(and(
            eq(classes.teacherId, t.id),
            eq(classes.status, "scheduled")
          ));
        const groupCount = Number(scheduledGroupClasses[0]?.count || 0);

        const scheduledO2OClasses = await db.select({ count: sql<number>`count(*)` })
          .from(oneToOneSessions)
          .where(and(
            eq(oneToOneSessions.teacherId, t.id),
            eq(oneToOneSessions.status, "scheduled")
          ));
        const o2oCount = Number(scheduledO2OClasses[0]?.count || 0);

        const assignedSessionsCount = groupCount + o2oCount;

        const availabilityStatus = "Available";

        return {
          id: t.id,
          name: t.name,
          activeStudentsCount,
          assignedSessionsCount,
          availabilityStatus,
          status: t.status,
        };
      }));

      return teachersWithWorkload;
    }),

  updateStudentPackage: adminQuery
    .input(z.object({
      studentId: z.number(),
      packageConfig: z.object({
        oneToOne: z.object({
          total: z.number().nonnegative(),
          min30: z.number().nonnegative(),
          min45: z.number().nonnegative(),
          min60: z.number().nonnegative(),
        }),
        group: z.object({
          total: z.number().nonnegative(),
          min30: z.number().nonnegative(),
          min45: z.number().nonnegative(),
          min60: z.number().nonnegative(),
        })
      })
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, packageConfig } = input;

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found." });
      }

      const o2oSum = packageConfig.oneToOne.min30 + packageConfig.oneToOne.min45 + packageConfig.oneToOne.min60;
      const groupSum = packageConfig.group.min30 + packageConfig.group.min45 + packageConfig.group.min60;

      if (o2oSum !== packageConfig.oneToOne.total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `One-to-One session duration sum (${o2oSum}) does not match One-to-One total (${packageConfig.oneToOne.total}).`,
        });
      }

      if (groupSum !== packageConfig.group.total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Group session duration sum (${groupSum}) does not match Group total (${packageConfig.group.total}).`,
        });
      }

      const totalAllocated = packageConfig.oneToOne.total + packageConfig.group.total;

      const oldOneToOne = profile.allocatedOneToOneSessions ?? 0;
      const oldGroup = profile.allocatedGroupSessions ?? 0;
      const oldTotal = profile.totalAllocatedSessions ?? 0;
      const oldConfig = profile.packageConfig as any;

      await db.transaction(async (tx) => {
        await tx.update(profiles)
          .set({
            allocatedOneToOneSessions: packageConfig.oneToOne.total,
            allocatedGroupSessions: packageConfig.group.total,
            totalAllocatedSessions: totalAllocated,
            packageConfig,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, studentId));

        await updateStudentSessionBalances(tx, studentId);

        if (oldOneToOne !== packageConfig.oneToOne.total || oldGroup !== packageConfig.group.total) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "class_count_updated",
            oldValue: `One-to-One: ${oldOneToOne}, Group: ${oldGroup} (Total: ${oldTotal})`,
            newValue: `One-to-One: ${packageConfig.oneToOne.total}, Group: ${packageConfig.group.total} (Total: ${totalAllocated})`,
          });
        }

        const oldO2OStr = oldConfig?.oneToOne
          ? `O2O [30m: ${oldConfig.oneToOne.min30 || 0}, 45m: ${oldConfig.oneToOne.min45 || 0}, 60m: ${oldConfig.oneToOne.min60 || 0}]`
          : `O2O [Unconfigured]`;
        const oldGStr = oldConfig?.group
          ? `Group [30m: ${oldConfig.group.min30 || 0}, 45m: ${oldConfig.group.min45 || 0}, 60m: ${oldConfig.group.min60 || 0}]`
          : `Group [Unconfigured]`;

        const newO2OStr = `O2O [30m: ${packageConfig.oneToOne.min30}, 45m: ${packageConfig.oneToOne.min45}, 60m: ${packageConfig.oneToOne.min60}]`;
        const newGStr = `Group [30m: ${packageConfig.group.min30}, 45m: ${packageConfig.group.min45}, 60m: ${packageConfig.group.min60}]`;

        if (oldO2OStr !== newO2OStr || oldGStr !== newGStr) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "session_distribution_updated",
            oldValue: `${oldO2OStr}, ${oldGStr}`,
            newValue: `${newO2OStr}, ${newGStr}`,
          });
        }
      });

      return { success: true };
    }),

  updateTeacherAssignment: adminQuery
    .input(z.object({
      studentId: z.number(),
      enrollmentId: z.number(),
      teacherIds: z.array(z.number()).max(1, "Only one active teacher per student is allowed"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, enrollmentId, teacherIds } = input;

      const enrollment = await db.query.batchEnrollments.findFirst({
        where: eq(batchEnrollments.id, enrollmentId),
      });

      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found." });
      }

      const teachersList = await db.select({
        id: users.id,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(and(
        inArray(users.id, teacherIds),
        eq(users.role, "teacher")
      ));

      if (teachersList.length !== teacherIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more selected teachers are invalid or do not exist.",
        });
      }

      const inactiveTeachers = teachersList.filter((t) => t.status !== "active");
      if (inactiveTeachers.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot assign inactive teacher(s): ${inactiveTeachers.map((t) => t.name).join(", ")}.`,
        });
      }

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId)
      });

      const oldTeacherIds = enrollment.assignedTeachers && Array.isArray(enrollment.assignedTeachers)
        ? enrollment.assignedTeachers as number[]
        : [];

      let oldTeacherNames = "None";
      if (oldTeacherIds.length > 0) {
        const oldTeachers = await db.select({ name: users.name })
          .from(users)
          .where(inArray(users.id, oldTeacherIds));
        oldTeacherNames = oldTeachers.map((t) => t.name).join(", ");
      }

      const newTeacherNames = teachersList.length > 0
        ? teachersList.map((t) => t.name).join(", ")
        : "None";

      await db.transaction(async (tx) => {
        await tx.update(batchEnrollments)
          .set({
            assignedTeachers: teacherIds,
          })
          .where(eq(batchEnrollments.id, enrollmentId));

        // Sync with studentClassAllocations to prevent UI state desync
        const classAlloc = await tx.query.studentClassAllocations.findFirst({
          where: eq(studentClassAllocations.studentId, studentId)
        });
        if (classAlloc) {
          const newAllocJson = classAlloc.allocation as any;
          if (newAllocJson && newAllocJson.oneToOne) {
            newAllocJson.oneToOne.teacherId = teacherIds[0] || null;
          }
          if (newAllocJson && newAllocJson.group) {
            newAllocJson.group.teacherId = teacherIds[1] || teacherIds[0] || null;
          }
          await tx.update(studentClassAllocations)
            .set({ allocation: newAllocJson, updatedAt: new Date() })
            .where(eq(studentClassAllocations.studentId, studentId));
        } else {
          // If no allocation exists, create one with the new teacher
          const pkg = (profile?.packageConfig as any) || {};
          const newAllocJson = {
            oneToOne: {
              teacherId: teacherIds[0] || null,
              designatedTime: "",
              sessions30: pkg.oneToOne?.min30 || profile?.allocatedOneToOneSessions || 0,
              sessions45: pkg.oneToOne?.min45 || 0,
              sessions60: pkg.oneToOne?.min60 || 0,
              completed30: 0,
              completed45: 0,
              completed60: 0,
            },
            group: {
              teacherId: teacherIds[1] || teacherIds[0] || null,
              batchId: null,
              designatedTime: "",
              sessions30: pkg.group?.min30 || profile?.allocatedGroupSessions || 0,
              sessions45: pkg.group?.min45 || 0,
              sessions60: pkg.group?.min60 || 0,
              completed30: 0,
              completed45: 0,
              completed60: 0,
            }
          };
          await tx.insert(studentClassAllocations).values({
            studentId,
            allocation: newAllocJson
          });
        }

        // Update upcoming one-to-one sessions to the new teacher
        if (teacherIds[0]) {
          await tx.update(oneToOneSessions)
            .set({ teacherId: teacherIds[0] })
            .where(
              and(
                eq(oneToOneSessions.studentId, studentId),
                inArray(oneToOneSessions.status, ["scheduled", "rescheduled"])
              )
            );
        }

        await tx.insert(studentCourseAuditLogs).values({
          studentId,
          changedBy: ctx.user.id,
          changeType: "teacher_changed",
          oldValue: `Assigned: ${oldTeacherNames}`,
          newValue: `Assigned: ${newTeacherNames}`,
        });
      });

      return { success: true };
    }),

  changeBatch: adminQuery
    .input(z.object({
      studentId: z.number(),
      newBatchId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const studentId = input.studentId;
      const toBatchId = input.newBatchId;

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        ),
      });

      const newBatch = await db.query.batches.findFirst({
        where: eq(batches.id, toBatchId),
        with: { module: true },
      });

      if (!newBatch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "New batch not found" });
      }

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      }

      let oldBatchName = "-";
      let oldBatchId: number | null = null;
      if (activeEnrollment) {
        oldBatchId = activeEnrollment.batchId;
        const oldBatch = await db.query.batches.findFirst({
          where: eq(batches.id, oldBatchId),
        });
        oldBatchName = oldBatch ? oldBatch.name : "-";
      }

      await db.transaction(async (tx) => {
        if (activeEnrollment) {
          await tx.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(eq(batchEnrollments.id, activeEnrollment.id));
        }

        await tx.insert(batchEnrollments).values({
          batchId: toBatchId,
          studentId,
          status: "active",
          assignedTeachers: [],
        });

        let diff = 0;
        if (activeEnrollment && oldBatchId) {
          const oldBatch = await tx.query.batches.findFirst({
            where: eq(batches.id, oldBatchId),
          });
          const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
          const newFee = parseFloat(newBatch.courseFee ?? "0");
          diff = newFee - oldFee;
        } else {
          diff = parseFloat(newBatch.courseFee ?? "0");
        }

        const currentTotal = parseFloat(profile.feesTotal ?? "0");
        const currentPaid = parseFloat(profile.feesPaid ?? "0");
        const nextTotal = Math.max(0, currentTotal + diff);
        const nextBalance = Math.max(0, nextTotal - currentPaid);
        const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

        await tx.update(profiles)
          .set({
            batch: newBatch.name,
            batchTime: newBatch.timeSlot,
            course: newBatch.module?.name || null,
            feesTotal: String(nextTotal),
            feesBalance: String(nextBalance),
            paymentStatus: nextPaymentStatus,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, studentId));

        // Sync with studentClassAllocations to prevent UI state desync
        const classAlloc = await tx.query.studentClassAllocations.findFirst({
          where: eq(studentClassAllocations.studentId, studentId)
        });
        if (classAlloc) {
          const newAllocJson = classAlloc.allocation as any;
          if (newAllocJson && newAllocJson.group) {
            newAllocJson.group.batchId = newBatch.id;
          }
          await tx.update(studentClassAllocations)
            .set({ allocation: newAllocJson, updatedAt: new Date() })
            .where(eq(studentClassAllocations.studentId, studentId));
        }

        await tx.insert(studentCourseAuditLogs).values({
          studentId,
          changedBy: ctx.user.id,
          changeType: "batch_changed",
          oldValue: `Batch: ${oldBatchName}`,
          newValue: `Batch: ${newBatch.name}`,
        });
      });

      return { success: true };
    }),

  updateClassAllocation: adminQuery
    .input(z.object({
      studentId: z.number(),
      allocation: z.object({
        oneToOne: z.object({
          teacherId: z.number().nullable().optional(),
          designatedTime: z.string().optional(),
          sessions30: z.number().nonnegative(),
          sessions45: z.number().nonnegative(),
          sessions60: z.number().nonnegative(),
          completed30: z.number().nonnegative().optional(),
          completed45: z.number().nonnegative().optional(),
          completed60: z.number().nonnegative().optional(),
        }),
        group: z.object({
          teacherId: z.number().nullable().optional(),
          batchId: z.number().nullable().optional(),
          designatedTime: z.string().optional(),
          sessions30: z.number().nonnegative(),
          sessions45: z.number().nonnegative(),
          sessions60: z.number().nonnegative(),
          completed30: z.number().nonnegative().optional(),
          completed45: z.number().nonnegative().optional(),
          completed60: z.number().nonnegative().optional(),
        }),
      })
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, allocation } = input;

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found." });
      }

      // Validate teachers exist
      if (allocation.oneToOne.teacherId) {
        const teacher = await db.query.users.findFirst({ where: eq(users.id, allocation.oneToOne.teacherId) });
        if (!teacher) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Teacher does not exist or was deleted. Please refresh the page and select a valid teacher.` });
        }
      }
      if (allocation.group.teacherId) {
        const teacher = await db.query.users.findFirst({ where: eq(users.id, allocation.group.teacherId) });
        if (!teacher) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Teacher does not exist or was deleted. Please refresh the page and select a valid teacher.` });
        }
      }

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        )
      });

      const classAllocRecord = await db.query.studentClassAllocations.findFirst({
        where: eq(studentClassAllocations.studentId, studentId),
      });

      let oldAlloc: any = null;
      if (activeEnrollment) {
        oldAlloc = {
          oneToOne: {
            teacherId: (activeEnrollment.assignedTeachers as any)?.[0] || null,
            sessions30: activeEnrollment.oneOnOne30Allocated,
            sessions45: activeEnrollment.oneOnOne45Allocated,
            sessions60: activeEnrollment.oneOnOne60Allocated,
            completed30: activeEnrollment.oneOnOne30Used,
            completed45: activeEnrollment.oneOnOne45Used,
            completed60: activeEnrollment.oneOnOne60Used,
          },
          group: {
            teacherId: (activeEnrollment.assignedTeachers as any)?.[1] || (activeEnrollment.assignedTeachers as any)?.[0] || null,
            batchId: activeEnrollment.batchId,
            sessions30: activeEnrollment.group30Allocated,
            sessions45: activeEnrollment.group45Allocated,
            sessions60: activeEnrollment.group60Allocated,
            completed30: activeEnrollment.group30Used,
            completed45: activeEnrollment.group45Used,
            completed60: activeEnrollment.group60Used,
          }
        };
      } else if (classAllocRecord && classAllocRecord.allocation) {
        const alloc = classAllocRecord.allocation as any;
        oldAlloc = {
          oneToOne: {
            teacherId: alloc.oneToOne?.teacherId || null,
            designatedTime: alloc.oneToOne?.designatedTime || "",
            sessions30: alloc.oneToOne?.sessions30 || 0,
            sessions45: alloc.oneToOne?.sessions45 || 0,
            sessions60: alloc.oneToOne?.sessions60 || 0,
            completed30: alloc.oneToOne?.completed30 || 0,
            completed45: alloc.oneToOne?.completed45 || 0,
            completed60: alloc.oneToOne?.completed60 || 0,
          },
          group: {
            teacherId: alloc.group?.teacherId || null,
            batchId: alloc.group?.batchId || null,
            designatedTime: alloc.group?.designatedTime || "",
            sessions30: alloc.group?.sessions30 || 0,
            sessions45: alloc.group?.sessions45 || 0,
            sessions60: alloc.group?.sessions60 || 0,
            completed30: alloc.group?.completed30 || 0,
            completed45: alloc.group?.completed45 || 0,
            completed60: alloc.group?.completed60 || 0,
          }
        };
      } else {
        const pkg = (profile.packageConfig as any) || {};
        oldAlloc = {
          oneToOne: {
            teacherId: null,
            sessions30: pkg.oneToOne?.min30 || profile.allocatedOneToOneSessions || 0,
            sessions45: pkg.oneToOne?.min45 || 0,
            sessions60: pkg.oneToOne?.min60 || 0,
            completed30: profile.attendedOneToOneSessions || 0,
            completed45: 0,
            completed60: 0,
          },
          group: {
            teacherId: null,
            batchId: null,
            sessions30: pkg.group?.min30 || profile.allocatedGroupSessions || 0,
            sessions45: pkg.group?.min45 || 0,
            sessions60: pkg.group?.min60 || 0,
            completed30: profile.attendedGroupSessions || 0,
            completed45: 0,
            completed60: 0,
          }
        };
      }
      
      await db.transaction(async (tx) => {
        const completedO2O30 = allocation.oneToOne.completed30 ?? oldAlloc.oneToOne.completed30 ?? 0;
        const completedO2O45 = allocation.oneToOne.completed45 ?? oldAlloc.oneToOne.completed45 ?? 0;
        const completedO2O60 = allocation.oneToOne.completed60 ?? oldAlloc.oneToOne.completed60 ?? 0;

        const completedGroup30 = allocation.group.completed30 ?? oldAlloc.group.completed30 ?? 0;
        const completedGroup45 = allocation.group.completed45 ?? oldAlloc.group.completed45 ?? 0;
        const completedGroup60 = allocation.group.completed60 ?? oldAlloc.group.completed60 ?? 0;

        const teacherIds: number[] = [];
        if (allocation.oneToOne.teacherId) teacherIds.push(allocation.oneToOne.teacherId);
        if (allocation.group.teacherId) teacherIds.push(allocation.group.teacherId);

        if (activeEnrollment) {
          await tx.update(batchEnrollments)
            .set({
              oneOnOne30Allocated: allocation.oneToOne.sessions30,
              oneOnOne45Allocated: allocation.oneToOne.sessions45,
              oneOnOne60Allocated: allocation.oneToOne.sessions60,
              group30Allocated: allocation.group.sessions30,
              group45Allocated: allocation.group.sessions45,
              group60Allocated: allocation.group.sessions60,
              oneOnOne30Used: completedO2O30,
              oneOnOne45Used: completedO2O45,
              oneOnOne60Used: completedO2O60,
              group30Used: completedGroup30,
              group45Used: completedGroup45,
              group60Used: completedGroup60,
              assignedTeachers: teacherIds,
            })
            .where(eq(batchEnrollments.id, activeEnrollment.id));
        }
        
        const newAllocationJson = {
          oneToOne: {
            teacherId: allocation.oneToOne.teacherId || null,
            designatedTime: allocation.oneToOne.designatedTime || oldAlloc?.oneToOne?.designatedTime || "",
            sessions30: allocation.oneToOne.sessions30,
            sessions45: allocation.oneToOne.sessions45,
            sessions60: allocation.oneToOne.sessions60,
            completed30: completedO2O30,
            completed45: completedO2O45,
            completed60: completedO2O60,
            remaining30: Math.max(0, allocation.oneToOne.sessions30 - completedO2O30),
            remaining45: Math.max(0, allocation.oneToOne.sessions45 - completedO2O45),
            remaining60: Math.max(0, allocation.oneToOne.sessions60 - completedO2O60),
          },
          group: {
            teacherId: allocation.group.teacherId || null,
            batchId: allocation.group.batchId || null,
            designatedTime: allocation.group.designatedTime || oldAlloc?.group?.designatedTime || "",
            sessions30: allocation.group.sessions30,
            sessions45: allocation.group.sessions45,
            sessions60: allocation.group.sessions60,
            completed30: completedGroup30,
            completed45: completedGroup45,
            completed60: completedGroup60,
            remaining30: Math.max(0, allocation.group.sessions30 - completedGroup30),
            remaining45: Math.max(0, allocation.group.sessions45 - completedGroup45),
            remaining60: Math.max(0, allocation.group.sessions60 - completedGroup60),
          }
        };

        if (classAllocRecord) {
          await tx.update(studentClassAllocations)
            .set({ allocation: newAllocationJson, updatedAt: new Date() })
            .where(eq(studentClassAllocations.studentId, studentId));
        } else {
          await tx.insert(studentClassAllocations).values({
            studentId,
            allocation: newAllocationJson,
          });
        }

        // Always sync the teacher for upcoming sessions if it changed
        if (allocation.oneToOne.teacherId) {
          await tx.update(oneToOneSessions)
            .set({ teacherId: allocation.oneToOne.teacherId })
            .where(
              and(
                eq(oneToOneSessions.studentId, studentId),
                inArray(oneToOneSessions.status, ["scheduled", "rescheduled"])
              )
            );
        }

        // Generate upcoming sessions based on designated time
        if (allocation.oneToOne.teacherId && allocation.oneToOne.designatedTime) {
          const designatedTime = allocation.oneToOne.designatedTime;
          const [hoursStr, minutesStr] = designatedTime.split(':');
          if (hoursStr && minutesStr) {
            const hours = parseInt(hoursStr, 10);
            const minutes = parseInt(minutesStr, 10);
            
            const existingSessions = await tx.query.oneToOneSessions.findMany({
              where: and(
                eq(oneToOneSessions.studentId, studentId),
                inArray(oneToOneSessions.status, ["scheduled", "ongoing", "completed", "rescheduled"])
              ),
              columns: { id: true, sessionLength: true, status: true, scheduledAt: true, teacherId: true }
            });
            
            let existing30 = 0, existing45 = 0, existing60 = 0;
            const upcomingSessionIdsToUpdate = [];
            
            for (const s of existingSessions) {
              if (s.sessionLength === 30) existing30++;
              if (s.sessionLength === 45) existing45++;
              if (s.sessionLength === 60) existing60++;
              
              if (s.status === "scheduled" || s.status === "rescheduled") {
                upcomingSessionIdsToUpdate.push(s);
              }
            }
            
            // We'll update the scheduledAt for upcoming sessions
            if (upcomingSessionIdsToUpdate.length > 0) {
              for (const upcoming of upcomingSessionIdsToUpdate) {
                const newScheduledAt = new Date(upcoming.scheduledAt);
                newScheduledAt.setHours(hours, minutes, 0, 0);
                
                await tx.update(oneToOneSessions)
                  .set({
                    scheduledAt: newScheduledAt
                  })
                  .where(eq(oneToOneSessions.id, upcoming.id));
              }
            }
            
            const new30 = Math.max(0, allocation.oneToOne.sessions30 - existing30);
            const new45 = Math.max(0, allocation.oneToOne.sessions45 - existing45);
            const new60 = Math.max(0, allocation.oneToOne.sessions60 - existing60);
            
            const totalNew = new30 + new45 + new60;
            
            if (totalNew > 0) {
              const sessionsToCreate = [];
              let currentDate = new Date();
              
              // If there are existing upcoming sessions, start from the latest scheduled date
              if (upcomingSessionIdsToUpdate.length > 0) {
                const latestSession = upcomingSessionIdsToUpdate.reduce((latest, current) => {
                  return new Date(current.scheduledAt) > new Date(latest.scheduledAt) ? current : latest;
                });
                currentDate = new Date(latestSession.scheduledAt);
              }
              
              currentDate.setHours(0, 0, 0, 0);
              
              let createdCount = 0;
              let currentDurationQueue = [
                ...Array(new30).fill(30),
                ...Array(new45).fill(45),
                ...Array(new60).fill(60)
              ];
              
              while (createdCount < totalNew) {
                currentDate.setDate(currentDate.getDate() + 1);
                
                if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                  continue; // Skip weekends
                }
                
                const sessionLength = currentDurationQueue[createdCount];
                const scheduledAt = new Date(currentDate);
                scheduledAt.setHours(hours, minutes, 0, 0);
                
                const meetingRoomId = crypto.randomUUID();
                const meetingUrl = `https://meet.emteesacademy.com/${meetingRoomId}`;
                
                sessionsToCreate.push({
                  teacherId: allocation.oneToOne.teacherId,
                  studentId: studentId,
                  title: "1-to-1 Session",
                  sessionLength,
                  scheduledAt,
                  status: "scheduled" as const,
                  meetingRoomId,
                  meetingUrl,
                  createdBy: ctx.user.id
                });
                
                createdCount++;
              }
              
              if (sessionsToCreate.length > 0) {
                await tx.insert(oneToOneSessions).values(sessionsToCreate);
              }
            }
          }
        }

        // Recalculate and sync with profile
        await updateStudentSessionBalances(tx, studentId);

        // Audit Teacher assignment changes
        const oldO2OTeacherId = oldAlloc?.oneToOne?.teacherId;
        const newO2OTeacherId = allocation.oneToOne.teacherId;
        if (oldO2OTeacherId !== newO2OTeacherId) {
          const oldT = oldO2OTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, oldO2OTeacherId) }) : null;
          const newT = newO2OTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, newO2OTeacherId) }) : null;
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "teacher_changed",
            oldValue: `O2O Teacher: ${oldT?.name || "None"}`,
            newValue: `O2O Teacher: ${newT?.name || "None"}`,
          });
        }

        const oldGTeacherId = oldAlloc?.group?.teacherId;
        const newGTeacherId = allocation.group.teacherId;
        if (oldGTeacherId !== newGTeacherId) {
          const oldT = oldGTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, oldGTeacherId) }) : null;
          const newT = newGTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, newGTeacherId) }) : null;
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "teacher_changed",
            oldValue: `Group Teacher: ${oldT?.name || "None"}`,
            newValue: `Group Teacher: ${newT?.name || "None"}`,
          });
        }

        // Audit Batch change (Group Session Batch)
        const oldBatchId = oldAlloc?.group?.batchId;
        const newBatchId = allocation.group.batchId;
        if (newBatchId && oldBatchId !== newBatchId) {
          const newBatch = await tx.query.batches.findFirst({ where: eq(batches.id, newBatchId) });
          const oldBatch = oldBatchId ? await tx.query.batches.findFirst({ where: eq(batches.id, oldBatchId) }) : null;

          if (newBatch) {
            const activeEnrollment = await tx.query.batchEnrollments.findFirst({
              where: and(
                eq(batchEnrollments.studentId, studentId),
                eq(batchEnrollments.status, "active")
              )
            });

            if (activeEnrollment) {
              await tx.update(batchEnrollments)
                .set({ status: "inactive", leftAt: new Date() })
                .where(eq(batchEnrollments.id, activeEnrollment.id));
            }

            await tx.insert(batchEnrollments).values({
              batchId: newBatchId,
              studentId,
              status: "active",
              assignedTeachers: newGTeacherId ? [newGTeacherId] : []
            });

            await tx.update(profiles)
              .set({
                batch: newBatch.name,
                batchTime: newBatch.timeSlot,
                updatedAt: new Date()
              })
              .where(eq(profiles.userId, studentId));

            await tx.insert(studentCourseAuditLogs).values({
              studentId,
              changedBy: ctx.user.id,
              changeType: "batch_changed",
              oldValue: `Batch: ${oldBatch?.name || "None"}`,
              newValue: `Batch: ${newBatch.name}`,
            });
          }
        }

        // Audit session count adjustments
        const oldO2OTotal = (oldAlloc?.oneToOne?.sessions30 || 0) + (oldAlloc?.oneToOne?.sessions45 || 0) + (oldAlloc?.oneToOne?.sessions60 || 0);
        const newO2OTotal = allocation.oneToOne.sessions30 + allocation.oneToOne.sessions45 + allocation.oneToOne.sessions60;
        const oldGTotal = (oldAlloc?.group?.sessions30 || 0) + (oldAlloc?.group?.sessions45 || 0) + (oldAlloc?.group?.sessions60 || 0);
        const newGTotal = allocation.group.sessions30 + allocation.group.sessions45 + allocation.group.sessions60;

        if (oldO2OTotal !== newO2OTotal || oldGTotal !== newGTotal) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "class_count_updated",
            oldValue: `O2O: ${oldO2OTotal}, Group: ${oldGTotal}`,
            newValue: `O2O: ${newO2OTotal}, Group: ${newGTotal}`,
          });
        }
      });

      return { success: true };
    }),

  listAllocations: authedQuery
    .input(z.object({
      teacherId: z.number().optional(),
      sessionType: z.enum(["one_to_one", "group"]).optional()
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      const allAllocations = await db.query.studentClassAllocations.findMany({
        with: {
          student: {
            with: {
              profile: true
            }
          }
        }
      });

      const enriched = await Promise.all(allAllocations.map(async (record) => {
        const alloc = record.allocation as any;
        
        const activeEnrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, record.studentId),
            eq(batchEnrollments.status, "active")
          )
        });

        const assignedTeachers = Array.isArray(activeEnrollment?.assignedTeachers) ? (activeEnrollment?.assignedTeachers as number[]) : [];
        const o2oTeacherId = assignedTeachers[0] || alloc?.oneToOne?.teacherId || null;
        const groupTeacherId = assignedTeachers[1] || assignedTeachers[0] || alloc?.group?.teacherId || null;
        const batchId = activeEnrollment?.batchId || alloc?.group?.batchId || null;

        let o2oTeacher = null;
        if (o2oTeacherId) {
          o2oTeacher = await db.query.users.findFirst({ where: eq(users.id, o2oTeacherId) });
        }

        let groupTeacher = null;
        if (groupTeacherId) {
          groupTeacher = await db.query.users.findFirst({ where: eq(users.id, groupTeacherId) });
        }

        let groupBatch = null;
        if (batchId) {
          groupBatch = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
        }

        const o30Alloc = activeEnrollment?.oneOnOne30Allocated ?? alloc?.oneToOne?.sessions30 ?? 0;
        const o45Alloc = activeEnrollment?.oneOnOne45Allocated ?? alloc?.oneToOne?.sessions45 ?? 0;
        const o60Alloc = activeEnrollment?.oneOnOne60Allocated ?? alloc?.oneToOne?.sessions60 ?? 0;
        const o30Used = activeEnrollment?.oneOnOne30Used ?? alloc?.oneToOne?.completed30 ?? 0;
        const o45Used = activeEnrollment?.oneOnOne45Used ?? alloc?.oneToOne?.completed45 ?? 0;
        const o60Used = activeEnrollment?.oneOnOne60Used ?? alloc?.oneToOne?.completed60 ?? 0;

        const g30Alloc = activeEnrollment?.group30Allocated ?? alloc?.group?.sessions30 ?? 0;
        const g45Alloc = activeEnrollment?.group45Allocated ?? alloc?.group?.sessions45 ?? 0;
        const g60Alloc = activeEnrollment?.group60Allocated ?? alloc?.group?.sessions60 ?? 0;
        const g30Used = activeEnrollment?.group30Used ?? alloc?.group?.completed30 ?? 0;
        const g45Used = activeEnrollment?.group45Used ?? alloc?.group?.completed45 ?? 0;
        const g60Used = activeEnrollment?.group60Used ?? alloc?.group?.completed60 ?? 0;

        const effectiveAllocation = {
          oneToOne: {
            teacherId: o2oTeacherId,
            sessions30: o30Alloc,
            sessions45: o45Alloc,
            sessions60: o60Alloc,
            completed30: o30Used,
            completed45: o45Used,
            completed60: o60Used,
            remaining30: Math.max(0, o30Alloc - o30Used),
            remaining45: Math.max(0, o45Alloc - o45Used),
            remaining60: Math.max(0, o60Alloc - o60Used),
          },
          group: {
            teacherId: groupTeacherId,
            batchId,
            sessions30: g30Alloc,
            sessions45: g45Alloc,
            sessions60: g60Alloc,
            completed30: g30Used,
            completed45: g45Used,
            completed60: g60Used,
            remaining30: Math.max(0, g30Alloc - g30Used),
            remaining45: Math.max(0, g45Alloc - g45Used),
            remaining60: Math.max(0, g60Alloc - g60Used),
          }
        };

        return {
          id: record.id,
          studentId: record.studentId,
          student: record.student,
          allocation: effectiveAllocation,
          o2oTeacher,
          groupTeacher,
          groupBatch,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }));

      let filtered = enriched;
      if (ctx.user.role === "teacher") {
        filtered = enriched.filter(e => 
          e.allocation?.oneToOne?.teacherId === ctx.user.id || 
          e.allocation?.group?.teacherId === ctx.user.id
        );
      } else if (input?.teacherId) {
        filtered = enriched.filter(e => 
          e.allocation?.oneToOne?.teacherId === input.teacherId || 
          e.allocation?.group?.teacherId === input.teacherId
        );
      }

      return filtered;
    }),

  updateSessionType: adminQuery
    .input(z.object({
      id: z.number(),
      sessionType: z.enum(["one_on_one", "group", "both"])
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, sessionType } = input;
      const oneOnOneEnabled = sessionType === "one_on_one" || sessionType === "both";
      const groupSessionEnabled = sessionType === "group" || sessionType === "both";

      await db.update(profiles)
        .set({
          oneOnOneEnabled,
          groupSessionEnabled,
          updatedAt: new Date()
        })
        .where(eq(profiles.userId, id));

      return { success: true };
    }),
});
