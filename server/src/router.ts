import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { userRouter } from "./routers/users";
import { learningRouter } from "./routers/learning";
import { classRouter } from "./routers/classes";
import { adminRouter } from "./routers/admin";
import { studentRouter } from "./routers/student";
import { studentsRouter } from "./routers/students";
import { privateMessageRouter } from "./routers/privateMessages";
import { notificationRouter } from "./routers/notifications";
import { communityRouter } from "./routers/community";
import { disciplineRouter } from "./routers/discipline";
import { salesExecutiveRouter } from "./routers/salesExecutive";
import { performanceRouter } from "./routers/performance";
import { qualificationsRouter } from "./routers/qualifications";
import { salesRouter } from "./routers/sales";
import { departmentRouter } from "./routers/departments";
import { teacherReportsRouter } from "./routers/teacherReports";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  user: userRouter,
  learning: learningRouter,
  class: classRouter,
  admin: adminRouter,
  student: studentRouter,
  students: studentsRouter,
  privateMessage: privateMessageRouter,
  notification: notificationRouter,
  community: communityRouter,
  discipline: disciplineRouter,
  salesExecutive: salesExecutiveRouter,
  sales: salesRouter,
  performance: performanceRouter,
  qualifications: qualificationsRouter,
  department: departmentRouter,
  teacherReports: teacherReportsRouter,
});

export type AppRouter = typeof appRouter;
