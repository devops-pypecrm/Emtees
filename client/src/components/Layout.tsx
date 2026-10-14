"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {  useLocation , Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  MessageCircle,
  Calendar,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  Bell,
  Menu,
  X,
  MessageSquare,
  GitPullRequest,
  Coins,
  Star,
  GraduationCap,
  Globe,
  Contact,
  Clock,
  User,
  Award,
  Building2,
  Video,
} from "lucide-react";
import { useSocket, useClassStartedAlert } from "@/hooks/useSocket";
import { trpc } from "@/providers/trpc";
import { useEffect } from "react";
import { toast } from "sonner";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Users", path: "/users" },
  { icon: Contact, label: "Students", path: "/students" },
  { icon: GraduationCap, label: "Qualifications", path: "/qualifications" },
  { icon: Users, label: "Admission Manager", path: "/sales-management/executives" },
  { icon: BarChart3, label: "Sales & Accounts", path: "/sales-management/dashboard" },
  { icon: Contact, label: "Leads", path: "/sales-management/leads" },
  { icon: Building2, label: "Departments", path: "/departments" },
  { icon: GraduationCap, label: "Academic Portal", path: "/academic-portal" },
  { icon: BookOpen, label: "Batches", path: "/batches" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
  { icon: Globe, label: "Community", path: "/community" },
  { icon: MessageSquare, label: "Private Messages", path: "/messages" },
  { icon: Calendar, label: "Group Sessions", path: "/classes/group" },
  { icon: Clock, label: "1 on 1 Sessions", path: "/classes/one-to-one" },
  { icon: Video, label: "Demo Classes", path: "/classes/demo" },
  { icon: GraduationCap, label: "Learning", path: "/learning" },
  { icon: CreditCard, label: "Fees", path: "/fees" },
  { icon: Coins, label: "Salaries", path: "/salaries" },
  { icon: Star, label: "Feedback", path: "/feedback" },
  { icon: Award, label: "Performance", path: "/performance" },
  { icon: GitPullRequest, label: "Requests", path: "/requests" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: BarChart3, label: "Teacher Reports", path: "/teacher-reports" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: Shield, label: "Discipline", path: "/discipline" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const studentNav = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: BookOpen, label: "Batches", path: "/batches" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
  { icon: Globe, label: "Community", path: "/community" },
  { icon: MessageSquare, label: "Private Messages", path: "/messages" },
  { icon: Calendar, label: "Group Sessions", path: "/classes/group" },
  { icon: Clock, label: "1 on 1 Sessions", path: "/classes/one-to-one" },
  { icon: GraduationCap, label: "Learning", path: "/learning" },
  { icon: CreditCard, label: "Fees", path: "/fees" },
  { icon: Star, label: "Feedback", path: "/feedback" },
  { icon: Award, label: "Performance", path: "/performance" },
  { icon: GitPullRequest, label: "Requests", path: "/requests" },
  { icon: BarChart3, label: "Progress", path: "/reports" },
  { icon: Bell, label: "Alerts", path: "/notifications" },
  { icon: Shield, label: "Discipline", path: "/discipline" },
];

const salesNav = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: BarChart3, label: "Sales & Accounts", path: "/sales-management/dashboard" },
  { icon: Contact, label: "Leads", path: "/sales-management/leads" },
  { icon: Contact, label: "My Students", path: "/sales-executive/students" },
  { icon: Video, label: "Demo Classes", path: "/sales-executive/demo-classes" },
  { icon: GitPullRequest, label: "Enrollments", path: "/sales-management/registrations" },
  { icon: User, label: "Profile", path: "/settings?tab=profile" },
  { icon: Settings, label: "Settings", path: "/settings?tab=security" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = useLocation().pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const reason = params.get("reason");
      if (reason) {
        toast.error(reason, { duration: 5000 });
        // Remove query parameter without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

  // Manage the global socket.io connection (connect on login, disconnect on logout)
  const { socket } = useSocket();
  // Show a toast whenever any class starts in a batch the user is in
  useClassStartedAlert();

  const conversationsQuery = trpc.privateMessage.listConversations.useQuery(undefined, {
    enabled: !!user,
  });

  const notificationsQuery = trpc.notification.list.useQuery({ limit: 100 }, {
    enabled: !!user,
  });

  const myProfileQuery = trpc.user.myProfile.useQuery(undefined, {
    enabled: !!user,
  });

  const totalUnreadCount = conversationsQuery.data?.reduce((acc, c) => acc + c.unreadCount, 0) || 0;
  const unreadNotificationsCount = notificationsQuery.data?.items.filter((n) => !n.isRead).length || 0;

  useEffect(() => {
    if (!socket) return;

    function handleNewMessage() {
      conversationsQuery.refetch();
    }

    function handleNewNotification(notification: any) {
      notificationsQuery.refetch();

      const freshUser = myProfileQuery.data || user;
      const pausedUntil = freshUser?.notificationsPausedUntil;
      const isPaused = pausedUntil && new Date(pausedUntil).getTime() > Date.now();
      const isCritical = ["security", "password_change", "login_alert", "account_security"].includes(notification.type);

      if (isPaused && !isCritical) {
        return;
      }

      toast(notification.title, {
        description: notification.message,
        action: {
          label: "View",
          onClick: () => {
            window.location.href = "/notifications";
          },
        },
      });
    }

    socket.on("private_message:new", handleNewMessage);
    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("private_message:new", handleNewMessage);
      socket.off("notification:new", handleNewNotification);
    };
  }, [socket, conversationsQuery, notificationsQuery]);

  if (!user) return null;

  let items = user.role === "student"
    ? [...studentNav]
    : user.role === "sales_executive"
    ? [...salesNav]
    : [...navItems];

  if (user.role === "student") {
    const completionDate = myProfileQuery.data?.profile?.completionDate;
    const hasCompleted = completionDate !== null && completionDate !== undefined;
    if (!hasCompleted) {
      items = items.filter((item) => item.path !== "/community");
    }
  }
  if (!["super_admin", "teacher"].includes(user.role)) {
    items = items.filter((item) => item.path !== "/salaries");
  }
  if (!["super_admin", "admin"].includes(user.role)) {
    items = items.filter((item) => item.path !== "/sales-management/executives");
  }
  if (!["super_admin", "admin", "academic_head"].includes(user.role)) {
    items = items.filter((item) => item.path !== "/teacher-reports");
  }
  if (!["super_admin", "admin", "academic_head"].includes(user.role)) {
    items = items.filter((item) => item.path !== "/qualifications");
  }
  if (user.role !== "academic_head") {
    items = items.filter((item) => item.path !== "/academic-portal");
  }
  if (user.role === "academic_head") {
    const allowedPaths = [
      "/",
      "/students",
      "/batches",
      "/departments",
      "/academic-portal",
      "/classes/group",
      "/classes/one-to-one",
      "/classes/demo",
      "/feedback",
      "/performance",
      "/notifications",
      "/discipline",
      "/qualifications",
      "/reports",
      "/teacher-reports",
    ];
    items = items.filter((item) => allowedPaths.includes(item.path));
  }
  const currentLabel = items.find((i) => i.path === pathname)?.label || "Dashboard";

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b flex items-center gap-3 bg-[#091221] text-white">
        <img src="/logo.jpg" alt="EMTEES Academy Logo" className="h-10 w-auto object-contain rounded-md" />
        <div>
          <h1 className="text-sm font-bold tracking-wide">EMTEES Academy</h1>
          <p className="text-[10px] text-gray-400">LMS & Communication</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.path;
          const isMessages = item.path === "/messages";
          const isNotifications = item.path === "/notifications";
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </div>
              {isMessages && totalUnreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 min-w-5 text-center">
                  {totalUnreadCount}
                </span>
              )}
              {isNotifications && unreadNotificationsCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 min-w-5 text-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
            {user.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role.replace(/_/g, " ")}</p>
          </div>
        </div>
        <Button variant="outline" className="w-full text-sm" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-white border-r flex-col shrink-0">
        {SidebarContent()}
      </aside>

      {/* Mobile sidebar overlay & drawer with smooth CSS animation */}
      <div className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
        <aside className={`absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl z-50 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="text-sm font-semibold text-gray-700">Menu</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {SidebarContent()}
        </aside>
      </div>

      <IncomingCallOverlay />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-base font-semibold text-gray-800 truncate">{currentLabel}</h2>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/notifications"
              className="relative p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-sm text-gray-500 truncate max-w-[120px]">{user.name}</span>
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                {user.name?.[0]?.toUpperCase() || "U"}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-safe min-w-0">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden bg-white border-t flex items-center justify-around px-1 py-1 pb-safe shrink-0">
          {items.slice(0, 4).map((item) => {
            const active = pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 flex-1 ${
                  active ? "text-emerald-700" : "text-gray-500"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-emerald-700" : "text-gray-400"}`} />
                <span className="text-[10px] font-medium truncate w-full text-center">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 flex-1 text-gray-500"
          >
            <Menu className="w-5 h-5 text-gray-400" />
            <span className="text-[10px] font-medium truncate w-full text-center">More</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
