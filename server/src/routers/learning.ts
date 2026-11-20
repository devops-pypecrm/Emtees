import { z } from "zod";
import { eq, desc, asc, and, count, sql, inArray, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { modules, batches, batchEnrollments, profiles, users, flexibilityRequests, classes, oneToOneSessions, batchFeeAuditLogs, batchAuditLogs, payments, classBatches, studentFeeConfigurations, departments, departmentModules } from "@db/schema";
import { sendBulkNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getIo } from "../lib/socketInstance";
import { isStudentFeeRestricted, recalculateStudentFees } from "../lib/feeHelper";

function parseTimeSlot(timeSlot: string) {
  const cleanStr = timeSlot.trim().toUpperCase();
  const match1 = cleanStr.match(/^(\d+):(\d+)\s*(AM|PM)?$/);
  if (match1) {
    let hours = parseInt(match1[1], 10);
    const minutes = parseInt(match1[2], 10);
    const ampm = match1[3];
    if (ampm === "PM" && hours < 12) {
      hours += 12;
    } else if (ampm === "AM" && hours === 12) {
      hours = 0;
    }
    return { hours, minutes };
  }
  const match2 = cleanStr.match(/^(\d+)\s*(AM|PM)?$/);
  if (match2) {
    let hours = parseInt(match2[1], 10);
    const ampm = match2[2];
    if (ampm === "PM" && hours < 12) {
      hours += 12;
    } else if (ampm === "AM" && hours === 12) {
      hours = 0;
    }
    return { hours, minutes: 0 };
  }
  return { hours: 9, minutes: 0 };
}

export const learningRouter = createRouter({
  // Modules
  listModules: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    
    let where;
    if (ctx.user.role === "academic_head") {
      const dept = await db.query.departments.findFirst({
        where: eq(departments.headUserId, ctx.user.id),
        with: { departmentModules: true }
      });
      if (!dept || dept.departmentModules.length === 0) {
        return [];
      }
      const moduleIds = dept.departmentModules.map((dm: any) => dm.moduleId);
      where = inArray(modules.id, moduleIds);
    }

    return db.query.modules.findMany({
      where,
      orderBy: desc(modules.createdAt),
      with: { batches: true, teacher: true, departmentModules: true },
    });
  }),

  createModule: adminQuery
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      learningObjectives: z.string().optional(),
      topics: z.string().optional(),
      teacherId: z.number().optional(),
      duration: z.string().optional(),
      maxStudents: z.number().optional(),
      minStudents: z.number().optional(),
      status: z.string().optional(),
      courseFee: z.number().or(z.string()).optional(),
      minimumDownPayment: z.number().or(z.string()).optional(),
      departmentId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { courseFee, minimumDownPayment, departmentId, ...rest } = input;
      const values: any = { ...rest };
      if (courseFee !== undefined) values.courseFee = String(courseFee);
      if (minimumDownPayment !== undefined) values.minimumDownPayment = String(minimumDownPayment);

      const result = await db.insert(modules).values(values).returning({ id: modules.id });
      const moduleId = result[0]?.id;

      if (moduleId && departmentId) {
        await db.insert(departmentModules).values({
          departmentId,
          moduleId,
        });
      }

      return db.query.modules.findFirst({
        where: eq(modules.id, moduleId),
        with: { teacher: true },
      });
    }),

  updateModule: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      learningObjectives: z.string().optional(),
      topics: z.string().optional(),
      teacherId: z.number().nullable().optional(),
      duration: z.string().optional(),
      maxStudents: z.number().optional(),
      minStudents: z.number().optional(),
      status: z.string().optional(),
      courseFee: z.number().or(z.string()).optional(),
      minimumDownPayment: z.number().or(z.string()).optional(),
      departmentId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, courseFee, minimumDownPayment, departmentId, ...rest } = input;
      const data: any = { ...rest };
      if (courseFee !== undefined) data.courseFee = String(courseFee);
      if (minimumDownPayment !== undefined) data.minimumDownPayment = String(minimumDownPayment);

      await db.update(modules)
        .set(data)
        .where(eq(modules.id, id));

      if (departmentId !== undefined) {
        // Delete old mapping if exists, then insert new one
        await db.delete(departmentModules).where(eq(departmentModules.moduleId, id));
        if (departmentId > 0) {
          await db.insert(departmentModules).values({
            departmentId,
            moduleId: id,
          });
        }
      }

      return db.query.modules.findFirst({
        where: eq(modules.id, id),
        with: { teacher: true },
      });
    }),

  // Batches
  listBatches: authedQuery
    .input(z.object({ moduleId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      let conditions = [];
      if (input?.moduleId) conditions.push(eq(batches.moduleId, input.moduleId));

      if (ctx.user.role === "academic_head") {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.headUserId, ctx.user.id),
          with: { departmentModules: true }
        });
        if (!dept || dept.departmentModules.length === 0) {
          return [];
        }
        const moduleIds = dept.departmentModules.map((dm: any) => dm.moduleId);
        conditions.push(inArray(batches.moduleId, moduleIds));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.query.batches.findMany({
        where,
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  getMatchingWaitingStudents: adminQuery
    .input(z.object({
      moduleId: z.number(),
      timeSlot: z.string(),
      sessionType: z.enum(["group", "both"]).default("group"),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const unassignedStudents = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          unionId: users.unionId,
          moduleId: profiles.moduleId,
          preferredClassTime: profiles.preferredClassTime,
          sessionType: profiles.sessionType,
          enrollmentStatus: profiles.enrollmentStatus,
        })
        .from(users)
        .innerJoin(profiles, eq(users.id, profiles.userId))
        .where(
          and(
            eq(users.role, "student"),
            eq(users.status, "active")
          )
        );

      const activeEnrollments = await db
        .select({ studentId: batchEnrollments.studentId })
        .from(batchEnrollments)
        .where(eq(batchEnrollments.status, "active"));
      const enrolledStudentIds = new Set(activeEnrollments.map(e => e.studentId));

      const cleanTargetSlot = input.timeSlot.trim().toLowerCase();

      return unassignedStudents.filter((student) => {
        if (enrolledStudentIds.has(student.id)) return false;
        if (student.sessionType === "one_on_one") return false;
        if (student.moduleId && Number(student.moduleId) !== input.moduleId) return false;

        const studentTime = (student.preferredClassTime || "").trim().toLowerCase();
        if (studentTime && cleanTargetSlot && studentTime !== cleanTargetSlot && !cleanTargetSlot.includes(studentTime) && !studentTime.includes(cleanTargetSlot)) {
          return false;
        }

        return true;
      });
    }),

  createBatch: adminQuery
    .input(z.object({
      moduleId: z.number(),
      name: z.string(),
      timeSlot: z.string().optional(),
      sessionType: z.enum(["group", "both"]).default("group"),
      teacherId: z.number().optional(),
      maxStudents: z.number().optional(),
      startDate: z.date().optional(),
      duration: z.string().optional(),
      courseFee: z.number().optional(),
      studentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { courseFee, studentIds, sessionType, ...rest } = input;
      const result = await db.insert(batches).values({
        ...rest,
        sessionType: sessionType || "group",
        courseFee: courseFee !== undefined ? String(courseFee) : undefined,
      }).returning({ id: batches.id });

      const batchId = result[0]?.id;

      if (batchId && studentIds && studentIds.length > 0) {
        for (const sId of studentIds) {
          await db.insert(batchEnrollments).values({
            batchId,
            studentId: sId,
            status: "active",
            paymentType: "FULL_PAYMENT",
            moduleId: input.moduleId,
            oneOnOne30Allocated: 0,
            oneOnOne45Allocated: 0,
            oneOnOne60Allocated: 0,
            group30Allocated: 0,
            group45Allocated: 0,
            group60Allocated: 0,
            assignedTeachers: input.teacherId ? [input.teacherId] : [],
          });
          await db.update(profiles).set({
            batch: input.name,
            batchTime: input.timeSlot || "",
            enrollmentStatus: "enrolled",
          }).where(eq(profiles.userId, sId));
        }
      }

      if (batchId && input.teacherId) {
        // Prepare group classes to schedule
        const groupClassesToSchedule: { title: string; duration: number }[] = [];
        const group30 = 0;
        const group45 = 0;
        const group60 = 0;

        for (let i = 1; i <= group30; i++) {
          groupClassesToSchedule.push({ title: `${input.name} - Group Session (30 Min) ${i}`, duration: 30 });
        }
        for (let i = 1; i <= group45; i++) {
          groupClassesToSchedule.push({ title: `${input.name} - Group Session (45 Min) ${i}`, duration: 45 });
        }
        for (let i = 1; i <= group60; i++) {
          groupClassesToSchedule.push({ title: `${input.name} - Group Session (60 Min) ${i}`, duration: 60 });
        }

        if (groupClassesToSchedule.length > 0) {
          const start = input.startDate ? new Date(input.startDate) : new Date();
          const { hours, minutes } = parseTimeSlot(input.timeSlot || "9:00 AM");

          for (let i = 0; i < groupClassesToSchedule.length; i++) {
            const item = groupClassesToSchedule[i];
            const scheduledAt = new Date(start);
            scheduledAt.setDate(start.getDate() + i);
            scheduledAt.setHours(hours, minutes, 0, 0);

            const slug = item.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().substring(0, 50);
            const roomName = `emtees-${slug}-${crypto.randomUUID().substring(0, 8)}`;

            const [newClass] = await db.insert(classes).values({
              batchId,
              teacherId: input.teacherId,
              title: item.title,
              classType: "group",
              status: "scheduled",
              scheduledAt,
              duration: item.duration,
              meetingRoomId: roomName,
              meetingUrl: `https://meet.gecouncil.com/${roomName}`,
            }).returning();

            if (newClass) {
              await db.insert(classBatches).values({
                classId: newClass.id,
                batchId,
              });
            }
          }

          const io = getIo();
          if (io) {
            io.emit("class:updated");
          }
        }
      }

      return db.query.batches.findFirst({ where: eq(batches.id, batchId), with: { module: true } });
    }),

  updateBatchFee: adminQuery
    .input(z.object({
      batchId: z.number(),
      courseFee: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can modify batch fee
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }

      // Validate courseFee is a positive numeric value
      if (input.courseFee <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Fee amount must be a positive number.",
        });
      }

      const db = getDb();

      // Retrieve current batch to get previous fee
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });

      if (!batch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Batch not found.",
        });
      }

      const previousFeeStr = batch.courseFee ?? "0";
      const updatedFeeStr = String(input.courseFee);

      // Update the batch fee and insert an audit log inside a transaction
      await db.transaction(async (tx) => {
        await tx.update(batches)
          .set({ courseFee: updatedFeeStr })
          .where(eq(batches.id, input.batchId));

        await tx.insert(batchFeeAuditLogs).values({
          batchId: input.batchId,
          previousFee: previousFeeStr,
          updatedFee: updatedFeeStr,
          adminId: ctx.user.id,
        });
      });

      // Refetch and return the updated batch
      return db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  updateBatch: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      timeSlot: z.string().optional(),
      teacherId: z.number().nullable().optional(),
      maxStudents: z.number().optional(),
      status: z.string().optional(),
      moduleId: z.number().optional(),
      startDate: z.date().nullable().optional(),
      duration: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can edit batch details
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }

      const db = getDb();
      const { id, ...data } = input;

      const existing = await db.query.batches.findFirst({
        where: eq(batches.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Batch not found.",
        });
      }

      // We need to compare changes and record them in batchAuditLogs
      const logsToInsert: {
        batchId: number;
        fieldName: string;
        previousValue: string | null;
        newValue: string | null;
        changedBy: number;
      }[] = [];

      const addLog = (field: string, prev: string | null, nextVal: string | null) => {
        if (prev !== nextVal) {
          logsToInsert.push({
            batchId: id,
            fieldName: field,
            previousValue: prev,
            newValue: nextVal,
            changedBy: ctx.user.id,
          });
        }
      };

      if (data.name !== undefined) addLog("name", existing.name, data.name);
      if (data.description !== undefined) addLog("description", existing.description, data.description);
      if (data.timeSlot !== undefined) addLog("timeSlot", existing.timeSlot, data.timeSlot);
      if (data.maxStudents !== undefined) addLog("maxStudents", existing.maxStudents?.toString() || null, data.maxStudents?.toString() || null);
      if (data.status !== undefined) addLog("status", existing.status, data.status);
      if (data.duration !== undefined) addLog("duration", existing.duration, data.duration);
      if (data.startDate !== undefined) {
        const prevStr = existing.startDate ? existing.startDate.toISOString() : null;
        const nextStr = data.startDate ? data.startDate.toISOString() : null;
        addLog("startDate", prevStr, nextStr);
      }

      if (data.teacherId !== undefined) {
        const prevId = existing.teacherId;
        const nextId = data.teacherId;
        if (prevId !== nextId) {
          let prevName = "Not assigned";
          let nextName = "Not assigned";
          if (prevId) {
            const t = await db.query.users.findFirst({ where: eq(users.id, prevId) });
            if (t) prevName = `${t.name} (ID: ${t.unionId})`;
          }
          if (nextId) {
            const t = await db.query.users.findFirst({ where: eq(users.id, nextId) });
            if (t) nextName = `${t.name} (ID: ${t.unionId})`;
          }
          addLog("teacher", prevName, nextName);
        }
      }

      if (data.moduleId !== undefined) {
        const prevId = existing.moduleId;
        const nextId = data.moduleId;
        if (prevId !== nextId) {
          let prevName = "Unknown";
          let nextName = "Unknown";
          if (prevId) {
            const m = await db.query.modules.findFirst({ where: eq(modules.id, prevId) });
            if (m) prevName = `${m.name} (ID: ${m.id})`;
          }
          if (nextId) {
            const m = await db.query.modules.findFirst({ where: eq(modules.id, nextId) });
            if (m) nextName = `${m.name} (ID: ${m.id})`;
          }
          addLog("course", prevName, nextName);
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(batches)
          .set({
            name: data.name,
            description: data.description,
            timeSlot: data.timeSlot,
            teacherId: data.teacherId,
            maxStudents: data.maxStudents,
            status: data.status,
            moduleId: data.moduleId,
            startDate: data.startDate,
            duration: data.duration,
          })
          .where(eq(batches.id, id));

        if (logsToInsert.length > 0) {
          await tx.insert(batchAuditLogs).values(logsToInsert);
        }
      });

      return db.query.batches.findFirst({
        where: eq(batches.id, id),
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  getStudentFeeConfig: adminQuery
    .input(z.object({
      studentId: z.union([z.number(), z.string()]),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      let userId: number | null = null;
      if (typeof input.studentId === "string") {
        const trimmed = input.studentId.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: and(eq(users.role, "student"), ilike(users.unionId, trimmed)),
          });
          if (u) userId = u.id;
          else {
            const p = await db.query.profiles.findFirst({
              where: ilike(profiles.enrollmentId, trimmed),
            });
            if (p) userId = p.userId;
          }
        }
      } else {
        userId = input.studentId;
      }

      if (!userId) return null;

      const studentUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { profile: true },
      });
      if (!studentUser) return null;

      let feeConfig = await db.query.studentFeeConfigurations.findFirst({
        where: eq(studentFeeConfigurations.studentId, userId),
      });

      if (!feeConfig) {
        const defaultTotal = parseFloat(studentUser.profile?.totalCourseFee || studentUser.profile?.feesTotal || "0");
        const [inserted] = await db.insert(studentFeeConfigurations).values({
          studentId: userId,
          totalCourseFee: String(defaultTotal),
          discount: "0.00",
          discountType: "flat",
          finalFee: String(defaultTotal),
          paymentMode: studentUser.profile?.paymentOption?.toUpperCase() === "INSTALLMENT" ? "INSTALLMENT" : "FULL_PAYMENT",
          downPayment: studentUser.profile?.downPayment || "0.00",
          numberOfInstallments: 1,
        }).returning();
        feeConfig = inserted;
      }

      const allPayments = await db.query.payments.findMany({
        where: eq(payments.studentId, userId),
        orderBy: [asc(payments.installmentNumber), asc(payments.id)],
      });

      const paidPayments = allPayments.filter((p) => p.status === "paid" && p.type === "tuition");
      const amountPaid = paidPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const finalFeeFloat = parseFloat(feeConfig.finalFee);
      const remainingBalance = Math.max(0, finalFeeFloat - amountPaid);
      const remainingInstallments = allPayments.filter((p) => p.status === "unpaid");

      return {
        studentId: userId,
        studentName: studentUser.name,
        unionId: studentUser.unionId,
        feeConfig,
        totalCourseFee: parseFloat(feeConfig.totalCourseFee),
        discount: parseFloat(feeConfig.discount),
        finalFee: finalFeeFloat,
        amountPaid,
        remainingBalance,
        paymentMode: feeConfig.paymentMode,
        remainingInstallments: remainingInstallments.map((inst) => ({
          id: inst.id,
          installmentNumber: inst.installmentNumber,
          amount: parseFloat(inst.amount),
          dueDate: inst.dueDate,
          status: inst.status,
        })),
      };
    }),

  enrollStudent: adminQuery
    .input(z.object({
      batchId: z.number(),
      studentId: z.union([z.number(), z.string()]),
      paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).optional(),
      feesTotal: z.number().optional(),
      installments: z.array(
        z.object({
          installmentNumber: z.number(),
          amount: z.number(),
          dueDate: z.string().optional(),
        })
      ).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const trimmed = input.studentId.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
          userId = parsed;
        } else {
          console.log(`[enrollStudent] Resolving student identifier: "${trimmed}"`);
          const u = await db.query.users.findFirst({
            where: and(eq(users.role, "student"), ilike(users.unionId, trimmed)),
          });
          if (u) {
            userId = u.id;
            console.log(`[enrollStudent] Resolved student by unionId. User ID: ${userId}`);
          } else {
            const p = await db.query.profiles.findFirst({
              where: ilike(profiles.enrollmentId, trimmed),
            });
            if (p) {
              userId = p.userId;
              console.log(`[enrollStudent] Resolved student by profile enrollmentId. User ID: ${userId}`);
            } else {
              console.warn(`[enrollStudent] Student not found with identifier: "${trimmed}"`);
              throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
            }
          }
        }
      } else {
        userId = input.studentId;
      }

      // Check for existing active enrollment
      const existing = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, input.batchId),
          eq(batchEnrollments.studentId, userId),
          eq(batchEnrollments.status, "active")
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Student already enrolled in this batch" });
      }

      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: { module: true },
      });

      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      }

      // Ensure student fee configuration exists
      let feeConfig = await db.query.studentFeeConfigurations.findFirst({
        where: eq(studentFeeConfigurations.studentId, userId),
      });

      const defaultFee = batch.courseFee ? parseFloat(batch.courseFee) : 0;
      const total = input.feesTotal !== undefined ? input.feesTotal : defaultFee;
      const payMode = (input.paymentType || "FULL_PAYMENT").toUpperCase();

      if (!feeConfig) {
        const [inserted] = await db.insert(studentFeeConfigurations).values({
          studentId: userId,
          totalCourseFee: String(total),
          discount: "0.00",
          discountType: "flat",
          finalFee: String(total),
          paymentMode: payMode,
          downPayment: String(total),
          numberOfInstallments: input.installments?.length || 1,
        }).returning();
        feeConfig = inserted;
      } else {
        const [updated] = await db.update(studentFeeConfigurations)
          .set({
            totalCourseFee: String(total),
            finalFee: String(total),
            paymentMode: payMode,
            downPayment: String(total),
            numberOfInstallments: input.installments?.length || 1,
          })
          .where(eq(studentFeeConfigurations.id, feeConfig.id))
          .returning();
        feeConfig = updated;
      }

      await db.insert(batchEnrollments).values({
        batchId: input.batchId,
        studentId: userId,
        paymentType: feeConfig.paymentMode,
        moduleId: batch.moduleId,
        studentFeeConfigId: feeConfig.id,
        oneOnOne30Allocated: 0,
        oneOnOne45Allocated: 0,
        oneOnOne60Allocated: 0,
        group30Allocated: 0,
        group45Allocated: 0,
        group60Allocated: 0,
        oneOnOne30Used: 0,
        oneOnOne45Used: 0,
        oneOnOne60Used: 0,
        group30Used: 0,
        group45Used: 0,
        group60Used: 0,
        assignedTeachers: batch.teacherId ? [batch.teacherId] : [],
      });

      // Generate payments
      if (payMode === "INSTALLMENT" && input.installments && input.installments.length > 0) {
        for (const inst of input.installments) {
          await db.insert(payments).values({
            studentId: userId,
            amount: String(inst.amount),
            type: "tuition",
            status: "unpaid",
            dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
            installmentNumber: inst.installmentNumber,
            batchId: input.batchId,
          });
        }
      } else {
        await db.insert(payments).values({
          studentId: userId,
          amount: String(total),
          type: "tuition",
          status: "unpaid",
          dueDate: null,
          installmentNumber: null,
          batchId: input.batchId,
        });
      }

      // Update student profile with enrolled batch and course info (preserving fee config)
      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, userId),
      });

      if (existingProfile) {
        await db.update(profiles)
          .set({
            batch: batch.name,
            batchTime: batch.timeSlot,
            course: batch.module?.name || null,
          })
          .where(eq(profiles.userId, userId));
      } else {
        await db.insert(profiles).values({
          userId,
          batch: batch.name,
          batchTime: batch.timeSlot,
          course: batch.module?.name || null,
        });
      }

      await recalculateStudentFees(userId);

      // Capacity alert: notify admins if over maxStudents
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

      if (batch?.maxStudents != null && activeCount > batch.maxStudents) {
        const adminIds = await getAdminUserIds();
        await sendBulkNotification(
          adminIds,
          "Batch Overcrowded",
          `Batch "${batch.name}" has exceeded its maximum capacity (${activeCount}/${batch.maxStudents}).`,
          "capacity_alert",
          { batchId: input.batchId, activeCount, maxStudents: batch.maxStudents }
        );
      }

      return { success: true };
    }),

  removeStudent: adminQuery
    .input(z.object({ batchId: z.number(), studentId: z.union([z.number(), z.string()]) }))
    .mutation(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const trimmed = input.studentId.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
          userId = parsed;
        } else {
          console.log(`[removeStudent] Resolving student identifier: "${trimmed}"`);
          const u = await db.query.users.findFirst({
            where: and(eq(users.role, "student"), ilike(users.unionId, trimmed)),
          });
          if (u) {
            userId = u.id;
            console.log(`[removeStudent] Resolved student by unionId. User ID: ${userId}`);
          } else {
            const p = await db.query.profiles.findFirst({
              where: ilike(profiles.enrollmentId, trimmed),
            });
            if (p) {
              userId = p.userId;
              console.log(`[removeStudent] Resolved student by profile enrollmentId. User ID: ${userId}`);
            } else {
              console.warn(`[removeStudent] Student not found with identifier: "${trimmed}"`);
              throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
            }
          }
        }
      } else {
        userId = input.studentId;
      }

      await db.update(batchEnrollments)
        .set({ status: "inactive", leftAt: new Date() })
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.studentId, userId)));

      // Update student profile: clear or update to another active enrollment
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });

      if (batch) {
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, userId),
        });

        if (existingProfile && existingProfile.batch === batch.name) {
          // Find if student has other active enrollments
          const otherEnrollment = await db.query.batchEnrollments.findFirst({
            where: and(
              eq(batchEnrollments.studentId, userId),
              eq(batchEnrollments.status, "active")
            ),
            with: { batch: { with: { module: true } } },
          });

          if (otherEnrollment && otherEnrollment.batch) {
            await db.update(profiles)
              .set({
                batch: otherEnrollment.batch.name,
                batchTime: otherEnrollment.batch.timeSlot,
                course: otherEnrollment.batch.module?.name || null,
              })
              .where(eq(profiles.userId, userId));
          } else {
            await db.update(profiles)
              .set({
                batch: null,
                batchTime: null,
                course: null,
              })
              .where(eq(profiles.userId, userId));
          }
        }
      }

      // Capacity alert: notify admins if under minStudents
      const batchWithModule = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: { module: true },
      });
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

      const minStudents = batchWithModule?.module?.minStudents;
      if (minStudents != null && activeCount < minStudents) {
        const adminIds = await getAdminUserIds();
        await sendBulkNotification(
          adminIds,
          "Batch Underpopulated",
          `Batch "${batchWithModule?.name}" has fallen below the minimum student count (${activeCount}/${minStudents}).`,
          "capacity_alert",
          { batchId: input.batchId, activeCount, minStudents }
        );
      }

      return { success: true };
    }),

  // Messages (Chat)
  deleteBatch: adminQuery
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can delete a batch
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();
      const { batchId } = input;

      // 1. Validation: Check if there are active enrollments
      const [{ value: activeEnrollmentsCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, "active")));

      if (activeEnrollmentsCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete batch with active student enrollments. Remove students first.",
        });
      }

      // 2. Validation: Check if there are ongoing classes
      const [{ value: ongoingClassesCount }] = await db
        .select({ value: count() })
        .from(classes)
        .where(and(eq(classes.batchId, batchId), eq(classes.status, "ongoing")));

      if (ongoingClassesCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete batch while there are ongoing live classes.",
        });
      }

      // 3. Resolve constraint dependencies in transaction
      await db.transaction(async (tx) => {
        // Clear references in flexibility_requests
        await tx.update(flexibilityRequests)
          .set({ fromBatchId: null })
          .where(eq(flexibilityRequests.fromBatchId, batchId));
        await tx.update(flexibilityRequests)
          .set({ toBatchId: null })
          .where(eq(flexibilityRequests.toBatchId, batchId));

        // Clear references to classes belonging to this batch
        const batchClasses = await tx.select({ id: classes.id }).from(classes).where(eq(classes.batchId, batchId));
        const classIds = batchClasses.map((c) => c.id);
        if (classIds.length > 0) {
          await tx.update(oneToOneSessions)
            .set({ classId: null })
            .where(inArray(oneToOneSessions.classId, classIds));
        }

        // Delete the batch (cascades to batchEnrollments, messages, classes, learningMaterials)
        await tx.delete(batches).where(eq(batches.id, batchId));
      });

      return { success: true };
    }),

  deleteModule: adminQuery
    .input(z.object({ moduleId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { moduleId } = input;

      // Find all batches under this module
      const moduleBatches = await db.select({ id: batches.id }).from(batches).where(eq(batches.moduleId, moduleId));
      const batchIds = moduleBatches.map((b) => b.id);

      if (batchIds.length > 0) {
        // 1. Validation: Check if any batches have active student enrollments
        const [{ value: activeEnrollmentsCount }] = await db
          .select({ value: count() })
          .from(batchEnrollments)
          .where(and(inArray(batchEnrollments.batchId, batchIds), eq(batchEnrollments.status, "active")));

        if (activeEnrollmentsCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete module with active student enrollments in its batches. Remove students first.",
          });
        }

        // 2. Validation: Check if any batches have ongoing classes
        const [{ value: ongoingClassesCount }] = await db
          .select({ value: count() })
          .from(classes)
          .where(and(inArray(classes.batchId, batchIds), eq(classes.status, "ongoing")));

        if (ongoingClassesCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete module while there are ongoing classes in its batches.",
          });
        }
      }

      // 3. Resolve constraint dependencies in transaction
      await db.transaction(async (tx) => {
        if (batchIds.length > 0) {
          // Clear references in flexibility_requests
          await tx.update(flexibilityRequests)
            .set({ fromBatchId: null })
            .where(inArray(flexibilityRequests.fromBatchId, batchIds));
          await tx.update(flexibilityRequests)
            .set({ toBatchId: null })
            .where(inArray(flexibilityRequests.toBatchId, batchIds));

          // Clear references to classes belonging to these batches
          const batchClasses = await tx.select({ id: classes.id }).from(classes).where(inArray(classes.batchId, batchIds));
          const classIds = batchClasses.map((c) => c.id);
          if (classIds.length > 0) {
            await tx.update(oneToOneSessions)
              .set({ classId: null })
              .where(inArray(oneToOneSessions.classId, classIds));
          }
        }

        // Delete the module (cascades to batches and then to batchEnrollments, messages, classes, learningMaterials)
        await tx.delete(modules).where(eq(modules.id, moduleId));
      });

      return { success: true };
    }),

  listBatchStudents: authedQuery
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      // Verification: only allow if admin, assigned teacher, or enrolled student
      const isTeacher = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });
      const isEnrolled = await db.query.batchEnrollments.findFirst({
        where: and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.studentId, ctx.user.id)),
      });

      const allowed = isEnrolled || isTeacher?.teacherId === ctx.user.id || ["admin", "super_admin", "academic_head"].includes(ctx.user.role);
      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view students in this batch" });
      }

      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")),
        with: { student: { with: { profile: true } } },
      });

      return enrollments.map((e) => e.student);
    }),

  listBatchAuditLogs: adminQuery
    .query(async () => {
      const db = getDb();
      return db.query.batchAuditLogs.findMany({
        orderBy: desc(batchAuditLogs.changedAt),
        with: {
          batch: true,
          changedByUser: true,
        },
      });
    }),

  // Course Notes
});

