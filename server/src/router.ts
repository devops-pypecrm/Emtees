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
import { srsAdmissionsRouter } from "./routers/srsAdmissions";
import { srsAcademicRouter } from "./routers/srsAcademic";
import { srsFinanceRouter } from "./routers/srsFinance";
import { srsClassesRouter } from "./routers/srsClasses";
import { srsReportsRouter } from "./routers/srsReports";
import { srsStaffRouter } from "./routers/srsStaff";

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
  admissions: srsAdmissionsRouter,
  academic: srsAcademicRouter,
  finance: srsFinanceRouter,
  lms: srsClassesRouter,
  reports: srsReportsRouter,
  staff: srsStaffRouter,
});

export type AppRouter = typeof appRouter;
