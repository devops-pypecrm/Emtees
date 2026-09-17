import { eq, and, isNull, isNotNull, lte, gte, lt, ne, gt, inArray, or, desc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { classes, batchEnrollments, payments, oneToOneSessions, profiles, users, batches, modules, classBatches, attendanceAlerts, attendance } from "@db/schema";
import { sendBulkNotification, sendNotification, getAdminUserIds } from "./notificationEngine";
import { notifications } from "@db/schema";
import { NotificationService } from "./notificationService";

const RECORDING_RETENTION_DAYS = Number(process.env.RECORDING_RETENTION_DAYS ?? 60);

export async function processFeesAndRestrictions(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // 1. Mark overdue profiles (balance > 0 and due date in the past)
  const overdueProfiles = await db.query.profiles.findMany({
    where: and(
      gt(profiles.feesBalance, "0"),
      lt(profiles.paymentDueDate, now),
      ne(profiles.paymentStatus, "overdue")
    ),
  });

  const adminIds = await getAdminUserIds();

  for (const profile of overdueProfiles) {
    await db.update(profiles)
      .set({ paymentStatus: "overdue" })
      .where(eq(profiles.id, profile.id));

    const message = `Your payment is overdue. Outstanding balance: ₹${profile.feesBalance}. Please pay as soon as possible.`;

    await sendNotification(
      profile.userId,
      "Payment Overdue",
      message,
      "fee_overdue"
    );

    if (adminIds.length > 0) {
      await sendBulkNotification(
        adminIds,
        "Student Payment Overdue",
        `A student's payment is overdue. Balance: ₹${profile.feesBalance}.`,
        "fee_overdue"
      );
    }
  }

  // 2. Deactivate enrollments past grace period
  const activeUnpaidProfiles = await db.query.profiles.findMany({
    where: gt(profiles.feesBalance, "0"),
  });

  for (const profile of activeUnpaidProfiles) {
    if (!profile.paymentDueDate) continue;

    const dueDate = new Date(profile.paymentDueDate);
    const gracePeriodDays = profile.gracePeriodDays ?? 7;
    const restrictionDate = new Date(dueDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    if (now > restrictionDate) {
      // Grace period expired!
      const activeEnrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.studentId, profile.userId),
          eq(batchEnrollments.status, "active")
        ),
      });

      if (activeEnrollments.length > 0) {
        for (const enrollment of activeEnrollments) {
          await db.update(batchEnrollments)
            .set({ status: "restricted" })
            .where(eq(batchEnrollments.id, enrollment.id));
        }

        // Log access restriction to timeline
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: "access_restricted",
          reason: "Grace period expired on unpaid fees",
          timestamp: now.toISOString(),
        });
        await db.update(profiles)
          .set({ activityTimeline: timeline })
          .where(eq(profiles.id, profile.id));

        // Send LMS warning notification
        await sendNotification(
          profile.userId,
          "Access Restricted",
          "Your fee payment is overdue. Please clear the outstanding balance to regain access to batch activities.",
          "fee_restricted"
        );
      }

      // Send daily post-grace overdue alerts
      const type = "fee_overdue_daily";
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const alreadySent = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, profile.userId),
          eq(notifications.type, type),
          gte(notifications.createdAt, oneDayAgo)
        ),
      });

      if (!alreadySent) {
        await sendNotification(
          profile.userId,
          "Access Restricted Due to Outstanding Fees",
          "Your fee payment is overdue. Please clear the outstanding balance to regain access to batch activities.",
          type
        );
      }
    }
  }
}

