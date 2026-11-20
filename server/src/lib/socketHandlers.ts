import type { Server, Socket } from "socket.io";
import { jwtVerify } from "jose";
import { jwtSecret } from "./env";

interface SocketUser {
  id: number;
  role: string;
  name: string;
}

/**
 * Attach all Socket.io event handlers and the JWT auth middleware to the given
 * io instance. Call this once after creating the Server in both dev and prod.
 */
export function setupSocketHandlers(io: Server): void {
  // ── Auth middleware ──────────────────────────────────────────────────────────
  // Client must pass { auth: { token: "<jwt>" } } during handshake.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      console.warn(`[socket auth] Connection rejected: No token provided on socket ${socket.id}`);
      return next(new Error("Authentication required"));
    }
    try {
      const { payload } = await jwtVerify(token, jwtSecret, {
        clockTolerance: 60,
      });
      (socket as Socket & { data: { user: SocketUser } }).data.user = {
        id: payload.sub ? parseInt(payload.sub) : 0,
        role: (payload.role as string) || "student",
        name: (payload.name as string) || "Unknown",
      };
      next();
    } catch (err: any) {
      console.error(`[socket auth] Token verification failed for socket ${socket.id}. Error:`, err?.message || err);
      next(new Error("Invalid or expired token"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const user = (socket as Socket & { data: { user: SocketUser } }).data.user;

    if (!user) {
      socket.disconnect(true);
      return;
    }

    console.log(`[socket] connected: user=${user.id} (${user.name}) socket=${socket.id}`);

    // Join personal room for private messaging
    socket.join(`user:${user.id}`);

    // ── batch:join ───────────────────────────────────────────────────────────

    // ── batch:leave ──────────────────────────────────────────────────────────

    // ── class:join ───────────────────────────────────────────────────────────
    socket.on("class:join", ({ classId }: { classId: number }) => {
      if (typeof classId !== "number") return;
      const room = `class:${classId}`;
      socket.join(room);
      console.log(`[socket] user=${user.id} joined room=${room}`);
    });

    // ── class:leave ──────────────────────────────────────────────────────────
    socket.on("class:leave", ({ classId }: { classId: number }) => {
      if (typeof classId !== "number") return;
      const room = `class:${classId}`;
      socket.leave(room);
      console.log(`[socket] user=${user.id} left room=${room}`);
    });

    // ── typing:start ─────────────────────────────────────────────────────────

    // ── typing:stop ──────────────────────────────────────────────────────────

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected: user=${user.id} reason=${reason}`);
    });
  });
}
