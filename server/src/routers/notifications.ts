import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, isNull, inArray, sql, lt, gte } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { notifications, users, batchEnrollments, batches } from "@db/schema";
import { getIo } from "../lib/socketInstance";


export const notificationRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;
      const now = new Date();

      const cursorDate = input.cursor ? new Date(input.cursor) : null;

      // 3. Fetch personal notifications for the user
      const notificationConditions: any[] = [eq(notifications.userId, user.id)];
      if (cursorDate) {
        notificationConditions.push(lt(notifications.createdAt, cursorDate));
      }

      const limit = input.limit;
      const personalNotifications = await db.query.notifications.findMany({
        where: and(...notificationConditions),
        orderBy: desc(notifications.createdAt),
        limit: limit + 50, // Fetch extra records for a robust merge
      });

      // 5. Merge, sort, and slice
      const merged = [...personalNotifications].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      const paginatedItems = merged.slice(0, limit);
      let nextCursor: string | undefined = undefined;

      if (merged.length > limit) {
        const lastItem = paginatedItems[paginatedItems.length - 1];
        nextCursor = lastItem.createdAt.toISOString();
      }

      return {
        items: paginatedItems.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        nextCursor,
      };
    }),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, ctx.user.id));
    return { success: true };
  }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

});
