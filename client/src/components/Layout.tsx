import { useState, useEffect, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell, LogOut, Menu, X, Home, Users, CreditCard, ClipboardList, Settings, BarChart3, GraduationCap, Wallet,
  UserCheck, Calendar, MessageSquare, Video, Shield, UserPlus, Clock, Percent, UsersRound, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { useSocket } from "@/hooks/useSocket";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";
import { toast } from "sonner";

type Item = { to: string; label: string; icon: any };
type Group = { title?: string; items: Item[] };
const I = (to: string, label: string, icon: any): Item => ({ to, label, icon });

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin", admin: "Administrator", accountant: "Accountant", academic_head: "Academic Head",
  sales_executive: "Academic Counsellor", teacher: "Teacher", student: "Student",
};

/** Menu per role, split into a few small labelled groups so it never feels crowded. */
export function navFor(role: string): Group[] {
  switch (role) {
    case "sales_executive":
      return [
        { items: [I("/", "Admissions", UserPlus), I("/demos", "Demo classes", Video)] },
        { title: "Records", items: [I("/students", "My students", Users), I("/reports", "Reports", BarChart3)] },
      ];
    case "accountant":
      return [
        { items: [I("/", "Payments", CreditCard), I("/teacher-pay", "Teacher pay", Wallet)] },
        { title: "Records", items: [I("/students", "Students", Users), I("/reports", "Reports", BarChart3)] },
      ];
    case "academic_head":
      return [
        { items: [I("/", "Overview", Home)] },
        { title: "Students", items: [I("/assign", "Assign teachers", UserCheck), I("/students", "All students", Users), I("/requests", "Requests", MessageSquare)] },
        { title: "Classes", items: [I("/timetable", "Timetable", Calendar), I("/groups", "Group sessions", UsersRound), I("/demos", "Demo classes", Video)] },
        { title: "Team", items: [I("/teachers", "Teachers", GraduationCap), I("/reports", "Reports", BarChart3)] },
      ];
    case "teacher":
      return [
        { items: [I("/", "Today", Home), I("/my-students", "My students", Users)] },
        { title: "Classes", items: [I("/groups", "Group sessions", UsersRound), I("/demos", "Demo classes", Video)] },
        { title: "Me", items: [I("/earnings", "Earnings", Wallet), I("/availability", "Availability", Clock), I("/requests", "Requests", MessageSquare), I("/reports", "Reports", BarChart3)] },
      ];
    case "student":
      return [{ items: [I("/", "My course", Home), I("/classes", "Classes", ClipboardList), I("/groups", "Group sessions", UsersRound), I("/requests", "Requests", MessageSquare)] }];
    default: // admin + super_admin
      return [
        { items: [I("/", "Overview", Home)] },
        { title: "Admissions", items: [I("/admissions", "Admissions", UserPlus), I("/payments", "Payments", CreditCard)] },
        { title: "Academics", items: [I("/assign", "Assign teachers", UserCheck), I("/students", "Students", Users), I("/timetable", "Timetable", Calendar), I("/groups", "Group sessions", UsersRound), I("/demos", "Demo classes", Video), I("/requests", "Requests", MessageSquare)] },
        { title: "Finance", items: [I("/teacher-pay", "Teacher pay", Wallet), I("/rates", "Pay rates", Percent)] },
        { title: "Administration", items: [I("/people", "Staff", GraduationCap), I("/reports", "Reports", BarChart3), I("/audit", "Audit log", Shield), I("/settings", "Settings", Settings)] },
      ];
  }
}

function Sidebar({ groups, onNavigate }: { groups: Group[]; onNavigate?: () => void }) {
  const loc = useLocation();
  // A group collapses only when you close it; the one holding the current page always stays open.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
      {groups.map((g, gi) => {
        const active = g.items.some((it) => (it.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(it.to)));
        const isClosed = !!g.title && closed[g.title] && !active;
        return (
          <div key={gi}>
            {g.title && (
              <button onClick={() => setClosed((c) => ({ ...c, [g.title!]: !c[g.title!] }))}
                className="w-full flex items-center justify-between px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                {g.title}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${isClosed ? "-rotate-90" : ""}`} />
              </button>
            )}
            {!isClosed && (
              <div className="space-y-1">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"} onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        isActive ? "bg-[#1D2A44] text-white font-medium shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                    <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                    {it.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100">
      <img src="/logo.jpg" className="h-9 w-9 rounded-lg object-cover" alt="" />
      <div className="leading-tight"><div className="font-semibold text-slate-900">EMTEES</div><div className="text-[11px] text-slate-400">Academy</div></div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const loc = useLocation();
  useSocket();
  useEffect(() => { setOpen(false); setShowNotes(false); }, [loc.pathname]);

  const notes = trpc.notification.list.useQuery({ limit: 30 }, { enabled: !!user, refetchInterval: 60000 });
  const markAll = trpc.notification.markAllRead.useMutation({ onSuccess: () => notes.refetch() });
  const items = notes.data?.items || [];
  const unread = items.filter((n: any) => !n.isRead).length;

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason) { toast.error(reason); window.history.replaceState({}, "", window.location.pathname); }
  }, []);

  if (!user) return null;
  const groups = navFor(user.role);
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const userCard = (
    <div className="border-t border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 grid place-items-center text-sm font-semibold">{initials}</div>
        <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-900 truncate">{user.name}</div><div className="text-xs text-slate-400 truncate">{ROLE_LABEL[user.role] || user.role}</div></div>
        <button onClick={logout} title="Sign out" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/70 lg:flex">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white border-r border-slate-200 sticky top-0 h-screen">
        <Brand />
        <Sidebar groups={groups} />
        {userCard}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-4"><Brand /><button onClick={() => setOpen(false)} className="p-2"><X className="h-5 w-5 text-slate-500" /></button></div>
            <Sidebar groups={groups} onNavigate={() => setOpen(false)} />
            {userCard}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-5 md:px-8 bg-white/80 backdrop-blur border-b border-slate-200">
          <button className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100" onClick={() => setOpen(true)}><Menu className="h-5 w-5 text-slate-600" /></button>
          <div className="lg:hidden font-semibold text-slate-900">EMTEES</div>
          <div className="ml-auto relative">
            <button className="relative p-2 rounded-lg hover:bg-slate-100" onClick={() => { setShowNotes((s) => !s); if (!showNotes && unread) markAll.mutate(); }}>
              <Bell className="h-5 w-5 text-slate-600" />
              {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 rounded-full bg-[#C8102E] text-white text-[10px] leading-4 px-1 text-center">{unread}</span>}
            </button>
            {showNotes && (
              <div className="absolute right-0 top-12 w-[22rem] max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold">Notifications</div>
                {items.length === 0 && <div className="p-8 text-center text-sm text-slate-400">You're all caught up</div>}
                {items.map((n: any) => (
                  <div key={n.id} className="px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="text-sm font-medium text-slate-800">{n.title || n.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="px-5 py-8 md:px-10 md:py-10 max-w-7xl mx-auto">{children}</main>
      </div>
      <IncomingCallOverlay />
    </div>
  );
}
