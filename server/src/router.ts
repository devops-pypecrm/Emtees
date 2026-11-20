import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { userRouter } from "./routers/users";
import { learningRouter } from "./routers/learning";
import { classRouter } from "./routers/classes";
import { adminRouter } from "./routers/admin";
import { studentRouter } from "./routers/student";
import { studentsRouter } from "./routers/students";
import { notificationRouter } from "./routers/notifications";
import { salesExecutiveRouter } from "./routers/salesExecutive";
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
  notification: notificationRouter,
  salesExecutive: salesExecutiveRouter,
  sales: salesRouter,
  qualifications: qualificationsRouter,
  department: departmentRouter,
  teacherReports: teacherReportsRouter,
});

export type AppRouter = typeof appRouter;
