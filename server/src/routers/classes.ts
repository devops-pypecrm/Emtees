import { z } from "zod";
import { eq, desc, and, inArray, or, ilike, sql, count, asc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { classes, attendance, oneToOneSessions, batchEnrollments, batches, profiles, users, classBatches, classJoinRequests, attendanceAlerts, oneToOneRescheduleRequests, notifications, studentClassAllocations, holidays, modules, classLedgerTransactions, systemSettings, departments, departmentTeachers } from "@db/schema";
import { sendBulkNotification, sendNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getIo } from "../lib/socketInstance";
import { isStudentFeeRestricted } from "../lib/feeHelper";
import { updateStudentSessionBalances } from "../lib/sessionHelper";
import { generateJitsiToken } from "../lib/jitsi";
import { evaluateClassCompletion } from "../lib/classEngine";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { recalculateSalaryInternal } from "./admin";


export const classRouter = createRouter({
  list: authedQuery
    .input(z.object({ batchId: z.number().optional(), status: z.string().optional(), limit: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const isRestricted = ctx.user.role === "student" ? await isStudentFeeRestricted(ctx.user.id) : false;

      // ─── PART 1: QUERY GROUP CLASSES ───
      const filters = [];
      if (input?.status) filters.push(eq(classes.status, input.status as "scheduled" | "ongoing" | "completed" | "cancelled"));
      if (ctx.user.role === "teacher") {
        filters.push(eq(classes.teacherId, ctx.user.id));
      } else if (ctx.user.role === "academic_head") {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.headUserId, ctx.user.id),
          with: { departmentTeachers: true }
        });
        if (dept && dept.departmentTeachers.length > 0) {
          const teacherIds = dept.departmentTeachers.map((dt: any) => dt.teacherId);
          filters.push(inArray(classes.teacherId, teacherIds));
        } else {
          filters.push(sql`false`);
        }
      }

      let visibleGroupBatchIds: number[] = [];
      const isStudentQuery = ctx.user.role === "student";

      if (input?.batchId) {
        const cbList = await db.select({ classId: classBatches.classId }).from(classBatches).where(eq(classBatches.batchId, input.batchId));
        const classIds = cbList.map(x => x.classId);

        const batchConditions = [eq(classes.batchId, input.batchId)];
        if (classIds.length > 0) {
          batchConditions.push(inArray(classes.id, classIds));
        }
        filters.push(or(...batchConditions));
      } else if (isStudentQuery) {
        const studentEnrollments = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, ctx.user.id),
            or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
          ),
          columns: { batchId: true },
        });
        const enrolledBatchIds = studentEnrollments.map((e) => e.batchId);

        // Fetch all active batches
        const activeBatches = await db.query.batches.findMany({
          where: eq(batches.status, "active"),
          columns: { id: true },
        });
        const activeBatchIds = activeBatches.map((b) => b.id);

        visibleGroupBatchIds = Array.from(new Set([...enrolledBatchIds, ...activeBatchIds]));
      }

      let groupClassesList: any[] = [];
      let fetchGroupClasses = true;

      if (isStudentQuery && !input?.batchId && visibleGroupBatchIds.length === 0) {
        fetchGroupClasses = false;
      }

      if (fetchGroupClasses) {
        const groupFilters = [...filters];
        if (isStudentQuery && !input?.batchId) {
          const cbList = await db.select({ classId: classBatches.classId }).from(classBatches).where(inArray(classBatches.batchId, visibleGroupBatchIds));
          const classIds = cbList.map(x => x.classId);

          const studentConditions = [inArray(classes.batchId, visibleGroupBatchIds)];
          if (classIds.length > 0) {
            studentConditions.push(inArray(classes.id, classIds));
          }
          groupFilters.push(or(...studentConditions));
        }

        const where = groupFilters.length > 0 ? and(...groupFilters) : undefined;
        groupClassesList = await db.query.classes.findMany({
          where,
          limit: input?.limit ? input.limit : undefined,
          orderBy: desc(classes.scheduledAt),
          with: {
            teacher: true,
            batch: {
              with: {
                module: true
              }
            },
            classBatches: {
              with: {
                batch: {
                  with: {
                    module: true
                  }
                }
              }
            }
          },
        });
      }

      // ─── PART 2: QUERY ONE-TO-ONE SESSIONS ───
      let oneToOnesList: any[] = [];

      if (!input?.batchId) {
        const oToFilters = [];
        if (input?.status) {
          if (input.status === "scheduled") {
            oToFilters.push(or(eq(oneToOneSessions.status, "scheduled"), eq(oneToOneSessions.status, "rescheduled")));
          } else {
            oToFilters.push(eq(oneToOneSessions.status, input.status as any));
          }
        }

        if (ctx.user.role === "student") {
          oToFilters.push(eq(oneToOneSessions.studentId, ctx.user.id));
        } else if (ctx.user.role === "teacher") {
          oToFilters.push(eq(oneToOneSessions.teacherId, ctx.user.id));
        } else if (ctx.user.role === "academic_head") {
          const dept = await db.query.departments.findFirst({
            where: eq(departments.headUserId, ctx.user.id),
            with: { departmentTeachers: true }
          });
          if (dept && dept.departmentTeachers.length > 0) {
            const teacherIds = dept.departmentTeachers.map((dt: any) => dt.teacherId);
            oToFilters.push(inArray(oneToOneSessions.teacherId, teacherIds));
          } else {
            oToFilters.push(sql`false`);
          }
        } else if (!["super_admin", "admin"].includes(ctx.user.role)) {
          oToFilters.push(sql`false`);
        }

        const oToWhere = oToFilters.length > 0 ? and(...oToFilters) : undefined;
        oneToOnesList = await db.query.oneToOneSessions.findMany({
          where: oToWhere,
          limit: input?.limit ? input.limit : undefined,
          orderBy: desc(oneToOneSessions.scheduledAt),
          with: {
            teacher: true,
            student: {
              with: {
                profile: true
              }
            },
          },
        });
      }

      // ─── PART 3: FORMAT & MAP BOTH LISTS ───
      let enrolledBatchMap = new Map<number, string>();
      let activeEnrollmentsCountMap = new Map<number, number>();

      const counts = await db
        .select({
          batchId: batchEnrollments.batchId,
          count: sql<number>`count(${batchEnrollments.id})::int`,
        })
        .from(batchEnrollments)
        .where(eq(batchEnrollments.status, "active"))
        .groupBy(batchEnrollments.batchId);
      
      for (const item of counts) {
        activeEnrollmentsCountMap.set(item.batchId, item.count);
      }

      if (ctx.user.role === "student") {
        const studentEnrollments = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, ctx.user.id),
            or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
          ),
          columns: { batchId: true, status: true },
        });
        for (const se of studentEnrollments) {
          enrolledBatchMap.set(se.batchId, se.status || "active");
        }
      }

      const mappedGroupClasses = groupClassesList.map(cls => {
        let isEnrolled = false;
        let enrollmentStatus: string | null = null;
        let enrollmentAllowed = false;

        if (ctx.user.role === "student") {
          const classBatchIds = Array.from(new Set([cls.batchId, ...(cls.classBatches?.map((cb: any) => cb.batchId) || [])]));
          for (const bid of classBatchIds) {
            const status = enrolledBatchMap.get(bid);
            if (status) {
              isEnrolled = true;
              enrollmentStatus = status;
            }
          }

          const primaryBatch = cls.batch;
          if (primaryBatch && primaryBatch.status === "active") {
            const currentCount = activeEnrollmentsCountMap.get(primaryBatch.id) || 0;
            const maxStudents = primaryBatch.maxStudents ?? 30;
            if (currentCount < maxStudents) {
              enrollmentAllowed = true;
            }
          }
        }

        const primaryBatch = cls.batch;
        const assignedStudentsCount = primaryBatch ? (activeEnrollmentsCountMap.get(primaryBatch.id) || 0) : 0;
        
        let mappedStatus: "scheduled" | "live" | "completed" | "cancelled" = "scheduled";
        if (cls.status === "ongoing") mappedStatus = "live";
        else if (cls.status === "completed") mappedStatus = "completed";
        else if (cls.status === "cancelled") mappedStatus = "cancelled";

        return {
          ...cls,
          meetingUrl: isRestricted ? null : cls.meetingUrl,
          recordingUrl: isRestricted ? null : cls.recordingUrl,
          batch: cls.batch || null,
          batches: cls.classBatches?.map((cb: any) => cb.batch).filter(Boolean) || [],
          isEnrolled,
          enrollmentStatus,
          enrollmentAllowed,
          assignedStudentsCount,
          status: mappedStatus,
        };
      });

      const mappedOneToOnes = oneToOnesList.map(s => {
        let mappedStatus: "scheduled" | "live" | "completed" | "cancelled" = "scheduled";
        if (s.status === "ongoing") mappedStatus = "live";
        else if (s.status === "completed") mappedStatus = "completed";
        else if (s.status === "cancelled") mappedStatus = "cancelled";
        else if (s.status === "rescheduled") mappedStatus = "scheduled";

        const profile = s.student?.profile;
        const studentCourse = profile?.course || null;
        const studentBatch = profile?.batch || null;

        return {
          id: s.id,
          batchId: null,
          teacherId: s.teacherId,
          title: s.title,
          description: s.remarks || null,
          classType: "one_to_one" as const,
          status: mappedStatus,
          scheduledAt: s.scheduledAt,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          duration: s.sessionLength,
          meetingUrl: isRestricted ? null : s.meetingUrl,
          meetingRoomId: s.meetingRoomId,
          teacher: s.teacher || null,
          student: s.student || null,
          batch: studentBatch ? { name: studentBatch, module: { name: studentCourse } } : null,
          batches: [],
          classBatches: [],
          isEnrolled: s.studentId === ctx.user.id,
          enrollmentStatus: s.studentId === ctx.user.id ? "active" : null,
          enrollmentAllowed: false,
          assignedStudentsCount: 1,
        };
      });

      const mergedList = [...mappedGroupClasses, ...mappedOneToOnes];
      mergedList.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

      return mergedList;
    }),

  getMeetingDetails: authedQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
        with: { teacher: true, batch: true },
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Access Control - Stricter permissions
      const isSuperAdmin = ctx.user.role === "super_admin";
      if (!isSuperAdmin) {
        if (ctx.user.role === "teacher") {
          if (cls.teacherId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You are not the assigned teacher for this class." });
          }
        } else if (ctx.user.role === "student") {
          if (await isStudentFeeRestricted(ctx.user.id)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access Restricted Due to Outstanding Fees." });
          }

          const profile = await db.query.profiles.findFirst({
            where: eq(profiles.userId, ctx.user.id),
          });
          if (!profile || (profile.remainingGroupSessions ?? 0) <= 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You have exhausted your allocated Group sessions. Cannot join this class." });
          }

          const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
          const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

          const enrollment = await db.query.batchEnrollments.findFirst({
            where: and(
              inArray(batchEnrollments.batchId, classBatchIds),
              eq(batchEnrollments.studentId, ctx.user.id),
              or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
            ),
          });
          if (!enrollment) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to join this class session." });
          }

          // Verify approved join request
          const joinReq = await db.query.classJoinRequests.findFirst({
            where: and(
              eq(classJoinRequests.classId, cls.id),
              eq(classJoinRequests.studentId, ctx.user.id)
            ),
          });
          if (!joinReq || joinReq.status !== "approved") {
            throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to join this class session. Request not approved." });
          }
        } else if (["admin", "academic_head"].includes(ctx.user.role)) {
          // Allow admins view-only access (isModerator will be false)
        } else {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        }
      }

      // Generate unique meeting room ID if not set
      let roomName = cls.meetingRoomId;
      if (!roomName) {
        const slug = cls.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().substring(0, 50);
        roomName = `emtees-${slug}-${cls.id}`;
        await db.update(classes).set({ meetingRoomId: roomName, meetingUrl: `https://meet.gecouncil.com/${roomName}` }).where(eq(classes.id, cls.id));
      }

      // Role determination - Stricter Jitsi moderator rules
      const isModerator = ["super_admin", "teacher"].includes(ctx.user.role);

      // JWT Generation if credentials configured
      let jwt: string | null = null;
      const jitsiAppId = process.env.JITSI_APP_ID;
      const jitsiAppSecret = process.env.JITSI_APP_SECRET;
      if (jitsiAppId && jitsiAppSecret) {
        const userDetails = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
        jwt = await generateJitsiToken({
          room: roomName,
          userName: ctx.user.name,
          userEmail: userDetails?.email || undefined,
          userId: String(ctx.user.id),
          isModerator,
          appId: jitsiAppId,
          appSecret: jitsiAppSecret,
        });
      }

      return {
        classId: cls.id,
        roomName,
        jwt,
        isModerator,
        title: cls.title,
        scheduledAt: cls.scheduledAt,
        teacherName: cls.teacher?.name,
      };
    }),

  create: authedQuery
    .input(z.object({
      batchIds: z.array(z.number()).min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      classType: z.enum(["group", "one_to_one"]).default("group"),
      scheduledAt: z.date(),
      duration: z.number().default(60),
      teacherId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Stricter role permission check
      const isSuperAdminOrTeacher = ["super_admin", "admin", "academic_head", "teacher"].includes(ctx.user.role);
      if (!isSuperAdminOrTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Super Admin, Admin, Academic Head and Teacher roles can schedule classes.",
        });
      }

      // Teacher batch assignment check
      if (ctx.user.role === "teacher") {
        const targetBatches = await db.query.batches.findMany({
          where: inArray(batches.id, input.batchIds),
        });
        
        const invalidBatches = targetBatches.filter(b => b.teacherId !== ctx.user.id);
        if (invalidBatches.length > 0 || targetBatches.length !== input.batchIds.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only schedule classes for batches assigned to you.",
          });
        }
        
        if (input.teacherId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only schedule classes with yourself as the assigned teacher.",
          });
        }
      }

      const slug = input.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().substring(0, 50);
      const roomName = `emtees-${slug}-${crypto.randomUUID().substring(0, 8)}`;
      
      const { batchIds, ...classValues } = input;
      
      // Save class with the first batchId for backward compatibility
      const [newClass] = await db.insert(classes).values({
        ...classValues,
        batchId: batchIds[0],
        meetingRoomId: roomName,
        meetingUrl: `https://meet.gecouncil.com/${roomName}`,
      }).returning();

      if (!newClass) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to schedule class.",
        });
      }

      // Insert into classBatches join table
      await db.insert(classBatches).values(
        batchIds.map(bid => ({
          classId: newClass.id,
          batchId: bid
        }))
      );

      // --- Notifications ---
      const teacherUser = await db.query.users.findFirst({ where: eq(users.id, input.teacherId) });
      const teacherName = teacherUser?.name || "Assigned Teacher";
      const scheduledTimeStr = new Date(input.scheduledAt).toLocaleString();

      // Fetch enrolled active students for all selected batch IDs
      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          inArray(batchEnrollments.batchId, batchIds),
          eq(batchEnrollments.status, "active")
        ),
      });
      const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

      const notificationData = {
        classId: newClass.id,
        type: "class_scheduled",
        scheduledAt: newClass.scheduledAt,
      };

      if (studentIds.length > 0) {
        await sendBulkNotification(
          studentIds,
          `New Class Scheduled: ${input.title}`,
          `Class "${input.title}" has been scheduled by ${teacherName} for ${scheduledTimeStr}.`,
          "class_scheduled",
          notificationData
        );
      }

      await sendNotification(
        input.teacherId,
        `Class Scheduled: ${input.title}`,
        `You are scheduled to teach "${input.title}" on ${scheduledTimeStr}.`,
        "class_scheduled",
        notificationData
      );

      const createdClass = await db.query.classes.findFirst({
        where: eq(classes.id, newClass.id),
        with: {
          teacher: true,
          classBatches: {
            with: {
              batch: true
            }
          }
        }
      });

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return createdClass;
    }),

  edit: authedQuery
    .input(z.object({
      id: z.number(),
      batchIds: z.array(z.number()).min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      scheduledAt: z.date(),
      duration: z.number().default(60),
      teacherId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.id) });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Stricter role check
      const isSuperAdminOrTeacher = ["super_admin", "admin", "academic_head", "teacher"].includes(ctx.user.role);
      if (!isSuperAdminOrTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Super Admin, Admin, Academic Head and Teacher roles can edit classes.",
        });
      }

      // If teacher, verify they are editing their own class
      if (ctx.user.role === "teacher" && cls.teacherId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to edit this class.",
        });
      }

      // If teacher, verify that all specified batchIds are taught by this teacher
      if (ctx.user.role === "teacher") {
        const targetBatches = await db.query.batches.findMany({
          where: inArray(batches.id, input.batchIds),
        });
        const invalidBatches = targetBatches.filter(b => b.teacherId !== ctx.user.id);
        if (invalidBatches.length > 0 || targetBatches.length !== input.batchIds.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only schedule classes for batches assigned to you.",
          });
        }
        
        if (input.teacherId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only edit classes with yourself as the assigned teacher.",
          });
        }
      }

      // Update classes table
      const { batchIds, id, ...classValues } = input;
      await db.update(classes)
        .set({
          ...classValues,
          batchId: batchIds[0],
        })
        .where(eq(classes.id, id));

      // Re-sync classBatches
      await db.delete(classBatches).where(eq(classBatches.classId, id));
      await db.insert(classBatches).values(
        batchIds.map(bid => ({
          classId: id,
          batchId: bid
        }))
      );

      // Recalculate salary if class is/was completed
      if (cls.status === "completed" || input.scheduledAt !== cls.scheduledAt) {
        const oldMonth = new Date(cls.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, cls.teacherId, oldMonth);
        
        const newMonth = new Date(input.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, input.teacherId, newMonth);
      }

      return { success: true };
    }),

  start: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.id) });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      const isAssignedTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isAdmin && !isAssignedTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins or the assigned Teacher can start this class.",
        });
      }

      await db.update(classes)
        .set({ status: "ongoing" })
        .where(eq(classes.id, input.id));

      const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, input.id));
      const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          inArray(batchEnrollments.batchId, classBatchIds),
          eq(batchEnrollments.status, "active")
        ),
      });
      const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
      
      const joinUrl = `/classes`;
      const notificationData = {
        classId: cls.id,
        type: "class_start",
        joinUrl
      };

      if (studentIds.length > 0) {
        await sendBulkNotification(
          studentIds,
          "Class Started",
          `Live class "${cls.title}" has started. Click here to join.`,
          "class_start",
          notificationData
        );
      }

      const io = getIo();
      if (io) {
        for (const bid of classBatchIds) {
          io.to(`batch:${bid}`).emit("class:started", {
            batchId: bid,
            classId: input.id,
            title: cls.title,
          });
        }
        io.emit("class:updated");
      }

      return { success: true };
    }),

  end: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.id) });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      const isAssignedTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isAdmin && !isAssignedTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins or the assigned Teacher can end this class.",
        });
      }

      const endedAt = new Date();
      const actualDuration = cls.startedAt
        ? Math.floor((endedAt.getTime() - new Date(cls.startedAt).getTime()) / 60000)
        : 0;
      await db.update(classes)
        .set({ status: "completed", endedAt, actualDuration })
        .where(eq(classes.id, input.id));

      // Evaluate 20-min Class Completion Rule
      await evaluateClassCompletion(input.id);

      const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, input.id));
      const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

      const io = getIo();
      if (io) {
        for (const bid of classBatchIds) {
          io.to(`batch:${bid}`).emit("class:ended", {
            batchId: bid,
            classId: input.id,
          });
        }
        io.emit("class:updated");
      }

      return { success: true };
    }),

  overrideClassLedger: adminQuery
    .input(z.object({
      classId: z.number(),
      studentId: z.number(),
      type: z.enum(["credit", "debit", "adjustment"]),
      amount: z.number(),
      remarks: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      const enrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, input.studentId),
          eq(batchEnrollments.status, "active")
        ),
        orderBy: (fields, { desc }) => [desc(fields.joinedAt)]
      });

      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active enrollment found for this student" });
      }

      await db.insert(classLedgerTransactions).values({
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        type: input.type,
        amount: input.amount,
        referenceClassId: input.classId,
        remarks: `[Admin Override]: ${input.remarks}`,
        createdBy: ctx.user.id,
      });
      
      return { success: true };
    }),

  cancel: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.id) });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      const isAssignedTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isAdmin && !isAssignedTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins or the assigned Teacher can cancel this class.",
        });
      }

      await db.update(classes)
        .set({ status: "cancelled" })
        .where(eq(classes.id, input.id));

      if (cls.status === "completed") {
        const monthStr = new Date(cls.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, cls.teacherId, monthStr);
      }

      const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, input.id));
      const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

      const io = getIo();
      if (io) {
        for (const bid of classBatchIds) {
          io.to(`batch:${bid}`).emit("class:cancelled", {
            batchId: bid,
            classId: input.id,
          });
        }
        io.emit("class:updated");
      }

      return { success: true };
    }),

  // ─── One-to-One Sessions ─────────────────────────────────────────────────────

  listOneToOne: authedQuery
    .input(z.object({ studentId: z.number().optional(), teacherId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const filters = [];
      
      if (ctx.user.role === "student") {
        filters.push(eq(oneToOneSessions.studentId, ctx.user.id));
      } else if (ctx.user.role === "teacher") {
        filters.push(eq(oneToOneSessions.teacherId, ctx.user.id));
      } else if (["super_admin", "admin", "academic_head"].includes(ctx.user.role)) {
        if (input?.studentId) filters.push(eq(oneToOneSessions.studentId, input.studentId));
        if (input?.teacherId) filters.push(eq(oneToOneSessions.teacherId, input.teacherId));
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to list 1-to-1 sessions." });
      }

      const where = filters.length > 0 ? and(...filters) : undefined;
      const sessions = await db.query.oneToOneSessions.findMany({
        where,
        orderBy: desc(oneToOneSessions.scheduledAt),
        with: {
          teacher: true,
          student: {
            with: {
              profile: true
            }
          },
          rescheduleRequests: true
        },
      });

      return sessions.map(s => {
        let mappedStatus: "scheduled" | "live" | "completed" | "cancelled" | "rescheduled" | "reschedule_request_pending" = "scheduled";
        if (s.status === "ongoing") mappedStatus = "live";
        else if (s.status === "completed") mappedStatus = "completed";
        else if (s.status === "cancelled") mappedStatus = "cancelled";
        else if (s.status === "rescheduled") mappedStatus = "rescheduled";
        else if (s.status === "reschedule_request_pending") mappedStatus = "reschedule_request_pending";

        return {
          ...s,
          classType: "one_to_one" as const,
          status: mappedStatus,
        };
      });
    }),

  createOneToOne: authedQuery
    .input(z.object({
      teacherId: z.number(),
      studentId: z.number(),
      title: z.string().min(1).default("1-to-1 Session"),
      sessionLength: z.number().default(30),
      scheduledAt: z.date(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, input.studentId),
          eq(batchEnrollments.status, "active")
        )
      });

      const classAllocRecord = await db.query.studentClassAllocations.findFirst({
        where: eq(studentClassAllocations.studentId, input.studentId),
      });
      const alloc = classAllocRecord?.allocation as any;

      const assignedTeachers = activeEnrollment && Array.isArray(activeEnrollment.assignedTeachers)
        ? (activeEnrollment.assignedTeachers as number[])
        : [];

      const isAssignedTeacher = assignedTeachers.includes(ctx.user.id) ||
                                (alloc?.oneToOne?.teacherId === ctx.user.id);

      const isAuthorized = ctx.user.role === "super_admin" || 
                           ctx.user.role === "admin" || 
                           ctx.user.role === "academic_head" ||
                           (ctx.user.role === "teacher" && isAssignedTeacher);

      if (!isAuthorized) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins or the assigned Teacher can create 1-to-1 sessions." });
      }

      const remaining30 = alloc?.oneToOne?.remaining30 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne30Allocated - activeEnrollment.oneOnOne30Used) : 0);
      const remaining45 = alloc?.oneToOne?.remaining45 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne45Allocated - activeEnrollment.oneOnOne45Used) : 0);
      const remaining60 = alloc?.oneToOne?.remaining60 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne60Allocated - activeEnrollment.oneOnOne60Used) : 0);

      let remaining = 0;
      if (input.sessionLength === 30) remaining = remaining30;
      else if (input.sessionLength === 45) remaining = remaining45;
      else if (input.sessionLength === 60) remaining = remaining60;
      else remaining = remaining30 + remaining45 + remaining60;

      if (remaining <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Student has exhausted their allocated ${input.sessionLength}-minute One-to-One sessions. Cannot schedule a new session.`,
        });
      }

      const validUntil = new Date(input.scheduledAt);
      validUntil.setDate(validUntil.getDate() + 60);

      // Generate unique meeting room ID
      const slug = input.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().substring(0, 50);
      const meetingRoomId = `emtees-1to1-${slug}-${Date.now()}`;
      const meetingUrl = `https://meet.gecouncil.com/${meetingRoomId}`;

      const result = await db.insert(oneToOneSessions).values({
        teacherId: input.teacherId,
        studentId: input.studentId,
        title: input.title,
        sessionLength: input.sessionLength,
        scheduledAt: input.scheduledAt,
        remarks: input.remarks,
        createdBy: ctx.user.id,
        validFrom: input.scheduledAt,
        validUntil,
        meetingRoomId,
        meetingUrl,
        status: "scheduled",
      }).returning({ id: oneToOneSessions.id });

      const newSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, result[0]?.id),
        with: { teacher: true, student: true },
      });

      if (newSession) {
        const timeStr = new Date(input.scheduledAt).toLocaleString();
        
        await sendNotification(
          input.studentId,
          `New 1-to-1 Session Scheduled: ${input.title}`,
          `A 1-to-1 session "${input.title}" has been scheduled with Teacher ${newSession.teacher?.name || "assigned"} on ${timeStr}.`,
          "class_scheduled",
          { sessionId: newSession.id }
        );

        await sendNotification(
          input.teacherId,
          `New 1-to-1 Session Scheduled: ${input.title}`,
          `A 1-to-1 session "${input.title}" has been scheduled with Student ${newSession.student?.name || "assigned"} on ${timeStr}.`,
          "class_scheduled",
          { sessionId: newSession.id }
        );
      }

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return newSession;
    }),

  startInstantOneToOne: authedQuery
    .input(z.object({
      studentId: z.number(),
      sessionLength: z.number().default(30),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      const classAllocRecord = await db.query.studentClassAllocations.findFirst({
        where: eq(studentClassAllocations.studentId, input.studentId),
      });
      const alloc = classAllocRecord?.allocation as any;
      const assignedTeacherId = alloc?.oneToOne?.teacherId;

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, input.studentId),
          eq(batchEnrollments.status, "active")
        )
      });
      const assignedTeachers = activeEnrollment && Array.isArray(activeEnrollment.assignedTeachers)
        ? (activeEnrollment.assignedTeachers as number[])
        : [];

      const isAssignedTeacher = assignedTeachers.includes(ctx.user.id) || (assignedTeacherId === ctx.user.id);
      const isAuthorized = ctx.user.role === "super_admin" || 
                           ctx.user.role === "admin" || 
                           ctx.user.role === "academic_head" ||
                           (ctx.user.role === "teacher" && isAssignedTeacher);

      if (!isAuthorized) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins or the assigned Teacher can start instant sessions." });
      }

      const remaining30 = alloc?.oneToOne?.remaining30 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne30Allocated - activeEnrollment.oneOnOne30Used) : 0);
      const remaining45 = alloc?.oneToOne?.remaining45 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne45Allocated - activeEnrollment.oneOnOne45Used) : 0);
      const remaining60 = alloc?.oneToOne?.remaining60 ?? (activeEnrollment ? Math.max(0, activeEnrollment.oneOnOne60Allocated - activeEnrollment.oneOnOne60Used) : 0);

      let remaining = 0;
      if (input.sessionLength === 30) remaining = remaining30;
      else if (input.sessionLength === 45) remaining = remaining45;
      else if (input.sessionLength === 60) remaining = remaining60;
      else remaining = remaining30 + remaining45 + remaining60;

      if (remaining <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Student has exhausted their allocated ${input.sessionLength}-minute One-to-One sessions.`,
        });
      }

      const scheduledAt = new Date();
      const validUntil = new Date(scheduledAt);
      validUntil.setDate(validUntil.getDate() + 60);

      const title = `Instant 1-to-1 Session (${input.sessionLength}m)`;
      const roomName = `emtees-1to1-instant-${crypto.randomUUID().substring(0, 8)}`;
      const meetingUrl = `https://meet.gecouncil.com/${roomName}`;

      const teacherId = ctx.user.role === "teacher" ? ctx.user.id : (assignedTeacherId || assignedTeachers[0]);
      if (!teacherId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No assigned teacher found to start this session." });
      }

      const result = await db.insert(oneToOneSessions).values({
        teacherId,
        studentId: input.studentId,
        title,
        sessionLength: input.sessionLength,
        scheduledAt,
        remarks: input.remarks || "Started instantly",
        createdBy: ctx.user.id,
        validFrom: scheduledAt,
        validUntil,
        meetingRoomId: roomName,
        meetingUrl,
        status: "ongoing",
        startedAt: scheduledAt,
        lastHeartbeatAt: scheduledAt,
        teacherAttendance: "present",
      }).returning({ id: oneToOneSessions.id });

      const newSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, result[0]?.id),
        with: { teacher: true, student: true },
      });

      if (newSession) {
        await sendNotification(
          input.studentId,
          `1-to-1 Session Started: ${title}`,
          `Your teacher has started an instant session. Join now!`,
          "class_started",
          { sessionId: newSession.id }
        );
      }

      const io = getIo();
      if (io) {
        io.emit("class:updated");
        
        // Emit direct call event to the student's personal socket room
        if (newSession) {
          io.to(`user:${input.studentId}`).emit("1to1:incoming_call", {
            sessionId: newSession.id,
            title: newSession.title,
            teacherName: newSession.teacher?.name || "Your Teacher",
            roomName: newSession.meetingRoomId
          });
        }
      }
      let jwt: string | null = null;
      const jitsiAppId = process.env.JITSI_APP_ID;
      const jitsiAppSecret = process.env.JITSI_APP_SECRET;
      if (jitsiAppId && jitsiAppSecret) {
        const userDetails = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
        jwt = await generateJitsiToken({
          room: roomName,
          userName: ctx.user.name,
          userEmail: userDetails?.email || undefined,
          userId: String(ctx.user.id),
          isModerator: true,
          appId: jitsiAppId,
          appSecret: jitsiAppSecret,
        });
      }

      console.log("[startInstantOneToOne] Generated JWT:", jwt);

      return {
        ...newSession,
        jwt,
        isModerator: true,
      };
    }),

  editOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
      teacherId: z.number(),
      studentId: z.number(),
      title: z.string().min(1),
      sessionLength: z.number(),
      scheduledAt: z.date(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins can edit 1-to-1 sessions." });
      }
      const db = getDb();
      const oldSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!oldSession) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const validUntil = new Date(input.scheduledAt);
      validUntil.setDate(validUntil.getDate() + 60);

      const timeChanged = oldSession.scheduledAt.getTime() !== input.scheduledAt.getTime();

      await db.update(oneToOneSessions).set({
        teacherId: input.teacherId,
        studentId: input.studentId,
        title: input.title,
        sessionLength: input.sessionLength,
        scheduledAt: input.scheduledAt,
        remarks: input.remarks,
        validFrom: input.scheduledAt,
        validUntil,
      }).where(eq(oneToOneSessions.id, input.sessionId));

      const updatedSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
        with: { teacher: true, student: true },
      });

      if (updatedSession && timeChanged) {
        const timeStr = new Date(input.scheduledAt).toLocaleString();
        
        await sendNotification(
          input.studentId,
          `1-to-1 Session Updated: ${input.title}`,
          `Your 1-to-1 session "${input.title}" details have been updated. New scheduled time: ${timeStr}.`,
          "class_scheduled",
          { sessionId: updatedSession.id }
        );

        await sendNotification(
          input.teacherId,
          `1-to-1 Session Updated: ${input.title}`,
          `Your 1-to-1 session "${input.title}" details have been updated. New scheduled time: ${timeStr}.`,
          "class_scheduled",
          { sessionId: updatedSession.id }
        );
      }

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return updatedSession;
    }),

  rescheduleOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
      scheduledAt: z.date(),
      sessionLength: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins can reschedule 1-to-1 sessions." });
      }
      const db = getDb();
      const oldSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!oldSession) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const validUntil = new Date(input.scheduledAt);
      validUntil.setDate(validUntil.getDate() + 60);

      await db.update(oneToOneSessions).set({
        scheduledAt: input.scheduledAt,
        sessionLength: input.sessionLength ?? oldSession.sessionLength,
        status: "rescheduled",
        validFrom: input.scheduledAt,
        validUntil,
        reminder1DaySentAt: null,
        reminder1HourSentAt: null,
        reminder10MinSentAt: null,
      }).where(eq(oneToOneSessions.id, input.sessionId));

      if (oldSession.status === "completed") {
        const oldMonth = new Date(oldSession.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, oldSession.teacherId, oldMonth);
        const newMonth = new Date(input.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, oldSession.teacherId, newMonth);
      }

      const updatedSession = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
        with: { teacher: true, student: true },
      });

      if (updatedSession) {
        const timeStr = new Date(input.scheduledAt).toLocaleString();
        
        await sendNotification(
          updatedSession.studentId,
          `1-to-1 Session Rescheduled: ${updatedSession.title}`,
          `Your 1-to-1 session "${updatedSession.title}" has been rescheduled to ${timeStr}.`,
          "class_scheduled",
          { sessionId: updatedSession.id }
        );

        await sendNotification(
          updatedSession.teacherId,
          `1-to-1 Session Rescheduled: ${updatedSession.title}`,
          `Your 1-to-1 session "${updatedSession.title}" has been rescheduled to ${timeStr}.`,
          "class_scheduled",
          { sessionId: updatedSession.id }
        );
      }

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return updatedSession;
    }),

  cancelOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins can cancel 1-to-1 sessions." });
      }
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      await db.update(oneToOneSessions).set({
        status: "cancelled",
      }).where(eq(oneToOneSessions.id, input.sessionId));

      if (session.status === "completed") {
        const monthStr = new Date(session.scheduledAt).toISOString().substring(0, 7);
        await recalculateSalaryInternal(db, session.teacherId, monthStr);
      }

      // Notify Student of cancellation
      await sendNotification(
        session.studentId,
        `1-to-1 Session Cancelled: ${session.title}`,
        `Your 1-to-1 session "${session.title}" has been cancelled.`,
        "class_cancelled",
        { sessionId: session.id }
      );

      // Notify Teacher of cancellation
      await sendNotification(
        session.teacherId,
        `1-to-1 Session Cancelled: ${session.title}`,
        `Your 1-to-1 session "${session.title}" has been cancelled.`,
        "class_cancelled",
        { sessionId: session.id }
      );

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return { success: true };
    }),

  requestReschedule: authedQuery
    .input(z.object({
      sessionId: z.number(),
      proposedScheduledAt: z.date(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "teacher") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Teachers can request rescheduling." });
      }
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      if (session.teacherId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only request rescheduling for sessions assigned to you." });
      }

      if (new Date() >= new Date(session.scheduledAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot request rescheduling after the session start time." });
      }

      // Check for existing pending request
      const existingPending = await db.query.oneToOneRescheduleRequests.findFirst({
        where: and(
          eq(oneToOneRescheduleRequests.sessionId, input.sessionId),
          eq(oneToOneRescheduleRequests.status, "pending")
        )
      });
      if (existingPending) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A rescheduling request is already pending for this session." });
      }

      await db.update(oneToOneSessions)
        .set({ status: "reschedule_request_pending" })
        .where(eq(oneToOneSessions.id, input.sessionId));

      const [newRequest] = await db.insert(oneToOneRescheduleRequests).values({
        sessionId: input.sessionId,
        previousScheduledAt: session.scheduledAt,
        proposedScheduledAt: input.proposedScheduledAt,
        reason: input.reason,
        status: "pending",
        requestedBy: ctx.user.id,
      }).returning();

      // Notify Super Admins and Admins
      const adminIds = await getAdminUserIds();
      if (adminIds.length > 0) {
        const timeStr = new Date(input.proposedScheduledAt).toLocaleString();
        const origTimeStr = new Date(session.scheduledAt).toLocaleString();
        await sendBulkNotification(
          adminIds,
          `Reschedule Request: ${session.title}`,
          `Teacher ${ctx.user.name} has requested to reschedule "${session.title}" (originally on ${origTimeStr}) to ${timeStr}. Reason: ${input.reason}`,
          "reschedule_request_submitted",
          { requestId: newRequest.id, sessionId: session.id }
        );
      }

      return newRequest;
    }),

  listRescheduleRequests: authedQuery
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const isAdmin = ["super_admin", "admin"].includes(ctx.user.role);
      const isTeacher = ctx.user.role === "teacher";

      if (!isAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view reschedule requests." });
      }

      const filters = [];
      if (input?.status) {
        filters.push(eq(oneToOneRescheduleRequests.status, input.status));
      }
      if (isTeacher) {
        filters.push(eq(oneToOneRescheduleRequests.requestedBy, ctx.user.id));
      }

      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.oneToOneRescheduleRequests.findMany({
        where,
        orderBy: desc(oneToOneRescheduleRequests.requestedAt),
        with: {
          session: {
            with: {
              teacher: true,
              student: {
                with: { profile: true }
              }
            }
          },
          requestedByUser: true,
          resolvedByUser: true,
        }
      });
    }),

  resolveRescheduleRequest: authedQuery
    .input(z.object({
      requestId: z.number(),
      status: z.enum(["approved", "rejected"]),
      proposedScheduledAt: z.date().optional(),
      adminRemarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["super_admin", "admin", "academic_head"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Admins can approve or reject reschedule requests." });
      }
      const db = getDb();
      const request = await db.query.oneToOneRescheduleRequests.findFirst({
        where: eq(oneToOneRescheduleRequests.id, input.requestId),
        with: {
          session: true,
        }
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Reschedule request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This request has already been resolved." });
      }

      // Update the request status and remarks
      await db.update(oneToOneRescheduleRequests).set({
        status: input.status,
        adminRemarks: input.adminRemarks ?? null,
        resolvedAt: new Date(),
        resolvedBy: ctx.user.id,
      }).where(eq(oneToOneRescheduleRequests.id, input.requestId));

      const session = request.session;

      if (input.status === "approved") {
        const finalTime = input.proposedScheduledAt || request.proposedScheduledAt;
        const validUntil = new Date(finalTime);
        validUntil.setDate(validUntil.getDate() + 60);

        // Update the 1-to-1 session itself
        await db.update(oneToOneSessions).set({
          scheduledAt: finalTime,
          status: "rescheduled",
          validFrom: finalTime,
          validUntil,
          reminder1DaySentAt: null,
          reminder1HourSentAt: null,
          reminder10MinSentAt: null,
        }).where(eq(oneToOneSessions.id, session.id));

        const timeStr = new Date(finalTime).toLocaleString();

        // Notify Student and Teacher
        await sendNotification(
          session.studentId,
          `1-to-1 Session Rescheduled: ${session.title}`,
          `Your 1-to-1 session "${session.title}" has been rescheduled to ${timeStr}.`,
          "class_scheduled",
          { sessionId: session.id }
        );

        await sendNotification(
          session.teacherId,
          `Reschedule Approved: ${session.title}`,
          `Your request to reschedule 1-to-1 session "${session.title}" has been approved. New time: ${timeStr}.`,
          "class_scheduled",
          { sessionId: session.id }
        );
      } else {
        // Update the 1-to-1 session status back to scheduled
        await db.update(oneToOneSessions).set({
          status: "scheduled",
        }).where(eq(oneToOneSessions.id, session.id));

        // Notify Student of rejection
        await sendNotification(
          session.studentId,
          `Reschedule Rejected: ${session.title}`,
          `The request to reschedule your 1-to-1 session "${session.title}" has been rejected.`,
          "reschedule_request_rejected",
          { sessionId: session.id }
        );

        // Notify Teacher of rejection
        await sendNotification(
          session.teacherId,
          `Reschedule Rejected: ${session.title}`,
          `Your request to reschedule 1-to-1 session "${session.title}" has been rejected. Remarks: ${input.adminRemarks || "None"}`,
          "reschedule_request_rejected",
          { sessionId: session.id }
        );
      }

      return { success: true };
    }),

  startOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && session.teacherId === ctx.user.id;

      if (!isSuperAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to start this session." });
      }

      const updateData: any = {
        status: "ongoing",
        lastHeartbeatAt: new Date(),
      };

      if (isTeacher) {
        updateData.teacherAttendance = "present";
      }

      await db.update(oneToOneSessions).set(updateData).where(eq(oneToOneSessions.id, input.sessionId));

      await sendNotification(
        session.studentId,
        `1-to-1 Session Started: ${session.title}`,
        `Your session "${session.title}" has started. Join now!`,
        "class_started",
        { sessionId: session.id }
      );

      const io = getIo();
      if (io) {
        io.emit("class:updated");

        // Emit direct call event to the student's personal socket room
        const teacherName = ctx.user.role === "teacher" ? ctx.user.name : "Your Teacher";
        io.to(`user:${session.studentId}`).emit("1to1:incoming_call", {
          sessionId: session.id,
          title: session.title,
          teacherName: teacherName,
          roomName: session.meetingRoomId
        });
      }

      let jwt: string | null = null;
      const jitsiAppId = process.env.JITSI_APP_ID;
      const jitsiAppSecret = process.env.JITSI_APP_SECRET;
      const roomName = session.meetingRoomId || `emtees-1to1-${session.id}`;
      if (jitsiAppId && jitsiAppSecret) {
        const userDetails = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
        jwt = await generateJitsiToken({
          room: roomName,
          userName: ctx.user.name,
          userEmail: userDetails?.email || undefined,
          userId: String(ctx.user.id),
          isModerator: true,
          appId: jitsiAppId,
          appSecret: jitsiAppSecret,
        });
      }

      return { success: true, jwt, roomName, isModerator: true };
    }),

  joinOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
        with: { teacher: true, student: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && session.teacherId === ctx.user.id;
      const isStudent = ctx.user.role === "student" && session.studentId === ctx.user.id;

      if (!isSuperAdmin && !isTeacher && !isStudent) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to join this session." });
      }

      if (isStudent) {
        if (session.status !== "ongoing") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Class has not started yet. Please wait for the teacher to start the session." });
        }
        await db.update(oneToOneSessions)
          .set({ studentAttendance: "present" })
          .where(eq(oneToOneSessions.id, input.sessionId));
      }

      if (isTeacher) {
        await db.update(oneToOneSessions)
          .set({ teacherAttendance: "present" })
          .where(eq(oneToOneSessions.id, input.sessionId));
      }

      const roomName = session.meetingRoomId || `emtees-1to1-${session.id}`;
      const isModerator = ["super_admin", "teacher"].includes(ctx.user.role);

      let jwt: string | null = null;
      const jitsiAppId = process.env.JITSI_APP_ID;
      const jitsiAppSecret = process.env.JITSI_APP_SECRET;
      if (jitsiAppId && jitsiAppSecret) {
        const userDetails = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
        jwt = await generateJitsiToken({
          room: roomName,
          userName: ctx.user.name,
          userEmail: userDetails?.email || undefined,
          userId: String(ctx.user.id),
          isModerator,
          appId: jitsiAppId,
          appSecret: jitsiAppSecret,
        });
      }

      console.log("[joinOneToOne] Generated JWT:", jwt);

      return {
        sessionId: session.id,
        roomName,
        jwt,
        isModerator,
        title: session.title,
        scheduledAt: session.scheduledAt,
        teacherName: session.teacher?.name,
      };
    }),

  trackOneToOneHeartbeat: authedQuery
    .input(z.object({
      sessionId: z.number(),
      bothPresent: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const updateData: any = {};
      
      // Only moderators (Teacher/Admin) keep the class alive. 
      // If they leave, the student's heartbeat should NOT prevent the 5-minute auto-closer.
      if (ctx.user.role !== "student") {
        updateData.lastHeartbeatAt = new Date();
      }

      if (input.bothPresent) {
        updateData.actualDuration = sql`COALESCE(${oneToOneSessions.actualDuration}, 0) + 1`;
      }

      if (ctx.user.role === "teacher") {
        updateData.teacherAttendance = "present";
        updateData.teacherDuration = sql`COALESCE(${oneToOneSessions.teacherDuration}, 0) + 1`;
      } else if (ctx.user.role === "student") {
        updateData.studentAttendance = "present";
        updateData.studentDuration = sql`COALESCE(${oneToOneSessions.studentDuration}, 0) + 1`;
      }

      await db.update(oneToOneSessions)
        .set(updateData)
        .where(eq(oneToOneSessions.id, input.sessionId));

      return { success: true };
    }),

  endOneToOne: authedQuery
    .input(z.object({
      sessionId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      const isTeacher = ctx.user.role === "teacher" && session.teacherId === ctx.user.id;

      if (!isAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to end this session." });
      }

      const endedAt = new Date();
      const startedAt = session.startedAt || session.scheduledAt;
      const actualDuration = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

      const teacherAttendance = session.teacherAttendance || "absent";
      const studentAttendance = session.studentAttendance || "absent";

      await db.update(oneToOneSessions).set({
        status: "completed",
        endedAt,
        actualDuration: sql`CASE WHEN ${oneToOneSessions.actualDuration} > 0 THEN ${oneToOneSessions.actualDuration} ELSE ${actualDuration > 0 ? actualDuration : 0} END`,
        teacherAttendance,
        studentAttendance,
        completedAt: endedAt,
      }).where(eq(oneToOneSessions.id, input.sessionId));

      await evaluateClassCompletion(undefined, input.sessionId);

      await updateStudentSessionBalances(db, session.studentId);

      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return { success: true };
    }),

  // Task 11.1 — complete a one-to-one session with duration validation
  completeOneToOne: teacherQuery
    .input(z.object({
      sessionId: z.number(),
      actualDurationMinutes: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const session = await db.query.oneToOneSessions.findFirst({
        where: eq(oneToOneSessions.id, input.sessionId),
      });
      if (!session) throw new Error("Session not found");
      if (session.teacherId !== ctx.user.id) throw new Error("Not authorized");

      const { sessionLength, actualDurationMinutes: dur } = { ...session, actualDurationMinutes: input.actualDurationMinutes };

      let valid = false;
      if (sessionLength === 30) {
        valid = dur >= 25 && dur <= 40;
      } else if (sessionLength === 45) {
        valid = dur >= 35 && dur <= 60;
      } else {
        // For other lengths, accept within ±20% tolerance
        valid = dur >= sessionLength * 0.8 && dur <= sessionLength * 1.5;
      }

      if (!valid) {
        throw new Error(
          `Duration ${dur} min is outside the acceptable range for a ${sessionLength}-min session.`,
        );
      }

      await db.update(oneToOneSessions)
        .set({ status: "completed", completedAt: new Date(), actualDuration: input.actualDurationMinutes })
        .where(eq(oneToOneSessions.id, input.sessionId));

      await evaluateClassCompletion(undefined, input.sessionId);

      // Recalculate salary for this teacher and month
      const monthStr = new Date(session.scheduledAt).toISOString().substring(0, 7);
      await recalculateSalaryInternal(db, session.teacherId, monthStr);

      await updateStudentSessionBalances(db, session.studentId);

      return { success: true };
    }),

  // Task 11.3 — update/delete session recording (admin-only)
  updateSessionRecording: adminQuery
    .input(z.object({
      sessionId: z.number(),
      recordingUrl: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(oneToOneSessions)
        .set({ recordingUrl: input.recordingUrl })
        .where(eq(oneToOneSessions.id, input.sessionId));
      return { success: true };
    }),

  deleteSessionRecording: adminQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(oneToOneSessions)
        .set({ recordingUrl: null, recordingDeletedAt: new Date() })
        .where(eq(oneToOneSessions.id, input.sessionId));
      return { success: true };
    }),

  // Task 11.5 — student session summary
  mySessionSummary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const allSessions = await db.query.oneToOneSessions.findMany({
      where: eq(oneToOneSessions.studentId, ctx.user.id),
    });
    const completed = allSessions.filter((s) => s.status === "completed").length;
    const total = allSessions.length;
    return { completed, remaining: total - completed };
  }),

  // Task 11.6 — teacher session summary
  teacherSessionSummary: teacherQuery
    .input(z.object({ teacherId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const teacherId = input?.teacherId ?? ctx.user.id;
      const allSessions = await db.query.oneToOneSessions.findMany({
        where: eq(oneToOneSessions.teacherId, teacherId),
      });
      const totalHandled = allSessions.filter((s) => s.status === "completed").length;
      // Earnings calculation: return 0 until rate configuration is available
      const totalEarnings = 0;
      return { totalHandled, totalEarnings };
    }),

  // ─── Attendance ──────────────────────────────────────────────────────────────

  getAttendance: teacherQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.query.attendance.findMany({
        where: eq(attendance.classId, input.classId),
        with: {
          student: {
            with: { profile: true }
          }
        },
      });
    }),

  recordAttendance: teacherQuery
    .input(z.object({
      classId: z.number(),
      studentId: z.number(),
      chatCount: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const status = (input.chatCount >= 4 ? "present" : "absent") as "present" | "absent" | "late";
      
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
        with: { batch: true },
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      const teacherId = cls.teacherId;
      const batchId = cls.batchId;
      const moduleId = cls.batch?.moduleId ? Number(cls.batch.moduleId) : null;
      const meetingId = cls.meetingRoomId;
      const attendanceDate = cls.scheduledAt;
      const sessionType = cls.classType || "group";
      const duration = cls.duration || 0;

      const existing = await db.query.attendance.findFirst({
        where: and(eq(attendance.classId, input.classId), eq(attendance.studentId, input.studentId)),
      });

      const attendanceData = {
        classId: input.classId,
        studentId: input.studentId,
        teacherId,
        batchId,
        moduleId,
        meetingId,
        attendanceDate,
        sessionType,
        duration,
        chatCount: input.chatCount,
        status,
        updatedBy: ctx.user.id,
        recordedAt: new Date(),
      };

      if (existing) {
        await db.update(attendance)
          .set(attendanceData)
          .where(eq(attendance.id, existing.id));
      } else {
        await db.insert(attendance).values({
          ...attendanceData,
          createdBy: ctx.user.id,
        });
      }

      if (status === "present") {
        const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
        if (cls) {
          await db.update(attendanceAlerts)
            .set({ status: "resolved", resolvedAt: new Date() })
            .where(and(
              eq(attendanceAlerts.studentId, input.studentId),
              eq(attendanceAlerts.batchId, cls.batchId),
              eq(attendanceAlerts.status, "active")
            ));
        }
      }

      // Check for consecutive absences (threshold configurable in system_settings)
      const absentSetting = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, "absent_consecutive_threshold") });
      const absentThreshold = absentSetting ? parseInt(absentSetting.value) || 7 : 7;
      const lastN = await db.query.attendance.findMany({
        where: eq(attendance.studentId, input.studentId),
        orderBy: desc(attendance.recordedAt),
        limit: absentThreshold,
      });
      if (lastN.length === absentThreshold && lastN.every((r) => r.status === "absent")) {
        const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
        if (cls) {
          const batch = await db.query.batches.findFirst({ where: eq(batches.id, cls.batchId) });
          const adminIds = await getAdminUserIds();
          await sendNotification(input.studentId, "Absence Alert", `You have been absent for ${absentThreshold} consecutive classes`, "absence_alert");
          if (batch?.teacherId) {
            await sendNotification(batch.teacherId, "Student Absence Alert", `A student has been absent for ${absentThreshold} consecutive classes`, "absence_alert");
          }
          if (adminIds.length > 0) {
            await sendBulkNotification(adminIds, "Student Absence Alert", `A student has been absent for ${absentThreshold} consecutive classes`, "absence_alert");
          }
        }
      }

      // Task 17.1 — attendance streak badge (feature-flagged)
      if (process.env.FEATURE_GAMIFICATION === "true" && status === "present") {
        const recentAttendance = await db.query.attendance.findMany({
          where: eq(attendance.studentId, input.studentId),
          orderBy: desc(attendance.recordedAt),
          limit: 30,
        });

        // Count consecutive present records from the most recent
        let streak = 0;
        for (const record of recentAttendance) {
          if (record.status === "present") {
            streak++;
          } else {
            break;
          }
        }

        if (streak === 7 || streak === 30) {
          const badgeLabel = streak === 7 ? "7-Day Streak" : "30-Day Streak";
          const profile = await db.query.profiles.findFirst({
            where: eq(profiles.userId, input.studentId),
          });
          if (profile) {
            const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
            timeline.push({
              type: "badge",
              badge: badgeLabel,
              timestamp: new Date().toISOString(),
            });
            await db.update(profiles)
              .set({ activityTimeline: timeline })
              .where(eq(profiles.userId, input.studentId));
          }
        }
      }

      await updateStudentSessionBalances(db, input.studentId);

      return { success: true, status };
    }),

  myAttendance: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.attendance.findMany({
      where: eq(attendance.studentId, ctx.user.id),
      with: { class: true },
    });
  }),

  recordJoinTime: authedQuery
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new Error("Class not found");

      // Verify student is enrolled in any batch linked to this class
      if (ctx.user.role === "student") {
        if (await isStudentFeeRestricted(ctx.user.id)) {
          throw new Error("Access Restricted Due to Outstanding Fees.");
        }

        const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
        const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

        const enrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            inArray(batchEnrollments.batchId, classBatchIds),
            eq(batchEnrollments.studentId, ctx.user.id),
            or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
          ),
        });
        if (!enrollment) {
          throw new Error("You are not authorized to join this class session.");
        }

        // Verify approved join request
        const joinReq = await db.query.classJoinRequests.findFirst({
          where: and(
            eq(classJoinRequests.classId, cls.id),
            eq(classJoinRequests.studentId, ctx.user.id)
          ),
        });
        if (!joinReq || joinReq.status !== "approved") {
          throw new Error("You are not authorized to join this class session. Request not approved.");
        }
      }

      // Record join time
      const existing = await db.query.attendance.findFirst({
        where: and(eq(attendance.classId, input.classId), eq(attendance.studentId, ctx.user.id)),
      });

      if (existing) {
        await db.update(attendance)
          .set({ joinedAt: new Date(), status: "present" })
          .where(eq(attendance.id, existing.id));
      } else {
        await db.insert(attendance).values({
          classId: input.classId,
          studentId: ctx.user.id,
          joinedAt: new Date(),
          status: "present",
        });
      }

      // Resolve active attendance alerts on class join
      if (cls) {
        const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
        const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));
        await db.update(attendanceAlerts)
          .set({ status: "resolved", resolvedAt: new Date() })
          .where(and(
            eq(attendanceAlerts.studentId, ctx.user.id),
            inArray(attendanceAlerts.batchId, classBatchIds),
            eq(attendanceAlerts.status, "active")
          ));
      }

      await updateStudentSessionBalances(db, ctx.user.id);

      return { success: true };
    }),

  getJoinStatus: authedQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      if (["super_admin", "teacher", "admin", "academic_head"].includes(ctx.user.role)) {
        return {
          isEnrolled: true,
          status: "approved" as const,
          meetingRoomId: cls.meetingRoomId,
        };
      }

      const isRestricted = ctx.user.role === "student" ? await isStudentFeeRestricted(ctx.user.id) : false;
      if (isRestricted) {
        return {
          isEnrolled: false,
          status: "none" as const,
          meetingRoomId: null,
        };
      }

      // Check batch enrollment
      const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
      const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

      const enrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          inArray(batchEnrollments.batchId, classBatchIds),
          eq(batchEnrollments.studentId, ctx.user.id),
          or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
        ),
      });

      if (!enrollment) {
        return {
          isEnrolled: false,
          status: "none" as const,
          meetingRoomId: null,
        };
      }

      const reqRecord = await db.query.classJoinRequests.findFirst({
        where: and(
          eq(classJoinRequests.classId, cls.id),
          eq(classJoinRequests.studentId, ctx.user.id)
        ),
      });

      return {
        isEnrolled: true,
        status: (reqRecord?.status || "none") as "pending" | "approved" | "declined" | "none",
        meetingRoomId: cls.meetingRoomId,
      };
    }),

  requestJoin: authedQuery
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      if (ctx.user.role === "student") {
        if (await isStudentFeeRestricted(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access Restricted Due to Outstanding Fees." });
        }

        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, ctx.user.id),
        });
        if (!profile || (profile.remainingGroupSessions ?? 0) <= 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You have exhausted your allocated Group sessions. Cannot join this class.",
          });
        }
      }

      // Verify batch enrollment
      const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
      const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

      const enrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          inArray(batchEnrollments.batchId, classBatchIds),
          eq(batchEnrollments.studentId, ctx.user.id),
          or(eq(batchEnrollments.status, "active"), eq(batchEnrollments.status, "restricted"))
        ),
      });
      if (!enrollment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not enrolled in any batch linked to this class." });
      }

      // Upsert request
      const existing = await db.query.classJoinRequests.findFirst({
        where: and(
          eq(classJoinRequests.classId, input.classId),
          eq(classJoinRequests.studentId, ctx.user.id)
        ),
      });

      if (existing) {
        await db.update(classJoinRequests)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(classJoinRequests.id, existing.id));
      } else {
        await db.insert(classJoinRequests).values({
          classId: input.classId,
          studentId: ctx.user.id,
          status: "pending",
        });
      }

      // Retrieve student details for real-time notification
      const student = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
      });

      // Emit to class room so host/teacher receives notification instantly
      const io = getIo();
      if (io) {
        io.to(`class:${input.classId}`).emit("class:join_request_new", {
          classId: input.classId,
          studentId: ctx.user.id,
          studentName: student?.name || "Unknown Student",
          studentUnionId: student?.unionId || "",
          status: "pending",
        });
      }

      return { success: true, status: "pending" as const };
    }),

  listJoinRequests: authedQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Only super_admin or assigned teacher can list requests
      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isSuperAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only class hosts can view join requests." });
      }

      // Fetch requests along with student details
      const list = await db.query.classJoinRequests.findMany({
        where: eq(classJoinRequests.classId, input.classId),
        orderBy: desc(classJoinRequests.createdAt),
        with: {
          student: {
            with: { profile: true }
          },
        },
      });

      return list.map(req => ({
        id: req.id,
        classId: req.classId,
        studentId: req.studentId,
        status: req.status,
        createdAt: req.createdAt,
        studentName: req.student?.name || "Unknown Student",
        studentUnionId: req.student?.profile?.enrollmentId || req.student?.unionId || "",
      }));
    }),

  approveJoinRequest: authedQuery
    .input(z.object({ classId: z.number(), studentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Permission check
      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isSuperAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only class hosts can approve requests." });
      }

      await db.update(classJoinRequests)
        .set({ status: "approved", updatedAt: new Date() })
        .where(and(
          eq(classJoinRequests.classId, input.classId),
          eq(classJoinRequests.studentId, input.studentId)
        ));

      // Emit sockets
      const io = getIo();
      if (io) {
        // Notify student personal room
        io.to(`user:${input.studentId}`).emit("class:join_request_status", {
          classId: input.classId,
          status: "approved",
        });

        // Notify class room for state sync
        io.to(`class:${input.classId}`).emit("class:join_request_updated", {
          studentId: input.studentId,
          status: "approved",
        });
      }

      return { success: true };
    }),

  declineJoinRequest: authedQuery
    .input(z.object({ classId: z.number(), studentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Permission check
      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isSuperAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only class hosts can decline requests." });
      }

      await db.update(classJoinRequests)
        .set({ status: "declined", updatedAt: new Date() })
        .where(and(
          eq(classJoinRequests.classId, input.classId),
          eq(classJoinRequests.studentId, input.studentId)
        ));

      // Emit sockets
      const io = getIo();
      if (io) {
        // Notify student personal room
        io.to(`user:${input.studentId}`).emit("class:join_request_status", {
          classId: input.classId,
          status: "declined",
        });

        // Notify class room for state sync
        io.to(`class:${input.classId}`).emit("class:join_request_updated", {
          studentId: input.studentId,
          status: "declined",
        });
      }

      return { success: true };
    }),

  approveAllJoinRequests: authedQuery
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      // Permission check
      const isSuperAdmin = ctx.user.role === "super_admin";
      const isTeacher = ctx.user.role === "teacher" && cls.teacherId === ctx.user.id;
      if (!isSuperAdmin && !isTeacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only class hosts can approve requests." });
      }

      // Fetch all pending requests
      const pendings = await db.query.classJoinRequests.findMany({
        where: and(
          eq(classJoinRequests.classId, input.classId),
          eq(classJoinRequests.status, "pending")
        ),
      });

      if (pendings.length > 0) {
        const studentIds = pendings.map(p => p.studentId);

        await db.update(classJoinRequests)
          .set({ status: "approved", updatedAt: new Date() })
          .where(and(
            eq(classJoinRequests.classId, input.classId),
            inArray(classJoinRequests.studentId, studentIds)
          ));

        const io = getIo();
        if (io) {
          // Notify each student personal room
          for (const sId of studentIds) {
            io.to(`user:${sId}`).emit("class:join_request_status", {
              classId: input.classId,
              status: "approved",
            });
          }

          // Notify class room
          io.to(`class:${input.classId}`).emit("class:join_request_updated_all", {
            classId: input.classId,
            status: "approved",
          });
        }
      }

      return { success: true };
    }),

  recordLeaveTime: authedQuery
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.attendance.findFirst({
        where: and(eq(attendance.classId, input.classId), eq(attendance.studentId, ctx.user.id)),
      });

      if (existing) {
        const now = new Date();
        const joinTime = existing.joinedAt ? new Date(existing.joinedAt) : null;
        const sessionDuration = joinTime
          ? Math.max(0, Math.floor((now.getTime() - joinTime.getTime()) / 1000))
          : 0;

        await db.update(attendance)
          .set({
            leftAt: now,
            duration: (existing.duration || 0) + sessionDuration,
          })
          .where(eq(attendance.id, existing.id));
      }

      return { success: true };
    }),

  listAttendanceAlerts: teacherQuery
    .input(
      z.object({
        status: z.enum(["active", "resolved", "all"]).default("active"),
        batchId: z.number().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (["academic_head", "student"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }

      const db = getDb();
      const user = ctx.user;

      const filters: any[] = [];

      // Filter by status
      if (input.status === "active") {
        filters.push(eq(attendanceAlerts.status, "active"));
      } else if (input.status === "resolved") {
        filters.push(eq(attendanceAlerts.status, "resolved"));
      }

      // Filter by batchId
      if (input.batchId) {
        filters.push(eq(attendanceAlerts.batchId, input.batchId));
      }

      // If the caller is a teacher, restrict to their batches
      if (user.role === "teacher") {
        const teacherBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, user.id));
        const batchIds = teacherBatches.map((b) => b.id);
        if (batchIds.length === 0) {
          return [];
        }
        filters.push(inArray(attendanceAlerts.batchId, batchIds));
      }

      // If search is provided, we filter by student name, username, unionId, or enrollmentId
      if (input.search) {
        const matchingStudents = await db
          .select({ id: users.id })
          .from(users)
          .leftJoin(profiles, eq(users.id, profiles.userId))
          .where(
            and(
              eq(users.role, "student"),
              or(
                ilike(users.name, "%" + input.search + "%"),
                ilike(users.username, "%" + input.search + "%"),
                ilike(users.unionId, "%" + input.search + "%"),
                ilike(profiles.enrollmentId, "%" + input.search + "%")
              )
            )
          );
        const studentIds = matchingStudents.map((s) => s.id);
        if (studentIds.length === 0) {
          return [];
        }
        filters.push(inArray(attendanceAlerts.studentId, studentIds));
      }

      // Fetch alerts with relations
      const list = await db.query.attendanceAlerts.findMany({
        where: and(...filters),
        orderBy: desc(attendanceAlerts.createdAt),
        with: {
          student: {
            with: { profile: true }
          },
          batch: {
            with: {
              teacher: true,
            },
          },
        },
      });

      return list;
    }),

  enrollAndJoin: authedQuery
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, input.classId),
      });
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });

      if (ctx.user.role !== "student") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only students can use this feature." });
      }

      if (await isStudentFeeRestricted(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Restricted Due to Outstanding Fees." });
      }

      // Check if the batch is active
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, cls.batchId),
        with: { module: true },
      });

      if (!batch || batch.status !== "active") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Enrollment is not allowed for this class batch." });
      }

      // Check if batch is full
      const activeEnrollments = await db.select({
        count: sql<number>`count(${batchEnrollments.id})::int`
      })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, batch.id), eq(batchEnrollments.status, "active")));

      const currentCount = Number(activeEnrollments[0]?.count || 0);
      const maxStudents = batch.maxStudents ?? 30;
      if (currentCount >= maxStudents) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This batch is already full." });
      }

      // 1. Create enrollment record / Add student to batch
      const existingEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, batch.id),
          eq(batchEnrollments.studentId, ctx.user.id)
        ),
      });

      if (!existingEnrollment) {
        await db.insert(batchEnrollments).values({
          batchId: batch.id,
          studentId: ctx.user.id,
          status: "active",
        });
      } else if (existingEnrollment.status !== "active") {
        await db.update(batchEnrollments)
          .set({ status: "active", leftAt: null })
          .where(eq(batchEnrollments.id, existingEnrollment.id));
      }

      // Update student profile batch/course settings and ensure they have group sessions allocated
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, ctx.user.id),
      });

      let newAllocatedGroup = profile ? (profile.allocatedGroupSessions ?? 0) : 0;
      if (newAllocatedGroup === 0) {
        newAllocatedGroup = 10;
      } else {
        newAllocatedGroup += 10;
      }

      const remainingGroup = newAllocatedGroup - (profile ? (profile.attendedGroupSessions ?? 0) : 0);
      const remainingOneToOne = profile ? (profile.remainingOneToOneSessions ?? 0) : 0;

      if (profile) {
        await db.update(profiles)
          .set({
            batch: batch.name,
            batchTime: batch.timeSlot,
            course: batch.module?.name || null,
            allocatedGroupSessions: newAllocatedGroup,
            remainingGroupSessions: remainingGroup,
            totalAllocatedSessions: newAllocatedGroup + (profile.allocatedOneToOneSessions ?? 0),
            totalRemainingSessions: remainingGroup + remainingOneToOne,
            activityTimeline: [
              ...(Array.isArray(profile.activityTimeline) ? profile.activityTimeline : []),
              { type: "enroll_and_join", batchId: batch.id, timestamp: new Date().toISOString() }
            ]
          })
          .where(eq(profiles.userId, ctx.user.id));
      } else {
        const nextEnrollmentId = await generateNextEnrollmentId();
        await db.insert(profiles).values({
          userId: ctx.user.id,
          enrollmentId: nextEnrollmentId,
          batch: batch.name,
          batchTime: batch.timeSlot,
          course: batch.module?.name || null,
          allocatedGroupSessions: 10,
          remainingGroupSessions: 10,
          totalAllocatedSessions: 10,
          totalRemainingSessions: 10,
          attendedOneToOneSessions: 0,
          attendedGroupSessions: 0,
          totalAttendedSessions: 0,
          activityTimeline: [{ type: "enroll_and_join", batchId: batch.id, timestamp: new Date().toISOString() }]
        });
      }

      // 2. Generate approved class join request to bypass lobby
      const existingJoinReq = await db.query.classJoinRequests.findFirst({
        where: and(
          eq(classJoinRequests.classId, cls.id),
          eq(classJoinRequests.studentId, ctx.user.id)
        ),
      });

      if (existingJoinReq) {
        await db.update(classJoinRequests)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(classJoinRequests.id, existingJoinReq.id));
      } else {
        await db.insert(classJoinRequests).values({
          classId: cls.id,
          studentId: ctx.user.id,
          status: "approved",
        });
      }

      // 3. Generate attendance entry
      const existingAttendance = await db.query.attendance.findFirst({
        where: and(eq(attendance.classId, cls.id), eq(attendance.studentId, ctx.user.id)),
      });

      if (existingAttendance) {
        await db.update(attendance)
          .set({ joinedAt: new Date(), status: "present" })
          .where(eq(attendance.id, existingAttendance.id));
      } else {
        await db.insert(attendance).values({
          classId: cls.id,
          studentId: ctx.user.id,
          joinedAt: new Date(),
          status: "present",
        });
      }

      // Resolve active attendance alerts on class join
      await db.update(attendanceAlerts)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(and(
          eq(attendanceAlerts.studentId, ctx.user.id),
          eq(attendanceAlerts.batchId, batch.id),
          eq(attendanceAlerts.status, "active")
        ));

      await updateStudentSessionBalances(db, ctx.user.id);

      // Create notification
      await db.insert(notifications).values({
        userId: ctx.user.id,
        title: "Enrollment Successful",
        message: `Successfully enrolled and joined class in batch "${batch.name}"!`,
        type: "enrollment_success",
      });

      // Broadcast update
      const io = getIo();
      if (io) {
        io.emit("class:updated");
      }

      return { success: true };
    }),

  getAttendanceReport: teacherQuery
    .input(z.object({
      teacherId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      moduleId: z.number().optional(),
      batchId: z.number().optional(),
      sessionType: z.enum(["group", "one_to_one"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(10),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const isTeacher = ctx.user.role === "teacher";
      
      // If user is teacher, enforce that they can only view their own report
      let targetTeacherId = input.teacherId;
      if (isTeacher && targetTeacherId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Teachers can only view their own attendance reports" });
      }

      // 1. Fetch Teacher Info
      const teacherInfo = await db.query.users.findFirst({
        where: eq(users.id, targetTeacherId),
      });
      if (!teacherInfo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found" });
      }

      // 2. Find batches assigned to this teacher
      const teacherBatches = await db.query.batches.findMany({
        where: eq(batches.teacherId, targetTeacherId),
        with: { module: true },
      });

      let targetBatchIds = teacherBatches.map(b => b.id);
      if (input.batchId) {
        targetBatchIds = targetBatchIds.filter(id => id === input.batchId);
      }
      if (input.moduleId) {
        targetBatchIds = teacherBatches
          .filter(b => b.moduleId === input.moduleId)
          .map(b => b.id);
      }

      if (targetBatchIds.length === 0) {
        return {
          teacher: {
            name: teacherInfo.name,
            id: teacherInfo.unionId || String(teacherInfo.id),
            department: teacherInfo.department || teacherInfo.specialization || "Academics",
            batches: teacherBatches.map(b => b.name),
            modules: Array.from(new Set(teacherBatches.map(b => b.module?.name).filter(Boolean))),
          },
          summary: {
            totalStudents: 0,
            totalClassesConducted: 0,
            presentCount: 0,
            absentCount: 0,
            attendancePct: 0,
            oneToOneCount: 0,
            groupCount: 0,
          },
          columns: [],
          students: [],
          pagination: {
            total: 0,
            pages: 0,
            page: input.page,
            limit: input.limit,
          }
        };
      }

      // 3. Find unique students enrolled in these batches
      const enrollmentsQuery = db
        .select({
          studentId: batchEnrollments.studentId,
          studentName: users.name,
          studentUnionId: users.unionId,
          batchId: batchEnrollments.batchId,
          batchName: batches.name,
          moduleId: modules.id,
          moduleName: modules.name,
        })
        .from(batchEnrollments)
        .innerJoin(users, eq(batchEnrollments.studentId, users.id))
        .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
        .innerJoin(modules, eq(batches.moduleId, modules.id))
        .where(
          and(
            inArray(batchEnrollments.batchId, targetBatchIds),
            eq(batchEnrollments.status, "active")
          )
        );

      const allEnrollments = await enrollmentsQuery;
      
      // Get unique students for pagination
      const uniqueStudentsMap = new Map();
      allEnrollments.forEach(e => {
        if (!uniqueStudentsMap.has(e.studentId)) {
          uniqueStudentsMap.set(e.studentId, {
            id: e.studentId,
            name: e.studentName,
            unionId: e.studentUnionId,
            batchId: e.batchId,
            batchName: e.batchName,
            moduleId: e.moduleId,
            moduleName: e.moduleName,
          });
        }
      });

      const uniqueStudents = Array.from(uniqueStudentsMap.values());
      const totalStudentsCount = uniqueStudents.length;
      
      // Paginate students
      const offset = (input.page - 1) * input.limit;
      const paginatedStudents = uniqueStudents.slice(offset, offset + input.limit);
      const paginatedStudentIds = paginatedStudents.map(s => s.id);

      // 4. Fetch classes/sessions conducted/scheduled for the target batches
      let startD = input.startDate ? new Date(input.startDate) : null;
      let endD = input.endDate ? new Date(input.endDate) : null;
      if (startD) startD.setHours(0,0,0,0);
      if (endD) endD.setHours(23,59,59,999);

      const classesQueryFilter = [
        inArray(classes.batchId, targetBatchIds),
        startD ? gte(classes.scheduledAt, startD) : undefined,
        endD ? lte(classes.scheduledAt, endD) : undefined,
        input.sessionType ? eq(classes.classType, input.sessionType) : undefined,
      ].filter(Boolean);

      const groupClasses = await db.query.classes.findMany({
        where: and(...classesQueryFilter as any),
        orderBy: asc(classes.scheduledAt),
      });

      // Fetch completed one-to-one sessions for this teacher and range
      const otoQueryFilter = [
        eq(oneToOneSessions.teacherId, targetTeacherId),
        eq(oneToOneSessions.status, "completed"),
        startD ? gte(oneToOneSessions.scheduledAt, startD) : undefined,
        endD ? lte(oneToOneSessions.scheduledAt, endD) : undefined,
      ].filter(Boolean);

      const oneToOnes = await db.query.oneToOneSessions.findMany({
        where: and(...otoQueryFilter as any),
        orderBy: asc(oneToOneSessions.scheduledAt),
      });

      const columnsList: any[] = [];
      
      groupClasses.forEach(c => {
        columnsList.push({
          id: `group-${c.id}`,
          classId: c.id,
          oneToOneSessionId: null,
          title: c.title,
          date: c.scheduledAt.toISOString().split("T")[0],
          dateTime: c.scheduledAt,
          type: "group",
          status: c.status,
          meetingId: c.meetingRoomId,
          duration: c.duration || 0,
        });
      });

      oneToOnes.forEach(s => {
        columnsList.push({
          id: `oto-${s.id}`,
          classId: null,
          oneToOneSessionId: s.id,
          title: s.title,
          date: s.scheduledAt.toISOString().split("T")[0],
          dateTime: s.scheduledAt,
          type: "one_to_one",
          status: "completed",
          meetingId: s.meetingRoomId,
          duration: s.actualDuration || s.sessionLength || 0,
          studentId: s.studentId,
        });
      });

      columnsList.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

      // Fetch holidays in the range
      const holidaysList = await db.query.holidays.findMany({
        where: and(
          startD ? gte(holidays.date, startD) : undefined,
          endD ? lte(holidays.date, endD) : undefined
        ),
      });
      const holidayDates = new Set(holidaysList.map(h => h.date.toISOString().split("T")[0]));

      // 5. Fetch attendance records
      const columnClassIds = columnsList.filter(c => c.type === "group").map(c => c.classId);
      const columnOtoIds = columnsList.filter(c => c.type === "one_to_one").map(c => c.oneToOneSessionId);

      const attendanceConditions = [];
      if (columnClassIds.length > 0) {
        attendanceConditions.push(inArray(attendance.classId, columnClassIds));
      }
      if (columnOtoIds.length > 0) {
        attendanceConditions.push(inArray(attendance.oneToOneSessionId, columnOtoIds));
      }

      let attendanceRecords: any[] = [];
      if (attendanceConditions.length > 0 && paginatedStudentIds.length > 0) {
        attendanceRecords = await db.query.attendance.findMany({
          where: and(
            inArray(attendance.studentId, paginatedStudentIds),
            or(...attendanceConditions)
          ),
          with: {
            class: true,
            teacher: true,
            batch: true,
            module: true,
          }
        });
      }

      // Calculate overall teacher stats
      let overallPresent = 0;
      let overallAbsent = 0;
      let overallConducted = columnsList.filter(c => c.status === "completed" || c.type === "one_to_one").length;
      let overallOneToOne = columnsList.filter(c => c.type === "one_to_one").length;
      let overallGroup = columnsList.filter(c => c.type === "group" && c.status === "completed").length;

      let allTeacherAttendance: any[] = [];
      if (attendanceConditions.length > 0) {
        allTeacherAttendance = await db.query.attendance.findMany({
          where: or(...attendanceConditions)
        });
      }

      allTeacherAttendance.forEach(a => {
        if (a.status === "present" || a.status === "late") overallPresent++;
        else if (a.status === "absent") overallAbsent++;
      });

      const teacherAttendancePct = (overallPresent + overallAbsent) > 0 
        ? Math.round((overallPresent / (overallPresent + overallAbsent)) * 100)
        : 100;

      // 6. Build Grid for paginated students
      const studentsData = paginatedStudents.map(student => {
        const studentCells: any[] = [];
        let presentDays = 0;
        let absentDays = 0;
        let scheduledClasses = 0;

        columnsList.forEach(col => {
          const colDateStr = col.date;
          
          let status: "present" | "absent" | "no_class" | "holiday" | "cancelled" = "no_class";
          let remarks = "";
          let record: any = null;

          if (holidayDates.has(colDateStr)) {
            status = "holiday";
          } else if (col.status === "cancelled") {
            status = "cancelled";
          } else {
            record = attendanceRecords.find(a => {
              if (col.type === "group") {
                return a.studentId === student.id && a.classId === col.classId;
              } else {
                return a.studentId === student.id && a.oneToOneSessionId === col.oneToOneSessionId;
              }
            });

            if (record) {
              status = (record.status === "present" || record.status === "late") ? "present" : "absent";
              remarks = record.remarks || "";
              
              if (status === "present") presentDays++;
              else absentDays++;
              scheduledClasses++;
            } else {
              if (col.type === "group" && col.status === "completed") {
                status = "absent";
                absentDays++;
                scheduledClasses++;
              } else if (col.type === "one_to_one" && col.studentId === student.id) {
                status = "absent";
                absentDays++;
                scheduledClasses++;
              }
            }
          }

          studentCells.push({
            columnId: col.id,
            classId: col.classId,
            oneToOneSessionId: col.oneToOneSessionId,
            status,
            date: colDateStr,
            time: col.dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            duration: record?.duration || col.duration || 0,
            teacherName: teacherInfo.name,
            studentName: student.name,
            moduleName: student.moduleName,
            batchName: student.batchName,
            remarks: remarks || record?.remarks || "",
            meetingId: col.meetingId || "",
            classType: col.type,
          });
        });

        const attendancePct = scheduledClasses > 0 
          ? Math.round((presentDays / scheduledClasses) * 100)
          : 100;

        return {
          id: student.id,
          name: student.name,
          unionId: student.unionId,
          batchName: student.batchName,
          moduleName: student.moduleName,
          cells: studentCells,
          summary: {
            presentDays,
            absentDays,
            scheduledClasses,
            attendancePct,
          }
        };
      });

      return {
        teacher: {
          name: teacherInfo.name,
          id: teacherInfo.unionId || String(teacherInfo.id),
          department: teacherInfo.department || teacherInfo.specialization || "Academics",
          batches: teacherBatches.map(b => b.name),
          modules: Array.from(new Set(teacherBatches.map(b => b.module?.name).filter(Boolean))),
        },
        summary: {
          totalStudents: totalStudentsCount,
          totalClassesConducted: overallConducted,
          presentCount: overallPresent,
          absentCount: overallAbsent,
          attendancePct: teacherAttendancePct,
          oneToOneCount: overallOneToOne,
          groupCount: overallGroup,
        },
        columns: columnsList.map(c => ({
          id: c.id,
          title: c.title,
          date: c.date,
          type: c.type,
        })),
        students: studentsData,
        pagination: {
          total: totalStudentsCount,
          pages: Math.ceil(totalStudentsCount / input.limit),
          page: input.page,
          limit: input.limit,
        }
      };
    }),

  listHolidays: adminQuery.query(async () => {
    const db = getDb();
    return db.query.holidays.findMany({
      orderBy: desc(holidays.date),
    });
  }),

  createHoliday: adminQuery
    .input(z.object({
      date: z.string(), // YYYY-MM-DD
      name: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(holidays).values({
        date: new Date(input.date),
        name: input.name,
        description: input.description,
      });
      return { success: true };
    }),

  deleteHoliday: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(holidays).where(eq(holidays.id, input.id));
      return { success: true };
    }),
});