export async function sendDueDateReminders(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const unpaidProfiles = await db.query.profiles.findMany({
    where: gt(profiles.feesBalance, "0"),
  });

  for (const profile of unpaidProfiles) {
    if (!profile.paymentDueDate) continue;

    const dueDate = new Date(profile.paymentDueDate);
    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if ([7, 3, 1].includes(daysDiff)) {
      const type = `fee_due_${daysDiff}_days`;
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const alreadySent = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, profile.userId),
          eq(notifications.type, type),
          gte(notifications.createdAt, oneDayAgo)
        ),
      });

      if (!alreadySent) {
        const formattedDueDate = dueDate.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
        const message = `Your batch fee balance of ₹${profile.feesBalance} is due on ${formattedDueDate}.`;

        await sendNotification(
          profile.userId,
          "Fee Payment Reminder",
          message,
          type
        );

        // Simulated email notification
        const user = await db.query.users.findFirst({
          where: eq(users.id, profile.userId),
        });
        if (user?.email) {
          console.log(`[Email Sent] to ${user.email}: ${message}`);
        }
      }
    }
  }
}

// Task 11.2 — auto-complete expired one-to-one sessions
async function expireOneToOneSessions(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const expiredSessions = await db.query.oneToOneSessions.findMany({
    where: and(
      lt(oneToOneSessions.validUntil, now),
      ne(oneToOneSessions.status, "completed"),
    ),
  });

  for (const session of expiredSessions) {
    await db.update(oneToOneSessions)
      .set({ status: "completed", completedAt: now })
      .where(eq(oneToOneSessions.id, session.id));
  }
}

// Task 11.4 — clean up expired recording URLs
async function cleanupExpiredRecordings(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expiredSessions = await db.query.oneToOneSessions.findMany({
    where: and(
      isNotNull(oneToOneSessions.recordingUrl),
      lt(oneToOneSessions.createdAt, cutoff),
    ),
  });

  const now = new Date();
  for (const session of expiredSessions) {
    await db.update(oneToOneSessions)
      .set({ recordingUrl: null, recordingDeletedAt: now })
      .where(eq(oneToOneSessions.id, session.id));
  }
}

