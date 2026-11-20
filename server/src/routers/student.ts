import { z } from "zod";
import { eq, desc, or, and, inArray, isNotNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";
import { flexibilityRequests, notifications, payments, profiles, users, batchEnrollments, batches, classes, oneToOneSessions, systemSettings, classBatches, studentFeeConfigurations } from "@db/schema";
import { sendNotification, sendBulkNotification } from "../lib/notificationEngine";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { recalculateStudentFees } from "../lib/feeHelper";
import { EnrollmentPaymentService } from "../lib/EnrollmentPaymentService";


export const studentRouter = createRouter({
  myPayments: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.payments.findMany({
      where: eq(payments.studentId, ctx.user.id),
      orderBy: desc(payments.createdAt),
      with: {
        batch: true,
      },
    });
  }),

  // Flexibility Requests
  createRequest: authedQuery
    .input(z.object({
      requestType: z.enum(["hold", "rejoin", "batch_change", "batch_removal"]),
      fromBatchId: z.number().optional(),
      toBatchId: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Input validations
      if (input.requestType === "batch_change") {
        if (!input.fromBatchId || !input.toBatchId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Both current batch and desired batch must be specified for a batch change request.",
          });
        }
      } else if (input.requestType === "batch_removal") {
        if (!input.fromBatchId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Current batch must be specified for a batch removal request.",
          });
        }
      }

      const result = await db.insert(flexibilityRequests).values({
        studentId: ctx.user.id,
        ...input,
      }).returning({ id: flexibilityRequests.id });

      // Notify student
      const typeLabel = input.requestType.replace("_", " ");
      await sendNotification(
        ctx.user.id,
        "Request Received",
        `Your ${typeLabel} request has been successfully received and is pending admin review.`,
        "flexibility_request_received"
      );

      // Notify Super Admins
      const superAdmins = await db.query.users.findMany({
        where: eq(users.role, "super_admin"),
        columns: { id: true },
      });
      const superAdminIds = superAdmins.map((sa) => sa.id);
      if (superAdminIds.length > 0) {
        await sendBulkNotification(
          superAdminIds,
          "New Request Submitted",
          `A new ${typeLabel} request has been submitted by student ${ctx.user.name}.`,
          "flexibility_request_submitted"
        );
      }

      return db.query.flexibilityRequests.findFirst({ where: eq(flexibilityRequests.id, result[0]?.id) });
    }),

  cancelRequest: authedQuery
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const request = await db.query.flexibilityRequests.findFirst({
        where: and(
          eq(flexibilityRequests.id, input.requestId),
          eq(flexibilityRequests.studentId, ctx.user.id),
          eq(flexibilityRequests.status, "pending")
        ),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pending request not found.",
        });
      }

      await db.update(flexibilityRequests)
        .set({
          status: "cancelled",
          resolvedAt: new Date(),
        })
        .where(eq(flexibilityRequests.id, input.requestId));

      // Append cancellation details to student's profile timeline
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, ctx.user.id),
      });
      if (profile) {
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: request.requestType,
          status: "cancelled",
          timestamp: new Date().toISOString(),
        });
        await db.update(profiles)
          .set({ activityTimeline: timeline })
          .where(eq(profiles.userId, ctx.user.id));
      }

      return { success: true };
    }),

  myRequests: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.flexibilityRequests.findMany({
      where: eq(flexibilityRequests.studentId, ctx.user.id),
      orderBy: desc(flexibilityRequests.requestedAt),
      with: { fromBatch: true, toBatch: true },
    });
  }),

  // Feedback
  myNotifications: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.notifications.findMany({
      where: eq(notifications.userId, ctx.user.id),
      orderBy: desc(notifications.createdAt),
    });
  }),

  markNotificationRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, input.id));
      return { success: true };
    }),

});
