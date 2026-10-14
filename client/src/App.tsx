import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import ForceChangePassword from "@/components/ForceChangePassword";

// Import pages
import Dashboard from "./lms-pages/Dashboard";
import Batches from "./lms-pages/Batches";
import Chat from "./lms-pages/Chat";
import Community from "./lms-pages/Community";
import PrivateChat from "./lms-pages/PrivateChat";
import Classes from "./lms-pages/Classes";
import Learning from "./lms-pages/Learning";
import Fees from "./lms-pages/Fees";
import Salaries from "./lms-pages/Salaries";
import Feedback from "./lms-pages/Feedback";
import Performance from "./lms-pages/Performance";
import Requests from "./lms-pages/Requests";
import Reports from "./lms-pages/Reports";
import TeacherReports from "./lms-pages/TeacherReports";
import Notifications from "./lms-pages/Notifications";
import Discipline from "./lms-pages/Discipline";
import Settings from "./lms-pages/Settings";
import Students from "./lms-pages/Students";
import Users from "./lms-pages/Users";
import QualificationManagement from "./lms-pages/QualificationManagement";
import Login from "./lms-pages/Login";
import Admission from "./lms-pages/Admission";
import DownloadApp from "./lms-pages/DownloadApp";
import SalesExecutiveStudents from "./lms-pages/SalesExecutiveStudents";
import SalesExecutives from "./lms-pages/SalesExecutives";
import SalesRegistrations from "./lms-pages/SalesRegistrations";
import SalesReports from "./lms-pages/SalesReports";
import SalesLeads from "./lms-pages/SalesLeads";
import SalesDashboard from "./lms-pages/SalesDashboard";
import SalesPerformanceDetail from "./lms-pages/SalesPerformanceDetail";
import Departments from "./lms-pages/Departments";
import SalesDemoClasses from "./lms-pages/SalesDemoClasses";
import AcademicHeadPortal from "./lms-pages/AcademicHeadPortal";

function ProtectedLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  if (user.mustChangePassword) {
    return <ForceChangePassword />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RegisterRedirect() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate(
          "/login?reason=Self-registration+is+disabled.+Please+contact+an+administrator+to+create+an+account.",
          { replace: true }
        );
      } else {
        const isAdmin = ["super_admin", "admin", "academic_head"].includes(user.role);
        if (isAdmin) {
          navigate("/users", { replace: true });
        } else {
          navigate("/?reason=You+do+not+have+permission+to+access+the+registration+page.", {
            replace: true,
          });
        }
      }
    }
  }, [user, isLoading, navigate]);

  return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
}

export default function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<RegisterRedirect />} />
        <Route path="/admission/:code" element={<Admission />} />
        <Route path="/app" element={<DownloadApp />} />
        
        {/* Protected Dashboard Routes */}
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="batches" element={<Batches />} />
          <Route path="chat" element={<Chat />} />
          <Route path="community" element={<Community />} />
          <Route path="messages" element={<PrivateChat />} />
          <Route path="classes">
            <Route index element={<Navigate to="/classes/group" replace />} />
            <Route path="group" element={<Classes type="group" />} />
            <Route path="one-to-one" element={<Classes type="one-to-one" />} />
            <Route path="demo" element={<Classes type="demo" />} />
          </Route>
          <Route path="learning" element={<Learning />} />
          <Route path="fees" element={<Fees />} />
          <Route path="salaries" element={<Salaries />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="performance" element={<Performance />} />
          <Route path="requests" element={<Requests />} />
          <Route path="reports" element={<Reports />} />
          <Route path="teacher-reports" element={<TeacherReports />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="discipline" element={<Discipline />} />
          <Route path="settings" element={<Settings />} />
          <Route path="students" element={<Students />} />
          <Route path="users" element={<Users />} />
          <Route path="qualifications" element={<QualificationManagement />} />
          <Route path="sales-executive/students" element={<SalesExecutiveStudents />} />
          <Route path="sales-executive/demo-classes" element={<SalesDemoClasses />} />
          <Route path="departments" element={<Departments />} />
          <Route path="academic-portal" element={<AcademicHeadPortal />} />
          <Route path="sales-management">
            <Route path="dashboard" element={<SalesDashboard />} />
            <Route path="executives" element={<SalesExecutives />} />
            <Route path="registrations" element={<SalesRegistrations />} />
            <Route path="reports" element={<SalesReports />} />
            <Route path="performance/:userId" element={<SalesPerformanceDetail />} />
            <Route path="leads" element={<SalesLeads />} />
          </Route>
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