export async function sendClassReminders(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Helper to send reminders
  const notifyParticipants = async (cls: typeof classes.$inferSelect, intervalText: string) => {
    // Fetch all batchIds for this class
    const cbList = await db.select({ batchId: classBatches.batchId }).from(classBatches).where(eq(classBatches.classId, cls.id));
    const classBatchIds = Array.from(new Set([cls.batchId, ...cbList.map(x => x.batchId)]));

    // Fetch batch and module details for all targeted batches
    const dbBatches = await db.query.batches.findMany({
      where: inArray(batches.id, classBatchIds),
      with: {
        module: true,
      },
    });

    const batchName = dbBatches.map(b => b.name).join(", ") || "Unknown Batch";
    const courseName = Array.from(new Set(dbBatches.map(b => b.module?.name).filter(Boolean))).join(", ") || "Unknown Course";
    const scheduledTimeStr = cls.scheduledAt ? new Date(cls.scheduledAt).toLocaleString() : "scheduled time";

    // Fetch enrolled active students across all linked batches
    const enrollments = await db.query.batchEnrollments.findMany({
      where: and(
        inArray(batchEnrollments.batchId, classBatchIds),
        eq(batchEnrollments.status, "active"),
      ),
    });
    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    const studentTitle = `Class Reminder: ${cls.title}`;
    const studentMessage = `Your class "${cls.title}" for batch(es) "${batchName}" (Course(s): "${courseName}") starts in ${intervalText} (at ${scheduledTimeStr}).`;
    
    const notificationData = {
      classId: cls.id,
      batchId: cls.batchId,
      scheduledAt: cls.scheduledAt,
      meetingUrl: cls.meetingUrl,
      type: "class_reminder",
    };

    if (studentIds.length > 0) {
      // Send LMS notifications to students
      await sendBulkNotification(
        studentIds,
        studentTitle,
        studentMessage,
        "class_reminder",
        notificationData
      );

      const studentUsers = await db.query.users.findMany({
        where: (u, { inArray }) => inArray(u.id, studentIds),
        columns: { id: true, email: true, phone: true },
      });
      
      for (const student of studentUsers) {
        await NotificationService.dispatch({
          userId: student.id,
          phone: student.phone || undefined,
          email: student.email || undefined,
          subject: studentTitle,
          message: studentMessage,
          type: "class_reminder",
          channels: ["email", "whatsapp", "sms"],
        });
      }
    }

    // Notify the assigned teacher
    if (cls.teacherId) {
      const teacherTitle = `Class Reminder (Teacher): ${cls.title}`;
      const teacherMessage = `Your class "${cls.title}" for batch "${batchName}" (Course: "${courseName}") starts in ${intervalText} (at ${scheduledTimeStr}).`;

      await sendNotification(
        cls.teacherId,
        teacherTitle,
        teacherMessage,
        "class_reminder",
        notificationData
      );

      const teacherUser = await db.query.users.findFirst({
        where: eq(users.id, cls.teacherId),
        columns: { email: true, phone: true },
      });
      if (teacherUser) {
        await NotificationService.dispatch({
          userId: cls.teacherId,
          phone: teacherUser.phone || undefined,
          email: teacherUser.email || undefined,
          subject: teacherTitle,
          message: teacherMessage,
          type: "class_reminder",
          channels: ["email", "whatsapp"],
        });
      }
    }
  };

  // 1. 1-Day Reminders (starting within 24 hours, but more than 1 hour away)
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const oneDayUpcoming = await db.query.classes.findMany({
    where: and(
      eq(classes.status, "scheduled"),
      lte(classes.scheduledAt, oneDayLater),
      gt(classes.scheduledAt, oneHourLater),
      isNull(classes.reminder1DaySentAt),
    ),
  });
  for (const cls of oneDayUpcoming) {
    await notifyParticipants(cls, "24 hours");
    await db.update(classes)
      .set({ reminder1DaySentAt: new Date() })
      .where(eq(classes.id, cls.id));
  }

  // 2. 1-Hour Reminders (starting within 1 hour, but more than 10 minutes away)
  const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);
  const oneHourUpcoming = await db.query.classes.findMany({
    where: and(
      eq(classes.status, "scheduled"),
      lte(classes.scheduledAt, oneHourLater),
      gt(classes.scheduledAt, tenMinutesLater),
      isNull(classes.reminder1HourSentAt),
    ),
  });
  for (const cls of oneHourUpcoming) {
    await notifyParticipants(cls, "1 hour");
    await db.update(classes)
      .set({ reminder1HourSentAt: new Date() })
      .where(eq(classes.id, cls.id));
  }

  // 3. 10-Minute Reminders (starting within 10 minutes)
  const tenMinUpcoming = await db.query.classes.findMany({
    where: and(
      eq(classes.status, "scheduled"),
      lte(classes.scheduledAt, tenMinutesLater),
      gte(classes.scheduledAt, now),
      isNull(classes.reminder10MinSentAt),
    ),
  });
  for (const cls of tenMinUpcoming) {
    await notifyParticipants(cls, "10 minutes");
    await db.update(classes)
      .set({ reminder10MinSentAt: new Date(), reminderSentAt: new Date() })
      .where(eq(classes.id, cls.id));
  }
}

