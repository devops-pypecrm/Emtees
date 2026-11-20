import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Outlet, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import ForceChangePassword from "@/components/ForceChangePassword";
import { useClassroom } from "@/components/Classroom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DownloadApp from "./pages/DownloadApp";
import Reports from "./pages/Reports";
import Students from "./pages/Students";
import Demos from "./pages/Demos";
import Requests from "./pages/Requests";
import CounsellorAdmissions from "./pages/counsellor/Admissions";
import Payments from "./pages/finance/Payments";
import TeacherPay from "./pages/finance/TeacherPay";
import Overview from "./pages/admin/Overview";
import AdminAdmissions from "./pages/admin/AdminAdmissions";
import People from "./pages/admin/People";
import Rates from "./pages/admin/Rates";
import SettingsPage from "./pages/admin/Settings";
import Audit from "./pages/admin/Audit";
import Assign from "./pages/head/Assign";
import Timetable from "./pages/head/Timetable";
import Teachers from "./pages/head/Teachers";
import Today from "./pages/teacher/Today";
import MyStudents from "./pages/teacher/MyStudents";
import Earnings from "./pages/teacher/Earnings";
import Availability from "./pages/teacher/Availability";
import StudentHome from "./pages/student/Home";
import StudentClasses from "./pages/student/Classes";
import { Loading } from "@/lib/kit";

function Protected() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!isLoading && !user) navigate("/login", { replace: true }); }, [user, isLoading, navigate]);
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loading /></div>;
  if (!user) return null;
  if (user.mustChangePassword) return <ForceChangePassword />;
  return <Layout><Outlet /></Layout>;
}

/** Home screen depends on the role. */
function Home() {
  const { user } = useAuth();
  switch (user!.role) {
    case "sales_executive": return <CounsellorAdmissions />;
    case "accountant": return <Payments />;
    case "teacher": return <Today />;
    case "student": return <StudentHome />;
    default: return <Overview />;
  }
}

/** Opened from the incoming-call popup: /class/:id joins that 1-to-1 session. */
function ClassLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  const rm = useClassroom(() => navigate("/", { replace: true }));
  useEffect(() => { if (id) rm.open({ id: Number(id) }); /* eslint-disable-next-line */ }, [id]);
  return <>{rm.element}<div className="text-sm text-slate-500">Opening your classroom…</div></>;
}

export default function App() {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const isHead = role === "academic_head";
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register/:token" element={<Register />} />
        <Route path="/app" element={<DownloadApp />} />
        <Route path="/" element={<Protected />}>
          <Route index element={<Home />} />
          <Route path="class/:id" element={<ClassLink />} />
          <Route path="reports" element={<Reports />} />
          <Route path="requests" element={<Requests />} />
          <Route path="demos" element={<Demos />} />
          <Route path="students" element={<Students />} />
          {(isAdmin || role === "accountant") && <Route path="payments" element={<Payments />} />}
          {(isAdmin || role === "accountant") && <Route path="teacher-pay" element={<TeacherPay />} />}
          {isAdmin && <Route path="admissions" element={<AdminAdmissions />} />}
          {isAdmin && <Route path="people" element={<People />} />}
          {isAdmin && <Route path="rates" element={<Rates />} />}
          {isAdmin && <Route path="settings" element={<SettingsPage />} />}
          {isAdmin && <Route path="audit" element={<Audit />} />}
          {(isAdmin || isHead) && <Route path="assign" element={<Assign />} />}
          {(isAdmin || isHead) && <Route path="timetable" element={<Timetable />} />}
          {(isAdmin || isHead) && <Route path="teachers" element={<Teachers />} />}
          {role === "teacher" && <Route path="my-students" element={<MyStudents />} />}
          {role === "teacher" && <Route path="earnings" element={<Earnings />} />}
          {role === "teacher" && <Route path="availability" element={<Availability />} />}
          {role === "student" && <Route path="classes" element={<StudentClasses />} />}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
