import { profiles, attendance, classes, oneToOneSessions, users, batchEnrollments, studentClassAllocations } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "./notificationEngine";

export async function updateStudentSessionBalances(db: any, studentId: number) {
  // Get student's profile
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (!profile) return;

  // Get student's active enrollment
  const enrollment = await db.query.batchEnrollments.findFirst({
    where: and(
      eq(batchEnrollments.studentId, studentId),
      eq(batchEnrollments.status, "active")
    )
  });

  const existingAlloc = await db.query.studentClassAllocations.findFirst({
    where: eq(studentClassAllocations.studentId, studentId)
  });

  // Count attended 1-to-1 sessions grouped by sessionLength
  const completedO2OSessions = await db
    .select({
      sessionLength: oneToOneSessions.sessionLength,
      count: sql<number>`count(*)`
    })
    .from(oneToOneSessions)
    .where(
      and(
        eq(oneToOneSessions.studentId, studentId),
        eq(oneToOneSessions.status, "completed"),
        sql`(${oneToOneSessions.actualDuration} IS NULL OR ${oneToOneSessions.actualDuration} >= 25)`
      )
    )
    .groupBy(oneToOneSessions.sessionLength);

  let completedO2O30 = 0;
  let completedO2O45 = 0;
  let completedO2O60 = 0;

  for (const item of completedO2OSessions) {
    if (item.sessionLength === 30) completedO2O30 = Number(item.count || 0);
    else if (item.sessionLength === 45) completedO2O45 = Number(item.count || 0);
    else if (item.sessionLength === 60) completedO2O60 = Number(item.count || 0);
  }

  // Count attended group classes grouped by duration
  const completedGroupClasses = await db
    .select({
      duration: classes.duration,
      count: sql<number>`count(*)`
    })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .where(
      and(
        eq(attendance.studentId, studentId),
        eq(attendance.status, "present"),
        eq(classes.classType, "group")
      )
    )
    .groupBy(classes.duration);

  let completedGroup30 = 0;
  let completedGroup45 = 0;
  let completedGroup60 = 0;

  for (const item of completedGroupClasses) {
    if (item.duration === 30) completedGroup30 = Number(item.count || 0);
    else if (item.duration === 45) completedGroup45 = Number(item.count || 0);
    else if (item.duration === 60) completedGroup60 = Number(item.count || 0);
  }

  let sessionsO2O30 = 0;
  let sessionsO2O45 = 0;
  let sessionsO2O60 = 0;
  let sessionsGroup30 = 0;
  let sessionsGroup45 = 0;
  let sessionsGroup60 = 0;

  if (enrollment) {
    sessionsO2O30 = enrollment.oneOnOne30Allocated || 0;
    sessionsO2O45 = enrollment.oneOnOne45Allocated || 0;
    sessionsO2O60 = enrollment.oneOnOne60Allocated || 0;
    sessionsGroup30 = enrollment.group30Allocated || 0;
    sessionsGroup45 = enrollment.group45Allocated || 0;
    sessionsGroup60 = enrollment.group60Allocated || 0;
  } else if (existingAlloc && existingAlloc.allocation) {
    const alloc = existingAlloc.allocation as any;
    sessionsO2O30 = alloc.oneToOne?.sessions30 || 0;
    sessionsO2O45 = alloc.oneToOne?.sessions45 || 0;
    sessionsO2O60 = alloc.oneToOne?.sessions60 || 0;
    sessionsGroup30 = alloc.group?.sessions30 || 0;
    sessionsGroup45 = alloc.group?.sessions45 || 0;
    sessionsGroup60 = alloc.group?.sessions60 || 0;
  } else {
    const pkg = (profile.packageConfig as any) || {};
    sessionsO2O30 = pkg.oneToOne?.min30 || profile.allocatedOneToOneSessions || 0;
    sessionsO2O45 = pkg.oneToOne?.min45 || 0;
    sessionsO2O60 = pkg.oneToOne?.min60 || 0;
    sessionsGroup30 = pkg.group?.min30 || profile.allocatedGroupSessions || 0;
    sessionsGroup45 = pkg.group?.min45 || 0;
    sessionsGroup60 = pkg.group?.min60 || 0;
  }

  const remainingO2O30 = Math.max(0, sessionsO2O30 - completedO2O30);
  const remainingO2O45 = Math.max(0, sessionsO2O45 - completedO2O45);
  const remainingO2O60 = Math.max(0, sessionsO2O60 - completedO2O60);

  const remainingGroup30 = Math.max(0, sessionsGroup30 - completedGroup30);
  const remainingGroup45 = Math.max(0, sessionsGroup45 - completedGroup45);
  const remainingGroup60 = Math.max(0, sessionsGroup60 - completedGroup60);

  if (enrollment) {
    // Update enrollment record
    await db.update(batchEnrollments)
      .set({
        oneOnOne30Used: completedO2O30,
        oneOnOne45Used: completedO2O45,
        oneOnOne60Used: completedO2O60,
        group30Used: completedGroup30,
        group45Used: completedGroup45,
        group60Used: completedGroup60,
      })
      .where(eq(batchEnrollments.id, enrollment.id));
  }

  // Sync studentClassAllocations table — preserve designatedTime and the admin-entered
  // "already taken" legacy counts (classes tracked on WhatsApp before the LMS). Those are ADDED to the
  // DB-recorded sessions, so only the genuinely pending classes remain.
  const existingAllocData = existingAlloc?.allocation as any;

  // Legacy rows (pre-"alreadyTaken") carried a manual completed count; adopt the excess over the DB count once.
  const priorOf = (kind: "oneToOne" | "group", m: "30" | "45" | "60", dbCount: number) => {
    const a = existingAllocData?.[kind];
    if (a?.[`alreadyTaken${m}`] !== undefined) return Number(a[`alreadyTaken${m}`]) || 0;
    return Math.max(0, (a?.[`completed${m}`] || 0) - dbCount);
  };
  const prior = {
    o2o30: priorOf("oneToOne", "30", completedO2O30), o2o45: priorOf("oneToOne", "45", completedO2O45), o2o60: priorOf("oneToOne", "60", completedO2O60),
    grp30: priorOf("group", "30", completedGroup30), grp45: priorOf("group", "45", completedGroup45), grp60: priorOf("group", "60", completedGroup60),
  };

  const finalO2OCompleted30 = completedO2O30 + prior.o2o30;
  const finalO2OCompleted45 = completedO2O45 + prior.o2o45;
  const finalO2OCompleted60 = completedO2O60 + prior.o2o60;

  const finalGroupCompleted30 = completedGroup30 + prior.grp30;
  const finalGroupCompleted45 = completedGroup45 + prior.grp45;
  const finalGroupCompleted60 = completedGroup60 + prior.grp60;

  const o2oSessions30 = existingAlloc ? (existingAllocData?.oneToOne?.sessions30 || 0) : sessionsO2O30;
  const o2oSessions45 = existingAlloc ? (existingAllocData?.oneToOne?.sessions45 || 0) : sessionsO2O45;
  const o2oSessions60 = existingAlloc ? (existingAllocData?.oneToOne?.sessions60 || 0) : sessionsO2O60;
  const groupSessions30 = existingAlloc ? (existingAllocData?.group?.sessions30 || 0) : sessionsGroup30;
  const groupSessions45 = existingAlloc ? (existingAllocData?.group?.sessions45 || 0) : sessionsGroup45;
  const groupSessions60 = existingAlloc ? (existingAllocData?.group?.sessions60 || 0) : sessionsGroup60;

  const newAllocationJson = {
    oneToOne: {
      teacherId: existingAlloc ? (existingAllocData?.oneToOne?.teacherId || null) : (enrollment ? ((enrollment.assignedTeachers as any)?.[0] || null) : null),
      designatedTime: existingAllocData?.oneToOne?.designatedTime || "",
      sessions30: o2oSessions30,
      sessions45: o2oSessions45,
      sessions60: o2oSessions60,
      alreadyTaken30: prior.o2o30,
      alreadyTaken45: prior.o2o45,
      alreadyTaken60: prior.o2o60,
      completed30: finalO2OCompleted30,
      completed45: finalO2OCompleted45,
      completed60: finalO2OCompleted60,
      remaining30: Math.max(0, o2oSessions30 - finalO2OCompleted30),
      remaining45: Math.max(0, o2oSessions45 - finalO2OCompleted45),
      remaining60: Math.max(0, o2oSessions60 - finalO2OCompleted60)
    },
    group: {
      teacherId: existingAlloc ? (existingAllocData?.group?.teacherId || null) : (enrollment ? ((enrollment.assignedTeachers as any)?.[1] || (enrollment.assignedTeachers as any)?.[0] || null) : null),
      batchId: existingAlloc ? (existingAllocData?.group?.batchId || null) : (enrollment ? enrollment.batchId : null),
      designatedTime: existingAllocData?.group?.designatedTime || "",
      sessions30: groupSessions30,
      sessions45: groupSessions45,
      sessions60: groupSessions60,
      alreadyTaken30: prior.grp30,
      alreadyTaken45: prior.grp45,
      alreadyTaken60: prior.grp60,
      completed30: finalGroupCompleted30,
      completed45: finalGroupCompleted45,
      completed60: finalGroupCompleted60,
      remaining30: Math.max(0, groupSessions30 - finalGroupCompleted30),
      remaining45: Math.max(0, groupSessions45 - finalGroupCompleted45),
      remaining60: Math.max(0, groupSessions60 - finalGroupCompleted60)
    }
  };

  if (existingAlloc) {
    await db.update(studentClassAllocations)
      .set({ allocation: newAllocationJson, updatedAt: new Date() })
      .where(eq(studentClassAllocations.studentId, studentId));
  } else {
    await db.insert(studentClassAllocations).values({
      studentId: studentId,
      allocation: newAllocationJson,
    });
  }

  // Sync totals to profiles table
  const totalAllocatedO2O = sessionsO2O30 + sessionsO2O45 + sessionsO2O60;
  const totalAllocatedGroup = sessionsGroup30 + sessionsGroup45 + sessionsGroup60;
  const totalAllocated = totalAllocatedO2O + totalAllocatedGroup;

  const totalAttendedO2O = completedO2O30 + completedO2O45 + completedO2O60;
  const totalAttendedGroup = completedGroup30 + completedGroup45 + completedGroup60;
  const totalAttended = totalAttendedO2O + totalAttendedGroup;

  const totalRemainingO2O = remainingO2O30 + remainingO2O45 + remainingO2O60;
  const totalRemainingGroup = remainingGroup30 + remainingGroup45 + remainingGroup60;
  const totalRemaining = totalRemainingO2O + totalRemainingGroup;

  // Predefined student threshold
  const STUDENT_THRESHOLD = 3;

  // Fetch old counts to prevent duplicate notifications
  const oldRemainingOneToOne = profile.remainingOneToOneSessions ?? 0;
  const oldRemainingGroup = profile.remainingGroupSessions ?? 0;
  const oldTotalRemaining = profile.totalRemainingSessions ?? 0;

  await db.update(profiles)
    .set({
      allocatedOneToOneSessions: totalAllocatedO2O,
      allocatedGroupSessions: totalAllocatedGroup,
      totalAllocatedSessions: totalAllocated,
      attendedOneToOneSessions: totalAttendedO2O,
      attendedGroupSessions: totalAttendedGroup,
      totalAttendedSessions: totalAttended,
      remainingOneToOneSessions: totalRemainingO2O,
      remainingGroupSessions: totalRemainingGroup,
      totalRemainingSessions: totalRemaining,
    })
    .where(eq(profiles.userId, studentId));

  // 1-to-1 session balance low or exhausted notifications
  if (totalRemainingO2O === STUDENT_THRESHOLD && oldRemainingOneToOne > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low One-to-One Session Balance",
      `You have only ${totalRemainingO2O} One-to-One sessions remaining.`,
      "session_threshold"
    );
  } else if (totalRemainingO2O === 0 && oldRemainingOneToOne > 0) {
    await sendNotification(
      studentId,
      "One-to-One Sessions Exhausted",
      `Your One-to-One session balance has been fully exhausted.`,
      "session_exhausted"
    );
  }

  // Group session balance low or exhausted notifications
  if (totalRemainingGroup === STUDENT_THRESHOLD && oldRemainingGroup > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low Group Session Balance",
      `You have only ${totalRemainingGroup} Group sessions remaining.`,
      "session_threshold"
    );
  } else if (totalRemainingGroup === 0 && oldRemainingGroup > 0) {
    await sendNotification(
      studentId,
      "Group Sessions Exhausted",
      `Your Group session balance has been fully exhausted.`,
      "session_exhausted"
    );
  }

  // Admin notification for total remaining
  const adminIds = await getAdminUserIds();
  if (adminIds.length > 0) {
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    const studentName = student?.name || "Student";

    if (totalRemaining === STUDENT_THRESHOLD && oldTotalRemaining > STUDENT_THRESHOLD) {
      await sendBulkNotification(
        adminIds,
        `Low Session Balance Alert: ${studentName}`,
        `Student ${studentName} has only ${totalRemaining} total sessions remaining.`,
        "session_threshold_admin",
        { studentId }
      );
    } else if (totalRemaining === 0 && oldTotalRemaining > 0) {
      await sendBulkNotification(
        adminIds,
        `Session Balance Exhausted: ${studentName}`,
        `Student ${studentName} has exhausted all allocated sessions.`,
        "session_exhausted_admin",
        { studentId }
      );
    }
  }
}