export async function checkStudentConsecutiveAbsences(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Fetch active enrollments
  const activeEnrollments = await db.query.batchEnrollments.findMany({
    where: eq(batchEnrollments.status, "active"),
    with: {
      student: true,
      batch: {
        with: {
          teacher: true,
        },
      },
    },
  });

  for (const enrollment of activeEnrollments) {
    // Fetch completed classes for this batch
    const completedClasses = await db.query.classes.findMany({
      where: and(
        eq(classes.batchId, enrollment.batchId),
        eq(classes.status, "completed")
      ),
      orderBy: desc(classes.scheduledAt),
    });

    const classIds = completedClasses.map((c) => c.id);
    let streak = 0;
    let lastAttendanceDate: Date | null = null;

    if (classIds.length > 0) {
      const studentAttendance = await db.query.attendance.findMany({
        where: and(
          eq(attendance.studentId, enrollment.studentId),
          inArray(attendance.classId, classIds)
        ),
      });

      const attendanceMap = new Map(studentAttendance.map(a => [a.classId, a.status]));

      for (const cls of completedClasses) {
        const status = attendanceMap.get(cls.id);
        if (status === "present" || status === "late") {
          lastAttendanceDate = cls.scheduledAt;
          break;
        } else {
          // status is "absent" or no record exists (treated as absent)
          streak++;
        }
      }
    }

    if (streak >= 7) {
      // Check if an active alert already exists
      const existingAlert = await db.query.attendanceAlerts.findFirst({
        where: and(
          eq(attendanceAlerts.studentId, enrollment.studentId),
          eq(attendanceAlerts.batchId, enrollment.batchId),
          eq(attendanceAlerts.status, "active")
        ),
      });

      if (!existingAlert) {
        // Create new active alert
        await db.insert(attendanceAlerts).values({
          studentId: enrollment.studentId,
          batchId: enrollment.batchId,
          consecutiveAbsences: streak,
          lastAttendanceDate,
          status: "active",
        });

        // Student Notification
        await sendNotification(
          enrollment.studentId,
          "Attendance Warning",
          "You have been absent for 7 consecutive days. We encourage you to resume your classes.",
          "absence_alert"
        );

        // Teacher Notification
        if (enrollment.batch.teacherId) {
          await sendNotification(
            enrollment.batch.teacherId,
            "Student Absence Alert",
            `Student ${enrollment.student.name} in batch ${enrollment.batch.name} has been absent for ${streak} consecutive classes.`,
            "absence_alert"
          );
        }

        // Admin & Super Admin Notification
        const adminIds = await getAdminUserIds();
        if (adminIds.length > 0) {
          await sendBulkNotification(
            adminIds,
            "Student Absence Alert",
            `Student ${enrollment.student.name} (${enrollment.student.unionId}) in batch ${enrollment.batch.name} (Teacher: ${enrollment.batch.teacher?.name || "None"}) has been absent for ${streak} consecutive classes.`,
            "absence_alert"
          );
        }
      } else {
        // Update alert consecutive absences count if changed
        const hasDateChanged = lastAttendanceDate
          ? existingAlert.lastAttendanceDate?.getTime() !== lastAttendanceDate.getTime()
          : existingAlert.lastAttendanceDate !== null;

        if (existingAlert.consecutiveAbsences !== streak || hasDateChanged) {
          await db.update(attendanceAlerts)
            .set({ consecutiveAbsences: streak, lastAttendanceDate })
            .where(eq(attendanceAlerts.id, existingAlert.id));
        }
      }
    } else {
      // Streak is less than 7, resolve any active alert
      await db.update(attendanceAlerts)
        .set({ status: "resolved", resolvedAt: now })
        .where(and(
          eq(attendanceAlerts.studentId, enrollment.studentId),
          eq(attendanceAlerts.batchId, enrollment.batchId),
          eq(attendanceAlerts.status, "active")
        ));
    }
  }
}

