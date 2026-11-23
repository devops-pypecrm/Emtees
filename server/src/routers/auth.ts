import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, gte, sql } from "drizzle-orm";
import { NotificationService } from "../lib/notificationService";
import { createRouter, publicQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, salesExecutives } from "@db/schema";
import { getNextUniqueId } from "../lib/idGenerator";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE, getCountryISOFromDialCode } from "@contracts/validation";

import { jwtSecret } from "../lib/env";

const generateToken = async (user: { id: number; role: string; name: string; deviceToken: string }) => {
  return new SignJWT({ role: user.role, name: user.name, sessionToken: user.deviceToken })
    .setSubject(String(user.id))
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(jwtSecret);
};

export const authRouter = createRouter({
  register: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        countryCode: z.string().optional(),
        countryISO: z.string().optional(),
        phoneNumber: z.string().optional(),
        phone: z.string().optional(),
        username: z.string().trim().min(3),
        password: z.string().trim().min(6),
        role: z.enum(["student", "teacher", "admin", "academic_head", "super_admin"]).default("student"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      let countryCode = input.countryCode;
      let phoneNumber = input.phoneNumber;
      let countryISO = input.countryISO;

      if (!countryCode || !phoneNumber) {
        if (input.phone) {
          const parsed = parseFullPhone(input.phone);
          if (parsed) {
            countryCode = parsed.countryCode;
            phoneNumber = parsed.phoneNumber;
            countryISO = parsed.countryISO;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: PHONE_ERROR_MESSAGE });
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Country code and phone number are required." });
        }
      }

      if (!countryISO) {
        countryISO = getCountryISOFromDialCode(countryCode) || "IN";
      }

      const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      const existingPhone = await db.query.users.findFirst({
        where: eq(users.fullInternationalNumber, fullIntNum),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      }

      const formattedPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const uniqueId = await getNextUniqueId(input.role);
      const deviceToken = crypto.randomUUID();
      const result = await db.insert(users).values({
        unionId: uniqueId,
        name: input.name,
        phone: formattedPhone,
        countryCode,
        countryISO,
        phoneNumber,
        fullInternationalNumber: fullIntNum,
        username: input.username,
        password: hashedPassword,
        rawPassword: input.password,
        role: input.role,
        deviceToken,
      }).returning({ id: users.id });

      const userId = result[0]?.id;
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const token = await generateToken({ id: user.id, role: user.role, name: user.name, deviceToken });
      return { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, unionId: user.unionId, email: user.email, mustChangePassword: user.mustChangePassword } };
    }),

  /** SRS 20: password reset. A 6-digit code is sent by email (and WhatsApp when configured); it expires in 15 minutes. Same reply for unknown users. */
  forgotPassword: publicQuery.input(z.object({ identifier: z.string().trim().min(3) })).mutation(async ({ input }) => {
    const db = getDb();
    const id = input.identifier.toLowerCase();
    const digits = input.identifier.replace(/[^\d]/g, "");
    const u = await db.query.users.findFirst({ where: sql`lower(${users.username}) = ${id} or lower(coalesce(${users.email},'')) = ${id} or (${digits} <> '' and regexp_replace(coalesce(${users.phone},''), '[^0-9]', '', 'g') = ${digits})` });
    if (u && u.status !== "inactive") {
      const code = String(crypto.randomInt(100000, 1000000));
      await db.execute(sql`update password_resets set used_at = now() where user_id = ${u.id} and used_at is null`);
      await db.execute(sql`insert into password_resets (user_id, code_hash, expires_at) values (${u.id}, ${await bcrypt.hash(code, 8)}, now() + interval '15 minutes')`);
      await NotificationService.dispatch({ userId: u.id, subject: "Your EMTEES password reset code", message: `Your reset code is ${code}. It is valid for 15 minutes. If you did not ask for this, ignore this message.`, type: "password_reset", channels: ["email", "whatsapp"] }).catch(() => {});
    }
    return { ok: true, message: "If this account exists, a reset code has been sent to its email or WhatsApp. If you have no email on file, ask an administrator to reset your password." };
  }),
  resetPassword: publicQuery.input(z.object({ identifier: z.string().trim().min(3), code: z.string().trim().length(6), newPassword: z.string().min(6) })).mutation(async ({ input }) => {
    const db = getDb();
    const id = input.identifier.toLowerCase();
    const digits = input.identifier.replace(/[^\d]/g, "");
    const u = await db.query.users.findFirst({ where: sql`lower(${users.username}) = ${id} or lower(coalesce(${users.email},'')) = ${id} or (${digits} <> '' and regexp_replace(coalesce(${users.phone},''), '[^0-9]', '', 'g') = ${digits})` });
    const bad = new TRPCError({ code: "BAD_REQUEST", message: "That code is not valid or has expired" });
    if (!u) throw bad;
    const r: any = (await db.execute(sql`select * from password_resets where user_id = ${u.id} and used_at is null and expires_at > now() order by id desc limit 1`)).rows[0];
    if (!r || r.attempts >= 5) throw bad;
    if (!(await bcrypt.compare(input.code, r.code_hash))) { await db.execute(sql`update password_resets set attempts = attempts + 1 where id = ${r.id}`); throw bad; }
    await db.update(users).set({ password: await bcrypt.hash(input.newPassword, 10), rawPassword: input.newPassword, mustChangePassword: false, updatedAt: new Date() } as any).where(eq(users.id, u.id));
    await db.execute(sql`update password_resets set used_at = now() where id = ${r.id}`);
    return { ok: true };
  }),

  login: publicQuery
    .input(
      z.object({
        username: z.string().trim(),
        password: z.string().trim(),
        deviceToken: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(sql`lower(${users.username})`, input.username.toLowerCase().trim()),
      });
      if (!user || !user.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }
      if (user.status === "on_hold") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account on hold" });
      }

      // Single device login: update device token
      const deviceToken = input.deviceToken ?? crypto.randomUUID();
      await db.update(users)
        .set({ deviceToken, lastLoginAt: new Date() })
        .where(eq(users.id, user.id));



      const token = await generateToken({ id: user.id, role: user.role, name: user.name, deviceToken });
      return { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, unionId: user.unionId, email: user.email, mustChangePassword: user.mustChangePassword } };
    }),



  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
    });
    if (!user) return null;

    // Validate session token matches stored device token (disabled to allow multiple sessions without auto-logout)
    // if (ctx.user.sessionToken && user.deviceToken !== ctx.user.sessionToken) {
    //   throw new TRPCError({ code: "UNAUTHORIZED", message: "Your account has been logged in from another device. You have been signed out." });
    // }

    return { id: user.id, name: user.name, role: user.role, phone: user.phone, username: user.username, status: user.status, unionId: user.unionId, email: user.email, notificationsPausedUntil: user.notificationsPausedUntil, mustChangePassword: user.mustChangePassword };
  }),
});
