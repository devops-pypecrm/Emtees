import { Router, Request, Response } from "express";
import { getDb } from "../queries/connection";
import { attendanceEvents, classes, oneToOneSessions } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { evaluateClassCompletion } from "../lib/classEngine";
import { syncOneToOneAttendance } from "./classes";

export const webhookRouter = Router();

webhookRouter.post("/jitsi", async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    
    // Validate Jitsi webhook payload
    // Depending on Jitsi configuration, the payload format might vary.
    // Example assumed format:
    // { eventType: "OccupantJoined", roomName: "emtees-slug-123", occupant: { id: "1", name: "User" } }
    
    const eventType = payload.eventType || payload.event_type;
    const roomName = payload.roomName || payload.room_name;
    const userIdStr = payload.occupant?.id || payload.participant?.id;
    
    if (!eventType || !roomName) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const db = getDb();
    const groupCls = await db.query.classes.findFirst({ where: eq(classes.meetingRoomId, roomName) });
    const otoCls = await db.query.oneToOneSessions.findFirst({ where: eq(oneToOneSessions.meetingRoomId, roomName) });

    if (!groupCls && !otoCls) {
      return res.status(400).json({ error: "Invalid room name, no class found" });
    }

    const classId = groupCls ? groupCls.id : null;
    const otoSessionId = otoCls ? otoCls.id : null;
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    
    let dbEventType: "join" | "leave" | null = null;
    if (eventType === "OccupantJoined" || eventType === "participant_joined") {
      dbEventType = "join";
    } else if (eventType === "OccupantLeft" || eventType === "participant_left") {
      dbEventType = "leave";
    }
    
    if (dbEventType) {
      await db.insert(attendanceEvents).values({
        classId: classId || null,
        oneToOneSessionId: otoSessionId || null,
        userId,
        eventType: dbEventType,
        timestamp: new Date(),
        metadata: payload,
      });

      if (groupCls) {
        if (dbEventType === "join" && userId === groupCls.teacherId) {
           if (!groupCls.startedAt) {
             await db.update(classes).set({ status: "ongoing", startedAt: new Date() }).where(eq(classes.id, classId!));
           } else if (groupCls.status !== "ongoing") {
             await db.update(classes).set({ status: "ongoing" }).where(eq(classes.id, classId!));
           }
        } else if (dbEventType === "leave" && userId === groupCls.teacherId) {
           const endedAt = new Date();
           const actualDuration = groupCls.startedAt ? Math.floor((endedAt.getTime() - new Date(groupCls.startedAt).getTime()) / 60000) : 0;
           await db.update(classes).set({ status: "completed", endedAt, actualDuration }).where(eq(classes.id, classId!));
           await evaluateClassCompletion(classId!);
        }
      }

      if (otoCls) {
        if (dbEventType === "join" && userId === otoCls.teacherId) {
           if (!otoCls.startedAt) {
             await db.update(oneToOneSessions).set({ status: "ongoing", startedAt: new Date(), teacherAttendance: "present" }).where(eq(oneToOneSessions.id, otoSessionId!));
           } else if (otoCls.status !== "ongoing") {
             await db.update(oneToOneSessions).set({ status: "ongoing", teacherAttendance: "present" }).where(eq(oneToOneSessions.id, otoSessionId!));
           }
        } else if (dbEventType === "join" && userId === otoCls.studentId) {
           await db.update(oneToOneSessions).set({ studentAttendance: "present" }).where(eq(oneToOneSessions.id, otoSessionId!));
        } else if (dbEventType === "leave" && userId === otoCls.teacherId) {
           const endedAt = new Date();
           const startedAt = otoCls.startedAt || otoCls.scheduledAt;
           const actualDuration = startedAt ? Math.floor((endedAt.getTime() - new Date(startedAt).getTime()) / 60000) : 0;
           await db.update(oneToOneSessions).set({
             status: "completed",
             endedAt,
             actualDuration: actualDuration > 0 ? actualDuration : 0,
             completedAt: endedAt
           }).where(eq(oneToOneSessions.id, otoSessionId!));
           
           await syncOneToOneAttendance(db, otoSessionId!, userId);
        }
      }
    }
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[jitsi webhook] error:", err);
    res.status(500).json({ error: err.message });
  }
});
