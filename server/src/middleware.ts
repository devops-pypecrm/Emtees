import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

export const authedQuery = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in" });
  }

  // Validate session token matches stored device token (disabled to allow multiple sessions)
  // if (ctx.user.sessionToken) {
  //   const db = getDb();
  //   const dbUser = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
  //   if (!dbUser || dbUser.deviceToken !== ctx.user.sessionToken) {
  //     throw new TRPCError({ code: "UNAUTHORIZED", message: "Your account has been logged in from another device. You have been signed out." });
  //   }
  // }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminQuery = authedQuery.use(async ({ ctx, next }) => {
  const allowedRoles = ["super_admin", "admin", "academic_head"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const strictAdminQuery = authedQuery.use(async ({ ctx, next }) => {
  const allowedRoles = ["super_admin", "admin"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Strict Admin access required" });
  }
  return next({ ctx });
});

export const teacherQuery = authedQuery.use(async ({ ctx, next }) => {
  const allowedRoles = ["super_admin", "admin", "academic_head", "teacher"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teacher access required" });
  }
  return next({ ctx });
});

/** Build a procedure restricted to the given roles (super_admin always allowed). */
export const roleQuery = (...roles: string[]) =>
  authedQuery.use(async ({ ctx, next }) => {
    if (ctx.user.role !== "super_admin" && !roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this action" });
    }
    return next({ ctx });
  });
