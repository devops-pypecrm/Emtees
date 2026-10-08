import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { attendanceEvents, attendance, classLedgerTransactions, classes, users, profiles, batches, batchEnrollments, classBatches, systemSettings, oneToOneSessions } from "@db/schema";
import { recalculateSalaryInternal } from "../routers/admin";
import { NotificationService } from "./notificationService";

// A class counts only if both parties stayed at least this many minutes (spec: 25 of 30).
export const DEFAULT_CLASS_DURATION_THRESHOLD = 25;
// A dropped participant has this long to rejoin and continue "seamlessly".
export const REJOIN_GRACE_MINUTES = 5;

async function getClassDurationThreshold(db: ReturnType<typeof getDb>): Promise<number> {
  const setting = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, "class_duration_threshold") });
  return setting ? parseInt(setting.value) || DEFAULT_CLASS_DURATION_THRESHOLD : DEFAULT_CLASS_DURATION_THRESHOLD;
}

export async function evaluateClassCompletion(classId?: number, oneToOneSessionId?: number) {
  if (!classId && !oneToOneSessionId) return;
  const db = getDb();
  
  // 1. Fetch class details
  let cls: any = null;
  let isOneToOne = false;

  if (classId) {
    cls = await db.query.classes.findFirst({
      where: eq(classes.id, classId)
    });
  } else if (oneToOneSessionId) {
    isOneToOne = true;
    cls = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, oneToOneSessionId)
    });
  }
  
  if (!cls) return;

  // 2. Fetch all events for this class/session
  const eventsQuery = classId 
    ? eq(attendanceEvents.classId, classId) 
    : eq(attendanceEvents.oneToOneSessionId, oneToOneSessionId!);

  const events = await db.select().from(attendanceEvents).where(eventsQuery).orderBy(attendanceEvents.timestamp);
  
  // Calculate duration per user. A rejoin within REJOIN_GRACE_MINUTES of a drop
  // bridges the gap (counted as attended) so a network blip doesn't invalidate the class.
  const userDurations: Record<number, number> = {};
  const activeSessions: Record<number, Date> = {};
  const lastLeave: Record<number, Date> = {};

  for (const event of events) {
    const uid = event.userId;
    if (event.eventType === "join") {
      if (!activeSessions[uid]) {
        activeSessions[uid] = event.timestamp;
        const prevLeave = lastLeave[uid];
        if (prevLeave) {
          const gapMins = (event.timestamp.getTime() - prevLeave.getTime()) / 60000;
          if (gapMins <= REJOIN_GRACE_MINUTES) {
            userDurations[uid] = (userDurations[uid] || 0) + gapMins;
          }
        }
      }
    } else if (event.eventType === "leave") {
      if (activeSessions[uid]) {
        const diffMins = (event.timestamp.getTime() - activeSessions[uid].getTime()) / 60000;
        userDurations[uid] = (userDurations[uid] || 0) + diffMins;
        delete activeSessions[uid]; // End this session block
        lastLeave[uid] = event.timestamp;
      }
    }
  }

  // If the class ended, anyone still "active" gets duration calculated until class endedAt (or now)
  const classEndTime = cls.endedAt || cls.completedAt || new Date();
  for (const uid in activeSessions) {
    const diffMins = (classEndTime.getTime() - activeSessions[uid].getTime()) / 60000;
    userDurations[uid] = (userDurations[uid] || 0) + diffMins;
  }

  // Fallback for 1-to-1: when the Jitsi webhook never delivered events (misconfigured / blocked),
  // use the minute-by-minute heartbeat counters recorded by the client apps.
  if (isOneToOne) {
    if (!userDurations[cls.teacherId] && cls.teacherDuration) userDurations[cls.teacherId] = cls.teacherDuration;
    if (!userDurations[cls.studentId] && cls.studentDuration) userDurations[cls.studentId] = cls.studentDuration;
  }

  // 3. Determine if teacher met the configurable duration threshold
  const durationThreshold = await getClassDurationThreshold(db);
  const teacherId = cls.teacherId;
  const teacherDuration = userDurations[teacherId] || 0;
  const teacherValid = teacherDuration >= durationThreshold;

  // 4. Determine student validities and create Ledger Debits
  const students = isOneToOne 
    ? [cls.studentId]
    : Object.keys(userDurations).map(Number).filter(id => id !== teacherId);

  for (const studentId of students) {
    const duration = userDurations[studentId] || 0;
    const studentValid = duration >= durationThreshold;
    
    let finalStatus: "present" | "absent" = "absent";
    if (teacherValid && studentValid) {
      finalStatus = "present";
    }
    
    // Upsert attendance record
    const attQuery = classId 
      ? and(eq(attendance.classId, classId), eq(attendance.studentId, studentId))
      : eq(attendance.oneToOneSessionId, oneToOneSessionId!);

    const [existingAtt] = await db.select().from(attendance).where(attQuery);
    
    const attData: any = {
      status: finalStatus,
      joinedAt: events.find((e: any) => e.userId === studentId && e.eventType === "join")?.timestamp,
      leftAt: events.slice().reverse().find((e: any) => e.userId === studentId && e.eventType === "leave")?.timestamp || classEndTime,
      duration: Math.floor(duration),
    };

    if (existingAtt) {
      await db.update(attendance).set(attData).where(eq(attendance.id, existingAtt.id));
    } else {
      let batchId = null;
      let moduleId = null;
      if (isOneToOne) {
        const enrollment = await db.query.batchEnrollments.findFirst({
          where: and(eq(batchEnrollments.studentId, studentId), eq(batchEnrollments.status, "active")),
          with: { batch: true },
        });
        batchId = enrollment?.batchId || null;
        moduleId = enrollment?.moduleId || enrollment?.batch?.moduleId || null;
      }

      await db.insert(attendance).values({
        ...attData,
        classId: classId || null,
        oneToOneSessionId: oneToOneSessionId || null,
        studentId: studentId,
        teacherId: teacherId,
        batchId: isOneToOne ? batchId : null,
        moduleId: isOneToOne ? moduleId : null,
        sessionType: isOneToOne ? "one_to_one" : "group",
        attendanceDate: cls.scheduledAt,
        meetingId: cls.meetingRoomId,
        createdBy: teacherId,
        recordedAt: cls.completedAt || classEndTime,
      });
    }

    // Process Ledger Debit ONLY if they were present (both teacher & student >= 20 mins)
    if (finalStatus === "present") {
      // Find active enrollment
      const [enrollment] = await db.select().from(batchEnrollments).where(and(
        eq(batchEnrollments.studentId, studentId),
        eq(batchEnrollments.status, "active") // assuming they are active
      )).limit(1);

      // Check if ledger already debited for this class
      const ledgerQuery = classId
        ? eq(classLedgerTransactions.referenceClassId, classId)
        : eq(classLedgerTransactions.referenceOneToOneId, oneToOneSessionId!);

      const [existingLedger] = await db.select().from(classLedgerTransactions).where(and(
        eq(classLedgerTransactions.studentId, studentId),
        ledgerQuery,
        eq(classLedgerTransactions.type, "debit")
      ));
      
      if (!existingLedger) {
        await db.insert(classLedgerTransactions).values({
          studentId,
          enrollmentId: enrollment ? enrollment.id : null,
          type: "debit",
          amount: 1, // 1 class credit
          referenceClassId: classId || null,
          referenceOneToOneId: oneToOneSessionId || null,
          remarks: classId ? `Class ${classId} completed` : `1-to-1 Session ${oneToOneSessionId} completed`,
        });
        
        // Also set validityEndDate if this is the FIRST class (and not Rejoin)
        if (!enrollment || !enrollment.isRejoin) {
          const [profile] = await db.select().from(profiles).where(eq(profiles.userId, studentId));
          if (profile && !profile.validityEndDate) {
            const allocated = profile.totalAllocatedSessions || 0;
            const daysValid = allocated * 2; // double the applicable number of classes
            const validityDate = new Date();
            validityDate.setDate(validityDate.getDate() + daysValid);
            
            await db.update(profiles).set({
              validityEndDate: validityDate
            }).where(eq(profiles.id, profile.id));
          }
        }
      }
    }
  }

  // Always recalculate remuneration (even when invalid) so a re-evaluated class
  // that no longer qualifies is removed from the salary instead of going stale
  if (!teacherValid) {
    const refCond = classId
      ? eq(classLedgerTransactions.referenceClassId, classId)
      : eq(classLedgerTransactions.referenceOneToOneId, oneToOneSessionId!);
    await db.delete(classLedgerTransactions).where(and(refCond, eq(classLedgerTransactions.type, "debit")));
  }
  // Keep the session's recorded duration in sync with what was actually validated
  if (isOneToOne) {
    await db.update(oneToOneSessions).set({
      teacherDuration: Math.floor(teacherDuration),
      studentDuration: Math.floor(userDurations[cls.studentId] || 0),
    }).where(eq(oneToOneSessions.id, oneToOneSessionId!));
  }

  // Always refresh the month's salary (forceInsert) so the report is created/updated automatically
  // as soon as the class is evaluated — previously the row was only updated if it already existed.
  const scheduledAt: Date = cls.scheduledAt || classEndTime;
  const monthStr = scheduledAt.toISOString().substring(0, 7);
  await recalculateSalaryInternal(db, teacherId, monthStr, true);

  const { updateStudentSessionBalances } = await import("./sessionHelper");
  for (const sid of students) {
    await updateStudentSessionBalances(db, sid).catch((e: any) => console.error("[classEngine] balance sync failed:", e));
  }
  const { getIo } = await import("./socketInstance");
  getIo()?.emit("class:updated");

  // 5. Post-Class Followups: Auto-message absentees
  if (isOneToOne) {
    // For 1-to-1, there is only one student
    const studentId = cls.studentId;
    const att = await db.query.attendance.findFirst({
      where: eq(attendance.oneToOneSessionId, oneToOneSessionId!)
    });
    
    if (!att || att.status === "absent") {
      const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
      if (student) {
        await NotificationService.dispatch({
          userId: studentId,
          phone: student.phone || undefined,
          email: student.email || undefined,
          subject: "Missed 1-to-1 Session",
          message: `Hi ${student.name}, we missed you in your 1-to-1 session "${cls.title}". Please contact us if you need help.`,
          type: "missed_class",
          channels: ["in_app", "email", "whatsapp", "sms"]
        });
      }
    }
  } else {
    // Group Class Absentees logic
    const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, classId!));
    const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)].filter(Boolean)));

    const activeEnrollments = await db.query.batchEnrollments.findMany({
      where: and(
        inArray(batchEnrollments.batchId, classBatchIds),
        eq(batchEnrollments.status, "active")
      ),
      with: { student: true }
    });

    const presents = await db.select({ studentId: attendance.studentId }).from(attendance)
      .where(and(eq(attendance.classId, classId!), eq(attendance.status, "present")));
    const presentSet = new Set(presents.map(p => p.studentId));

    for (const enr of activeEnrollments) {
      if (!presentSet.has(enr.studentId) && enr.student) {
        await NotificationService.dispatch({
          userId: enr.studentId,
          phone: enr.student.phone || undefined,
          email: enr.student.email || undefined,
          subject: "Missed Class Notification",
          message: `Hi ${enr.student.name}, we missed you in today's class "${cls.title}". If you face any issues joining, please let us know.`,
          type: "missed_class",
          channels: ["in_app", "email", "whatsapp", "sms"] 
        });

        const absentSetting = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, "absent_consecutive_threshold") });
        const absentThreshold = absentSetting ? parseInt(absentSetting.value) || 7 : 7;

        const lastN = await db.select({ status: attendance.status })
          .from(attendance)
          .where(eq(attendance.studentId, enr.studentId))
          .orderBy(sql`${attendance.id} DESC`)
          .limit(absentThreshold);

        if (lastN.length === absentThreshold && lastN.every((r: any) => r.status === "absent")) {
          await NotificationService.dispatch({
            userId: enr.studentId,
            subject: "Absence Alert",
            message: `You have been absent for ${absentThreshold} consecutive classes. Please reach out if you need assistance.`,
            type: "absence_alert",
            channels: ["in_app", "email", "sms"]
          });

          const adminIds = (await db.query.users.findMany({ where: inArray(users.role, ["super_admin", "admin", "academic_head"]) })).map((u: any) => u.id);
          for (const adminId of adminIds) {
            await NotificationService.dispatch({
              userId: adminId,
              subject: "Student Absence Alert",
              message: `Student ${enr.student.name} has been absent for ${absentThreshold} consecutive classes.`,
              type: "absence_alert",
              channels: ["in_app"]
            });
          }
        }
      }
    }
  }
}
