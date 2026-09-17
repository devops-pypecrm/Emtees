import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { 
  Download, 
  AlertTriangle, 
  Search, 
  XCircle, 
  Printer, 
  Edit, 
  User, 
  Calendar, 
  BookOpen, 
  DollarSign, 
  Clock, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  Mail, 
  Phone,
  CreditCard,
  GraduationCap,
  Award,
  Star,
  MapPin,
  Activity,
  Briefcase,
  Check,
  X,
  Plus
} from "lucide-react";
import ClassReportView from "@/components/ClassReportView";
import WorkloadReportView from "@/components/WorkloadReportView";

export default function ReportsPage() {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  
  const [teacherId, setTeacherId] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
  const [teacherStatusFilter, setTeacherStatusFilter] = useState("all");
  const [teacherBatchFilter, setTeacherBatchFilter] = useState("all");

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";

  // Attendance report states
  const [attendanceTeacherId, setAttendanceTeacherId] = useState<number | null>(null);
  const [attendanceTeacherSearch, setAttendanceTeacherSearch] = useState("");
  const [showAttendanceTeacherDropdown, setShowAttendanceTeacherDropdown] = useState(false);
  const [attendanceDateType, setAttendanceDateType] = useState("this_month");
  const [attendanceStartDate, setAttendanceStartDate] = useState("");
  const [attendanceEndDate, setAttendanceEndDate] = useState("");
  const [attendanceModuleId, setAttendanceModuleId] = useState("all");
  const [attendanceBatchId, setAttendanceBatchId] = useState("all");
  const [attendanceSessionType, setAttendanceSessionType] = useState("all");
  const [attendancePage, setAttendancePage] = useState(1);
  const [selectedCellDetails, setSelectedCellDetails] = useState<any | null>(null);

  // Holiday management states
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDescription, setHolidayDescription] = useState("");
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);

  // Teacher Student-Wise Report states
  const [tswTeacherId, setTswTeacherId] = useState<number | null>(null);
  const [tswTeacherSearch, setTswTeacherSearch] = useState("");
  const [showTswTeacherDropdown, setShowTswTeacherDropdown] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [tswStartDate, setTswStartDate] = useState(firstOfMonth);
  const [tswEndDate, setTswEndDate] = useState(today);

  // Daily Teacher Report states
  const [dailyReportDate, setDailyReportDate] = useState(today);

  // Auto-set teacher id if logged in user is teacher
  useEffect(() => {
    if (isTeacher && user?.id) {
      setAttendanceTeacherId(user.id);
    }
  }, [user, isTeacher]);

  const statsQuery = trpc.admin.getDashboardStats.useQuery(undefined, { enabled: isAdmin });
  const studentSearchQuery = trpc.admin.searchStudents.useQuery(
    { search: studentSearch },
    { enabled: studentSearch.length >= 2 && showStudentDropdown && isAdmin }
  );

  const batchesQuery = trpc.learning.listBatches.useQuery(undefined, { enabled: isAdmin });

  const teacherSearchQuery = trpc.admin.searchTeachers.useQuery(
    {
      search: teacherSearch,
      status: teacherStatusFilter === "all" ? undefined : teacherStatusFilter,
      batchId: teacherBatchFilter === "all" ? undefined : Number(teacherBatchFilter),
    },
    { enabled: isAdmin }
  );

  const attendanceTeacherSearchQuery = trpc.admin.searchTeachers.useQuery(
    {
      search: attendanceTeacherSearch,
    },
    { enabled: isAdmin && attendanceTeacherSearch.length >= 2 && showAttendanceTeacherDropdown }
  );

  const studentReport = trpc.admin.getStudentReport.useQuery(
    { studentId: isNaN(Number(studentId)) ? studentId : Number(studentId) },
    { enabled: !!studentId && isAdmin }
  );
  const teacherReport = trpc.admin.getTeacherReport.useQuery(
    { teacherId: isNaN(Number(teacherId)) ? teacherId : Number(teacherId) },
    { enabled: !!teacherId && isAdmin }
  );
  const leaderboard = trpc.admin.getLeaderboard.useQuery(undefined, { enabled: isAdmin });
  const myAttendance = trpc.class.myAttendance.useQuery(undefined, { enabled: user?.role === "student" });
  const studentProfileQuery = trpc.students.getProfile.useQuery(
    { id: user?.id || 0 },
    { enabled: user?.role === "student" && typeof user?.id === "number" && user.id > 0 }
  );

  // Holiday Queries
  const holidaysQuery = trpc.class.listHolidays.useQuery(undefined, { enabled: isAdmin });
  const createHolidayMutation = trpc.class.createHoliday.useMutation({
    onSuccess: () => {
      toast.success("Holiday created successfully");
      holidaysQuery.refetch();
      attendanceReportQuery.refetch();
      setShowHolidayDialog(false);
      setHolidayName("");
      setHolidayDate("");
      setHolidayDescription("");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteHolidayMutation = trpc.class.deleteHoliday.useMutation({
    onSuccess: () => {
      toast.success("Holiday deleted successfully");
      holidaysQuery.refetch();
      attendanceReportQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const { start: calculatedStart, end: calculatedEnd } = getDateRange(attendanceDateType);
  const startFilter = attendanceDateType === "custom" ? attendanceStartDate : calculatedStart;
  const endFilter = attendanceDateType === "custom" ? attendanceEndDate : calculatedEnd;

  const attendanceReportQuery = trpc.class.getAttendanceReport.useQuery(
    {
      teacherId: attendanceTeacherId || 0,
      startDate: startFilter || undefined,
      endDate: endFilter || undefined,
      moduleId: attendanceModuleId === "all" ? undefined : Number(attendanceModuleId),
      batchId: attendanceBatchId === "all" ? undefined : Number(attendanceBatchId),
      sessionType: attendanceSessionType === "all" ? undefined : (attendanceSessionType as "group" | "one_to_one"),
      page: attendancePage,
      limit: 10,
    },
    {
      enabled: !!attendanceTeacherId,
    }
  );

  const exportTeacherReport = trpc.admin.exportTeacherReport.useQuery(
    { teacherId: isNaN(Number(teacherId)) ? teacherId : Number(teacherId) },
    { enabled: false }
  );

  // Teacher Student-Wise Report query
  const tswTeacherSearchQuery = trpc.admin.searchTeachers.useQuery(
    { search: tswTeacherSearch },
    { enabled: isAdmin && tswTeacherSearch.length >= 2 && showTswTeacherDropdown }
  );
  const tswReportQuery = trpc.admin.getTeacherStudentWiseReport.useQuery(
    { teacherId: tswTeacherId!, startDate: tswStartDate, endDate: tswEndDate },
    { enabled: isAdmin && !!tswTeacherId && !!tswStartDate && !!tswEndDate }
  );

  // Daily Teacher Report query
  const dailyReportQuery = trpc.admin.getDailyTeacherReport.useQuery(
    { date: dailyReportDate },
    { enabled: isAdmin && !!dailyReportDate }
  );

  function getDateRange(type: string): { start: string; end: string } {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (type) {
      case "today":
        break;
      case "yesterday":
        start.setDate(now.getDate() - 1);
        end.setDate(now.getDate() - 1);
        break;
      case "this_week": {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        end.setDate(diff + 6);
        break;
      }
      case "last_week": {
        const dayL = now.getDay();
        const diffL = now.getDate() - dayL + (dayL === 0 ? -6 : 1) - 7;
        start.setDate(diffL);
        end.setDate(diffL + 6);
        break;
      }
      case "this_month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "last_month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        return { start: "", end: "" };
    }

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }

  const exportAttendanceToExcel = () => {
    if (!attendanceReportQuery.data) return;
    const { teacher, students, columns } = attendanceReportQuery.data;

    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: sans-serif; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
          th { background-color: #0f766e; color: white; font-weight: bold; }
          .left-align { text-align: left; }
          .present { background-color: #22c55e; color: white; }
          .absent { background-color: #ef4444; color: white; }
          .holiday { background-color: #3b82f6; color: white; }
          .cancelled { background-color: #f97316; color: white; }
          .noclass { background-color: #e2e8f0; color: #64748b; }
          h2, h3 { color: #0f766e; }
        </style>
      </head>
      <body>
        <h2>EMTEES Academy - Teacher Attendance Report</h2>
        <p><strong>Teacher:</strong> ${teacher.name} (${teacher.id})</p>
        <p><strong>Department:</strong> ${teacher.department}</p>
        <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
        
        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Student ID</th>
              <th>Present Days</th>
              <th>Absent Days</th>
              <th>Attendance %</th>
              ${columns.map(c => `<th>${c.date}<br/><small>${c.type === 'one_to_one' ? '1:1' : 'Group'}</small></th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr>
                <td class="left-align"><strong>${s.name}</strong></td>
                <td>${s.unionId || s.id}</td>
                <td>${s.summary.presentDays}</td>
                <td>${s.summary.absentDays}</td>
                <td>${s.summary.attendancePct}%</td>
                ${s.cells.map(c => {
                  let clsName = "noclass";
                  let display = "⚪";
                  if (c.status === "present") { clsName = "present"; display = "🟢"; }
                  else if (c.status === "absent") { clsName = "absent"; display = "🔴"; }
                  else if (c.status === "holiday") { clsName = "holiday"; display = "🔵"; }
                  else if (c.status === "cancelled") { clsName = "cancelled"; display = "🟠"; }
                  return '<td class="' + clsName + '">' + display + '</td>';
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Attendance_Report_" + teacher.name.replace(/\s+/g, "_") + ".xls";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportToExcel = () => {
    if (!studentReport.data) return;
    const data = studentReport.data;
    
    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: sans-serif; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #059669; color: white; font-weight: bold; }
          .header-row { background-color: #f3f4f6; font-weight: bold; }
          h2, h3 { color: #065f46; font-family: sans-serif; }
        </style>
      </head>
      <body>
        <h2>EMTEES Academy - Student 360° Report</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        
        <h3>1. Student Information</h3>
        <table>
          <tr class="header-row"><td colspan="2">Personal Details</td></tr>
          <tr><td>Student Name</td><td>${data.student.name}</td></tr>
          <tr><td>Student ID (Union ID)</td><td>${data.student.unionId || "-"}</td></tr>
          <tr><td>Enrollment ID</td><td>${data.profile?.enrollmentId || "-"}</td></tr>
          <tr><td>Phone Number</td><td>${data.student.phone || "-"}</td></tr>
          <tr><td>Email Address</td><td>${data.student.email || "-"}</td></tr>
          <tr><td>Qualification</td><td>${(data.student as any).qualification?.name || (data.profile as any)?.qualification?.name || (data.student as any).qualificationName || data.profile?.educationalQualification || (data.student as any).educationalQualification || "-"}</td></tr>
          <tr><td>Postal Code</td><td>{(data.student as any).postalCode || data.profile?.postalCode || "-"}</td></tr>
          <tr><td>Address</td><td>{(data.student as any).address || data.profile?.address || "-"}</td></tr>
          <tr><td>Gender</td><td>${data.profile?.gender || "-"}</td></tr>
          <tr><td>Date of Birth</td><td>${data.profile?.dob ? new Date(data.profile.dob).toLocaleDateString() : "-"}</td></tr>
          <tr><td>Registration Date</td><td>${new Date(data.student.createdAt).toLocaleDateString()}</td></tr>
          <tr><td>Current Status</td><td>${data.student.status}</td></tr>
        </table>
        <br/>

        <h3>2. Course & Batch Information</h3>
        <table>
          <thead>
            <tr>
              <th>Course Name</th>
              <th>Batch Name</th>
              <th>Total Course Fee</th>
              <th>Amount Paid</th>
              <th>Outstanding Balance</th>
              <th>Payment Option</th>
              <th>Payment Status</th>
              <th>Start Date</th>
              <th>Duration</th>
              <th>Primary Teacher</th>
              <th>Enrollment Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.enrollments.map((e: any) => `
              <tr>
                <td>${e.moduleName}</td>
                <td>${e.batchName}</td>
                <td>₹${parseFloat(data.profile?.totalCourseFee || "0").toLocaleString("en-IN")}</td>
                <td>₹${parseFloat(data.profile?.feesPaid || "0").toLocaleString("en-IN")}</td>
                <td>₹${parseFloat(data.profile?.remainingBalance || "0").toLocaleString("en-IN")}</td>
                <td style="text-transform: capitalize;">${data.profile?.paymentOption?.replace('_', ' ') || "Full Payment"}</td>
                <td style="text-transform: capitalize;">${data.profile?.paymentStatus || "Unpaid"}</td>
                <td>${e.batchStartDate ? new Date(e.batchStartDate).toLocaleDateString() : "-"}</td>
                <td>${e.batchDuration || "-"}</td>
                <td>${e.primaryTeacherName}</td>
                <td>${new Date(e.joinedAt).toLocaleDateString()}</td>
                <td>${e.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>3. Teacher & Class Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Teacher Name</th>
              <th>Total Classes Conducted</th>
              <th>One-to-One Sessions</th>
              <th>Group Sessions</th>
            </tr>
          </thead>
          <tbody>
            ${data.teachersSummary.map((t: any) => `
              <tr>
                <td>${t.teacherName}</td>
                <td>${t.totalCount}</td>
                <td>${t.oneToOneCount}</td>
                <td>${t.groupCount}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>4. Fee & Payment Summary</h3>
        <table>
          <tr class="header-row"><td colspan="2">Financial Overview</td></tr>
          <tr><td>Total Course Fee</td><td>₹${data.profile?.totalCourseFee || 0}</td></tr>
          <tr><td>Total Amount Paid</td><td>₹${data.profile?.feesPaid || 0}</td></tr>
          <tr><td>Total Outstanding Balance</td><td>₹${data.profile?.remainingBalance || 0}</td></tr>
          <tr><td>Next Due Date</td><td>${data.profile?.paymentDueDate ? new Date(data.profile.paymentDueDate).toLocaleDateString() : "-"}</td></tr>
          <tr><td>Last Payment Date</td><td>${data.lastPaymentDate ? new Date(data.lastPaymentDate).toLocaleDateString() : "-"}</td></tr>
          <tr><td>Payment Status</td><td>${data.profile?.paymentStatus || "unpaid"}</td></tr>
        </table>
        <br/>

        <h4>Payment History Table</h4>
        <table>
          <thead>
            <tr>
              <th>Payment Date</th>
              <th>Payment Type</th>
              <th>Transaction ID</th>
              <th>Amount Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.payments.map((p: any) => `
              <tr>
                <td>${new Date(p.createdAt).toLocaleDateString()}</td>
                <td>${p.type}</td>
                <td>${p.transactionId || "-"}</td>
                <td>₹${p.amount}</td>
                <td>${p.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>5. Attendance & Class Utilization</h3>
        <table>
          <tr class="header-row"><td colspan="2">Attendance Overview</td></tr>
          <tr><td>Total Classes Allocated</td><td>${(data.sessionUtilization?.oneToOne?.allocated || 0) + (data.sessionUtilization?.group?.allocated || 0)}</td></tr>
          <tr><td>Total Classes Attended</td><td>${data.attendance.present}</td></tr>
          <tr><td>Total Classes Missed</td><td>${data.attendance.missed}</td></tr>
          <tr><td>Attendance Percentage</td><td>${data.attendance.percentage}%</td></tr>
        </table>
        <br/>

        <h3>6. One-to-One Session Tracking</h3>
        <table>
          <thead>
            <tr>
              <th>Session Type</th>
              <th>Allocated</th>
              <th>Attended</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>30 Minute Sessions</td>
              <td>${data.oneToOneTracking.min30.allocated}</td>
              <td>${data.oneToOneTracking.min30.attended}</td>
              <td>${data.oneToOneTracking.min30.remaining}</td>
            </tr>
            <tr>
              <td>45 Minute Sessions</td>
              <td>${data.oneToOneTracking.min45.allocated}</td>
              <td>${data.oneToOneTracking.min45.attended}</td>
              <td>${data.oneToOneTracking.min45.remaining}</td>
            </tr>
            <tr>
              <td>60 Minute Sessions</td>
              <td>${data.oneToOneTracking.min60.allocated}</td>
              <td>${data.oneToOneTracking.min60.attended}</td>
              <td>${data.oneToOneTracking.min60.remaining}</td>
            </tr>
          </tbody>
        </table>
        <br/>

        <h3>7. Group Session Tracking</h3>
        <table>
          <thead>
            <tr>
              <th>Session Type</th>
              <th>Allocated</th>
              <th>Attended</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>30 Minute Sessions</td>
              <td>${data.groupTracking.min30.allocated}</td>
              <td>${data.groupTracking.min30.attended}</td>
              <td>${data.groupTracking.min30.remaining}</td>
            </tr>
            <tr>
              <td>45 Minute Sessions</td>
              <td>${data.groupTracking.min45.allocated}</td>
              <td>${data.groupTracking.min45.attended}</td>
              <td>${data.groupTracking.min45.remaining}</td>
            </tr>
            <tr>
              <td>60 Minute Sessions</td>
              <td>${data.groupTracking.min60.allocated}</td>
              <td>${data.groupTracking.min60.attended}</td>
              <td>${data.groupTracking.min60.remaining}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Student_Report_${data.student.name.replace(/\s+/g, "_")}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Excel report exported successfully!");
  };

  const handlePrint = () => {
    window.print();
  };

  const exportTeacherToExcel = () => {
    if (!teacherReport.data) return;
    const data = teacherReport.data;
    
    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: sans-serif; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #0284c7; color: white; font-weight: bold; }
          .header-row { background-color: #f3f4f6; font-weight: bold; }
          h2, h3 { color: #0369a1; font-family: sans-serif; }
        </style>
      </head>
      <body>
        <h2>EMTEES Academy - Teacher 360° Report</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        
        <h3>1. Teacher Information</h3>
        <table>
          <tr class="header-row"><td colspan="2">Personal Details</td></tr>
          <tr><td>Teacher Name</td><td>${data.teacher.name}</td></tr>
          <tr><td>Teacher ID (Union ID)</td><td>${data.teacher.unionId || "-"}</td></tr>
          <tr><td>Phone Number</td><td>${data.teacher.phone || "-"}</td></tr>
          <tr><td>Email Address</td><td>${data.teacher.email || "-"}</td></tr>
          <tr><td>Gender</td><td>${data.profile?.gender || "-"}</td></tr>
          <tr><td>Date of Birth</td><td>${data.profile?.dob ? new Date(data.profile.dob).toLocaleDateString() : "-"}</td></tr>
          <tr><td>Joining Date</td><td>${data.teacher.createdAt ? new Date(data.teacher.createdAt).toLocaleDateString() : "-"}</td></tr>
          <tr><td>Qualification</td><td>${(data.teacher as any).qualification?.name || (data.profile as any)?.qualification?.name || data.profile?.educationalQualification || "-"}</td></tr>
          <tr><td>Specialization</td><td>${data.profile?.specialization || "-"}</td></tr>
          <tr><td>Experience</td><td>${data.profile?.experience || "-"}</td></tr>
          <tr><td>Status</td><td>${data.teacher.status}</td></tr>
          <tr><td>Address</td><td>${data.profile?.address || "-"}</td></tr>
        </table>
        <br/>

        <h3>2. Assigned Batches</h3>
        <table>
          <thead>
            <tr>
              <th>Batch Name</th>
              <th>Batch Code</th>
              <th>Course Name</th>
              <th>Students Count</th>
              <th>Start Date</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.batches.map((b: any) => `
              <tr>
                <td>${b.name}</td>
                <td>${b.code}</td>
                <td>${b.courseName}</td>
                <td>${b.studentsCount}</td>
                <td>${b.startDate ? new Date(b.startDate).toLocaleDateString() : "-"}</td>
                <td>${b.duration}</td>
                <td>${b.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>3. Assigned Modules</h3>
        <table>
          <thead>
            <tr>
              <th>Module Name</th>
              <th>Duration</th>
              <th>Total Classes Planned</th>
              <th>Completed Classes</th>
              <th>Remaining Classes</th>
            </tr>
          </thead>
          <tbody>
            ${data.modules.map((m: any) => `
              <tr>
                <td>${m.name}</td>
                <td>${m.duration}</td>
                <td>${m.totalClassesPlanned}</td>
                <td>${m.completedClasses}</td>
                <td>${m.remainingClasses}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>4. Classes Conducted Report</h3>
        <table>
          <tr class="header-row"><td colspan="2">Overview</td></tr>
          <tr><td>Total Classes Assigned</td><td>${data.teachingSummary.totalClassesAssigned}</td></tr>
          <tr><td>Total Classes Conducted</td><td>${data.teachingSummary.totalClassesConducted}</td></tr>
          <tr><td>Total Classes Remaining</td><td>${data.teachingSummary.totalClassesRemaining}</td></tr>
          <tr><td>Total Teaching Hours</td><td>${data.teachingSummary.totalTeachingHours} hrs</td></tr>
          <tr><td>Teacher Attendance %</td><td>${data.teachingSummary.teacherAttendancePercentage}%</td></tr>
        </table>
        <br/>

        <h3>5. Session Duration Grid</h3>
        <table>
          <thead>
            <tr>
              <th>Session Type</th>
              <th>30 Min (Total / Completed / Remaining)</th>
              <th>45 Min (Total / Completed / Remaining)</th>
              <th>60 Min (Total / Completed / Remaining)</th>
              <th>Earnings (Current Month)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>One-to-One Sessions</td>
              <td>${data.oneToOneStats.min30.total} / ${data.oneToOneStats.min30.completed} / ${data.oneToOneStats.min30.remaining}</td>
              <td>${data.oneToOneStats.min45.total} / ${data.oneToOneStats.min45.completed} / ${data.oneToOneStats.min45.remaining}</td>
              <td>${data.oneToOneStats.min60.total} / ${data.oneToOneStats.min60.completed} / ${data.oneToOneStats.min60.remaining}</td>
              <td>₹${data.oneToOneStats.total.earnings}</td>
            </tr>
            <tr>
              <td>Group Sessions</td>
              <td>${data.groupStats.min30.total} / ${data.groupStats.min30.completed} / ${data.groupStats.min30.remaining}</td>
              <td>${data.groupStats.min45.total} / ${data.groupStats.min45.completed} / ${data.groupStats.min45.remaining}</td>
              <td>${data.groupStats.min60.total} / ${data.groupStats.min60.completed} / ${data.groupStats.min60.remaining}</td>
              <td>₹${data.groupStats.total.earnings}</td>
            </tr>
          </tbody>
        </table>
        <br/>

        <h3>6. Teacher Attendance Report</h3>
        <table>
          <thead>
            <tr>
              <th>Working Days</th>
              <th>Present Days</th>
              <th>Absent Days</th>
              <th>Leave Days</th>
              <th>Attendance Percentage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${data.attendanceReport.workingDays}</td>
              <td>${data.attendanceReport.presentDays}</td>
              <td>${data.attendanceReport.absentDays}</td>
              <td>${data.attendanceReport.leaveDays}</td>
              <td>${data.attendanceReport.attendancePercentage}%</td>
            </tr>
          </tbody>
        </table>
        <br/>

        <h3>7. Salary Configurations & Breakdown</h3>
        <table>
          <tr class="header-row"><td colspan="2">Salary Config Rates</td></tr>
          <tr><td>Basic Salary</td><td>₹${data.salaryReport.config.basicSalary}</td></tr>
          <tr><td>One-to-One Session Rates (30m / 45m / 60m)</td><td>₹${data.salaryReport.config.oneToOne30MinRate} / ₹${data.salaryReport.config.oneToOne45MinRate} / ₹${data.salaryReport.config.oneToOne60MinRate}</td></tr>
          <tr><td>Group Session Rates (30m / 45m / 60m)</td><td>₹${data.salaryReport.config.group30MinRate} / ₹${data.salaryReport.config.group45MinRate} / ₹${data.salaryReport.config.group60MinRate}</td></tr>
        </table>
        <br/>

        <h4>Current Month Salary Summary</h4>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Basic Salary</td><td>₹${data.salaryReport.currentMonthBreakdown.summary.basicSalary}</td></tr>
            <tr><td>One-to-One Earnings</td><td>₹${data.salaryReport.currentMonthBreakdown.summary.oneToOneEarnings}</td></tr>
            <tr><td>Group Earnings</td><td>₹${data.salaryReport.currentMonthBreakdown.summary.groupEarnings}</td></tr>
            <tr class="header-row"><td>Net Salary</td><td>₹${data.salaryReport.currentMonthBreakdown.summary.netSalary}</td></tr>
          </tbody>
        </table>
        <br/>

        <h3>8. Monthly Salary History</h3>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Classes Conducted</th>
              <th>Net Salary / Amount</th>
              <th>Payment Status</th>
              <th>Payment Date</th>
            </tr>
          </thead>
          <tbody>
            ${data.salaryReport.history.map((h: any) => `
              <tr>
                <td>${h.month}</td>
                <td>${h.classesConducted}</td>
                <td>₹${h.salaryEarned}</td>
                <td>${h.paymentStatus}</td>
                <td>${h.paymentDate ? new Date(h.paymentDate).toLocaleDateString() : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <br/>

        <h3>9. Performance Summary</h3>
        <table>
          <tr class="header-row"><td colspan="2">KPIs</td></tr>
          <tr><td>Total Students Taught</td><td>${data.performanceSummary.totalStudentsTaught}</td></tr>
          <tr><td>Total Batches Managed</td><td>${data.performanceSummary.totalBatchesManaged}</td></tr>
          <tr><td>Total Classes Conducted</td><td>${data.performanceSummary.totalClassesConducted}</td></tr>
          <tr><td>Average Student Attendance Rate</td><td>${data.performanceSummary.averageStudentAttendance}%</td></tr>
          <tr><td>Average Student Feedback Rating</td><td>${data.performanceSummary.studentFeedbackRating}/5.0</td></tr>
          <tr class="header-row"><td>Composite Performance Score</td><td>${data.performanceSummary.teacherPerformanceScore}/100</td></tr>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Teacher_Report_${data.teacher.name.replace(/\s+/g, "_")}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Excel report exported successfully!");
  };

  const handleExportTeacher = () => {
    if (teacherReport.data) {
      exportTeacherToExcel();
    } else {
      toast.error("Please load teacher report details first.");
    }
  };

  const renderTeacherAttendanceReport = (hideTeacherSelect: boolean) => {
    const reportData = attendanceReportQuery.data;
    const isLoading = attendanceReportQuery.isLoading;

    return (
      <div className="space-y-6 animate-fadeIn" id="printable-attendance-area">
        {/* Filters */}
        <Card className="print-hide border border-slate-100 shadow-sm rounded-xl">
          <CardHeader className="pb-3 bg-slate-50/50 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Attendance Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Teacher Selector (Autocomplete) */}
              {!hideTeacherSelect && (
                <div className="relative">
                  <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Search Teacher</Label>
                  <div className="relative">
                    <Input
                      placeholder="Type name or ID..."
                      value={attendanceTeacherSearch}
                      onChange={(e) => {
                        setAttendanceTeacherSearch(e.target.value);
                        setShowAttendanceTeacherDropdown(true);
                      }}
                      onFocus={() => setShowAttendanceTeacherDropdown(true)}
                      className="pr-8 text-sm"
                    />
                    <Search className="w-4 h-4 absolute right-2.5 top-3 text-gray-400" />
                  </div>
                  {showAttendanceTeacherDropdown && attendanceTeacherSearchQuery.data && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {attendanceTeacherSearchQuery.data.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 text-center">No teachers found</div>
                      ) : (
                        attendanceTeacherSearchQuery.data.map((t) => (
                          <div
                            key={t.id}
                            className="p-2.5 text-xs hover:bg-emerald-50 cursor-pointer border-b last:border-b-0 transition-colors"
                            onClick={() => {
                              setAttendanceTeacherId(t.id);
                              setAttendanceTeacherSearch(t.name);
                              setShowAttendanceTeacherDropdown(false);
                            }}
                          >
                            <div className="font-semibold text-gray-900">{t.name}</div>
                            <div className="text-gray-500 font-mono mt-0.5">ID: {t.unionId || t.id}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Date Range Type Selector */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Date Range</Label>
                <Select value={attendanceDateType} onValueChange={(val) => {
                  setAttendanceDateType(val);
                  setAttendancePage(1);
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="last_week">Last Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Date Pickers */}
              {attendanceDateType === "custom" && (
                <>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Start Date</Label>
                    <Input
                      type="date"
                      value={attendanceStartDate}
                      onChange={(e) => {
                        setAttendanceStartDate(e.target.value);
                        setAttendancePage(1);
                      }}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">End Date</Label>
                    <Input
                      type="date"
                      value={attendanceEndDate}
                      onChange={(e) => {
                        setAttendanceEndDate(e.target.value);
                        setAttendancePage(1);
                      }}
                      className="text-sm"
                    />
                  </div>
                </>
              )}

              {/* Module Filter */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Module</Label>
                <Select value={attendanceModuleId} onValueChange={(val) => {
                  setAttendanceModuleId(val);
                  setAttendancePage(1);
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="All Modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {reportData?.teacher.modules.map((m, idx) => (
                      <SelectItem key={idx} value={String(m)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Batch Filter */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Batch</Label>
                <Select value={attendanceBatchId} onValueChange={(val) => {
                  setAttendanceBatchId(val);
                  setAttendancePage(1);
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="All Batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Batches</SelectItem>
                    {reportData?.teacher.batches.map((b, idx) => (
                      <SelectItem key={idx} value={String(b)}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Session Type Filter */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block">Session Type</Label>
                <Select value={attendanceSessionType} onValueChange={(val) => {
                  setAttendanceSessionType(val);
                  setAttendancePage(1);
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="All Sessions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="group">Group Session</SelectItem>
                    <SelectItem value="one_to_one">One-on-One Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 border p-3 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400">
          <span className="text-gray-400 uppercase tracking-wider text-[10px]">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-green-500 block"></span>🟢 Present</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-red-500 block"></span>🔴 Absent</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-blue-500 block"></span>🔵 Holiday</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-orange-500 block"></span>🟠 Cancelled</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-gray-200 dark:bg-slate-800 block"></span>⚪ No Class</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-20 text-sm font-semibold text-emerald-700">
            <TrendingUp className="w-5 h-5 animate-spin mr-2" /> Loading Attendance Data...
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !reportData && (
          <Card className="border border-slate-100 shadow-sm rounded-xl">
            <CardContent className="py-12 flex flex-col items-center justify-center text-center">
              <Calendar className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">No Teacher Selected</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">Please search and select a teacher above to generate the attendance report.</p>
            </CardContent>
          </Card>
        )}

        {/* Report Content */}
        {!isLoading && reportData && (
          <>
            {/* Top Summaries */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Teacher Info Card */}
              <Card className="border border-slate-100 shadow-sm rounded-xl overflow-hidden bg-gradient-to-br from-teal-50/10 to-white">
                <CardHeader className="pb-3 border-b bg-slate-50/20">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-400 font-bold">Teacher Information</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Name:</span> <strong className="text-gray-900">{reportData.teacher.name}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">ID:</span> <span className="font-mono text-gray-800 font-semibold">{reportData.teacher.id}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Department:</span> <span className="font-medium text-gray-800">{reportData.teacher.department}</span></div>
                  <div className="pt-2 border-t mt-2"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-1">Assigned Batches:</span>
                    <div className="flex flex-wrap gap-1">
                      {reportData.teacher.batches.map((b, i) => <Badge key={i} variant="outline" className="text-[10px] bg-slate-50">{b}</Badge>)}
                    </div>
                  </div>
                  <div className="pt-2 border-t"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-1">Assigned Modules:</span>
                    <div className="flex flex-wrap gap-1">
                      {reportData.teacher.modules.map((m, i) => <Badge key={i} variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-100">{m}</Badge>)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Statistics Card */}
              <Card className="border border-slate-100 shadow-sm rounded-xl overflow-hidden bg-gradient-to-br from-emerald-50/10 to-white lg:col-span-2">
                <CardHeader className="pb-3 border-b bg-slate-50/20 flex flex-row justify-between items-center">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-400 font-bold">Conduct & Attendance Summary</CardTitle>
                  <div className="flex gap-2 print-hide">
                    <Button variant="outline" size="sm" onClick={exportAttendanceToExcel} className="h-8 text-xs font-semibold flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Excel</Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs font-semibold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> PDF / Print</Button>
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={() => setShowHolidayDialog(true)} className="h-8 text-xs font-semibold flex items-center gap-1.5 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"><Plus className="w-3.5 h-3.5" /> Manage Holiday</Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-xs text-gray-400 font-bold uppercase block mb-1">Total Students</span>
                    <strong className="text-2xl text-slate-800 font-extrabold">{reportData.summary.totalStudents}</strong>
                  </div>
                  <div className="p-3 bg-teal-50/50 rounded-xl">
                    <span className="text-xs text-teal-600 font-bold uppercase block mb-1">Conducted Classes</span>
                    <strong className="text-2xl text-teal-800 font-extrabold">{reportData.summary.totalClassesConducted}</strong>
                    <div className="text-[10px] text-teal-700 mt-1 flex justify-center gap-2">
                      <span>1:1: {reportData.summary.oneToOneCount}</span>
                      <span>Group: {reportData.summary.groupCount}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-green-50/50 rounded-xl">
                    <span className="text-xs text-green-600 font-bold uppercase block mb-1">Total Attendance</span>
                    <strong className="text-2xl text-green-800 font-extrabold">{reportData.summary.presentCount + reportData.summary.absentCount}</strong>
                    <div className="text-[10px] text-green-700 mt-1 flex justify-center gap-2">
                      <span>🟢 {reportData.summary.presentCount}</span>
                      <span>🔴 {reportData.summary.absentCount}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-indigo-50/50 rounded-xl">
                    <span className="text-xs text-indigo-600 font-bold uppercase block mb-1">Attendance Rate</span>
                    <strong className="text-2xl text-indigo-800 font-extrabold">{reportData.summary.attendancePct}%</strong>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Table/Grid */}
            <Card className="border border-slate-100 shadow-sm rounded-xl overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto relative max-h-[500px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="left-0 top-0 sticky bg-slate-50 z-30 text-left text-xs font-bold text-gray-500 uppercase tracking-wider p-3 pl-4 border-r min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student Info</th>
                        <th className="top-0 sticky bg-slate-50 z-20 text-xs font-bold text-gray-500 uppercase tracking-wider p-3 border-r min-w-[120px]">Stats</th>
                        {reportData.columns.map((col) => (
                          <th key={col.id} className="top-0 sticky bg-slate-50 z-20 text-xs font-bold text-gray-500 uppercase tracking-wider p-3 border-r min-w-[90px] text-center">
                            <span className="block text-gray-700">{col.date}</span>
                            <Badge variant="outline" className={`text-[9px] mt-1 font-semibold ${col.type === "one_to_one" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>
                              {col.type === "one_to_one" ? "1-to-1" : "Group"}
                            </Badge>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.students.length === 0 ? (
                        <tr>
                          <td colSpan={2 + reportData.columns.length} className="text-center py-10 text-xs text-gray-500">No students found.</td>
                        </tr>
                      ) : (
                        reportData.students.map((student) => (
                          <tr key={student.id} className="border-b last:border-b-0 hover:bg-slate-50/50 transition-colors">
                            <td className="left-0 sticky bg-white hover:bg-slate-50 z-10 p-3 pl-4 border-r font-medium text-sm text-gray-900 min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                              <div className="font-semibold">{student.name}</div>
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">{student.unionId || student.id}</div>
                              <div className="text-[9px] text-slate-500 mt-1 flex flex-col gap-0.5">
                                <span>Batch: {student.batchName}</span>
                                <span>Module: {student.moduleName}</span>
                              </div>
                            </td>
                            <td className="p-3 border-r text-xs text-gray-600 min-w-[120px]">
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>Present:</span> <span className="font-bold text-green-600">{student.summary.presentDays}</span></div>
                                <div className="flex justify-between"><span>Absent:</span> <span className="font-bold text-red-600">{student.summary.absentDays}</span></div>
                                <div className="flex justify-between"><span>Rate:</span> <span className="font-bold text-slate-800">{student.summary.attendancePct}%</span></div>
                              </div>
                            </td>
                            {student.cells.map((cell, cIdx) => {
                              let cellColor = "bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-400";
                              let displayChar = "⚪";
                              
                              if (cell.status === "present") {
                                cellColor = "bg-green-500 hover:bg-green-600 text-white";
                                displayChar = "🟢";
                              } else if (cell.status === "absent") {
                                cellColor = "bg-red-500 hover:bg-red-600 text-white";
                                displayChar = "🔴";
                              } else if (cell.status === "holiday") {
                                cellColor = "bg-blue-500 hover:bg-blue-600 text-white";
                                displayChar = "🔵";
                              } else if (cell.status === "cancelled") {
                                cellColor = "bg-orange-500 hover:bg-orange-600 text-white";
                                displayChar = "🟠";
                              }

                              return (
                                <td key={cIdx} className="p-3 border-r text-center align-middle">
                                  <button
                                    onClick={() => setSelectedCellDetails(cell)}
                                    className={`${cellColor} w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all shadow-sm transform hover:scale-105`}
                                    title={`Click for Details - ${cell.date}`}
                                  >
                                    {displayChar}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                <div className="print-hide border-t p-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50">
                  <span className="text-xs text-gray-500">
                    Showing Page {reportData.pagination.page} of {reportData.pagination.pages || 1} ({reportData.pagination.total} total students)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={attendancePage <= 1}
                      onClick={() => setAttendancePage(p => Math.max(1, p - 1))}
                      className="text-xs font-semibold h-8"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={attendancePage >= reportData.pagination.pages}
                      onClick={() => setAttendancePage(p => p + 1)}
                      className="text-xs font-semibold h-8"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  if (isTeacher) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center print-hide">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-700" />
              Attendance Report
            </h1>
            <p className="text-xs text-gray-500 mt-1">View and filter student class attendance records</p>
          </div>
        </div>
        {renderTeacherAttendanceReport(true)}
        
        {/* Attendance Details Dialog */}
        <Dialog open={!!selectedCellDetails} onOpenChange={(open) => !open && setSelectedCellDetails(null)}>
          <DialogContent className="w-[95vw] md:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Attendance Details
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 mt-1">
                Class session detailed information and attendance logs.
              </DialogDescription>
            </DialogHeader>
            {selectedCellDetails && (
              <div className="space-y-3.5 text-sm pt-2">
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 border-b pb-3">
                  <div>
                    <span className="text-xs text-gray-400 font-semibold block uppercase">Class Date</span>
                    <strong className="text-gray-900">{selectedCellDetails.date}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-semibold block uppercase">Class Time</span>
                    <strong className="text-gray-900">{selectedCellDetails.time}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-semibold block uppercase">Session Type</span>
                    <Badge variant="outline" className={`text-[10px] font-bold mt-0.5 ${selectedCellDetails.classType === "one_to_one" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>
                      {selectedCellDetails.classType === "one_to_one" ? "One-on-One" : "Group Class"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-semibold block uppercase">Duration</span>
                    <strong className="text-gray-900">{selectedCellDetails.duration} minutes</strong>
                  </div>
                </div>

                <div className="space-y-2 border-b pb-3">
                  <div className="flex justify-between"><span className="text-gray-500">Student:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.studentName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Teacher:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.teacherName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Batch:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.batchName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Module:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.moduleName}</span></div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Attendance Status:</span> 
                    <Badge className={`text-xs font-bold uppercase tracking-wider ${
                      selectedCellDetails.status === "present" ? "bg-green-500 text-white" :
                      selectedCellDetails.status === "absent" ? "bg-red-500 text-white" :
                      selectedCellDetails.status === "holiday" ? "bg-blue-500 text-white" :
                      selectedCellDetails.status === "cancelled" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {selectedCellDetails.status}
                    </Badge>
                  </div>
                  {selectedCellDetails.meetingId && (
                    <div className="flex justify-between"><span className="text-gray-500">Meeting ID:</span> <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-0.5 rounded border">{selectedCellDetails.meetingId}</span></div>
                  )}
                  {selectedCellDetails.remarks && (
                    <div className="bg-slate-50 p-2.5 rounded-lg border text-xs text-gray-600 mt-2">
                      <span className="font-bold text-gray-500 block mb-0.5">Remarks / Notes:</span>
                      {selectedCellDetails.remarks}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 print-hide">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Total Students</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalStudents || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Teachers</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalTeachers || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Batches</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalBatches || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Pending Fees</p>
                <p className="text-2xl font-bold">₹{statsQuery.data?.pendingFees || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="student">
            <TabsList className="print-hide">
              <TabsTrigger value="student">Student Report</TabsTrigger>
              <TabsTrigger value="teacher">Teacher Report</TabsTrigger>
              <TabsTrigger value="teacher-attendance">Teacher Attendance Report</TabsTrigger>
              <TabsTrigger value="class-report">Class Report</TabsTrigger>
              <TabsTrigger value="workload">Workload Report</TabsTrigger>
              <TabsTrigger value="teacher-student-wise">Teacher Student-Wise</TabsTrigger>
              <TabsTrigger value="daily-report">Daily Report</TabsTrigger>
            </TabsList>


            <TabsContent value="student">
              <Card className="print-card-border">
                <CardHeader className="print-hide">
                  <CardTitle className="text-base">Student Report Lookup</CardTitle>
                </CardHeader>
                <CardContent>
                  <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                      body * {
                        visibility: hidden;
                      }
                      #printable-report-area, #printable-report-area *,
                      #printable-teacher-report-area, #printable-teacher-report-area * {
                        visibility: visible;
                      }
                      #printable-report-area, #printable-teacher-report-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                        padding: 10px;
                      }
                      .print-hide {
                        display: none !important;
                      }
                      .print-card-border {
                        border: 1px solid #cbd5e1 !important;
                        border-radius: 0.5rem !important;
                        padding: 1.25rem !important;
                        margin-bottom: 1.25rem !important;
                        box-shadow: none !important;
                        break-inside: avoid;
                      }
                      .print-grid {
                        display: grid !important;
                        grid-template-cols: repeat(4, minmax(0, 1fr)) !important;
                        gap: 0.75rem !important;
                      }
                      .print-grid-2 {
                        display: grid !important;
                        grid-template-cols: repeat(2, minmax(0, 1fr)) !important;
                        gap: 1rem !important;
                      }
                    }
                  `}} />
                  
                  {/* Autocomplete Search input */}
                  <div className="relative flex gap-3 mb-6 print-hide">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        placeholder="Search Student by ID, Enrollment No, or Name..."
                        value={studentSearch}
                        onChange={(e) => {
                          setStudentSearch(e.target.value);
                          setShowStudentDropdown(true);
                        }}
                        onFocus={() => setShowStudentDropdown(true)}
                        className="pl-10 pr-10"
                      />
                      {studentSearch && (
                        <button
                          onClick={() => {
                            setStudentSearch("");
                            setStudentId("");
                            setShowStudentDropdown(false);
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      
                      {showStudentDropdown && studentSearch.length >= 2 && studentSearchQuery.isLoading && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-sm text-gray-500">
                          Searching...
                        </div>
                      )}
                      
                      {showStudentDropdown && studentSearchQuery.data && studentSearchQuery.data.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {studentSearchQuery.data.map((student) => (
                            <button
                              key={student.id}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 focus:bg-emerald-50 transition-colors flex flex-col border-b last:border-b-0 border-gray-100"
                              onClick={() => {
                                setStudentId(String(student.id));
                                setStudentSearch(`${student.name} (${student.unionId || student.enrollmentId || student.id})`);
                                setShowStudentDropdown(false);
                              }}
                            >
                              <span className="font-semibold text-sm text-gray-800">{student.name}</span>
                              <span className="text-xs text-gray-500">
                                ID: {student.unionId || "-"} | Enrollment: {student.enrollmentId || "-"}
                              </span>
                              {student.course && (
                                <span className="text-xs text-emerald-600 font-medium mt-0.5">
                                  Course: {student.course} ({student.batch})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {studentReport.data && (
                      <Button variant="outline" onClick={exportToExcel}>
                        <Download className="w-4 h-4 mr-2" /> Export Excel
                      </Button>
                    )}
                  </div>

                  {studentReport.isLoading && (
                    <div className="text-center py-12 text-gray-500">Loading student report details...</div>
                  )}

                  {studentReport.data && (
                    <div id="printable-report-area" className="space-y-6">
                      {/* Page Header (Only visible in Print) */}
                      <div className="hidden print:block border-b pb-4 mb-6">
                        <h1 className="text-2xl font-bold text-emerald-800">EMTEES Academy</h1>
                        <p className="text-sm text-gray-500">Student Comprehensive Academic & Operation Report</p>
                        <p className="text-xs text-gray-400 mt-1">Generated: {new Date().toLocaleString()}</p>
                      </div>

                      {/* Report Summary Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print-grid">
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Student Status</p>
                              <Badge className={`mt-1 capitalize ${
                                studentReport.data.student.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                studentReport.data.student.status === "inactive" ? "bg-gray-100 text-gray-700 hover:bg-gray-100" :
                                studentReport.data.student.status === "suspended" ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }`}>
                                {studentReport.data.student.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-400 font-medium">Batch Name</p>
                              <p className="text-sm font-bold text-gray-800 truncate mt-0.5">
                                {studentReport.data.enrollments.filter((e: any) => e.status === "active").map((e: any) => e.batchName).join(", ") || studentReport.data.profile?.batch || "None"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                              <DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Total Fees Paid</p>
                              <p className="text-base font-bold text-gray-800 mt-0.5">
                                ₹{parseFloat(studentReport.data.profile?.feesPaid || "0").toLocaleString("en-IN")}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                              <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Outstanding Balance</p>
                              <p className={`text-base font-bold mt-0.5 ${parseFloat(studentReport.data.profile?.remainingBalance || "0") > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                ₹{parseFloat(studentReport.data.profile?.remainingBalance || "0").toLocaleString("en-IN")}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                              <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Attendance %</p>
                              <p className="text-base font-bold text-gray-800 mt-0.5">{studentReport.data.attendance.percentage}%</p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Classes Attended</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">
                                {studentReport.data.attendance.present} / {studentReport.data.attendance.total}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Sessions Remaining</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">
                                {studentReport.data.sessionUtilization.oneToOne.remaining + studentReport.data.sessionUtilization.group.remaining} Left
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                              <Users className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-400 font-medium">Assigned Teacher(s)</p>
                              <p className="text-sm font-bold text-gray-800 truncate mt-0.5">
                                {studentReport.data.enrollments.map((e: any) => e.primaryTeacherName).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join(", ") || "None"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Section 1 & 2: Student Information & Enrollments */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-grid-2">
                        {/* Student Details Card */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <User className="w-4 h-4 text-emerald-600" />
                              1. Student Information
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Student Name</span>
                              <span className="text-sm font-semibold text-gray-800">{studentReport.data.student.name}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Student ID / Enrollment ID</span>
                              <span className="text-sm font-mono text-gray-800">{studentReport.data.student.unionId || studentReport.data.profile?.enrollmentId || "-"}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Phone Number</span>
                              <span className="text-sm text-gray-800 flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                {studentReport.data.student.phone || "-"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Email Address</span>
                              <span className="text-sm text-gray-800 flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-gray-400" />
                                {studentReport.data.student.email || "-"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Gender</span>
                              <span className="text-sm text-gray-800 capitalize">{studentReport.data.profile?.gender || "-"}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Date of Birth</span>
                              <span className="text-sm text-gray-800">
                                {studentReport.data.profile?.dob ? new Date(studentReport.data.profile.dob).toLocaleDateString("en-IN") : "-"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <span className="text-xs text-gray-400">Registration Date</span>
                              <span className="text-sm text-gray-800">
                                {new Date(studentReport.data.student.createdAt).toLocaleDateString("en-IN")}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-400">Current Status</span>
                              <Badge className={`capitalize ${
                                studentReport.data.student.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                studentReport.data.student.status === "inactive" ? "bg-gray-100 text-gray-700 hover:bg-gray-100" :
                                studentReport.data.student.status === "suspended" ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }`}>
                                {studentReport.data.student.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Enrolled Batches Details Card */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-blue-600" />
                              2. Course & Batch Information
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4">
                            {studentReport.data.enrollments.length === 0 ? (
                              <p className="text-sm text-gray-500 italic py-4 text-center">No batch enrollments found.</p>
                            ) : (
                              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                                {studentReport.data.enrollments.map((e: any, idx: number) => (
                                  <div key={e.id} className={`pb-3 ${idx < studentReport.data.enrollments.length - 1 ? "border-b border-dashed border-gray-100" : ""}`}>
                                    <div className="flex justify-between items-start">
                                      <span className="font-semibold text-sm text-gray-850">{e.moduleName}</span>
                                      <Badge variant={e.status === "active" ? "default" : "secondary"} className="capitalize text-[10px] px-1.5 py-0.5">
                                        {e.status}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-500 mt-2">
                                      <div><span className="font-medium text-gray-400">Batch:</span> {e.batchName}</div>
                                      <div><span className="font-medium text-gray-400">Teacher:</span> {e.primaryTeacherName}</div>
                                      <div><span className="font-medium text-gray-400">Start Date:</span> {e.batchStartDate ? new Date(e.batchStartDate).toLocaleDateString("en-IN") : "-"}</div>
                                      <div><span className="font-medium text-gray-400">Duration:</span> {e.batchDuration || "-"}</div>
                                      <div className="col-span-2"><span className="font-medium text-gray-400">Enrolled On:</span> {new Date(e.joinedAt).toLocaleDateString("en-IN")}</div>
                                      <div className="col-span-2 border-t border-dashed border-gray-100 pt-2 mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                                        <div><span className="font-medium text-gray-400">Total Course Fee:</span> ₹{parseFloat(studentReport.data.profile?.totalCourseFee || "0").toLocaleString("en-IN")}</div>
                                        <div><span className="font-medium text-gray-400">Total Paid:</span> <span className="font-semibold text-emerald-700">₹{parseFloat(studentReport.data.profile?.feesPaid || "0").toLocaleString("en-IN")}</span></div>
                                        <div><span className="font-medium text-gray-400">Outstanding Balance:</span> ₹{parseFloat(studentReport.data.profile?.remainingBalance || "0").toLocaleString("en-IN")}</div>
                                        <div><span className="font-medium text-gray-400">Payment Option:</span> <span className="capitalize">{studentReport.data.profile?.paymentOption?.replace('_', ' ') || "Full Payment"}</span></div>
                                        <div className="col-span-2"><span className="font-medium text-gray-400">Payment Status:</span> <span className="capitalize font-semibold text-emerald-700">{studentReport.data.profile?.paymentStatus || "Unpaid"}</span></div>
                                      </div>
                                      {e.assignedTeachersNames.length > 0 && (
                                        <div className="col-span-2 text-[11px] bg-slate-50 dark:bg-slate-900 p-1.5 rounded mt-1">
                                          <span className="font-medium text-gray-400">Other Teachers:</span>{" "}
                                          {e.assignedTeachersNames.map((t: any) => t.name).join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Section 3 & 8: Teacher Interaction Summary & Session Utilization Dashboard */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-grid-2">
                        {/* Teacher & Class Summary Card */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <Users className="w-4 h-4 text-violet-600" />
                              3. Teacher & Class Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-2 p-0">
                            {studentReport.data.teachersSummary.length === 0 ? (
                              <p className="text-sm text-gray-500 italic p-6 text-center">No teacher sessions conducted yet.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="pl-6">Teacher Name</TableHead>
                                    <TableHead className="text-center">Total Classes</TableHead>
                                    <TableHead className="text-center">1-to-1 Sessions</TableHead>
                                    <TableHead className="text-center pr-6">Group Sessions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {studentReport.data.teachersSummary.map((t: any) => (
                                    <TableRow key={t.teacherId}>
                                      <TableCell className="pl-6 font-medium text-gray-800 text-xs">{t.teacherName}</TableCell>
                                      <TableCell className="text-center font-semibold text-emerald-600 text-xs">{t.totalCount}</TableCell>
                                      <TableCell className="text-center text-gray-600 text-xs">{t.oneToOneCount}</TableCell>
                                      <TableCell className="text-center text-gray-600 text-xs pr-6">{t.groupCount}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>

                        {/* Session Utilization Dashboard Card */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-indigo-600" />
                              8. Session Utilization Dashboard
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6 space-y-5">
                            {/* One-to-One Progress Bar */}
                            <div>
                              <div className="flex justify-between items-center text-xs mb-1.5">
                                <span className="font-semibold text-gray-700 flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                  One-to-One Sessions
                                </span>
                                <span className="font-semibold text-gray-500">
                                  {studentReport.data.sessionUtilization.oneToOne.attended} / {studentReport.data.sessionUtilization.oneToOne.allocated} Used ({studentReport.data.sessionUtilization.oneToOne.percentageUsed}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2.5">
                                <div 
                                  className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500" 
                                  style={{ width: `${studentReport.data.sessionUtilization.oneToOne.percentageUsed}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                                <span>{studentReport.data.sessionUtilization.oneToOne.remaining} Sessions Remaining</span>
                                <span>Allocated: {studentReport.data.sessionUtilization.oneToOne.allocated}</span>
                              </div>
                            </div>

                            {/* Group Sessions Progress Bar */}
                            <div>
                              <div className="flex justify-between items-center text-xs mb-1.5">
                                <span className="font-semibold text-gray-700 flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5 text-blue-600" />
                                  Group Sessions
                                </span>
                                <span className="font-semibold text-gray-500">
                                  {studentReport.data.sessionUtilization.group.attended} / {studentReport.data.sessionUtilization.group.allocated} Used ({studentReport.data.sessionUtilization.group.percentageUsed}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2.5">
                                <div 
                                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                                  style={{ width: `${studentReport.data.sessionUtilization.group.percentageUsed}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                                <span>{studentReport.data.sessionUtilization.group.remaining} Sessions Remaining</span>
                                <span>Allocated: {studentReport.data.sessionUtilization.group.allocated}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Section 6 & 7: Session Length Tracking (30, 45, 60 Minutes) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-grid-2">
                        {/* One-to-One Session Lengths */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-emerald-600" />
                              6. One-to-One Session Tracking
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4 grid grid-cols-3 gap-3">
                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">30 Min Session</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.oneToOneTracking.min30.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.oneToOneTracking.min30.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.oneToOneTracking.min30.remaining}</span>
                              </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">45 Min Session</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.oneToOneTracking.min45.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.oneToOneTracking.min45.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.oneToOneTracking.min45.remaining}</span>
                              </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">60 Min Session</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.oneToOneTracking.min60.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.oneToOneTracking.min60.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.oneToOneTracking.min60.remaining}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Group Session Lengths */}
                        <Card className="print-card-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <Users className="w-4 h-4 text-blue-600" />
                              7. Group Session Tracking
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4 grid grid-cols-3 gap-3">
                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">30 Min Group</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.groupTracking.min30.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.groupTracking.min30.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.groupTracking.min30.remaining}</span>
                              </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">45 Min Group</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.groupTracking.min45.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.groupTracking.min45.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.groupTracking.min45.remaining}</span>
                              </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-slate-900 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">60 Min Group</p>
                                <div className="space-y-0.5 text-[11px] text-gray-550">
                                  <div className="flex justify-between"><span>Alloc:</span> <span className="font-semibold text-gray-800">{studentReport.data.groupTracking.min60.allocated}</span></div>
                                  <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-emerald-600">{studentReport.data.groupTracking.min60.attended}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-800 pt-1.5 mt-2 flex justify-between items-center text-[11px]">
                                <span className="text-gray-400">Rem:</span>
                                <span className="font-bold text-blue-600">{studentReport.data.groupTracking.min60.remaining}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Section 4: Fee & Payment Summary */}
                      <Card className="print-card-border shadow-sm">
                        <CardHeader className="pb-3 border-b border-gray-100">
                          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                            4. Fee & Payment Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Total Course Fee</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">
                                ₹{parseFloat(studentReport.data.profile?.totalCourseFee || "0").toLocaleString("en-IN")}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Total Amount Paid</p>
                              <p className="text-sm font-bold text-emerald-650 mt-0.5">
                                ₹{parseFloat(studentReport.data.profile?.feesPaid || "0").toLocaleString("en-IN")}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Outstanding Balance</p>
                              <p className={`text-sm font-bold mt-0.5 ${parseFloat(studentReport.data.profile?.remainingBalance || "0") > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                ₹{parseFloat(studentReport.data.profile?.remainingBalance || "0").toLocaleString("en-IN")}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Next Due Date</p>
                              <p className="text-xs font-semibold text-gray-700 mt-1">
                                {studentReport.data.profile?.paymentDueDate ? new Date(studentReport.data.profile.paymentDueDate).toLocaleDateString("en-IN") : "-"}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Last Payment Date</p>
                              <p className="text-xs font-semibold text-gray-700 mt-1">
                                {studentReport.data.lastPaymentDate ? new Date(studentReport.data.lastPaymentDate).toLocaleDateString("en-IN") : "-"}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg text-center border border-slate-100">
                              <p className="text-[10px] text-gray-405 font-medium">Payment Status</p>
                              <Badge className={`mt-0.5 capitalize text-[10px] ${
                                studentReport.data.profile?.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                studentReport.data.profile?.paymentStatus === "partial" ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" :
                                studentReport.data.profile?.paymentStatus === "overdue" ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                "bg-gray-100 text-gray-700 hover:bg-gray-100"
                              }`}>
                                {studentReport.data.profile?.paymentStatus || "unpaid"}
                              </Badge>
                            </div>
                          </div>

                          {/* Payment History Table */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payment History Records</h4>
                            {studentReport.data.payments.length === 0 ? (
                              <p className="text-xs text-gray-500 italic py-3 text-center">No transactions on record.</p>
                            ) : (
                              <div className="border border-slate-100 rounded-md overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="pl-4">Payment Date</TableHead>
                                      <TableHead>Payment Method</TableHead>
                                      <TableHead>Transaction Reference</TableHead>
                                      <TableHead>Amount Paid</TableHead>
                                      <TableHead>Balance Remaining</TableHead>
                                      <TableHead className="pr-4">Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(() => {
                                      const sortedPayments = [...studentReport.data.payments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                                      let tempBalance = parseFloat(studentReport.data.profile?.totalCourseFee || "0");
                                      const paymentsWithBal = sortedPayments.map((p) => {
                                        if (p.status === "paid") {
                                          tempBalance -= parseFloat(p.amount);
                                        }
                                        return { ...p, runningBalance: tempBalance };
                                      }).reverse();

                                      return paymentsWithBal.map((p) => (
                                        <TableRow key={p.id} className="text-xs">
                                          <TableCell className="pl-4 font-medium">{new Date(p.createdAt).toLocaleDateString("en-IN")}</TableCell>
                                          <TableCell className="capitalize">{(p.type || "").replace(/_/g, " ")}</TableCell>
                                          <TableCell className="font-mono text-[11px] text-gray-500">{p.transactionId || "-"}</TableCell>
                                          <TableCell className="font-semibold text-emerald-600">₹{parseFloat(p.amount).toLocaleString("en-IN")}</TableCell>
                                          <TableCell className="text-gray-500">₹{p.runningBalance.toLocaleString("en-IN")}</TableCell>
                                          <TableCell className="pr-4">
                                            <Badge variant={p.status === "paid" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0.5">
                                              {p.status}
                                            </Badge>
                                          </TableCell>
                                        </TableRow>
                                      ));
                                    })()}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Section 5 & 9: Attendance & Utilization + Recent Attendance History */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print-grid-2">
                        {/* Attendance Utilization circular gauge */}
                        <Card className="print-card-border md:col-span-1 shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              5. Attendance & Class Utilization
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6 text-center space-y-6">
                            <div className="relative inline-flex items-center justify-center">
                              <svg className="w-28 h-28">
                                <circle 
                                  className="text-gray-100" 
                                  strokeWidth="8" 
                                  stroke="currentColor" 
                                  fill="transparent" 
                                  r="44" 
                                  cx="56" 
                                  cy="56" 
                                />
                                <circle 
                                  className="text-emerald-600 transition-all duration-1000" 
                                  strokeWidth="8" 
                                  strokeDasharray={276.46}
                                  strokeDashoffset={276.46 - (276.46 * studentReport.data.attendance.percentage) / 100}
                                  strokeLinecap="round" 
                                  stroke="currentColor" 
                                  fill="transparent" 
                                  r="44" 
                                  cx="56" 
                                  cy="56" 
                                />
                              </svg>
                              <div className="absolute text-center">
                                <span className="text-2xl font-extrabold text-gray-800">{studentReport.data.attendance.percentage}%</span>
                                <span className="block text-[9px] text-gray-400 uppercase font-semibold mt-0.5">Rate</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                              <div className="border-r border-gray-100">
                                <p className="text-[10px] text-gray-400 font-medium">Allocated</p>
                                <p className="text-sm font-bold text-gray-700">{(studentReport.data.sessionUtilization.oneToOne.allocated + studentReport.data.sessionUtilization.group.allocated) || 0}</p>
                              </div>
                              <div className="border-r border-gray-100">
                                <p className="text-[10px] text-gray-400 font-medium">Attended</p>
                                <p className="text-sm font-bold text-emerald-600">{studentReport.data.attendance.present}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-400 font-medium">Missed</p>
                                <p className="text-sm font-bold text-rose-600">{studentReport.data.attendance.missed}</p>
                              </div>
                            </div>
                            
                            <p className="text-[10px] text-gray-400 italic">
                              Attendance % = (Attended Classes / Total Conducted Classes) &times; 100
                            </p>
                          </CardContent>
                        </Card>

                        {/* Recent Attendance History Table */}
                        <Card className="print-card-border md:col-span-2 shadow-sm">
                          <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-blue-600" />
                              9. Recent Attendance History
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-2 p-0">
                            {studentReport.data.recentAttendance.length === 0 ? (
                              <p className="text-sm text-gray-500 italic p-6 text-center">No attendance history available.</p>
                            ) : (
                              <div className="max-h-[280px] overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="pl-6">Date</TableHead>
                                      <TableHead>Session Type</TableHead>
                                      <TableHead>Duration</TableHead>
                                      <TableHead>Teacher</TableHead>
                                      <TableHead className="pr-6">Attendance Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {studentReport.data.recentAttendance.map((a: any) => (
                                      <TableRow key={a.id} className="text-xs">
                                        <TableCell className="pl-6 font-medium">
                                          {new Date(a.recordedAt).toLocaleDateString("en-IN")}
                                        </TableCell>
                                        <TableCell className="capitalize">{a.classType}</TableCell>
                                        <TableCell>{a.duration ? `${a.duration} Mins` : "-"}</TableCell>
                                        <TableCell>{a.teacherName}</TableCell>
                                        <TableCell className="pr-6">
                                          <Badge className={`capitalize text-[10px] px-2 py-0.5 hover:opacity-100 ${
                                            a.status === "present" ? "bg-emerald-100 text-emerald-700" :
                                            a.status === "absent" ? "bg-rose-100 text-rose-705" :
                                            a.status === "late" ? "bg-amber-100 text-amber-700" :
                                            "bg-blue-100 text-blue-700"
                                          }`}>
                                            {a.status}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Section 10: Admin Actions Footer */}
                      <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-dashed border-gray-200 print-hide">
                        <Link to={`/students?search=${encodeURIComponent(studentReport.data.student.name)}`}>
                          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                            <Edit className="w-3.5 h-3.5" /> Edit Student
                          </Button>
                        </Link>
                        <Link to={`/students?view=${studentReport.data.student.id}`}>
                          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" /> View Full Profile
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5" /> Print Report
                        </Button>
                        <Button variant="default" size="sm" onClick={handlePrint} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                          <Download className="w-3.5 h-3.5" /> Download PDF
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="teacher">
              <Card className="print-card-border shadow-sm">
                <CardHeader className="print-hide border-b border-gray-150">
                  <CardTitle className="text-base font-semibold text-slate-800">Teacher Report Lookup</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Search and Filters Section */}
                  <div className="flex flex-col md:flex-row gap-3 mb-6 print-hide">
                    {/* Autocomplete Search input */}
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        placeholder="Search Teacher by ID, Union ID, or Name..."
                        value={teacherSearch}
                        onChange={(e) => {
                          setTeacherSearch(e.target.value);
                          setShowTeacherDropdown(true);
                        }}
                        onFocus={() => setShowTeacherDropdown(true)}
                        className="pl-10 pr-10"
                      />
                      {teacherSearch && (
                        <button
                          onClick={() => {
                            setTeacherSearch("");
                            setTeacherId("");
                            setShowTeacherDropdown(false);
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      
                      {showTeacherDropdown && teacherSearchQuery.isLoading && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-sm text-gray-500">
                          Searching...
                        </div>
                      )}
                      
                      {showTeacherDropdown && teacherSearchQuery.data && teacherSearchQuery.data.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {teacherSearchQuery.data.map((teacher) => (
                            <button
                              key={teacher.id}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-sky-50 focus:bg-sky-50 transition-colors flex flex-col border-b last:border-b-0 border-gray-100"
                              onClick={() => {
                                setTeacherId(String(teacher.id));
                                setTeacherSearch(`${teacher.name} (${teacher.unionId || teacher.id})`);
                                setShowTeacherDropdown(false);
                              }}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className="font-semibold text-sm text-gray-800">{teacher.name}</span>
                                <Badge className={`capitalize text-[10px] ${
                                  teacher.status === "active" ? "bg-emerald-100 text-emerald-700" :
                                  teacher.status === "inactive" ? "bg-gray-100 text-gray-700" :
                                  teacher.status === "suspended" ? "bg-rose-100 text-rose-700" :
                                  "bg-amber-100 text-amber-700"
                                }`}>
                                  {teacher.status === "on_hold" ? "On Leave" : teacher.status}
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">
                                ID: {teacher.unionId || "-"} | Email: {teacher.email || "-"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Filter by Status */}
                    <div className="w-full md:w-48">
                      <Select value={teacherStatusFilter} onValueChange={(val) => setTeacherStatusFilter(val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Filter Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="on_leave">On Leave</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Filter by Batch */}
                    <div className="w-full md:w-48">
                      <Select value={teacherBatchFilter} onValueChange={(val) => setTeacherBatchFilter(val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Filter Batch" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Batches</SelectItem>
                          {batchesQuery.data?.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {teacherReport.data && (
                      <Button variant="outline" onClick={handleExportTeacher} className="border-gray-200">
                        <Download className="w-4 h-4 mr-2 text-sky-600" /> Export Excel
                      </Button>
                    )}
                  </div>

                  {teacherReport.isLoading && (
                    <div className="text-center py-12 text-gray-500">Loading teacher report details...</div>
                  )}

                  {!teacherId && !teacherReport.isLoading && (
                    <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-150 rounded-xl bg-slate-50/20">
                      <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">Search and select a teacher above to view their comprehensive 360° report.</p>
                    </div>
                  )}

                  {teacherReport.data && (
                    <div id="printable-teacher-report-area" className="space-y-6">
                      <div className="hidden print:block border-b pb-4 mb-6">
                        <h1 className="text-2xl font-bold text-sky-800">EMTEES Academy</h1>
                        <p className="text-sm text-gray-500 font-medium">Teacher Comprehensive Activity, Attendance & Salary Report</p>
                        <p className="text-xs text-gray-400 mt-1">Generated: {new Date().toLocaleString()}</p>
                      </div>

                      {/* Header Summary Cards */}
                      <div className={`grid grid-cols-2 ${user?.role === "academic_head" ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4 print-grid`}>
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Teacher Status</p>
                              <Badge className={`mt-1 capitalize ${
                                teacherReport.data.teacher.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                teacherReport.data.teacher.status === "inactive" ? "bg-gray-100 text-gray-700 hover:bg-gray-100" :
                                teacherReport.data.teacher.status === "suspended" ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }`}>
                                {teacherReport.data.teacher.status === "on_hold" ? "On Leave" : teacherReport.data.teacher.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                              <Award className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Performance Score</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-base font-bold ${
                                  teacherReport.data.performanceSummary.teacherPerformanceScore >= 90 ? "text-emerald-600" :
                                  teacherReport.data.performanceSummary.teacherPerformanceScore >= 80 ? "text-blue-600" :
                                  "text-amber-600"
                                }`}>
                                  {teacherReport.data.performanceSummary.teacherPerformanceScore}/100
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-650 flex items-center justify-center shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 font-medium">Teaching Hours</p>
                              <p className="text-base font-bold text-gray-800 mt-0.5">
                                {teacherReport.data.teachingSummary.totalTeachingHours} hrs
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        {user?.role !== "academic_head" && (
                          <Card className="print-card-border shadow-sm border border-slate-100">
                            <CardContent className="p-4 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                                <DollarSign className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 font-medium">Current Month Net</p>
                                <p className="text-base font-bold text-emerald-650 mt-0.5">
                                  ₹{teacherReport.data.salaryReport.currentMonthBreakdown.summary.netSalary.toLocaleString("en-IN")}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>

                      {/* 1. Teacher Personal Information */}
                      <Card className="print-card-border shadow-sm border border-slate-100 overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                          <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <User className="w-4 h-4 text-sky-500" />
                            Teacher Personal Profile
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5">
                          <div className="flex flex-col md:flex-row gap-6">
                            {/* Left Side: Avatar/Photo */}
                            <div className="flex flex-col items-center gap-3 shrink-0">
                              <div className="relative w-24 h-24 rounded-full border-2 border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                                {teacherReport.data.profile?.photo || teacherReport.data.teacher.avatar ? (
                                  <img 
                                    src={teacherReport.data.profile?.photo || teacherReport.data.teacher.avatar || ""} 
                                    alt={teacherReport.data.teacher.name} 
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <User className="w-12 h-12 text-slate-300" />
                                )}
                              </div>
                              <span className="text-xs text-gray-450 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">
                                ID: {teacherReport.data.teacher.unionId || teacherReport.data.teacher.id}
                              </span>
                            </div>

                            {/* Right Side: Profile Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 flex-1 text-sm">
                              <div>
                                <span className="text-gray-450 block font-medium text-xs">Full Name</span>
                                <span className="font-bold text-gray-800 text-base">{teacherReport.data.teacher.name}</span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Email Address</span>
                                <span className="font-semibold text-gray-700 flex items-center gap-1.5 mt-0.5">
                                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {teacherReport.data.teacher.email}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Phone Number</span>
                                <span className="font-semibold text-gray-700 flex items-center gap-1.5 mt-0.5">
                                  <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {teacherReport.data.teacher.phone || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Gender / Date of Birth</span>
                                <span className="font-semibold text-gray-705 mt-0.5 block">
                                  {teacherReport.data.profile?.gender || "-"} | {teacherReport.data.profile?.dob ? new Date(teacherReport.data.profile.dob).toLocaleDateString() : "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Educational Qualification</span>
                                <span className="font-semibold text-gray-705 flex items-center gap-1.5 mt-0.5">
                                  <GraduationCap className="w-3.5 h-3.5 text-sky-400" /> {teacherReport.data.profile?.educationalQualification || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Specialization</span>
                                <span className="font-semibold text-gray-705 mt-0.5 block">
                                  {teacherReport.data.profile?.specialization || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Teaching Experience</span>
                                <span className="font-semibold text-gray-705 flex items-center gap-1.5 mt-0.5">
                                  <Briefcase className="w-3.5 h-3.5 text-amber-400" /> {teacherReport.data.profile?.experience || "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-455 block font-medium text-xs">Joining Date</span>
                                <span className="font-semibold text-gray-705 flex items-center gap-1.5 mt-0.5">
                                  <Calendar className="w-3.5 h-3.5 text-teal-400" /> {teacherReport.data.teacher.createdAt ? new Date(teacherReport.data.teacher.createdAt).toLocaleDateString() : "-"}
                                </span>
                              </div>
                              <div className="sm:col-span-2 md:col-span-3 border-t pt-3 mt-1">
                                <span className="text-gray-455 block font-medium text-xs">Address</span>
                                <span className="font-semibold text-gray-705 flex items-start gap-1.5 mt-1">
                                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                  {teacherReport.data.profile?.address || "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 2. Assigned Batch & Module Information */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-grid-2">
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-sky-500" />
                              Assigned Batches ({teacherReport.data.batches.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto">
                            {teacherReport.data.batches.length === 0 ? (
                              <div className="p-6 text-center text-sm text-gray-450">No batches assigned yet.</div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Batch (Code)</TableHead>
                                    <TableHead>Course</TableHead>
                                    <TableHead>Students</TableHead>
                                    <TableHead>Start Date</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teacherReport.data.batches.map((b) => (
                                    <TableRow key={b.id}>
                                      <TableCell className="font-semibold">{b.name} <span className="text-xs text-gray-400 font-mono">({b.code})</span></TableCell>
                                      <TableCell className="text-xs text-gray-600 font-medium">{b.courseName}</TableCell>
                                      <TableCell className="font-semibold">{b.studentsCount}</TableCell>
                                      <TableCell className="text-xs">{b.startDate ? new Date(b.startDate).toLocaleDateString() : "-"}</TableCell>
                                      <TableCell>
                                        <Badge className={`capitalize text-[10px] ${
                                          b.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-700 hover:bg-gray-100"
                                        }`}>
                                          {b.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-emerald-500" />
                              Assigned Modules ({teacherReport.data.modules.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto">
                            {teacherReport.data.modules.length === 0 ? (
                              <div className="p-6 text-center text-sm text-gray-450">No modules assigned yet.</div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Module Name</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Planned</TableHead>
                                    <TableHead>Completed</TableHead>
                                    <TableHead>Remaining</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teacherReport.data.modules.map((m) => (
                                    <TableRow key={m.id}>
                                      <TableCell className="font-semibold">{m.name}</TableCell>
                                      <TableCell className="text-xs font-semibold text-gray-655">{m.duration}</TableCell>
                                      <TableCell className="text-xs font-semibold">{m.totalClassesPlanned}</TableCell>
                                      <TableCell className="text-xs font-bold text-emerald-600">{m.completedClasses}</TableCell>
                                      <TableCell className="text-xs font-semibold text-amber-600">{m.remainingClasses}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* 3. Classes Conducted Report & Attendance */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-grid-2">
                        {/* Classes Conducted Details */}
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-500" />
                              Classes Conducted (Duration Breakdown)
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-center mb-2">
                              <div className="bg-sky-50 p-2.5 rounded-lg border border-sky-100/50">
                                <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider">One-to-One Sessions</p>
                                <p className="text-lg font-bold text-sky-800 mt-0.5">
                                  {teacherReport.data.oneToOneStats.total.completed} <span className="text-xs font-normal text-sky-500">/ {teacherReport.data.oneToOneStats.total.assigned}</span>
                                </p>
                              </div>
                              <div className="bg-violet-50 p-2.5 rounded-lg border border-violet-100/50">
                                <p className="text-[10px] text-violet-600 font-bold uppercase tracking-wider">Group Sessions</p>
                                <p className="text-lg font-bold text-violet-800 mt-0.5">
                                  {teacherReport.data.groupStats.total.completed} <span className="text-xs font-normal text-violet-500">/ {teacherReport.data.groupStats.total.assigned}</span>
                                </p>
                              </div>
                            </div>
                            
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="py-1">Type & Length</TableHead>
                                  <TableHead className="py-1">Total</TableHead>
                                  <TableHead className="py-1 text-emerald-600">Completed</TableHead>
                                  <TableHead className="py-1 text-amber-600">Remaining</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <TableRow>
                                  <TableCell className="py-2 font-medium">1:1 - 30 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.oneToOneStats.min30.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.oneToOneStats.min30.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.oneToOneStats.min30.remaining}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell className="py-2 font-medium">1:1 - 45 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.oneToOneStats.min45.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.oneToOneStats.min45.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.oneToOneStats.min45.remaining}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell className="py-2 font-medium">1:1 - 60 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.oneToOneStats.min60.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.oneToOneStats.min60.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.oneToOneStats.min60.remaining}</TableCell>
                                </TableRow>
                                <TableRow className="border-t border-dashed bg-slate-50/20">
                                  <TableCell className="py-2 font-medium">Group - 30 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.groupStats.min30.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.groupStats.min30.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.groupStats.min30.remaining}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell className="py-2 font-medium">Group - 45 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.groupStats.min45.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.groupStats.min45.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.groupStats.min45.remaining}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell className="py-2 font-medium">Group - 60 Minutes</TableCell>
                                  <TableCell className="py-2 font-semibold text-slate-800">{teacherReport.data.groupStats.min60.total}</TableCell>
                                  <TableCell className="py-2 font-semibold text-emerald-600">{teacherReport.data.groupStats.min60.completed}</TableCell>
                                  <TableCell className="py-2 font-medium text-amber-600">{teacherReport.data.groupStats.min60.remaining}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        {/* Attendance Report Card */}
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <Activity className="w-4 h-4 text-rose-500" />
                              Teacher Attendance Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-5 flex flex-col justify-between h-[calc(100%-60px)]">
                            <div className="flex items-center justify-between gap-6 mb-4">
                              <div className="space-y-1.5 flex-1">
                                <div className="flex justify-between items-end text-sm">
                                  <span className="font-semibold text-slate-650">Attendance Rate</span>
                                  <span className="font-bold text-lg text-slate-800">{teacherReport.data.attendanceReport.attendancePercentage}%</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      teacherReport.data.attendanceReport.attendancePercentage >= 90 ? "bg-emerald-500" :
                                      teacherReport.data.attendanceReport.attendancePercentage >= 85 ? "bg-blue-500" :
                                      "bg-amber-500"
                                    }`}
                                    style={{ width: `${teacherReport.data.attendanceReport.attendancePercentage}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                              <div className="border border-slate-100 rounded-lg p-2.5">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Working Days</p>
                                <p className="text-xl font-bold text-gray-800 mt-0.5">{teacherReport.data.attendanceReport.workingDays}</p>
                              </div>
                              <div className="border border-emerald-105 bg-emerald-50/10 rounded-lg p-2.5">
                                <p className="text-[10px] text-emerald-600 font-bold uppercase">Days Present</p>
                                <p className="text-xl font-bold text-emerald-700 mt-0.5">{teacherReport.data.attendanceReport.presentDays}</p>
                              </div>
                              <div className="border border-rose-105 bg-rose-50/10 rounded-lg p-2.5">
                                <p className="text-[10px] text-rose-600 font-bold uppercase">Days Absent</p>
                                <p className="text-xl font-bold text-rose-700 mt-0.5">{teacherReport.data.attendanceReport.absentDays}</p>
                              </div>
                              <div className="border border-amber-105 bg-amber-50/10 rounded-lg p-2.5">
                                <p className="text-[10px] text-amber-600 font-bold uppercase">Leave Days</p>
                                <p className="text-xl font-bold text-amber-700 mt-0.5">{teacherReport.data.attendanceReport.leaveDays}</p>
                              </div>
                            </div>

                            <div className="text-xs text-gray-400 mt-4 leading-relaxed border-t border-dashed pt-3">
                              <strong>Note:</strong> Working days are unique calendar dates where sessions or classes were scheduled. Leave days reflect standard period allowances for on-hold status periods. Absent records represent sessions marked absent for the instructor.
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* 4. Detailed Salary Report & configurations */}
                      {user?.role !== "academic_head" && (
                        <Card className="print-card-border shadow-sm border border-slate-100">
                          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-emerald-500" />
                              Detailed Salary Breakdown (Current Billing Month)
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-5 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Configurations Section */}
                              <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salary configurations</h4>
                                <div className="text-sm space-y-2 border border-slate-100 rounded-lg p-4 bg-slate-50/30">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Basic Salary:</span>
                                    <span className="font-bold text-gray-800">₹{parseFloat(String(teacherReport.data.salaryReport.config.basicSalary)).toLocaleString()}</span>
                                  </div>
                                  <div className="border-t border-dashed my-2 pt-2">
                                    <span className="text-xs font-bold text-gray-400 block mb-1">One-to-One Session Rates:</span>
                                    <div className="grid grid-cols-3 text-center text-xs gap-1.5 mt-1">
                                      <div className="bg-slate-100 rounded p-1 font-medium">30m: <strong>₹{teacherReport.data.salaryReport.config.oneToOne30MinRate}</strong></div>
                                      <div className="bg-slate-100 rounded p-1 font-medium">45m: <strong>₹{teacherReport.data.salaryReport.config.oneToOne45MinRate}</strong></div>
                                      <div className="bg-slate-100 rounded p-1 font-medium">60m: <strong>₹{teacherReport.data.salaryReport.config.oneToOne60MinRate}</strong></div>
                                    </div>
                                  </div>
                                  <div className="border-t border-dashed my-2 pt-2">
                                    <span className="text-xs font-bold text-gray-400 block mb-1">Group Session Rates:</span>
                                    <div className="grid grid-cols-3 text-center text-xs gap-1.5 mt-1">
                                      <div className="bg-slate-100 rounded p-1 font-medium">30m: <strong>₹{teacherReport.data.salaryReport.config.group30MinRate}</strong></div>
                                      <div className="bg-slate-100 rounded p-1 font-medium">45m: <strong>₹{teacherReport.data.salaryReport.config.group45MinRate}</strong></div>
                                      <div className="bg-slate-100 rounded p-1 font-medium">60m: <strong>₹{teacherReport.data.salaryReport.config.group60MinRate}</strong></div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Monthly Earnings breakdown */}
                              <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session Earnings Breakdown</h4>
                                <div className="text-sm space-y-2 border border-slate-100 rounded-lg p-4">
                                  <div className="flex justify-between text-xs font-bold text-gray-400 pb-1 border-b">
                                    <span>Session Type & duration</span>
                                    <span>Count & amount</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium">
                                    <span>1:1 - 30 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min30.count} sessions ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min30.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium">
                                    <span>1:1 - 45 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min45.count} sessions ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min45.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium">
                                    <span>1:1 - 60 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min60.count} sessions ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.min60.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium border-t border-dashed pt-1.5">
                                    <span>Group - 30 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.group.min30.count} classes ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.group.min30.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium">
                                    <span>Group - 45 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.group.min45.count} classes ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.group.min45.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium border-b border-dashed pb-1.5">
                                    <span>Group - 60 Min:</span>
                                    <span>{teacherReport.data.salaryReport.currentMonthBreakdown.group.min60.count} classes ({`₹${teacherReport.data.salaryReport.currentMonthBreakdown.group.min60.earnings}`})</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-xs pt-1.5">
                                    <span>Total Session Earnings:</span>
                                    <span className="text-indigo-650">₹{(teacherReport.data.salaryReport.currentMonthBreakdown.oneToOne.totalEarnings + teacherReport.data.salaryReport.currentMonthBreakdown.group.totalEarnings).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Net Salary Summary */}
                              <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Salary Calculation</h4>
                                <div className="text-sm space-y-2.5 border-2 border-slate-100 rounded-lg p-4 bg-slate-50/10 flex flex-col justify-between h-[calc(100%-32px)]">
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between font-medium">
                                      <span className="text-gray-500">Basic Salary:</span>
                                      <span className="font-semibold text-gray-800">₹{teacherReport.data.salaryReport.currentMonthBreakdown.summary.basicSalary.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                      <span className="text-gray-500">Session Earnings:</span>
                                      <span className="font-semibold text-gray-800">₹{(teacherReport.data.salaryReport.currentMonthBreakdown.summary.oneToOneEarnings + teacherReport.data.salaryReport.currentMonthBreakdown.summary.groupEarnings).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between border-t pt-2.5 mt-2 bg-slate-100/40 p-2 rounded">
                                    <span className="font-bold text-slate-700">Net Salary:</span>
                                    <span className="font-extrabold text-lg text-emerald-700">
                                      ₹{teacherReport.data.salaryReport.currentMonthBreakdown.summary.netSalary.toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Salary History Table */}
                            <div className="space-y-3 pt-3 border-t">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salary Payment History</h4>
                              {teacherReport.data.salaryReport.history.length === 0 ? (
                                <div className="text-center py-4 text-xs text-gray-400">No salary payment records found.</div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-100">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-50/50">
                                        <TableHead>Billing Month</TableHead>
                                        <TableHead>Classes Conducted</TableHead>
                                        <TableHead>Net Salary / Amount Paid</TableHead>
                                        <TableHead>Payment Status</TableHead>
                                        <TableHead>Disbursal Date</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {teacherReport.data.salaryReport.history.map((hist) => (
                                        <TableRow key={hist.id}>
                                          <TableCell className="font-semibold">{hist.month}</TableCell>
                                          <TableCell className="font-medium text-gray-655">{hist.classesConducted} classes</TableCell>
                                          <TableCell className="font-semibold text-slate-750">₹{hist.salaryEarned.toLocaleString()}</TableCell>
                                          <TableCell>
                                            <Badge className={`capitalize text-[10px] ${
                                              hist.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                              hist.paymentStatus === "unpaid" ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                                              "bg-gray-100 text-gray-700 hover:bg-gray-100"
                                            }`}>
                                              {hist.paymentStatus}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-xs text-gray-500 font-medium">
                                            {hist.paymentDate ? new Date(hist.paymentDate).toLocaleDateString() : "-"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* 5. Performance Summary Dashboard */}
                      <Card className="print-card-border shadow-sm border border-slate-100">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                          <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-sky-500" />
                            Performance KPI Analysis & Rating Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Composite Performance Score Gauge */}
                            <div className="border border-slate-100 rounded-xl p-4 bg-sky-50/5 flex flex-col justify-between items-center text-center">
                              <div>
                                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Composite Score</span>
                                <div className="relative inline-flex items-center justify-center mt-1">
                                  <div className="text-3xl font-extrabold text-sky-700 font-mono">
                                    {teacherReport.data.performanceSummary.teacherPerformanceScore}
                                  </div>
                                </div>
                                <span className="text-xs text-sky-655 font-semibold block mt-1.5">Out of 100 max</span>
                              </div>
                              <div className="mt-3">
                                <Badge className={`text-[10px] font-bold ${
                                  teacherReport.data.performanceSummary.teacherPerformanceScore >= 90 ? "bg-emerald-600 text-white hover:bg-emerald-600" :
                                  teacherReport.data.performanceSummary.teacherPerformanceScore >= 80 ? "bg-blue-105 text-blue-700 hover:bg-blue-105" :
                                  "bg-amber-105 text-amber-700 hover:bg-amber-105"
                                }`}>
                                  {teacherReport.data.performanceSummary.teacherPerformanceScore >= 90 ? "Excellent" :
                                   teacherReport.data.performanceSummary.teacherPerformanceScore >= 80 ? "Very Good" :
                                   teacherReport.data.performanceSummary.teacherPerformanceScore >= 70 ? "Satisfactory" :
                                   "Needs Focus"}
                                </Badge>
                              </div>
                            </div>

                            {/* Avg Student Attendance Rate */}
                            <div className="border border-slate-100 rounded-xl p-4 bg-indigo-50/5 flex flex-col justify-between items-center text-center">
                              <div>
                                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Student Attendance</span>
                                <div className="text-3xl font-extrabold text-indigo-700 font-mono mt-1">
                                  {teacherReport.data.performanceSummary.averageStudentAttendance}%
                                </div>
                                <span className="text-xs text-gray-500 block mt-1.5 font-medium">Avg student rate in classes</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full mt-3 overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-500 rounded-full" 
                                  style={{ width: `${teacherReport.data.performanceSummary.averageStudentAttendance}%` }} 
                                />
                              </div>
                            </div>

                            {/* Average Student Rating */}
                            <div className="border border-slate-100 rounded-xl p-4 bg-amber-50/5 flex flex-col justify-between items-center text-center">
                              <div>
                                <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Feedback Rating</span>
                                <div className="flex items-center justify-center gap-1.5 mt-1">
                                  <Star className="w-5 h-5 fill-amber-450 text-amber-450 shrink-0" />
                                  <span className="text-3xl font-extrabold text-amber-700 font-mono">
                                    {teacherReport.data.performanceSummary.studentFeedbackRating}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-500 block mt-1.5 font-medium">Avg score from feedback forms</span>
                              </div>
                              <span className="text-[11px] text-amber-600 font-semibold mt-3">Excellent rating scale</span>
                            </div>

                            {/* Academic Capacity metrics */}
                            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col justify-between gap-1.5 text-left text-xs">
                              <div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Operational Capacity</span>
                                <div className="space-y-1.5 mt-2 font-semibold text-slate-700">
                                  <div className="flex justify-between">
                                    <span>Students Taught:</span>
                                    <span className="text-gray-800 font-bold">{teacherReport.data.performanceSummary.totalStudentsTaught}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Batches Managed:</span>
                                    <span className="text-gray-800 font-bold">{teacherReport.data.performanceSummary.totalBatchesManaged}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Classes Conducted:</span>
                                    <span className="text-gray-800 font-bold">{teacherReport.data.performanceSummary.totalClassesConducted}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t border-dashed pt-1.5 text-[10px] text-gray-400 font-medium">
                                Cumulative totals since joining.
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 6. Students List */}
                      <Card className="print-card-border shadow-sm border border-slate-100 mt-6">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                          <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Users className="w-4 h-4 text-orange-500" />
                            Assigned Students ({teacherReport.data.studentsList?.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                          {!teacherReport.data.studentsList || teacherReport.data.studentsList.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-450">No students found for this teacher.</div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Student Name (ID)</TableHead>
                                  <TableHead>Batches/Type</TableHead>
                                  <TableHead>Classes Conducted</TableHead>
                                  <TableHead>Classes Remaining</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {teacherReport.data.studentsList.map((s: any) => (
                                  <TableRow key={s.id}>
                                    <TableCell className="font-semibold">
                                      {s.name} <span className="text-xs text-gray-400 font-mono">({s.unionId || s.id})</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-600 font-medium max-w-[200px] truncate" title={s.batchNames.join(", ")}>
                                      {s.batchNames.join(", ") || "-"}
                                    </TableCell>
                                    <TableCell className="font-semibold text-emerald-600">
                                      {s.totalClassesConducted} <span className="text-xs text-gray-400 font-normal">({s.oneToOneConducted} 1:1, {s.groupConducted} Grp)</span>
                                    </TableCell>
                                    <TableCell className="font-semibold text-amber-600">
                                      {s.totalClassesRemaining} <span className="text-xs text-gray-400 font-normal">({s.oneToOneRemaining} 1:1, {s.groupRemaining} Grp)</span>
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={`capitalize text-[10px] ${
                                        s.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-700 hover:bg-gray-100"
                                      }`}>
                                        {s.status}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>

                      {/* Admin Actions Footer */}
                      <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-dashed border-gray-200 print-hide">
                        {user?.role !== "academic_head" && (
                          <Link to={`/salaries?search=${encodeURIComponent(teacherReport.data.teacher.name)}`}>
                            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5" /> View Salary Logs
                            </Button>
                          </Link>
                        )}
                        <Link to={`/classes?teacher=${teacherReport.data.teacher.id}`}>
                          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> View Class Logs
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5" /> Print Report
                        </Button>
                        <Button variant="default" size="sm" onClick={handlePrint} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700">
                          <Download className="w-3.5 h-3.5" /> Download PDF
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leaderboard">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Student Leaderboard</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Attendance %</TableHead>
                        <TableHead>Chat Activity</TableHead>
                        <TableHead>Composite Score</TableHead>
                        <TableHead>At Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.data?.map((s, i) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-bold text-gray-500">#{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.attendancePct}%</TableCell>
                          <TableCell>{s.chatActivity}</TableCell>
                          <TableCell className="font-bold">{s.compositeScore}</TableCell>
                          <TableCell>
                            {(s as any).atRisk && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> At Risk</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="teacher-attendance">
              {renderTeacherAttendanceReport(false)}
            </TabsContent>
            
            <TabsContent value="class-report">
              <ClassReportView />
            </TabsContent>

            <TabsContent value="workload">
              <WorkloadReportView />
            </TabsContent>

            {/* ─── Teacher Student-Wise Report ─── */}
            <TabsContent value="teacher-student-wise">
              <Card className="shadow-sm border-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-base font-semibold text-slate-800">Teacher Student-Wise Report</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Select a teacher and date range to see per-student attendance breakdown.</p>
                </CardHeader>
                <div className="p-5 space-y-4 print-hide">
                  {/* Teacher Search */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <Input
                        className="pl-9"
                        placeholder="Search teacher name..."
                        value={tswTeacherSearch}
                        onChange={(e) => { setTswTeacherSearch(e.target.value); setShowTswTeacherDropdown(true); if (!e.target.value) setTswTeacherId(null); }}
                        onFocus={() => setShowTswTeacherDropdown(true)}
                      />
                      {showTswTeacherDropdown && tswTeacherSearchQuery.data && tswTeacherSearchQuery.data.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {tswTeacherSearchQuery.data.map((t: any) => (
                            <button
                              key={t.id}
                              className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                              onClick={() => { setTswTeacherId(t.id); setTswTeacherSearch(t.name || t.username); setShowTswTeacherDropdown(false); }}
                            >
                              <span className="font-medium">{t.name || t.username}</span>
                              {t.username && <span className="text-gray-400 ml-2">@{t.username}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="date" value={tswStartDate} onChange={(e) => setTswStartDate(e.target.value)} className="w-36" />
                      <span className="text-gray-400 text-sm">to</span>
                      <Input type="date" value={tswEndDate} onChange={(e) => setTswEndDate(e.target.value)} className="w-36" />
                    </div>
                  </div>
                </div>
                {tswReportQuery.isLoading && <div className="text-center py-12 text-gray-400">Loading...</div>}
                {!tswTeacherId && !tswReportQuery.isLoading && (
                  <div className="text-center py-12 text-gray-400">Search and select a teacher to view their student-wise report.</div>
                )}
                {tswTeacherId && !tswReportQuery.isLoading && tswReportQuery.data && (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Student</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">1-to-1 Sessions</TableHead>
                        <TableHead className="text-center">Total Classes</TableHead>
                        <TableHead className="text-center">Attendance %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tswReportQuery.data.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No records found for this period.</TableCell></TableRow>
                      )}
                      {tswReportQuery.data.map((row: any) => (
                        <TableRow key={row.studentId} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{row.studentName}</TableCell>
                          <TableCell className="text-center text-green-600 font-semibold">{row.presentCount}</TableCell>
                          <TableCell className="text-center text-red-500 font-semibold">{row.absentCount}</TableCell>
                          <TableCell className="text-center text-blue-600">{row.oneToOneCount}</TableCell>
                          <TableCell className="text-center">{row.totalClasses}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-xs ${row.attendanceRate >= 75 ? "bg-green-100 text-green-700" : row.attendanceRate >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}>
                              {row.attendanceRate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            {/* ─── Daily All-Teachers Report ─── */}
            <TabsContent value="daily-report">
              <Card className="shadow-sm border-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-base font-semibold text-slate-800">Daily All-Teachers Report</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Overview of all teacher activity for a given day.</p>
                </CardHeader>
                <div className="p-5 print-hide">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Date:</label>
                    <Input
                      type="date"
                      value={dailyReportDate}
                      onChange={(e) => setDailyReportDate(e.target.value)}
                      className="w-40"
                    />
                    <Button variant="outline" size="sm" onClick={() => setDailyReportDate(today)}>Today</Button>
                  </div>
                </div>
                {dailyReportQuery.isLoading && <div className="text-center py-12 text-gray-400">Loading...</div>}
                {dailyReportQuery.data && (
                  <>
                    {/* Summary bar */}
                    <div className="grid grid-cols-4 gap-3 px-5 pb-4">
                      {[
                        { label: "Teachers Active", value: dailyReportQuery.data.length, cls: "text-indigo-600" },
                        { label: "Group Classes", value: dailyReportQuery.data.reduce((a: number, r: any) => a + r.groupClasses, 0), cls: "text-blue-600" },
                        { label: "1-to-1 Sessions", value: dailyReportQuery.data.reduce((a: number, r: any) => a + r.o2oSessions, 0), cls: "text-purple-600" },
                        { label: "Total Minutes", value: dailyReportQuery.data.reduce((a: number, r: any) => a + r.totalMinutes, 0), cls: "text-green-600" },
                      ].map((s) => (
                        <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Teacher</TableHead>
                          <TableHead className="text-center">Group Classes</TableHead>
                          <TableHead className="text-center">1-to-1</TableHead>
                          <TableHead className="text-center">Completed</TableHead>
                          <TableHead className="text-center">Unique Students</TableHead>
                          <TableHead className="text-center">Total Minutes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyReportQuery.data.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No classes or sessions found for this date.</TableCell></TableRow>
                        )}
                        {dailyReportQuery.data.map((row: any) => (
                          <TableRow key={row.teacherId} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{row.teacherName}</TableCell>
                            <TableCell className="text-center">{row.groupClasses}</TableCell>
                            <TableCell className="text-center">{row.o2oSessions}</TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-green-100 text-green-700 text-xs">{row.completedClasses}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{row.uniqueStudents}</TableCell>
                            <TableCell className="text-center font-semibold text-indigo-700">{row.totalMinutes} min</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {user?.role === "student" && myAttendance.data && (
        <Card className="border border-slate-100 shadow-sm rounded-xl">
          <CardHeader className="pb-3 bg-slate-50/50 border-b flex flex-row justify-between items-center">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              My Attendance Calendar
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs font-semibold flex items-center gap-1.5 print-hide"><Printer className="w-3.5 h-3.5" /> Print</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <span className="text-xs text-emerald-600 font-bold uppercase block mb-1">Present Classes</span>
                <strong className="text-2xl text-emerald-800 font-extrabold">{myAttendance.data.filter((a) => a.status === "present" || a.status === "late").length}</strong>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl">
                <span className="text-xs text-rose-600 font-bold uppercase block mb-1">Absent Classes</span>
                <strong className="text-2xl text-rose-800 font-extrabold">{myAttendance.data.filter((a) => a.status === "absent").length}</strong>
              </div>
              <div className="p-3 bg-indigo-50 rounded-xl">
                <span className="text-xs text-indigo-600 font-bold uppercase block mb-1">Attendance Rate</span>
                <strong className="text-2xl text-indigo-800 font-extrabold">
                  {myAttendance.data.length > 0
                    ? `${Math.round((myAttendance.data.filter((a) => a.status === "present" || a.status === "late").length / myAttendance.data.length) * 100)}%`
                    : "100%"}
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Total Classes</span>
                <strong className="text-2xl text-slate-800 font-extrabold">{myAttendance.data.length}</strong>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-50/50 p-3 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400">
              <span className="text-gray-400 uppercase tracking-wider text-[10px]">Legend:</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-green-500 block"></span>🟢 Present</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-red-500 block"></span>🔴 Absent</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-blue-500 block"></span>🔵 Holiday</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-orange-500 block"></span>🟠 Cancelled</span>
            </div>

            {/* Grid Table */}
            <div className="overflow-x-auto relative border rounded-xl">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Class Title</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead className="text-center">Session Type</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myAttendance.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-gray-500">No attendance history available.</TableCell>
                    </TableRow>
                  ) : (
                    myAttendance.data.map((a) => {
                      let cellColor = "bg-gray-100 text-gray-600";
                      let display = "⚪ No Class";
                      
                      if (a.status === "present" || a.status === "late") {
                        cellColor = "bg-green-100 text-green-700 border-green-200";
                        display = "🟢 Present";
                      } else if (a.status === "absent") {
                        cellColor = "bg-red-100 text-red-700 border-red-200";
                        display = "🔴 Absent";
                      } else if (a.status === "holiday" as any) {
                        cellColor = "bg-blue-100 text-blue-700 border-blue-200";
                        display = "🔵 Holiday";
                      } else if (a.status === "cancelled" as any) {
                        cellColor = "bg-orange-100 text-orange-700 border-orange-200";
                        display = "🟠 Cancelled";
                      }

                      const mappedCell = {
                        date: a.recordedAt ? new Date(a.recordedAt).toLocaleDateString() : "-",
                        time: a.recordedAt ? new Date(a.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "-",
                        classType: a.sessionType || (a.class?.classType) || "group",
                        duration: a.duration || a.class?.duration || (a.class as any)?.sessionLength || 0,
                        studentName: user.name,
                        teacherName: (a as any).teacher?.name || "Instructor",
                        batchName: (a as any).batch?.name || "-",
                        moduleName: (a as any).module?.name || "-",
                        status: a.status,
                        remarks: a.remarks || "",
                        meetingId: a.meetingId || a.class?.meetingRoomId || "",
                      };

                      return (
                        <TableRow key={a.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedCellDetails(mappedCell)}>
                          <TableCell className="font-semibold text-gray-900">
                            {a.class?.title || (a as any).oneToOneSession?.title || "Class Session"}
                          </TableCell>
                          <TableCell>
                            {a.recordedAt ? new Date(a.recordedAt).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] font-bold ${mappedCell.classType === "one_to_one" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>
                              {mappedCell.classType === "one_to_one" ? "1-to-1" : "Group"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-xs font-bold ${cellColor}`}>
                              {display}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {mappedCell.duration} min
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Details Dialog */}
      <Dialog open={!!selectedCellDetails} onOpenChange={(open) => !open && setSelectedCellDetails(null)}>
        <DialogContent className="w-[95vw] md:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 border-b pb-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              Attendance Details
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 mt-1">
              Class session detailed information and attendance logs.
            </DialogDescription>
          </DialogHeader>
          {selectedCellDetails && (
            <div className="space-y-3.5 text-sm pt-2">
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 border-b pb-3">
                <div>
                  <span className="text-xs text-gray-400 font-semibold block uppercase">Class Date</span>
                  <strong className="text-gray-900">{selectedCellDetails.date}</strong>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-semibold block uppercase">Class Time</span>
                  <strong className="text-gray-900">{selectedCellDetails.time}</strong>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-semibold block uppercase">Session Type</span>
                  <Badge variant="outline" className={`text-[10px] font-bold mt-0.5 ${selectedCellDetails.classType === "one_to_one" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>
                    {selectedCellDetails.classType === "one_to_one" ? "One-on-One" : "Group Class"}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-semibold block uppercase">Duration</span>
                  <strong className="text-gray-900">{selectedCellDetails.duration} minutes</strong>
                </div>
              </div>

              <div className="space-y-2 border-b pb-3">
                <div className="flex justify-between"><span className="text-gray-500">Student:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.studentName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Teacher:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.teacherName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Batch:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.batchName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Module:</span> <span className="font-semibold text-gray-800">{selectedCellDetails.moduleName}</span></div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Attendance Status:</span> 
                  <Badge className={`text-xs font-bold uppercase tracking-wider ${
                    selectedCellDetails.status === "present" ? "bg-green-500 text-white" :
                    selectedCellDetails.status === "absent" ? "bg-red-500 text-white" :
                    selectedCellDetails.status === "holiday" ? "bg-blue-500 text-white" :
                    selectedCellDetails.status === "cancelled" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {selectedCellDetails.status}
                  </Badge>
                </div>
                {selectedCellDetails.meetingId && (
                  <div className="flex justify-between"><span className="text-gray-500">Meeting ID:</span> <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-0.5 rounded border">{selectedCellDetails.meetingId}</span></div>
                )}
                {selectedCellDetails.remarks && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border text-xs text-gray-600 mt-2">
                    <span className="font-bold text-gray-500 block mb-0.5">Remarks / Notes:</span>
                    {selectedCellDetails.remarks}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Holiday Dialog */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent className="w-[95vw] md:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Manage Academy Holidays
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 mt-1">
              Add a public holiday or academy closure date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Holiday Date</Label>
              <Input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Holiday Name</Label>
              <Input
                placeholder="e.g. Independence Day, Christmas Closure"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Description (Optional)</Label>
              <Input
                placeholder="e.g. Academy will remain closed today"
                value={holidayDescription}
                onChange={(e) => setHolidayDescription(e.target.value)}
                className="text-sm"
              />
            </div>
            
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 mt-2"
              disabled={!holidayDate || !holidayName || createHolidayMutation.isPending}
              onClick={() => createHolidayMutation.mutate({ date: holidayDate, name: holidayName, description: holidayDescription })}
            >
              {createHolidayMutation.isPending ? "Adding Holiday..." : "Add Holiday"}
            </Button>

            {/* List of existing holidays */}
            <div className="pt-3 border-t mt-3">
              <span className="text-[10px] text-gray-400 font-bold uppercase block mb-2">Existing Holidays</span>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {holidaysQuery.data?.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-2">No holidays recorded yet</p>
                ) : (
                  holidaysQuery.data?.map((h) => (
                    <div key={h.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border text-xs">
                      <div>
                        <strong>{h.name}</strong>
                        <span className="text-gray-500 font-semibold block mt-0.5">{new Date(h.date).toLocaleDateString()}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
                        onClick={() => deleteHolidayMutation.mutate({ id: h.id })}
                      >
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
