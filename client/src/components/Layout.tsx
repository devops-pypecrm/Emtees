import { useState, useEffect, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Bell, LogOut, Menu, X, Home, Users, CreditCard, ClipboardList, Settings, BarChart3, GraduationCap, Wallet, FileText, UserCheck, Calendar, MessageSquare, Video, Shield, UserPlus, Clock, Percent } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { useSocket } from "@/hooks/useSocket";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";
import { toast } from "sonner";

type Item = { to: string; label: string; icon: any };
const I = (to: string, label: string, icon: any): Item => ({ to, label, icon });

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin", admin: "Administrator", accountant: "Accountant", academic_head: "Academic Head", sales_executive: "Academic Counsellor", teacher: "Teacher", student: "Student",
};

export function navFor(role: string): Item[] {
  switch (role) {
    case "sales_executive": return [I("/", "Admissions", UserPlus), I("/demos", "Demo classes", Video), I("/students", "My students", Users), I("/reports", "Reports", BarChart3)];
    case "accountant": return [I("/", "Payments", CreditCard), I("/teacher-pay", "Teacher pay", Wallet), I("/students", "Students", Users), I("/reports", "Reports", BarChart3)];
    case "academic_head": return [I("/", "Overview", Home), I("/assign", "Assign teachers", UserCheck), I("/students", "Students", Users), I("/timetable", "Timetable", Calendar), I("/teachers", "Teachers", GraduationCap), I("/requests", "Requests", MessageSquare), I("/demos", "Demo classes", Video), I("/reports", "Reports", BarChart3)];
    case "teacher": return [I("/", "Today", Home), I("/my-students", "My students", Users), I("/demos", "Demo classes", Video), I("/earnings", "Earnings", Wallet), I("/availability", "Availability", Clock), I("/requests", "Requests", MessageSquare), I("/reports", "Reports", BarChart3)];
    case "student": return [I("/", "My course", Home), I("/classes", "Classes", ClipboardList), I("/requests", "Requests", MessageSquare)];
    default: return [ // admin + super_admin
      I("/", "Overview", Home), I("/admissions", "Admissions", UserPlus), I("/payments", "Payments", CreditCard), I("/assign", "Assign teachers", UserCheck), I("/students", "Students", Users),
      I("/timetable", "Timetable", Calendar), I("/people", "Staff", GraduationCap), I("/teacher-pay", "Teacher pay", Wallet), I("/rates", "Pay rates", Percent), I("/requests", "Requests", MessageSquare),
      I("/demos", "Demo classes", Video), I("/reports", "Reports", BarChart3), I("/audit", "Audit log", Shield), I("/settings", "Settings", Settings),
    ];
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useSocket();
  useEffect(() => setOpen(false), [loc.pathname]);

  const notes = trpc.notification.list.useQuery({ limit: 30 }, { enabled: !!user, refetchInterval: 60000 });
  const markAll = trpc.notification.markAllRead.useMutation({ onSuccess: () => notes.refetch() });
  const [showNotes, setShowNotes] = useState(false);
  const unread = (notes.data?.items || []).filter((n: any) => !n.isRead).length;

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason) { toast.error(reason); window.history.replaceState({}, "", window.location.pathname); }
  }, []);

  if (!user) return null;
  const items = navFor(user.role);
  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === "/"}
          className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${isActive ? "bg-white/15 text-white font-medium" : "text-slate-300 hover:bg-white/10"}`}>
          <it.icon className="h-4 w-4" />{it.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[#1D2A44] text-white sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10"><img src="/logo.jpg" className="h-8 w-8 rounded" alt="" /><span className="font-semibold">EMTEES</span></div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute left-0 top-0 h-full w-60 bg-[#1D2A44] text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10"><span className="font-semibold">EMTEES</span><X className="h-5 w-5" onClick={() => setOpen(false)} /></div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-white border-b px-4 h-14">
          <button className="md:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="text-sm text-slate-500 hidden md:block">{ROLE_LABEL[user.role] || user.role}</div>
          <div className="flex items-center gap-3 ml-auto relative">
            <button className="relative" onClick={() => { setShowNotes((s) => !s); if (!showNotes && unread) markAll.mutate(); }}>
              <Bell className="h-5 w-5 text-slate-600" />
              {unread > 0 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 text-white text-[10px] px-1.5">{unread}</span>}
            </button>
            {showNotes && (
              <div className="absolute right-0 top-9 w-80 max-h-96 overflow-y-auto rounded-lg border bg-white shadow-lg p-2 text-sm z-50">
                {(notes.data?.items || []).length === 0 && <div className="p-4 text-center text-slate-500">No notifications</div>}
                {(notes.data?.items || []).map((n: any) => (
                  <div key={n.id} className="border-b last:border-0 p-2"><div className="font-medium">{n.title || n.subject}</div><div className="text-slate-500 text-xs">{n.message}</div></div>
                ))}
              </div>
            )}
            <div className="text-sm font-medium">{user.name}</div>
            <button onClick={logout} title="Sign out"><LogOut className="h-4 w-4 text-slate-600" /></button>
          </div>
        </header>
        <main className="p-4 md:p-6 max-w-7xl">{children}</main>
      </div>
      <IncomingCallOverlay />
    </div>
  );
}
