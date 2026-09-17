import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  MessageCircle,
  ArrowRight,
  Play,
  Video,
  AlertCircle,
  UserCheck,
  BarChart3,
  Settings,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import JitsiMeet from "@/components/JitsiMeet";
import { toast } from "sonner";
import { ClassAllocationSummary } from "@/components/ClassAllocationSummary";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { socket } from "@/lib/socket";
import { Clock, Bell, Check, X } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [upcomingSearch, setUpcomingSearch] = useState("");
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";

  const statsQuery = trpc.admin.getDashboardStats.useQuery(undefined, { enabled: isAdmin });
  const myBatches = trpc.user.myBatches.useQuery(undefined, { enabled: user?.role === "student" || user?.role === "teacher" });
  const salesStatsQuery = trpc.salesExecutive.getDashboardStats.useQuery(undefined, { enabled: user?.role === "sales_executive" });
  const referralLinkQuery = trpc.salesExecutive.getReferralLink.useQuery(undefined, { enabled: user?.role === "sales_executive" });
  const myAttendance = trpc.class.myAttendance.useQuery(undefined, { enabled: user?.role === "student" });
  const notifications = trpc.student.myNotifications.useQuery(undefined, { enabled: user?.role === "student" });
  const teacherStatsQuery = trpc.user.getTeacherStats.useQuery(undefined, { enabled: isTeacher });
  const classesQuery = trpc.class.list.useQuery(undefined);
  const studentProfileQuery = trpc.students.getProfile.useQuery(
    { id: user?.id || 0 },
    { enabled: user?.role === "student" && typeof user?.id === "number" && user.id > 0 }
  );
  const myProfile = trpc.user.myProfile.useQuery(undefined, { enabled: user?.role === "student" });

  const [alertsSearch, setAlertsSearch] = useState("");
  const [alertsBatchFilter, setAlertsBatchFilter] = useState<string>("all");

  const showAttendanceAlerts = ["super_admin", "admin", "teacher"].includes(user?.role || "");
  const attendanceAlertsQuery = trpc.class.listAttendanceAlerts.useQuery(
    { status: "active" },
    { enabled: showAttendanceAlerts }
  );

  // Jitsi Meeting states
  const [jitsiRoom, setJitsiRoom] = useState<string | null>(null);
  const [selectedClassForMeeting, setSelectedClassForMeeting] = useState<any>(null);

  const startClass = trpc.class.start.useMutation({
    onSuccess: () => {
      toast.success("Class started");
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const startOneToOne = trpc.class.startOneToOne.useMutation({
    onSuccess: () => {
      toast.success("One-to-One Session started");
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordJoinTime = trpc.class.recordJoinTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const recordLeaveTime = trpc.class.recordLeaveTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const joinOneToOne = trpc.class.joinOneToOne.useMutation({
    onSuccess: () => {
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStartClass = async (cls: any) => {
    try {
      if (cls.classType === "one_to_one") {
        const details = await startOneToOne.mutateAsync({ sessionId: cls.id });
        setSelectedClassForMeeting({
          ...cls,
          isOneToOne: true,
          jwt: details?.jwt,
        });
        setJitsiRoom(details?.roomName || cls.meetingRoomId || `emtees-1to1-${cls.id}`);
      } else {
        await startClass.mutateAsync({ id: cls.id });
        setSelectedClassForMeeting(cls);
        setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start meeting");
    }
  };

  const handleJoinClass = async (cls: any) => {
    if (cls.classType === "one_to_one") {
      try {
        const details = await joinOneToOne.mutateAsync({ sessionId: cls.id });
        setSelectedClassForMeeting({
          ...cls,
          isOneToOne: true,
          jwt: details.jwt,
        });
        setJitsiRoom(details.roomName || cls.meetingRoomId || `emtees-1to1-${cls.id}`);
      } catch (err: any) {
        toast.error(err.message || "Failed to join 1-to-1 session");
      }
    } else {
      setSelectedClassForMeeting(cls);
      setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
    }
  };

  // Local time state updating every minute
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Reminder states persisting to localStorage
  const [reminders, setReminders] = useState<Record<number, boolean>>({});
  
  useEffect(() => {
    try {
      const stored = localStorage.getItem("session_reminders");
      if (stored) {
        setReminders(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleToggleReminder = (classId: number) => {
    const updated = { ...reminders, [classId]: !reminders[classId] };
    setReminders(updated);
    try {
      localStorage.setItem("session_reminders", JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (updated[classId]) {
      toast.success("Reminder added! You will be notified when this session starts.");
    } else {
      toast.info("Reminder removed.");
    }
  };

  // View Details Modal States
  const [selectedClassForDetails, setSelectedClassForDetails] = useState<any>(null);
  const [openDetailsModal, setOpenDetailsModal] = useState(false);

  // Enroll & Join Mutation
  const enrollAndJoin = trpc.class.enrollAndJoin.useMutation({
    onSuccess: (data, variables) => {
      toast.success("Successfully enrolled and joined class.");
      classesQuery.refetch();
      // Locate the newly enrolled class to launch meeting room immediately
      const cls = classesQuery.data?.find(c => c.id === variables.classId);
      if (cls) {
        handleJoinClass(cls);
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to enroll and join class.");
    }
  });

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleClassUpdate = () => {
      classesQuery.refetch();
    };

    socket.on("class:updated", handleClassUpdate);
    socket.on("class:started", handleClassUpdate);
    socket.on("class:ended", handleClassUpdate);
    socket.on("class:cancelled", handleClassUpdate);

    return () => {
      socket.off("class:updated", handleClassUpdate);
      socket.off("class:started", handleClassUpdate);
      socket.off("class:ended", handleClassUpdate);
      socket.off("class:cancelled", handleClassUpdate);
    };
  }, [socket]);

  const stats = statsQuery.data;

  if (!user) return null;

  if (user.role === "sales_executive") {
    const stats = salesStatsQuery.data;
    const refLink = referralLinkQuery.data;

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-700 p-6 rounded-2xl text-white shadow-md">
          <div>
            <h2 className="text-xl font-bold">Welcome back, {user.name}!</h2>
            <p className="text-xs text-emerald-100 mt-1">Here is your sales performance snapshot</p>
          </div>
          {refLink && (
            <div className="bg-white/10 border border-white/20 p-3 rounded-xl flex items-center gap-3 w-full md:w-auto">
              <div className="min-w-0">
                <span className="text-[10px] text-emerald-200 block uppercase font-semibold">Your Referral Link</span>
                <span className="text-xs font-mono font-bold truncate block">{typeof window !== "undefined" ? window.location.origin : ""}{refLink.link}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-white hover:bg-emerald-50 text-emerald-800 shrink-0 font-semibold"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    navigator.clipboard.writeText(`${window.location.origin}${refLink.link}`);
                    toast.success("Referral link copied!");
                  }
                }}
              >
                Copy Link
              </Button>
            </div>
          )}
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <StatCard icon={UserCheck} label="Registrations" value={stats?.totalRegistrations ?? 0} color="bg-emerald-50 text-emerald-600" />
          <StatCard icon={GraduationCap} label="Enrollments" value={stats?.totalEnrollments ?? 0} color="bg-purple-50 text-purple-600" />
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Recent Referrals */}
          <Card className="border border-gray-100 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="pb-2 border-b bg-gray-50/50">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Recent Registrations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Student ID</TableHead>
                      <TableHead className="text-xs font-semibold">Name</TableHead>
                      <TableHead className="text-xs font-semibold">Phone</TableHead>
                      <TableHead className="text-xs font-semibold">Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!stats?.recentRegistrations || stats.recentRegistrations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-gray-500 py-6">No students registered yet</TableCell>
                      </TableRow>
                    ) : (
                      stats.recentRegistrations.map((student) => (
                        <TableRow key={student.id} className="hover:bg-gray-50/50 transition-colors">
                          <TableCell className="text-xs font-semibold font-mono text-emerald-700">{student.profile?.enrollmentId || student.unionId}</TableCell>
                          <TableCell className="text-xs font-medium text-gray-900">{student.name}</TableCell>
                          <TableCell className="text-xs text-gray-600">{student.phone || "-"}</TableCell>
                          <TableCell className="text-xs text-gray-500">{new Date(student.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const activeAlerts = attendanceAlertsQuery.data || [];
  const uniqueBatches = Array.from(
    new Map(
      activeAlerts
        .filter((alert: any) => alert.batch)
        .map((alert: any) => [alert.batch.id, alert.batch])
    ).values()
  ) as any[];

  const filteredAlerts = activeAlerts.filter((alert: any) => {
    if (alertsSearch) {
      const searchLower = alertsSearch.toLowerCase();
      const nameMatch = alert.student?.name?.toLowerCase().includes(searchLower);
      const unionIdMatch = (alert.student?.profile?.enrollmentId || alert.student?.unionId)?.toLowerCase().includes(searchLower);
      if (!nameMatch && !unionIdMatch) {
        return false;
      }
    }
    if (alertsBatchFilter !== "all") {
      if (alert.batchId.toString() !== alertsBatchFilter) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {user.role === "student" && myProfile.data?.isRestricted && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 shadow-sm animate-pulse rounded-xl">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">Access Restricted Due to Outstanding Fees</h4>
              <p className="text-xs text-red-700 dark:text-red-400">
                Your account access has been restricted due to outstanding dues. Please clear your outstanding balance to regain access to live classes, recorded sessions, group chats, and learning resources.
              </p>
              <Link to="/fees" className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 dark:text-red-300 mt-2 hover:underline">
                Pay Outstanding Fees <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {isAdmin && stats && (
          <>
            <StatCard icon={Users} label="Total Students" value={stats.totalStudents} color="bg-blue-50 text-blue-600" to="/students" />
            <StatCard icon={GraduationCap} label="Teachers" value={stats.totalTeachers} color="bg-emerald-50 text-emerald-600" to="/users" />
            <StatCard icon={BookOpen} label="Batches" value={stats.totalBatches} color="bg-purple-50 text-purple-600" to="/batches" />
            <StatCard icon={Calendar} label="Total Classes Held" value={stats.totalClasses} color="bg-orange-50 text-orange-600" to="/classes/group" />
            <StatCard icon={Check} label="Valid Classes (≥20m)" value={stats.totalValidClasses ?? 0} color="bg-emerald-50 text-emerald-600" to="/reports" />
            <StatCard icon={CreditCard} label="Ledger Balance (Credits)" value={stats.totalLedgerBalance ?? 0} color="bg-indigo-50 text-indigo-600" to="/reports" />
            <StatCard icon={Check} label="Attendance Today" value={stats.todayTotalAttendance ?? 0} color="bg-teal-50 text-teal-600" to="/reports" />
            <StatCard icon={Check} label="Present Today" value={stats.todayPresentCount ?? 0} color="bg-green-50 text-green-600" to="/reports" />
            <StatCard icon={X} label="Absent Today" value={stats.todayAbsentCount ?? 0} color="bg-red-50 text-red-600" to="/reports" />
            <StatCard icon={BarChart3} label="Attendance % Today" value={`${stats.todayAttendancePercentage ?? 100}%`} color="bg-indigo-50 text-indigo-600" to="/reports" />
          </>
        )}
        {isTeacher && teacherStatsQuery.data && (
          <>
            <StatCard icon={Calendar} label="My Classes" value={teacherStatsQuery.data.classesCount ?? 0} color="bg-blue-50 text-blue-600" to="/classes/group" />
            <StatCard icon={Users} label="My Students" value={teacherStatsQuery.data.studentCount ?? 0} color="bg-emerald-50 text-emerald-600" to="/students" />
            <StatCard icon={Calendar} label="Today's Classes" value={teacherStatsQuery.data.todayClassesCount ?? 0} color="bg-teal-50 text-teal-600" to="/classes/one-to-one" />
            <StatCard icon={Check} label="Present Today" value={teacherStatsQuery.data.todayPresentCount ?? 0} color="bg-green-50 text-green-600" to="/reports" />
            <StatCard icon={X} label="Absent Today" value={teacherStatsQuery.data.todayAbsentCount ?? 0} color="bg-red-50 text-red-600" to="/reports" />
            <StatCard icon={CreditCard} label="Current Month Earnings" value={`₹${(teacherStatsQuery.data.currentMonthEarnings ?? 0).toLocaleString("en-IN")}`} color="bg-amber-50 text-amber-600" to="/salaries" />
          </>
        )}
        {user.role === "student" && (
          <>
            <StatCard icon={BookOpen} label="My Batches" value={myBatches.data?.length || 0} color="bg-blue-50 text-blue-600" to="/batches" />
            <StatCard
              icon={BarChart3}
              label="Attendance Percentage"
              value={myAttendance.data ? (myAttendance.data.length > 0 ? `${Math.round((myAttendance.data.filter((a) => a.status === "present" || a.status === "late").length / myAttendance.data.length) * 100)}%` : "100%") : "-"}
              color="bg-emerald-50 text-emerald-600"
              to="/reports"
            />
            <StatCard
              icon={Check}
              label="Present Classes"
              value={myAttendance.data?.filter((a) => a.status === "present" || a.status === "late").length ?? 0}
              color="bg-green-50 text-green-600"
              to="/reports"
            />
            <StatCard
              icon={X}
              label="Absent Classes"
              value={myAttendance.data?.filter((a) => a.status === "absent").length ?? 0}
              color="bg-red-50 text-red-600"
              to="/reports"
            />
            <StatCard
              icon={Calendar}
              label="Remaining Classes"
              value={myProfile.data?.profile ? (Number(myProfile.data.profile.remainingOneToOneSessions ?? 0) + Number(myProfile.data.profile.remainingGroupSessions ?? 0)) : 0}
              color="bg-purple-50 text-purple-600"
              to="/classes/group"
            />
          </>
        )}
      </div>

      {user.role === "student" && myProfile.data?.profile && (
        <div className="space-y-4">
          <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block">Enrolled Session Type</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                    {myProfile.data.profile.oneOnOneEnabled && myProfile.data.profile.groupSessionEnabled ? "One-on-One & Group Sessions" : myProfile.data.profile.oneOnOneEnabled ? "One-on-One Session" : myProfile.data.profile.groupSessionEnabled ? "Group Session" : "Standard Enrollment"}
                  </span>
                </div>
              </div>

              {myProfile.data.profile.preferredClassTime && (
                <div className="flex items-center gap-3 border-l pl-4 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block">Preferred Class Time</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{myProfile.data.profile.preferredClassTime}</span>
                  </div>
                </div>
              )}

              {myProfile.data.profile.paymentType && (
                <div className="flex items-center gap-3 border-l pl-4 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block">Payment Plan</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm capitalize">
                      {myProfile.data.profile.paymentType.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">My Session Balance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* One-to-One Sessions Card */}
            <Card className="border border-emerald-100 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/20 to-white dark:from-emerald-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">One-to-One Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {myProfile.data.profile.remainingOneToOneSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.allocatedOneToOneSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.attendedOneToOneSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Group Sessions Card */}
            <Card className="border border-blue-100 dark:border-blue-950 bg-gradient-to-br from-blue-50/20 to-white dark:from-blue-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-blue-800 dark:text-blue-400">Group Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                    {myProfile.data.profile.remainingGroupSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.allocatedGroupSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.attendedGroupSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Sessions Card */}
            <Card className="border border-purple-100 dark:border-purple-950 bg-gradient-to-br from-purple-50/20 to-white dark:from-purple-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-purple-800 dark:text-purple-400">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-purple-600 dark:text-purple-400">
                    {myProfile.data.profile.totalRemainingSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.totalAllocatedSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.totalAttendedSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      )}

      {user.role === "student" && studentProfileQuery.data?.classAllocation && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">My Class Allocation Details</h3>
          {(() => {
            const classAlloc = studentProfileQuery.data.classAllocation;
            const activeEnrollment = studentProfileQuery.data.enrollments?.find((e: any) => e.status === "active") || studentProfileQuery.data.enrollments?.[0];
            const groupBatchName = activeEnrollment?.batch?.name || "Unassigned";
            
            const getTeacherName = (tId: number | null | undefined) => {
              if (!tId) return "Unassigned";
              const resolved = activeEnrollment?.resolvedTeachers?.find((x: any) => x.id === tId);
              if (resolved) return resolved.name;
              if (activeEnrollment?.batch?.teacher?.id === tId) return activeEnrollment.batch.teacher.name;
              return `Teacher #${tId}`;
            };

            return (
              <ClassAllocationSummary
                allocation={classAlloc as any}
                oneToOneTeacherName={getTeacherName((classAlloc as any)?.oneToOne?.teacherId)}
                groupTeacherName={getTeacherName((classAlloc as any)?.group?.teacherId)}
                groupBatchName={groupBatchName}
                batchName={groupBatchName}
                moduleName={activeEnrollment?.batch?.module?.name}
                isAdmin={false}
              />
            );
          })()}
        </div>
      )}

      {/* Jitsi fullscreen overlay */}
      {jitsiRoom && user && (
        <JitsiMeet
          classId={selectedClassForMeeting.classId || selectedClassForMeeting.id}
          isOneToOne={selectedClassForMeeting.classType === "one_to_one" || selectedClassForMeeting.title?.startsWith("1-on-1") || !!selectedClassForMeeting.isOneToOne}
          roomName={jitsiRoom}
          jwt={selectedClassForMeeting.jwt}
          onJoin={() => {
            if (selectedClassForMeeting && user.role === "student" && selectedClassForMeeting.classType !== "one_to_one" && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
              recordJoinTime.mutate({ classId: selectedClassForMeeting.classId || selectedClassForMeeting.id });
            }
          }}
          onLeave={() => {
            if (selectedClassForMeeting && user.role === "student" && selectedClassForMeeting.classType !== "one_to_one" && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
              recordLeaveTime.mutate({ classId: selectedClassForMeeting.classId || selectedClassForMeeting.id });
            }
          }}
          classInfo={selectedClassForMeeting ? {
            title: selectedClassForMeeting.title,
            scheduledAt: selectedClassForMeeting.scheduledAt,
            teacherName: selectedClassForMeeting.teacherName || selectedClassForMeeting.teacher?.name,
          } : undefined}
          onClose={() => {
            setJitsiRoom(null);
            setSelectedClassForMeeting(null);
            classesQuery.refetch();
          }}
        />
      )}

      {/* Live & Upcoming Classes Widget */}
      <Card className="border border-emerald-100/40 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/10 via-white to-white dark:from-emerald-950/5 dark:via-gray-950 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-50 dark:border-gray-900/50">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-400 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live & Upcoming Sessions
          </CardTitle>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search student name or ID..."
                value={upcomingSearch}
                onChange={(e) => setUpcomingSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-white/80 dark:bg-gray-900/80 border-gray-200 dark:border-gray-800 rounded-lg"
              />
            </div>
            <Link to="/classes" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline flex items-center gap-1 shrink-0">
              View All Classes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Dynamic calculations for live & upcoming classes */}
          {(() => {
            const nowTime = now.getTime();
            const getPriority = (status: "LIVE NOW" | "STARTING SOON" | "UPCOMING") => {
              if (status === "LIVE NOW") return 1;
              if (status === "STARTING SOON") return 2;
              return 3;
            };

            const searchQuery = upcomingSearch.trim().toLowerCase();

            const classesList = (classesQuery.data || [])
              .map((cls: any) => {
                const startTime = new Date(cls.scheduledAt);
                const duration = cls.duration || cls.sessionLength || 30;
                const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
                const diffMs = startTime.getTime() - nowTime;

                let statusLabel: "LIVE NOW" | "STARTING SOON" | "UPCOMING" = "UPCOMING";
                let isLive = false;

                if (cls.status === "ongoing" || (cls.status === "scheduled" && nowTime >= startTime.getTime() && nowTime <= endTime.getTime())) {
                  statusLabel = "LIVE NOW";
                  isLive = true;
                } else if (cls.status === "scheduled" && diffMs <= 30 * 60 * 1000 && diffMs > 0) {
                  statusLabel = "STARTING SOON";
                } else {
                  statusLabel = "UPCOMING";
                }

                const isPast = cls.status === "completed" || cls.status === "cancelled" || (cls.status === "scheduled" && nowTime > endTime.getTime());

                return {
                  ...cls,
                  startTime,
                  endTime,
                  diffMs,
                  statusLabel,
                  isLive,
                  isPast,
                };
              })
              .filter((cls) => !cls.isPast)
              .filter((cls) => {
                if (!searchQuery) return true;
                const studentName = (cls.student?.name || cls.studentName || "").toLowerCase();
                const studentId = String(
                  cls.student?.unionId ||
                  cls.student?.profile?.enrollmentId ||
                  cls.student?.profile?.admissionNo ||
                  cls.student?.id ||
                  cls.studentId ||
                  ""
                ).toLowerCase();
                const studentEmail = (cls.student?.email || cls.studentEmail || "").toLowerCase();
                const title = (cls.title || "").toLowerCase();

                return (
                  studentName.includes(searchQuery) ||
                  studentId.includes(searchQuery) ||
                  studentEmail.includes(searchQuery) ||
                  title.includes(searchQuery)
                );
              })
              .sort((a, b) => {
                const pA = getPriority(a.statusLabel);
                const pB = getPriority(b.statusLabel);
                if (pA !== pB) return pA - pB;
                return a.startTime.getTime() - b.startTime.getTime();
              })
              .slice(0, 6);

            const getCountdownString = (diffMs: number) => {
              if (diffMs <= 0) return "Starting...";
              const diffMins = Math.floor(diffMs / 60000);
              const mins = diffMins % 60;
              const diffHours = Math.floor(diffMins / 60);
              const hours = diffHours % 24;
              const days = Math.floor(diffHours / 24);

              const parts = [];
              if (days > 0) parts.push(`${days} Day${days > 1 ? "s" : ""}`);
              if (hours > 0) parts.push(`${hours} Hour${hours > 1 ? "s" : ""}`);
              if (mins > 0 || parts.length === 0) parts.push(`${mins} Min${mins > 1 ? "s" : ""}`);

              return `Starts in: ${parts.join(" ")}`;
            };

            if (classesQuery.isLoading) {
              return <p className="text-xs text-gray-400 py-6 text-center">Loading classes...</p>;
            }

            if (classesList.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-400 dark:text-gray-600 text-lg">
                    {upcomingSearch ? "🔍" : "📅"}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {upcomingSearch ? `No sessions found matching "${upcomingSearch}"` : "No live or upcoming sessions available."}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                    {upcomingSearch ? "Try searching with a different student name or ID." : "Check back later for scheduled classes."}
                  </p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classesList.map((cls) => (
                  <div
                    key={cls.id}
                    className="relative flex flex-col justify-between p-5 rounded-2xl border border-gray-100 dark:border-gray-900 bg-white dark:bg-gray-950 hover:shadow-lg hover:border-emerald-200/60 dark:hover:border-emerald-900/60 transition-all duration-300"
                  >
                    {/* Header: Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {cls.statusLabel === "LIVE NOW" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                          🔴 LIVE NOW
                        </span>
                      ) : cls.statusLabel === "STARTING SOON" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900">
                          🕒 STARTING SOON
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900">
                          📅 UPCOMING
                        </span>
                      )}

                      {cls.statusLabel !== "LIVE NOW" && (
                        <span className="text-[10px] font-mono font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded-md">
                          {getCountdownString(cls.diffMs)}
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    <div className="space-y-2 mb-4">
                      <div>
                        <h4 className="font-bold text-sm text-gray-950 dark:text-white line-clamp-1">{cls.title}</h4>
                        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 line-clamp-1 mt-0.5">
                          {cls.classType === "one_to_one" ? (
                            <>
                              One-to-One Session {cls.student?.name && `| Student: ${cls.student.name}`}
                            </>
                          ) : (
                            <>
                              Group Class | {cls.batch?.name || "Batch"} | {cls.batch?.module?.name || "Course"}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <p className="flex items-center gap-1.5">
                          <span className="font-semibold">Teacher:</span> {cls.teacher?.name || "Not assigned"}
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[10px] text-gray-400">
                          <span>Date:</span> {cls.startTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[10px] text-gray-400">
                          <span>Time:</span> {cls.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} ({cls.duration || 60} mins)
                        </p>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-auto pt-3 border-t border-gray-50 dark:border-gray-900 flex items-center gap-2">
                      {user.role === "student" ? (
                        !cls.isEnrolled ? (
                          <Button
                            size="sm"
                            onClick={() => enrollAndJoin.mutate({ classId: cls.id })}
                            disabled={enrollAndJoin.isPending}
                            className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 font-semibold shadow-md shadow-emerald-500/10"
                          >
                            {enrollAndJoin.isPending && enrollAndJoin.variables?.classId === cls.id ? (
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Enroll & Join
                          </Button>
                        ) : (cls.statusLabel === "LIVE NOW" || cls.classType === "one_to_one") ? (
                          <Button
                            size="sm"
                            onClick={() => handleJoinClass(cls)}
                            disabled={!!myProfile.data?.isRestricted}
                            className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 font-semibold shadow-md shadow-red-500/10"
                          >
                            <Video className="w-4 h-4" /> Join Session
                          </Button>
                        ) : (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="grid grid-cols-2 gap-2 w-full">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedClassForDetails(cls);
                                  setOpenDetailsModal(true);
                                }}
                                className="text-xs h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 font-semibold"
                              >
                                View Details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleReminder(cls.id)}
                                className={`text-xs h-9 rounded-xl font-semibold flex items-center justify-center gap-1 ${
                                  reminders[cls.id]
                                    ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
                                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                                }`}
                              >
                                {reminders[cls.id] ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Set
                                  </>
                                ) : (
                                  <>
                                    <Bell className="w-3.5 h-3.5 text-gray-400" /> Remind
                                  </>
                                )}
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              disabled
                              className="w-full bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-600 text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 font-semibold cursor-not-allowed"
                            >
                              <Video className="w-4 h-4" /> Join Class (Disabled)
                            </Button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col gap-2 w-full">
                          <div className={
                            cls.status === "ongoing" || ((isTeacher && cls.teacherId === user.id) || user.role === "super_admin")
                              ? "grid grid-cols-2 gap-2 w-full"
                              : "w-full"
                          }>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedClassForDetails(cls);
                                setOpenDetailsModal(true);
                              }}
                              className="w-full text-xs h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 font-semibold"
                            >
                              View Details
                            </Button>
                            {cls.status === "ongoing" ? (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 font-semibold"
                                onClick={() => handleJoinClass(cls)}
                              >
                                <Video className="w-4 h-4" /> Join Class
                              </Button>
                            ) : (
                              ((isTeacher && cls.teacherId === user.id) || user.role === "super_admin") && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleStartClass(cls)}
                                  disabled={((cls.classType !== "one_to_one" && nowTime < cls.startTime.getTime()) || startClass.isPending || startOneToOne.isPending)}
                                >
                                  {((startClass.isPending && startClass.variables?.id === cls.id) || (startOneToOne.isPending && startOneToOne.variables?.sessionId === cls.id)) ? (
                                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                  Start Class
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {showAttendanceAlerts && (
        <Card className="border border-red-100/40 dark:border-red-950 bg-gradient-to-br from-red-50/10 via-white to-white dark:from-red-950/5 dark:via-gray-950 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-50 dark:border-gray-900/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-800 dark:text-red-400">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 animate-pulse" />
              At Risk Attendance Alerts (7+ Days Absent)
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
              <Input
                placeholder="Search student name or ID..."
                value={alertsSearch}
                onChange={(e) => setAlertsSearch(e.target.value)}
                className="h-8 text-xs w-full sm:w-48 bg-white dark:bg-gray-950"
              />
              <Select value={alertsBatchFilter} onValueChange={setAlertsBatchFilter}>
                <SelectTrigger className="h-8 text-xs w-full sm:w-48 bg-white dark:bg-gray-950">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="all">All Batches</SelectItem>
                  {uniqueBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {attendanceAlertsQuery.isLoading ? (
              <p className="text-xs text-gray-400 py-4 text-center">Loading at-risk students...</p>
            ) : filteredAlerts.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">No at-risk students match the criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-gray-100 dark:border-gray-900">
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Student Name</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Student ID</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Batch Name</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Assigned Teacher</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500 text-center">Consecutive Absences</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Last Attendance Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlerts.map((alert: any) => (
                      <TableRow key={alert.id} className="border-gray-50 dark:border-gray-900/50 hover:bg-gray-50/50 dark:hover:bg-gray-900/10">
                        <TableCell className="py-2.5 font-medium text-xs text-gray-800 dark:text-gray-200">
                          {alert.student?.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {alert.student?.profile?.enrollmentId || alert.student?.unionId}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-600 dark:text-gray-300">
                          {alert.batch?.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                          {alert.batch?.teacher?.name || "Not assigned"}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-center font-semibold text-red-600 dark:text-red-400">
                          <Badge variant="destructive" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900/30 font-semibold text-[11px] px-2 py-0.5 rounded">
                            {alert.consecutiveAbsences} days
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                          {alert.lastAttendanceDate
                            ? new Date(alert.lastAttendanceDate).toLocaleDateString([], { dateStyle: "medium" })
                            : "No classes attended"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
            {isAdmin && (
              <>
                <QuickAction to="/users" label="Manage Users" desc="Add/edit students & teachers" />
                <QuickAction to="/batches" label="Manage Batches" desc="Create modules & batches" />
                <QuickAction to="/classes" label="Schedule Classes" desc="Plan live sessions" />
                {user.role !== "academic_head" && (
                  <QuickAction to="/fees" label="Fee Management" desc="Track payments & dues" />
                )}
              </>
            )}
            {isTeacher && (
              <>
                <QuickAction to="/classes" label="My Classes" desc="View & start sessions" />
                <QuickAction to="/chat" label="Group Chat" desc="Message your batches" />
                <QuickAction to="/reports" label="Reports" desc="View performance data" />
              </>
            )}
            {user.role === "student" && (
              <>
                <QuickAction to="/batches" label="My Batches" desc="View enrolled batches" />
                <QuickAction to="/chat" label="Group Chat" desc="Chat with batch members" />
                <QuickAction to="/classes" label="Upcoming Classes" desc="See scheduled sessions" />
                <QuickAction to="/fees" label="My Fees" desc="View payment status" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.role === "student" && notifications.data?.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-gray-500 text-xs">{n.message}</p>
                </div>
              </div>
            )) || (
              <p className="text-sm text-gray-500">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Class Details Modal */}
      {selectedClassForDetails && (
        <Dialog open={openDetailsModal} onOpenChange={setOpenDetailsModal}>
          <DialogContent className="max-w-md bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-2xl shadow-2xl p-6">
            <DialogHeader className="pb-3 border-b border-gray-50 dark:border-gray-900/50">
              <DialogTitle className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                🎓 Class Session Details
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 mt-1">
                View the scheduling details for this upcoming live class.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-sm text-gray-800 dark:text-gray-200">
              <div>
                <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Class Title</span>
                <span className="font-bold text-base text-gray-950 dark:text-white">{selectedClassForDetails.title}</span>
              </div>

              {selectedClassForDetails.classType === "one_to_one" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Session Type</span>
                    <span className="font-medium text-xs text-purple-600 dark:text-purple-400">One-to-One Session</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Assigned Student</span>
                    <span className="font-medium text-xs text-emerald-600 dark:text-emerald-400">{selectedClassForDetails.student?.name || "Not assigned"}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Batch</span>
                    <span className="font-medium text-xs text-emerald-600 dark:text-emerald-400">{selectedClassForDetails.batch?.name || "Not assigned"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Course Module</span>
                    <span className="font-medium text-xs text-blue-600 dark:text-blue-400">{selectedClassForDetails.batch?.module?.name || "Not assigned"}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Scheduled Date</span>
                  <span className="text-xs font-mono">{selectedClassForDetails.startTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Scheduled Time</span>
                  <span className="text-xs font-mono">{selectedClassForDetails.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} ({selectedClassForDetails.duration || 60} mins)</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Assigned Teacher</span>
                <span className="text-xs font-medium">{selectedClassForDetails.teacher?.name || "No teacher assigned"}</span>
              </div>

              {selectedClassForDetails.description && (
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
                    {selectedClassForDetails.classType === "one_to_one" ? "Remarks" : "Description / Agenda"}
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-900/50 leading-relaxed">
                    {selectedClassForDetails.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-50 dark:border-gray-900/50">
              <div className="flex items-center gap-3 w-full">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-10 text-xs font-semibold"
                  onClick={() => handleToggleReminder(selectedClassForDetails.id)}
                >
                  {reminders[selectedClassForDetails.id] ? "Remove Reminder" : "Add Reminder"}
                </Button>
                
                {user.role === "student" ? (
                  selectedClassForDetails.isEnrolled && (
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 text-xs font-semibold"
                      disabled={!!myProfile.data?.isRestricted}
                      onClick={() => {
                        setOpenDetailsModal(false);
                        handleJoinClass(selectedClassForDetails);
                      }}
                    >
                      Join Session
                    </Button>
                  )
                ) : (
                  ((isTeacher && selectedClassForDetails.teacherId === user.id) || user.role === "super_admin") && (
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-10 text-xs font-semibold disabled:opacity-50"
                      disabled={(selectedClassForDetails.classType !== "one_to_one" && now.getTime() < selectedClassForDetails.startTime.getTime()) || startClass.isPending || startOneToOne.isPending}
                      onClick={() => {
                        setOpenDetailsModal(false);
                        handleStartClass(selectedClassForDetails);
                      }}
                    >
                      Start Session
                    </Button>
                  )
                )}
              </div>

              <Button
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800 dark:text-gray-300 rounded-xl h-10 text-xs font-semibold"
                onClick={() => setOpenDetailsModal(false)}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, to }: { icon: any; label: string; value: string | number; color: string; to?: string }) {
  const content = (
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-xl md:text-2xl font-bold mt-0.5">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-2 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </CardContent>
  );

  if (to) {
    return (
      <Card className="hover:shadow-md hover:border-slate-300 dark:hover:border-slate-800 transition-all duration-200 cursor-pointer">
        <Link to={to} className="block w-full h-full">
          {content}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      {content}
    </Card>
  );
}

function QuickAction({ to, label, desc }: { to: string; label: string; desc: string }) {
  return (
    <Link to={to} className="flex items-center justify-between p-4 rounded-lg border hover:border-emerald-300 hover:bg-emerald-50 transition-colors group">
      <div>
        <p className="font-medium text-gray-900 group-hover:text-emerald-700">{label}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
    </Link>
  );
}