export async function sendOneToOneReminders(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Helper to send reminders
  const notifyParticipants = async (session: typeof oneToOneSessions.$inferSelect, intervalText: string) => {
    const scheduledTimeStr = session.scheduledAt ? new Date(session.scheduledAt).toLocaleString() : "scheduled time";

    const studentTitle = `1-to-1 Session Reminder: ${session.title}`;
    const studentMessage = `Your 1-to-1 session "${session.title}" starts in ${intervalText} (at ${scheduledTimeStr}).`;

    const notificationData = {
      sessionId: session.id,
      scheduledAt: session.scheduledAt,
      meetingUrl: session.meetingUrl,
      type: "class_reminder",
    };

    // Notify student
    await sendNotification(
      session.studentId,
      studentTitle,
      studentMessage,
      "class_reminder",
      notificationData
    );

    // Notify teacher
    const teacherTitle = `1-to-1 Session Reminder (Teacher): ${session.title}`;
    const teacherMessage = `Your 1-to-1 session "${session.title}" starts in ${intervalText} (at ${scheduledTimeStr}).`;

    await sendNotification(
      session.teacherId,
      teacherTitle,
      teacherMessage,
      "class_reminder",
      notificationData
    );

    // Simulated email logs
    const usersToNotify = await db.query.users.findMany({
      where: inArray(users.id, [session.studentId, session.teacherId]),
      columns: { id: true, email: true },
    });
    for (const u of usersToNotify) {
      if (u.email) {
        console.log(`[Email Reminder Sent] to ${u.email} for 1-to-1 session "${session.title}" (${intervalText} reminder)`);
      }
    }
  };

  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);

  // 1. 24-Hour Reminders
  const oneDayUpcoming = await db.query.oneToOneSessions.findMany({
    where: and(
      inArray(oneToOneSessions.status, ["scheduled", "rescheduled", "reschedule_request_pending"]),
      lte(oneToOneSessions.scheduledAt, oneDayLater),
      gt(oneToOneSessions.scheduledAt, oneHourLater),
      isNull(oneToOneSessions.reminder1DaySentAt),
    ),
  });
  for (const session of oneDayUpcoming) {
    await notifyParticipants(session, "24 hours");
    await db.update(oneToOneSessions)
      .set({ reminder1DaySentAt: new Date() })
      .where(eq(oneToOneSessions.id, session.id));
  }

  // 2. 1-Hour Reminders
  const oneHourUpcoming = await db.query.oneToOneSessions.findMany({
    where: and(
      inArray(oneToOneSessions.status, ["scheduled", "rescheduled", "reschedule_request_pending"]),
      lte(oneToOneSessions.scheduledAt, oneHourLater),
      gt(oneToOneSessions.scheduledAt, tenMinutesLater),
      isNull(oneToOneSessions.reminder1HourSentAt),
    ),
  });
  for (const session of oneHourUpcoming) {
    await notifyParticipants(session, "1 hour");
    await db.update(oneToOneSessions)
      .set({ reminder1HourSentAt: new Date() })
      .where(eq(oneToOneSessions.id, session.id));
  }

  // 3. 10-Minute Reminders
  const tenMinUpcoming = await db.query.oneToOneSessions.findMany({
    where: and(
      inArray(oneToOneSessions.status, ["scheduled", "rescheduled", "reschedule_request_pending"]),
      lte(oneToOneSessions.scheduledAt, tenMinutesLater),
      gte(oneToOneSessions.scheduledAt, now),
      isNull(oneToOneSessions.reminder10MinSentAt),
    ),
  });
  for (const session of tenMinUpcoming) {
    await notifyParticipants(session, "10 minutes");
    await db.update(oneToOneSessions)
      .set({ reminder10MinSentAt: new Date() })
      .where(eq(oneToOneSessions.id, session.id));
  }
}

export async function checkExpiryAlerts(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Expiry ending in exactly 3 days (rough check)
  const expiringProfiles = await db.query.profiles.findMany({
    where: and(
      isNotNull(profiles.validityEndDate),
      lte(profiles.validityEndDate, threeDaysLater),
      gt(profiles.validityEndDate, now)
    ),
    with: { user: true }
  });

  for (const profile of expiringProfiles) {
    if (!profile.user) continue;

    // Check if we already sent the '3_days_expiry' alert in the last 24h
    const recentAlert = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, profile.userId),
        eq(notifications.type, "expiry_alert"),
        gte(notifications.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))
      )
    });

    if (recentAlert) continue; // Already alerted recently

    const expiryDateStr = profile.validityEndDate!.toLocaleDateString();
    await NotificationService.dispatch({
      userId: profile.userId,
      phone: profile.user.phone || undefined,
      email: profile.user.email || undefined,
      subject: "Enrollment Expiry Alert",
      message: `Dear ${profile.user.name}, your class validity expires on ${expiryDateStr}. Please contact support for renewal.`,
      type: "expiry_alert",
      channels: ["in_app", "email", "whatsapp", "sms"]
    });
  }
}

export async function autoEndStaleSessions(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  // Find 1-to-1 sessions that have been ongoing but have no heartbeat for 5 minutes, 
  // or have been ongoing for more than 3 hours (fallback)
  const staleSessions = await db.query.oneToOneSessions.findMany({
    where: and(
      eq(oneToOneSessions.status, "ongoing"),
      or(
        and(
          isNotNull(oneToOneSessions.lastHeartbeatAt),
          lte(oneToOneSessions.lastHeartbeatAt, fiveMinutesAgo)
        ),
        lte(oneToOneSessions.startedAt, threeHoursAgo)
      )
    )
  });

  for (const session of staleSessions) {
    const startedAt = session.startedAt || session.scheduledAt;
    const sessionLength = session.sessionLength || 30;
    
    // Auto-end it exactly at its intended duration to prevent bizarre 8+ hour actualDurations
    const endedAt = new Date(startedAt.getTime() + sessionLength * 60000);

    await db.update(oneToOneSessions).set({
      status: "completed",
      endedAt,
      actualDuration: sessionLength,
      completedAt: endedAt,
      // Default to absent if not marked present (though it should have been set to present when started)
      teacherAttendance: session.teacherAttendance || "present",
      studentAttendance: session.studentAttendance || "absent"
    }).where(eq(oneToOneSessions.id, session.id));

    // Update the student session balance directly
    const { updateStudentSessionBalances } = await import("./sessionHelper");
    await updateStudentSessionBalances(db, session.studentId);
    
    // Sync attendance to log the actual class
    const { evaluateClassCompletion } = await import("./classEngine");
    await evaluateClassCompletion(undefined, session.id);

    // Notify clients that the class was ended
    const { getIo } = await import("./socketInstance");
    const io = getIo();
    if (io) {
      io.emit("class:updated");
    }
  }

  // Find Group classes that have been ongoing for more than 3 hours
  const staleGroupClasses = await db.query.classes.findMany({
    where: and(
      eq(classes.status, "ongoing"),
      isNotNull(classes.startedAt),
      lte(classes.startedAt, threeHoursAgo)
    )
  });

  for (const cls of staleGroupClasses) {
    const startedAt = cls.startedAt || cls.scheduledAt;
    const durationMins = cls.duration || 60; // default 60 mins for group class
    const endedAt = new Date(startedAt.getTime() + durationMins * 60000);

    await db.update(classes).set({
      status: "completed",
      endedAt,
      actualDuration: durationMins
    }).where(eq(classes.id, cls.id));

    const { evaluateClassCompletion } = await import("./classEngine");
    await evaluateClassCompletion(cls.id, undefined);

    const { getIo } = await import("./socketInstance");
    const io = getIo();
    if (io) {
      io.emit("class:updated");
    }
  }
}

export async function runSchedulerTasks(): Promise<void> {
  await sendClassReminders();
  await sendOneToOneReminders();
  await processFeesAndRestrictions();
  // await sendDueDateReminders(); // if exists
  await expireOneToOneSessions();
  await autoEndStaleSessions();
  await cleanupExpiredRecordings();
  await checkStudentConsecutiveAbsences();
  await checkExpiryAlerts();
}

export function startScheduler(): void {
  setInterval(async () => {
    try {
      await runSchedulerTasks();
    } catch (err) {
      console.error("[scheduler] error:", err);
    }
  }, 60 * 1000);
}

