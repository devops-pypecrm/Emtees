import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const getEnrollmentSourceLabel = (source: string | null | undefined) => {
  if (source === "referral") return "Sales Executive Referral";
  if (source === "self") return "Student Self Enrollment";
  return "Direct Admission";
};
import { Search, Plus, Upload, Edit, Trash2, Download, Eye, FileText, Send, Calendar, CreditCard, Award, MessageCircle, FileUp, User, Clock, AlertTriangle, CheckCircle, RefreshCcw, BookOpen, History, Settings, X, Play, GraduationCap, Key } from "lucide-react";
import { validatePhoneNumber } from "@contracts/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useEffect } from "react";
import { ClassAllocationForm, ClassAllocationValue } from "@/components/ClassAllocationForm";
import { ClassAllocationSummary } from "@/components/ClassAllocationSummary";
import { ClassBalanceAdjustment } from "@/components/ClassBalanceAdjustment";

function formatTimeStr(timeStr?: string) {
  if (!timeStr) return "-";
  const [h, m] = timeStr.split(":");
  if (!h || !m) return timeStr;
  const hNum = parseInt(h, 10);
  const ampm = hNum >= 12 ? "PM" : "AM";
  const h12 = hNum % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m} ${ampm}`;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isAcademicHead = user?.role === "academic_head";
  const isTeacher = user?.role === "teacher";
  const isStaff = isAdmin || isAcademicHead || isTeacher;

  // Search, Filters & Pagination states
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("search") || "";
    }
    return "";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending_enrollment" | "alumni">("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [qualificationFilter, setQualificationFilter] = useState<string>("all");
  const [postalCodeFilter, setPostalCodeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Dialog / Dialog states
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [credentialsStudent, setCredentialsStudent] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [importSummary, setImportSummary] = useState<{
    totalRows: number;
    successfulImports: number;
    failedRows: number;
    errors: { row: number; name?: string; errors: string[] }[];
  } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string>("");
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const view = new URLSearchParams(window.location.search).get("view");
      const parsed = view ? parseInt(view, 10) : null;
      return parsed && parsed > 0 ? parsed : null;
    }
    return null;
  });

  // New States for Course & Class Package Enhancement
  const [packageEditMode, setPackageEditMode] = useState(false);
  const [packageForm, setPackageForm] = useState<any>({
    oneToOne: { total: 0, min30: 0, min45: 0, min60: 0 },
    group: { total: 0, min30: 0, min45: 0, min60: 0 },
  });
  const [teacherAssignMode, setTeacherAssignMode] = useState(false);
  const [assignTeachersForm, setAssignTeachersForm] = useState<number[]>([]);
  const [batchChangeMode, setBatchChangeMode] = useState(false);
  const [newBatchCourseId, setNewBatchCourseId] = useState<number | "">("");
  const [newBatchId, setNewBatchId] = useState<number | "">("");

  // Form states
  const [idGenerationType, setIdGenerationType] = useState<"auto" | "manual">("auto");
  const [form, setForm] = useState<{
    name: string;
    countryCode: string;
    countryISO: string;
    phoneNumber: string;
    email: string;
    username: string;
    password: string;
    courseId: number | "";
    batchId: number | "";
    preferredClassTime?: string;
    sessionType?: "one_on_one" | "group" | "both";
    feesTotal: number;
    allocatedOneToOneSessions: number;
    allocatedGroupSessions: number;
    paymentType: "FULL_PAYMENT" | "INSTALLMENT";
    gender: string;
    dob: string;
    address: string;
    postalCode: string;
    qualificationId: number | "";
    educationalQualification: string;
    parentName: string;
    parentPhone: string;
    parentCountryCode: string;
    parentCountryISO: string;
    parentPhoneNumber: string;
    notes: string;
    enrollmentId: string;
  }>({
    name: "",
    countryCode: "+91",
    countryISO: "IN",
    phoneNumber: "",
    email: "",
    username: "",
    password: "",
    courseId: "",
    batchId: "",
    preferredClassTime: "9:00 AM",
    sessionType: "group",
    feesTotal: 0,
    allocatedOneToOneSessions: 0,
    allocatedGroupSessions: 0,
    paymentType: "FULL_PAYMENT",
    gender: "",
    dob: "",
    address: "",
    postalCode: "",
    qualificationId: "",
    educationalQualification: "",
    parentName: "",
    parentPhone: "",
    parentCountryCode: "+91",
    parentCountryISO: "IN",
    parentPhoneNumber: "",
    notes: "",
    enrollmentId: "",
  });

  const [classAllocation, setClassAllocation] = useState<ClassAllocationValue>({
    oneToOne: {
      teacherId: "",
      designatedTime: "",
      sessions30: 0,
      sessions45: 0,
      sessions60: 0,
    },
    group: {
      teacherId: "",
      batchId: "",
      designatedTime: "",
      sessions30: 0,
      sessions45: 0,
      sessions60: 0,
    },
  });

  const [isConfiguringAllocation, setIsConfiguringAllocation] = useState(false);
  const [tempAllocation, setTempAllocation] = useState<ClassAllocationValue>({
    oneToOne: { teacherId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 },
    group: { teacherId: "", batchId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 },
  });
  const [configStudentId, setConfigStudentId] = useState<number | null>(null);

  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  const [adjustType, setAdjustType] = useState<"oneToOne" | "group">("oneToOne");

  const [paymentType, setPaymentType] = useState<"FULL_PAYMENT" | "INSTALLMENT">("FULL_PAYMENT");
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [installments, setInstallments] = useState<Array<{ installmentNumber: number; amount: number; dueDate?: string }>>([]);

  // Document upload state
  const [newDoc, setNewDoc] = useState({ name: "", url: "" });

  // Fee adjustment state
  const [feeForm, setFeeForm] = useState({ minInitialPayment: 0, paymentDueDate: "" });

  // Student Fee Rules state
  const [feeRulesState, setFeeRulesState] = useState<{
    paymentType: "FULL_PAYMENT" | "INSTALLMENT";
    totalCourseFee: number;
    initialPayment: number;
    numInstallments: number;
    installments: Array<{
      installmentNumber: number;
      amount: number;
      dueDate: string;
      status: "paid" | "unpaid";
    }>;
  } | null>(null);

  const [isConfirmingFeeRules, setIsConfirmingFeeRules] = useState(false);

  // Session adjustment state
  const [sessionForm, setSessionForm] = useState({ allocatedOneToOne: 0, allocatedGroup: 0, reason: "" });

  const resetForm = () => {
    setForm({
      name: "",
      countryCode: "+91",
      countryISO: "IN",
      phoneNumber: "",
      email: "",
      username: "",
      password: "",
      courseId: "",
      batchId: "",
      feesTotal: 0,
      allocatedOneToOneSessions: 0,
      allocatedGroupSessions: 0,
      paymentType: "FULL_PAYMENT",
      gender: "",
      dob: "",
      address: "",
      postalCode: "",
      qualificationId: "",
      educationalQualification: "",
      parentName: "",
      parentPhone: "",
      parentCountryCode: "+91",
      parentCountryISO: "IN",
      parentPhoneNumber: "",
      notes: "",
      enrollmentId: "",
    });
    setClassAllocation({
      oneToOne: { teacherId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 },
      group: { teacherId: "", batchId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 }
    });
    setIdGenerationType("auto");
    setPaymentType("FULL_PAYMENT");
    setInstallmentCount(2);
    setInstallments([]);
  };

  // tRPC Queries
  const activeQualificationsQuery = trpc.qualifications.listActive.useQuery();
  const activeCoursesQuery = trpc.learning.listModules.useQuery();
  const activeCourses = activeCoursesQuery.data?.filter((m) => m.status === "active") || [];
  const selectedCourse = activeCourses.find((c) => c.id === Number(form.courseId));
  const activeBatches = selectedCourse?.batches?.filter((b: any) => b.status === "active") || [];

  const filterCourseSelected = activeCourses.find((c) => c.id === Number(courseFilter));
  const filterBatches = filterCourseSelected?.batches || [];

  const studentsQuery = trpc.students.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    courseId: courseFilter !== "all" ? Number(courseFilter) : undefined,
    batchId: batchFilter !== "all" ? Number(batchFilter) : undefined,
    qualificationId: qualificationFilter !== "all" ? Number(qualificationFilter) : undefined,
    postalCode: postalCodeFilter || undefined,
    limit,
    offset: (page - 1) * limit,
  }, { enabled: isStaff });

  const profileQuery = trpc.students.getProfile.useQuery(
    { id: detailsStudentId || 0 },
    { enabled: typeof detailsStudentId === "number" && detailsStudentId > 0 }
  );

  // tRPC Mutations
  const createStudentMutation = trpc.students.create.useMutation({
    onSuccess: (data) => {
      if (data.emailError) {
        toast.warning(`Student created, but credentials email failed: ${data.emailError}`);
      } else {
        toast.success("Student created successfully!");
      }
      setOpen(false);
      resetForm();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStudentMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      toast.success("Student details updated successfully");
      setEditOpen(false);
      setEditStudent(null);
      studentsQuery.refetch();
      if (detailsStudentId) profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteStudentMutation = trpc.students.delete.useMutation({
    onSuccess: () => {
      toast.success("Student account deleted successfully");
      setDeleteId(null);
      setDetailsStudentId(null);
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSessionTypeMutation = trpc.students.updateSessionType.useMutation({
    onSuccess: () => {
      toast.success("Session Type updated");
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const importStudentsMutation = trpc.students.import.useMutation({
    onSuccess: (data) => {
      if (data.errors && data.errors.length > 0) {
        setImportSummary({
          totalRows: data.totalRows || 0,
          successfulImports: data.successfulImports || 0,
          failedRows: data.failedRows || 0,
          errors: data.errors,
        });
        toast.warning(`Import completed: ${data.successfulImports} succeeded, ${data.failedRows} failed.`);
      } else {
        toast.success(`Imported ${data.successfulImports} students successfully`);
        setImportOpen(false);
        setImportFile(null);
        setBase64Data("");
        setImportSummary(null);
      }
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const addDocumentMutation = trpc.students.addDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setNewDoc({ name: "", url: "" });
      profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDocumentMutation = trpc.students.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document deleted");
      profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPaymentMutation = trpc.admin.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const adjustFeesMutation = trpc.admin.adjustStudentFees.useMutation({
    onSuccess: () => {
      toast.success("Fees adjusted successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateFeeRulesMutation = trpc.admin.updateStudentFeeRules.useMutation({
    onSuccess: () => {
      toast.success("Student fee rules updated successfully!");
      setIsConfirmingFeeRules(false);
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const adjustSessionsMutation = trpc.admin.adjustStudentSessions.useMutation({
    onSuccess: () => {
      toast.success("Sessions adjusted successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
      setSessionForm(prev => ({ ...prev, reason: "" }));
    },
    onError: (err) => toast.error(err.message),
  });

  const teachersAvailabilityQuery = trpc.students.getTeachersAvailability.useQuery(undefined, {
    enabled: !!detailsStudentId,
  });

  const teachersQuery = trpc.user.list.useQuery(
    { role: "teacher", status: "active", limit: 200 },
    { enabled: isAdmin || isAcademicHead }
  );

  const batchesQuery = trpc.learning.listBatches.useQuery(undefined);
  const departmentsQuery = trpc.department.list.useQuery();

  const studentDepartmentId = useMemo(() => {
    const studentId = configStudentId || detailsStudentId;
    if (!studentId || !studentsQuery.data?.items) return null;
    const student = studentsQuery.data.items.find((s: any) => s.id === studentId);
    const moduleId = student?.courseId;
    if (!moduleId || !departmentsQuery.data) return null;
    
    const dept = departmentsQuery.data.find((d: any) => 
      d.modules?.some((m: any) => m.id === moduleId)
    );
    return dept?.id || null;
  }, [configStudentId, detailsStudentId, studentsQuery.data, departmentsQuery.data]);

  const getTeacherName = (id: number | null | undefined) => {
    if (!id) return "Unassigned";
    const t = teachersQuery.data?.find((x: any) => x.id === id);
    return t ? `${t.name} (${t.unionId})` : `Teacher #${id}`;
  };

  const getBatchName = (id: number | null | undefined) => {
    if (!id) return "Unassigned";
    const b = batchesQuery.data?.find((x: any) => x.id === id);
    return b ? b.name : `Batch #${id}`;
  };

  const updateClassAllocationMutation = trpc.students.updateClassAllocation.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Class allocation saved successfully!");
      setIsConfiguringAllocation(false);
      profileQuery.refetch();
      studentsQuery.refetch();
      if (editStudent && editStudent.id === variables.studentId) {
        setEditStudent({
          ...editStudent,
          classAllocation: variables.allocation
        });
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updatePackageMutation = trpc.students.updateStudentPackage.useMutation({
    onSuccess: () => {
      toast.success("Package details updated successfully");
      setPackageEditMode(false);
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTeacherAssignmentMutation = trpc.students.updateTeacherAssignment.useMutation({
    onSuccess: () => {
      toast.success("Teacher assignment updated successfully");
      setTeacherAssignMode(false);
      profileQuery.refetch();
      teachersAvailabilityQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const changeBatchMutation = trpc.students.changeBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch changed successfully");
      setBatchChangeMode(false);
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Load default country settings
  const defaultCountryQuery = trpc.admin.getDefaultCountry.useQuery(undefined, {
    enabled: isAdmin || isAcademicHead,
  });

  useEffect(() => {
    if (defaultCountryQuery.data) {
      setForm((prev) => {
        if (prev.phoneNumber === "") {
          return {
            ...prev,
            countryCode: defaultCountryQuery.data.code,
            countryISO: defaultCountryQuery.data.iso,
            parentCountryCode: defaultCountryQuery.data.code,
            parentCountryISO: defaultCountryQuery.data.iso,
          };
        }
        return prev;
      });
    }
  }, [defaultCountryQuery.data]);

  // Initialize student fee rules state from profile query
  useEffect(() => {
    if (profileQuery.data?.student?.profile) {
      const profile = profileQuery.data.student.profile;
      const paymentsList = profileQuery.data.payments || [];
      const paymentType = (profile.paymentOption === "installment" ? "INSTALLMENT" : "FULL_PAYMENT") as "FULL_PAYMENT" | "INSTALLMENT";
      const totalCourseFee = parseFloat(profile.totalCourseFee || profile.feesTotal || "0");
      const initialPayment = parseFloat(profile.minInitialPayment || profile.downPayment || "0");

      // Filter and sort tuition payments
      const tuitionPayments = paymentsList.filter(p => p.type === "tuition");
      const sortedTuition = [...tuitionPayments].sort((a, b) => (a.installmentNumber || 999) - (b.installmentNumber || 999));

      const installments = sortedTuition.map((p, idx) => ({
        installmentNumber: p.installmentNumber || (idx + 1),
        amount: parseFloat(p.amount),
        dueDate: p.dueDate ? new Date(p.dueDate).toISOString().split("T")[0] : "",
        status: p.status as "paid" | "unpaid",
      }));

      setFeeRulesState({
        paymentType,
        totalCourseFee,
        initialPayment,
        numInstallments: installments.length || 1,
        installments: installments.length > 0 ? installments : [
          {
            installmentNumber: 1,
            amount: totalCourseFee,
            dueDate: profile.paymentDueDate ? new Date(profile.paymentDueDate).toISOString().split("T")[0] : "",
            status: "unpaid",
          }
        ],
      });
    } else {
      setFeeRulesState(null);
    }
  }, [profileQuery.data]);

  const recalculateStudentFeeRules = () => {
    if (!feeRulesState) return;
    const { totalCourseFee, initialPayment, numInstallments, installments } = feeRulesState;

    const paidPayments = installments.filter(i => i.status === "paid");
    const sumPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);

    if (totalCourseFee < sumPaid) {
      toast.error(`Total Course Fee cannot be less than the amount already paid (₹${sumPaid}).`);
      return;
    }

    const remaining = totalCourseFee - sumPaid;
    const numUnpaid = Math.max(1, numInstallments - paidPayments.length);

    let newInstallments = [...paidPayments];

    if (paidPayments.length === 0) {
      // Case 1: No paid installments yet (student has not paid anything)
      if (initialPayment > totalCourseFee) {
        toast.error("Initial payment cannot exceed the total course fee.");
        return;
      }
      
      // Installment #1 is the initial payment
      const inst1 = {
        installmentNumber: 1,
        amount: initialPayment,
        dueDate: installments[0]?.dueDate || new Date().toISOString().split("T")[0],
        status: "unpaid" as const,
      };
      newInstallments.push(inst1);

      if (numInstallments > 1) {
        const remainingUnpaid = numInstallments - 1;
        const restAmount = totalCourseFee - initialPayment;
        const base = Math.floor(restAmount / remainingUnpaid);
        const remainder = restAmount % remainingUnpaid;

        for (let i = 0; i < remainingUnpaid; i++) {
          const instNo = i + 2;
          const prevInstDate = newInstallments[newInstallments.length - 1].dueDate;
          const baseDate = prevInstDate ? new Date(prevInstDate) : new Date();
          const nextDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

          newInstallments.push({
            installmentNumber: instNo,
            amount: base + (i === remainingUnpaid - 1 ? remainder : 0),
            dueDate: nextDate.toISOString().split("T")[0],
            status: "unpaid" as const,
          });
        }
      } else {
        // Only 1 installment: adjust its amount to match the total course fee
        newInstallments[0].amount = totalCourseFee;
      }
    } else {
      // Case 2: There are already paid installments
      const base = Math.floor(remaining / numUnpaid);
      const remainder = remaining % numUnpaid;

      // Find the highest installment number in paid payments
      const maxPaidInstNumber = Math.max(...paidPayments.map(p => p.installmentNumber), 0);

      for (let i = 0; i < numUnpaid; i++) {
        const instNo = maxPaidInstNumber + i + 1;
        
        // Find existing unpaid installment at this index to preserve due date if possible
        const existingUnpaid = installments.filter(inst => inst.status === "unpaid")[i];
        let dueDate = existingUnpaid?.dueDate;
        if (!dueDate) {
          const prevInstDate = newInstallments[newInstallments.length - 1]?.dueDate;
          const baseDate = prevInstDate ? new Date(prevInstDate) : new Date();
          const nextDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          dueDate = nextDate.toISOString().split("T")[0];
        }

        newInstallments.push({
          installmentNumber: instNo,
          amount: base + (i === numUnpaid - 1 ? remainder : 0),
          dueDate,
          status: "unpaid" as const,
        });
      }
    }

    // Ensure they are sorted by installment number
    newInstallments.sort((a, b) => a.installmentNumber - b.installmentNumber);

    setFeeRulesState({
      ...feeRulesState,
      installments: newInstallments,
      numInstallments: newInstallments.length,
    });

    toast.success("Installments recalculated successfully!");
  };

  const addFeeRulesInstallmentRow = () => {
    if (!feeRulesState) return;
    const { installments } = feeRulesState;
    const maxInstNo = installments.reduce((max, i) => Math.max(max, i.installmentNumber), 0);
    const lastInst = installments.find(i => i.installmentNumber === maxInstNo);
    
    let nextDateStr = "";
    if (lastInst?.dueDate) {
      const lastDate = new Date(lastInst.dueDate);
      const nextDate = new Date(lastDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      nextDateStr = nextDate.toISOString().split("T")[0];
    } else {
      nextDateStr = new Date().toISOString().split("T")[0];
    }

    const newInst = {
      installmentNumber: maxInstNo + 1,
      amount: 0,
      dueDate: nextDateStr,
      status: "unpaid" as const,
    };

    setFeeRulesState({
      ...feeRulesState,
      installments: [...installments, newInst],
      numInstallments: installments.length + 1,
    });
  };

  const removeFeeRulesInstallmentRow = (instNo: number) => {
    if (!feeRulesState) return;
    const { installments } = feeRulesState;
    const target = installments.find(i => i.installmentNumber === instNo);
    if (target?.status === "paid") {
      toast.error("Paid installments cannot be deleted.");
      return;
    }

    const filtered = installments.filter(i => i.installmentNumber !== instNo);
    
    // Re-number installments continuously
    const renumbered = filtered.map((inst, idx) => ({
      ...inst,
      installmentNumber: idx + 1,
    }));

    setFeeRulesState({
      ...feeRulesState,
      installments: renumbered,
      numInstallments: renumbered.length,
    });
  };

  // Helper calculation for installments
  const calculateInstallments = (totalFee: number, count: number) => {
    if (totalFee <= 0) return [];
    const base = Math.floor(totalFee / count);
    const remainder = totalFee % count;
    return Array.from({ length: count }, (_, i) => ({
      installmentNumber: i + 1,
      amount: base + (i === count - 1 ? remainder : 0),
      dueDate: "",
    }));
  };

  const handleFeesTotalChange = (fee: number) => {
    setForm((prev) => ({ ...prev, feesTotal: fee }));
    if (paymentType === "INSTALLMENT") {
      setInstallments(calculateInstallments(fee, installmentCount));
    }
  };

  const handleInstallmentCountChange = (count: number) => {
    setInstallmentCount(count);
    setInstallments(calculateInstallments(form.feesTotal, count));
  };

  const handleInstallmentAmountChange = (index: number, amt: number) => {
    setInstallments((prev) => {
      const updated = [...prev];
      updated[index].amount = amt;
      return updated;
    });
  };

  const handleInstallmentDateChange = (index: number, date: string) => {
    setInstallments((prev) => {
      const updated = [...prev];
      updated[index].dueDate = date;
      return updated;
    });
  };

  const handleCourseChange = (courseIdVal: string) => {
    const cId = courseIdVal ? Number(courseIdVal) : "";
    let fee = 0;
    if (cId) {
      const selectedCourse = activeCourses.find((c: any) => c.id === cId);
      fee = selectedCourse ? parseFloat(selectedCourse.courseFee || "0") : 0;
    }
    setForm((prev) => ({
      ...prev,
      courseId: cId,
      batchId: "",
      feesTotal: fee,
    }));
    if (paymentType === "INSTALLMENT") {
      setInstallments(calculateInstallments(fee, installmentCount));
    }
  };

  const handleCreateOpen = () => {
    const defCode = "+91";
    const defIso = "IN";
    setForm({
      name: "",
      countryCode: defCode,
      countryISO: defIso,
      phoneNumber: "",
      email: "",
      username: "",
      password: "",
      courseId: "",
      batchId: "",
      preferredClassTime: "9:00 AM",
      sessionType: "group",
      feesTotal: 0,
      allocatedOneToOneSessions: 0,
      allocatedGroupSessions: 0,
      paymentType: "FULL_PAYMENT",
      gender: "",
      dob: "",
      address: "",
      postalCode: "",
      qualificationId: "",
      educationalQualification: "",
      parentName: "",
      parentPhone: "",
      parentCountryCode: defCode,
      parentCountryISO: defIso,
      parentPhoneNumber: "",
      notes: "",
      enrollmentId: "",
    });
    setClassAllocation({
      oneToOne: {
        teacherId: "",
        designatedTime: "",
        sessions30: 0,
        sessions45: 0,
        sessions60: 0,
      },
      group: {
        teacherId: "",
        batchId: "",
        designatedTime: "",
        sessions30: 0,
        sessions45: 0,
        sessions60: 0,
      },
    });
    setIdGenerationType("auto");
    setPaymentType("FULL_PAYMENT");
    setInstallmentCount(2);
    setInstallments([]);
    setOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId) {
      toast.error("Course is required");
      return;
    }
    const error = validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO);
    if (error) {
      toast.error(error);
      return;
    }
    if (form.postalCode && !/^\d+$/.test(form.postalCode.trim())) {
      toast.error("Postal code must contain numbers only.");
      return;
    }
    const sumInstallments = installments.reduce((sum, inst) => sum + inst.amount, 0);
    if (paymentType === "INSTALLMENT" && sumInstallments !== form.feesTotal) {
      toast.error(`Installment sum (₹${sumInstallments}) must equal course fee (₹${form.feesTotal})`);
      return;
    }

    createStudentMutation.mutate({
      ...form,
      email: form.email ? form.email : undefined,
      sessionType: (form.sessionType as "one_on_one" | "group" | "both") || "group",
      enrollmentId: idGenerationType === "manual" ? form.enrollmentId : undefined,
      courseId: Number(form.courseId),
      batchId: form.batchId ? Number(form.batchId) : undefined,
      qualificationId: form.qualificationId ? Number(form.qualificationId) : undefined,
      postalCode: form.postalCode ? form.postalCode.trim() : undefined,
      address: form.address || undefined,
      paymentType,
      installments: paymentType === "INSTALLMENT" ? installments : undefined,
    });
  };

  const handleEditOpen = (u: any) => {
    setEditStudent({
      id: u.id,
      name: u.name,
      countryCode: u.countryCode || "+91",
      countryISO: u.countryISO || "IN",
      phoneNumber: u.phoneNumber || "",
      email: u.email || "",
      username: u.username || "",
      password: "",
      status: u.status,
      course: u.profile?.course || "",
      batch: u.profile?.batch || "",
      courseId: u.courseId || "",
      batchId: u.batchId || "",
      preferredClassTime: u.profile?.preferredClassTime || "",
      classAllocation: u.classAllocation || null,
      feesTotal: parseFloat(u.profile?.feesTotal || "0"),
      completionDate: u.profile?.completionDate ? new Date(u.profile.completionDate).toISOString().split("T")[0] : "",
      gender: u.profile?.gender || "",
      dob: u.profile?.dob ? new Date(u.profile.dob).toISOString().split("T")[0] : "",
      address: u.address || u.profile?.address || "",
      postalCode: u.postalCode || u.profile?.postalCode || "",
      qualificationId: u.qualificationId || u.profile?.qualificationId || "",
      educationalQualification: u.qualificationName || u.profile?.educationalQualification || "",
      parentName: u.profile?.parentName || "",
      parentPhone: u.profile?.parentPhone || "",
      parentCountryCode: u.profile?.parentCountryCode || "+91",
      parentCountryISO: u.profile?.parentCountryISO || "IN",
      parentPhoneNumber: u.profile?.parentPhoneNumber || "",
      notes: u.profile?.notes || "",
      enrollmentId: u.profile?.enrollmentId || "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    const error = validatePhoneNumber(editStudent.countryCode, editStudent.phoneNumber, editStudent.countryISO);
    if (error) {
      toast.error(error);
      return;
    }

    if (editStudent.postalCode && !/^\d+$/.test(editStudent.postalCode.trim())) {
      toast.error("Postal code must contain numbers only.");
      return;
    }


    const selectedB = editStudent.batchId ? batchesQuery.data?.find((b) => b.id === Number(editStudent.batchId)) : null;
    if (selectedB && selectedB.status !== "active") {
      toast.error("Selected batch is inactive or deleted.");
      return;
    }

    const qualObj = activeQualificationsQuery.data?.find(q => String(q.id) === String(editStudent.qualificationId));

    updateStudentMutation.mutate({
      ...editStudent,
      email: editStudent.email ? editStudent.email : undefined,
      courseId: editStudent.courseId ? Number(editStudent.courseId) : undefined,
      batchId: editStudent.batchId ? Number(editStudent.batchId) : undefined,
      qualificationId: editStudent.qualificationId ? Number(editStudent.qualificationId) : null,
      educationalQualification: qualObj ? qualObj.name : editStudent.educationalQualification,
      postalCode: editStudent.postalCode ? editStudent.postalCode.trim() : "",
      dob: editStudent.dob || null,
      completionDate: editStudent.completionDate || null,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setBase64Data(base64);
      setImportSummary(null); // Clear previous summary on new file select
      toast.success(`File "${file.name}" loaded successfully.`);
    };
    reader.onerror = () => {
      toast.error("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Full Name",
      "Phone Number",
      "Username (Optional)",
      "Password (Optional)",
      "Student Enrollment ID (Optional)",
      "Module",
      "Preferred Time (Optional)",
      "Type (Optional)",
      "Email (Optional)",
      "Gender (Optional)",
      "DOB",
      "Address",
      "Postal Code",
      "Education Qualification",
      "Parent Name",
      "Parent Phone Number",
      "Total Course Fee",
      "Payment Option",
      "Total Class Assigned (Optional)",
      "Classes Completed (Optional)",
      "Balance Classes (Optional)",
      "Assigned Teacher (Optional)",
      "Date of Joining (Optional)"
    ];
    const sampleRow = [
      "John Doe",
      "+919876543210",
      "johndoe123",
      "pass1234",
      "STU0001",
      "IELTS Advanced",
      "9:00 AM",
      "Group",
      "johndoe@example.com",
      "Male",
      "1995-08-15",
      "123 Main St, Mumbai",
      "400001",
      "Bachelor of Science",
      "Richard Doe",
      "+919876543211",
      "15000",
      "Full Payment",
      "30",
      "0",
      "30",
      "Teacher Username",
      "2023-01-15"
    ];
    
    const csvContent = [
      headers.join(","),
      sampleRow.map(val => `"${val.replace(/"/g, '""')}"`).join(",")
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "student_import_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (!base64Data) {
      toast.error("Please upload a CSV or Excel file first.");
      return;
    }
    importStudentsMutation.mutate({
      fileData: base64Data,
      fileName: importFile?.name || "import.csv",
    });
  };

  // Export to CSV function
  const handleExportCSV = () => {
    if (!studentsQuery.data?.items?.length) {
      toast.error("No students available to export");
      return;
    }
    const headers = ["Student ID", "Name", "Phone", "Email", "Qualification", "Address", "Postal Code", "Course", "Batch", "Status", "Joined Date"];
    const rows = studentsQuery.data.items.map((s) => [
      s.profile?.enrollmentId || s.unionId,
      s.name,
      s.phone || "",
      s.email || "",
      s.qualificationName || s.profile?.educationalQualification || "",
      s.address || s.profile?.address || "",
      s.postalCode || s.profile?.postalCode || "",
      s.profile?.course || "",
      s.profile?.batch || "",
      s.status,
      s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `students_export_${statusFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // UI status helpers
  const getStatusBadge = (status: string, completionDate?: Date | string | null) => {
    if (completionDate) {
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Alumni</Badge>;
    }
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "suspended":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Suspended</Badge>;
      case "on_hold":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">On Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!isStaff) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Access restricted to staff members.</p>
      </div>
    );
  }

  const studentsList = studentsQuery.data?.items || [];
  const totalStudents = studentsQuery.data?.total || 0;
  const totalPages = Math.ceil(totalStudents / limit);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Header Section */}
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Students Management</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mt-2">View and manage Emtees student enrollment, profiles, and analytics with real-time updates.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" onClick={handleExportCSV} className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium shadow-sm transition-all flex-1 sm:flex-none">
            <Download className="w-4 h-4 mr-2 text-slate-500" />
            Export CSV
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium shadow-sm transition-all flex-1 sm:flex-none">
                <Upload className="w-4 h-4 mr-2 text-slate-500" />
                Bulk Import
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleCreateOpen} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Student
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] md:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl">
                  <DialogHeader className="pb-2 border-b">
                    <DialogTitle>Register New Student</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 min-h-0">
                      
                      {/* Personal Details Section */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">1. Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></label>
                            <Input placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                          </div>
                          <PhoneNumberInput
                            label="Phone Number"
                            required
                            countryCode={form.countryCode}
                            countryISO={form.countryISO}
                            value={form.phoneNumber}
                            onChange={(data) => setForm({
                              ...form,
                              countryCode: data.countryCode,
                              countryISO: data.countryISO,
                              phoneNumber: data.phoneNumber
                            })}
                          />
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Email Address</label>
                            <Input placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Gender</label>
                              <select
                                className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                              >
                                <option value="">Select</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Date of Birth</label>
                              <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                            </div>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Address</label>
                            <Textarea placeholder="Full postal address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Postal Code</label>
                            <Input placeholder="e.g. 682001" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Educational Qualification</label>
                            <select
                              className="border rounded h-9 px-3 text-xs bg-white w-full"
                              value={form.qualificationId}
                              onChange={(e) => {
                                const qid = e.target.value ? Number(e.target.value) : "";
                                const qObj = activeQualificationsQuery.data?.find(q => q.id === qid);
                                setForm({ ...form, qualificationId: qid, educationalQualification: qObj ? qObj.name : "" });
                              }}
                            >
                              <option value="">Select Qualification</option>
                              {activeQualificationsQuery.data?.map((q) => (
                                <option key={q.id} value={q.id}>{q.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Parent/Guardian Name</label>
                            <Input placeholder="Parent Name" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
                          </div>
                          <PhoneNumberInput
                            label="Parent Phone Number"
                            countryCode={form.parentCountryCode}
                            countryISO={form.parentCountryISO}
                            value={form.parentPhoneNumber}
                            placeholder="Parent Phone"
                            onChange={(data) => setForm({
                              ...form,
                              parentCountryCode: data.countryCode,
                              parentCountryISO: data.countryISO,
                              parentPhoneNumber: data.phoneNumber,
                              parentPhone: data.fullNumber
                            })}
                          />
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Username <span className="text-red-500">*</span></label>
                            <Input placeholder="Username for LMS login" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Password <span className="text-red-500">*</span></label>
                            <Input type="password" placeholder="LMS Login Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                          </div>
                        </div>
                      </div>

                      {/* Course & Batch Selection */}
                      <div className="space-y-3 pt-3 border-t">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">2. Enrollment Info</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Student Enrollment ID</label>
                            <div className="flex gap-4 items-center mb-2">
                              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="idGenType"
                                  value="auto"
                                  checked={idGenerationType === "auto"}
                                  onChange={() => setIdGenerationType("auto")}
                                />
                                Auto-Generate
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="idGenType"
                                  value="manual"
                                  checked={idGenerationType === "manual"}
                                  onChange={() => setIdGenerationType("manual")}
                                />
                                Manual Entry
                              </label>
                            </div>
                            {idGenerationType === "manual" && (
                              <Input
                                placeholder="e.g. STU1050"
                                value={form.enrollmentId}
                                onChange={(e) => setForm({ ...form, enrollmentId: e.target.value.toUpperCase() })}
                                required
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Select Module <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={form.courseId}
                              onChange={(e) => handleCourseChange(e.target.value)}
                            >
                              <option value="">Select Module</option>
                              {activeCourses.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Preferred Time Slot <span className="text-red-500">*</span></label>
                            <Input
                              placeholder="e.g. 7 AM or Morning"
                              value={form.preferredClassTime || ""}
                              onChange={(e) => setForm({ ...form, preferredClassTime: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Session Type <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={form.sessionType || "group"}
                              onChange={(e) => setForm({ ...form, sessionType: e.target.value as any })}
                            >
                              <option value="group">Group Session</option>
                              <option value="one_on_one">One-on-One Session</option>
                              <option value="both">Both (Group + 1-on-1)</option>
                            </select>
                          </div>
                          <div className="col-span-1 md:col-span-2 p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs space-y-1">
                            <p className="font-semibold text-amber-800 dark:text-amber-400">Batch Assignment Workflow</p>
                            <p className="text-amber-700 dark:text-amber-300 text-[11px]">
                              Students will enter a <strong>"Waiting for Batch"</strong> status upon enrollment. They will be dynamically assigned to a batch when an Academic Head or Admin forms a cohort matching their Module, Preferred Time Slot, and Session Type.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Payment Installment setup */}
                      <div className="space-y-3 pt-3 border-t">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">3. Fee & Payment Setup</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Total Course Fee (₹)</label>
                            <Input type="number" value={form.feesTotal} onChange={(e) => handleFeesTotalChange(Number(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Payment Type</label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={paymentType}
                              onChange={(e) => setPaymentType(e.target.value as any)}
                            >
                              <option value="FULL_PAYMENT">Full Payment upfront</option>
                              <option value="INSTALLMENT">Pay in Installments</option>
                            </select>
                          </div>

                          {paymentType === "INSTALLMENT" && (
                            <div className="md:col-span-2 space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-700">Installments Setup</span>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500">Count:</label>
                                  <select
                                    className="border rounded px-2 py-0.5 text-xs bg-white outline-none"
                                    value={installmentCount}
                                    onChange={(e) => handleInstallmentCountChange(Number(e.target.value))}
                                  >
                                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {installments.map((inst, index) => (
                                  <div key={index} className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2 border rounded-lg">
                                    <span className="text-xs font-bold text-gray-500 w-28 shrink-0">Installment #{inst.installmentNumber}</span>
                                    <div className="flex items-center gap-1 w-full">
                                      <span className="text-gray-400 text-xs">₹</span>
                                      <Input
                                        type="number"
                                        className="h-8 text-xs font-mono"
                                        value={inst.amount}
                                        onChange={(e) => handleInstallmentAmountChange(index, Number(e.target.value))}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 w-full">
                                      <span className="text-gray-400 text-xs shrink-0">Due Date:</span>
                                      <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={inst.dueDate}
                                        onChange={(e) => handleInstallmentDateChange(index, e.target.value)}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t mt-4">
                      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={createStudentMutation.isPending || !form.name || !form.countryCode || !form.phoneNumber || !!validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO) || !form.username || !form.password}>
                        {createStudentMutation.isPending ? "Creating student..." : "Create Student Account"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Tabs and Filters Section */}
      <div className="flex flex-col gap-5">
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-2 min-w-max p-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl w-fit border border-slate-200/50 shadow-inner">
            {(["all", "active", "inactive", "pending_enrollment", "alumni"] as const).map((status) => (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`py-2 px-5 text-sm font-semibold rounded-xl transition-all capitalize duration-200 ${
                  statusFilter === status
                    ? "bg-white dark:bg-slate-800 text-emerald-700 shadow border border-slate-200/60"
                    : "bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toolbar */}
        <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  className="pl-10 h-10 w-full rounded-xl border-slate-200 bg-white shadow-inner-sm text-sm focus-visible:ring-emerald-500/20" 
                  placeholder="Search ID, Name, Phone, Address..." 
                  value={search} 
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
                  autoComplete="off" 
                  name="student-search" 
                />
              </div>
              <select
                className="h-10 border border-slate-200 rounded-xl px-4 text-sm bg-white shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:w-[160px] font-medium text-slate-700 cursor-pointer transition-all hover:bg-slate-50"
                value={courseFilter}
                onChange={(e) => { setCourseFilter(e.target.value); setBatchFilter("all"); setPage(1); }}
              >
                <option value="all">All Modules</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className="h-10 border border-slate-200 rounded-xl px-4 text-sm bg-white shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:w-[160px] font-medium text-slate-700 cursor-pointer transition-all hover:bg-slate-50 disabled:opacity-50 disabled:bg-slate-100"
                value={batchFilter}
                onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
                disabled={courseFilter === "all"}
              >
                <option value="all">All Batches</option>
                {filterBatches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select
                className="h-10 border border-slate-200 rounded-xl px-4 text-sm bg-white shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:w-[180px] font-medium text-slate-700 cursor-pointer transition-all hover:bg-slate-50"
                value={qualificationFilter}
                onChange={(e) => { setQualificationFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All Qualifications</option>
                {activeQualificationsQuery.data?.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
              <Input
                className="h-10 w-full sm:w-32 rounded-xl border-slate-200 bg-white shadow-inner-sm text-sm focus-visible:ring-emerald-500/20"
                placeholder="Postal Code"
                value={postalCodeFilter}
                onChange={(e) => { setPostalCodeFilter(e.target.value); setPage(1); }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student List Table */}
      <Card className="border border-slate-200/60 shadow-lg rounded-2xl overflow-hidden bg-white">
        <CardContent className="p-0 overflow-x-auto">
          {/* Desktop Table View */}
          <Table className="hidden md:table">
            <TableHeader className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-100">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Student ID</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Name</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Phone</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Assigned Teacher</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Designated Time</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4 whitespace-nowrap text-center">Total</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4 whitespace-nowrap text-center">Taken</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Module</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Session</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Batch</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Status</TableHead>
                <TableHead className="font-bold text-slate-700 tracking-wide text-[13px] py-4">Joined</TableHead>
                <TableHead className="text-right font-bold text-slate-700 tracking-wide text-[13px] py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsList.map((s) => {
                const isO2O = s.profile?.oneOnOneEnabled;
                const isGrp = s.profile?.groupSessionEnabled;
                const sessionLabel = isO2O && isGrp ? "Both" : isO2O ? "One-on-One" : isGrp ? "Group" : "None";
                const sessionBadgeClass = isO2O && isGrp ? "bg-purple-100/50 text-purple-700 border-purple-200/50" : isO2O ? "bg-blue-100/50 text-blue-700 border-blue-200/50" : isGrp ? "bg-emerald-100/50 text-emerald-700 border-emerald-200/50" : "bg-slate-100 text-slate-600 border-slate-200/50";
                const alloc = s.classAllocation as any;
                const totalClasses = alloc 
                  ? ((alloc.oneToOne?.sessions30 || 0) + (alloc.oneToOne?.sessions45 || 0) + (alloc.oneToOne?.sessions60 || 0) +
                     (alloc.group?.sessions30 || 0) + (alloc.group?.sessions45 || 0) + (alloc.group?.sessions60 || 0))
                  : ((s.profile?.allocatedOneToOneSessions || 0) + (s.profile?.allocatedGroupSessions || 0));

                const classesTaken = alloc
                  ? ((alloc.oneToOne?.completed30 || 0) + (alloc.oneToOne?.completed45 || 0) + (alloc.oneToOne?.completed60 || 0) +
                     (alloc.group?.completed30 || 0) + (alloc.group?.completed45 || 0) + (alloc.group?.completed60 || 0))
                  : ((s.profile?.attendedOneToOneSessions || 0) + (s.profile?.attendedGroupSessions || 0));

                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-slate-50/70 transition-colors group"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("a")) return;
                      setDetailsStudentId(s.id);
                    }}
                  >
                    <TableCell className="font-mono text-xs font-bold text-emerald-700 py-4">
                      <span className="bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">{s.profile?.enrollmentId || s.unionId}</span>
                    </TableCell>
                    <TableCell className="font-medium py-4">
                      <button
                        className="text-left font-semibold text-slate-800 hover:text-emerald-600 transition-colors group-hover:text-emerald-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfigStudentId(s.id);
                          const alloc = s.classAllocation || {
                            oneToOne: { teacherId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 },
                            group: { teacherId: "", batchId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 }
                          };
                          setTempAllocation({
                            oneToOne: {
                              teacherId: (alloc as any).oneToOne?.teacherId ?? "",
                              designatedTime: (alloc as any).oneToOne?.designatedTime ?? "",
                              sessions30: (alloc as any).oneToOne?.sessions30 ?? 0,
                              sessions45: (alloc as any).oneToOne?.sessions45 ?? 0,
                              sessions60: (alloc as any).oneToOne?.sessions60 ?? 0,
                              completed30: (alloc as any).oneToOne?.completed30 ?? 0,
                              completed45: (alloc as any).oneToOne?.completed45 ?? 0,
                              completed60: (alloc as any).oneToOne?.completed60 ?? 0,
                            },
                            group: {
                              teacherId: (alloc as any).group?.teacherId ?? "",
                              batchId: ((alloc as any).group?.batchId as any) ?? "",
                              designatedTime: (alloc as any).group?.designatedTime ?? "",
                              sessions30: (alloc as any).group?.sessions30 ?? 0,
                              sessions45: (alloc as any).group?.sessions45 ?? 0,
                              sessions60: (alloc as any).group?.sessions60 ?? 0,
                              completed30: (alloc as any).group?.completed30 ?? 0,
                              completed45: (alloc as any).group?.completed45 ?? 0,
                              completed60: (alloc as any).group?.completed60 ?? 0,
                            }
                          });
                          setIsConfiguringAllocation(true);
                        }}
                      >
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell className="py-4 text-slate-600 text-sm whitespace-nowrap">{s.phone}</TableCell>
                    <TableCell className="text-xs py-4 space-y-1 whitespace-nowrap">
                      {isO2O && (s.classAllocation as any)?.oneToOne?.teacherId && (
                        <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 px-1 py-0 shadow-sm font-bold">1v1</Badge> <span className="text-slate-700 font-medium">{getTeacherName((s.classAllocation as any).oneToOne.teacherId)}</span></div>
                      )}
                      {isGrp && (s.classAllocation as any)?.group?.teacherId && (
                        <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 px-1 py-0 shadow-sm font-bold">Grp</Badge> <span className="text-slate-700 font-medium">{getTeacherName((s.classAllocation as any).group.teacherId)}</span></div>
                      )}
                      {(!isO2O || !(s.classAllocation as any)?.oneToOne?.teacherId) && (!isGrp || !(s.classAllocation as any)?.group?.teacherId) && <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="text-xs py-4 space-y-1 whitespace-nowrap">
                      {isO2O && (s.classAllocation as any)?.oneToOne?.designatedTime && (
                        <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 px-1 py-0 shadow-sm font-bold">1v1</Badge> <span className="text-slate-700 font-medium font-mono">{formatTimeStr((s.classAllocation as any).oneToOne.designatedTime)}</span></div>
                      )}
                      {isGrp && (s.classAllocation as any)?.group?.designatedTime && (
                        <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 px-1 py-0 shadow-sm font-bold">Grp</Badge> <span className="text-slate-700 font-medium font-mono">{formatTimeStr((s.classAllocation as any).group.designatedTime)}</span></div>
                      )}
                      {(!isO2O || !(s.classAllocation as any)?.oneToOne?.designatedTime) && (!isGrp || !(s.classAllocation as any)?.group?.designatedTime) && <span className="text-slate-400">-</span>}
                    </TableCell>
                    <TableCell className="text-center py-4">
                      <div className="inline-flex items-center justify-center bg-slate-100 rounded-full min-w-8 h-8 px-2 font-bold text-slate-700 text-sm shadow-inner">{totalClasses}</div>
                    </TableCell>
                    <TableCell className="text-center py-4">
                      <div className="inline-flex items-center justify-center bg-emerald-50 border border-emerald-100 rounded-full min-w-8 h-8 px-2 font-bold text-emerald-700 text-sm shadow-sm">{classesTaken}</div>
                    </TableCell>
                    <TableCell className="py-4 text-slate-700 font-medium text-sm">{s.profile?.course || "-"}</TableCell>
                    <TableCell className="py-4" onClick={(e) => {
                        if (isAdmin) e.stopPropagation();
                      }}>
                      {isAdmin ? (
                        <select
                          className="h-8 text-[11px] font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 w-24 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                          value={isO2O && isGrp ? "both" : isO2O ? "one_on_one" : "group"}
                          onChange={(e) => {
                            updateSessionTypeMutation.mutate({
                              id: s.id,
                              sessionType: e.target.value as any
                            });
                          }}
                          disabled={updateSessionTypeMutation.isPending}
                        >
                          <option value="group">Group</option>
                          <option value="one_on_one">One-on-One</option>
                          <option value="both">Both</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${sessionBadgeClass} shadow-sm`}>
                          {sessionLabel}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 font-medium text-slate-700 text-sm">
                      {s.profile?.batch ? (
                        s.profile.batch
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800 shadow-sm">
                          Waiting for Batch
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-4">{getStatusBadge(s.status, s.profile?.completionDate)}</TableCell>
                    <TableCell className="py-4 text-slate-500 text-sm font-medium">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right py-4 whitespace-nowrap">
                      <div className="flex justify-end gap-1.5 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg" onClick={() => setDetailsStudentId(s.id)}><Eye className="w-4 h-4" /></Button>
                        {isAdmin && (
                          <>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg" onClick={(e) => { e.stopPropagation(); setCredentialsStudent(s); }} title="Login Credentials"><Key className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 rounded-lg" onClick={(e) => { e.stopPropagation(); handleEditOpen(s); }}><Edit className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg" onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}><Trash2 className="w-4 h-4" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {studentsList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-gray-500 py-16 bg-slate-50/30">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shadow-inner">
                        <Search className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">{studentsQuery.isLoading ? "Loading student records..." : "No student records found matching your filters"}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-4 p-4 bg-slate-50/50">
            {studentsList.map((s) => {
              const isO2O = s.profile?.oneOnOneEnabled;
              const isGrp = s.profile?.groupSessionEnabled;
              const sessionLabel = isO2O && isGrp ? "Both" : isO2O ? "One-on-One" : isGrp ? "Group" : "None";
              const sessionBadgeClass = isO2O && isGrp ? "bg-purple-100/50 text-purple-700 border-purple-200/50" : isO2O ? "bg-blue-100/50 text-blue-700 border-blue-200/50" : isGrp ? "bg-emerald-100/50 text-emerald-700 border-emerald-200/50" : "bg-slate-100 text-slate-600 border-slate-200/50";
              const alloc = s.classAllocation as any;
              const totalClasses = alloc 
                ? ((alloc.oneToOne?.sessions30 || 0) + (alloc.oneToOne?.sessions45 || 0) + (alloc.oneToOne?.sessions60 || 0) +
                   (alloc.group?.sessions30 || 0) + (alloc.group?.sessions45 || 0) + (alloc.group?.sessions60 || 0))
                : ((s.profile?.allocatedOneToOneSessions || 0) + (s.profile?.allocatedGroupSessions || 0));

              const classesTaken = alloc
                ? ((alloc.oneToOne?.completed30 || 0) + (alloc.oneToOne?.completed45 || 0) + (alloc.oneToOne?.completed60 || 0) +
                   (alloc.group?.completed30 || 0) + (alloc.group?.completed45 || 0) + (alloc.group?.completed60 || 0))
                : ((s.profile?.attendedOneToOneSessions || 0) + (s.profile?.attendedGroupSessions || 0));

              return (
                <Card key={s.id} className="border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden p-5 space-y-4 bg-white active:scale-[0.98] transition-transform" onClick={() => setDetailsStudentId(s.id)}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">{s.profile?.enrollmentId || s.unionId}</span>
                    <div>{getStatusBadge(s.status, s.profile?.completionDate)}</div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{s.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 font-medium">{s.phone}</p>
                  </div>
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Module:</span> <span className="font-semibold text-slate-800">{s.profile?.course || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Batch:</span> <span className="font-semibold text-slate-800">{s.profile?.batch || <span className="text-amber-600 text-xs bg-amber-50 px-2 rounded-sm border border-amber-100">Waiting for Batch</span>}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Designated Time:</span> <span className="font-mono font-semibold text-slate-800 text-xs">{
                      isO2O && (s.classAllocation as any)?.oneToOne?.designatedTime ? formatTimeStr((s.classAllocation as any).oneToOne.designatedTime) :
                      isGrp && (s.classAllocation as any)?.group?.designatedTime ? formatTimeStr((s.classAllocation as any).group.designatedTime) : "-"
                    }</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total Classes:</span> <span className="font-bold text-slate-800 bg-slate-100 px-2 rounded-full">{totalClasses}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Classes Taken:</span> <span className="font-bold text-emerald-700 bg-emerald-50 px-2 rounded-full border border-emerald-100">{classesTaken}</span></div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${sessionBadgeClass} shadow-sm`}>
                      {sessionLabel}
                    </span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-emerald-50 hover:text-emerald-600" onClick={() => setDetailsStudentId(s.id)}><Eye className="w-4 h-4" /></Button>
                      {isAdmin && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => setCredentialsStudent(s)}><Key className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-blue-50 hover:text-blue-600" onClick={() => handleEditOpen(s)}><Edit className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(s.id)}><Trash2 className="w-4 h-4" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
            {studentsList.length === 0 && (
              <div className="text-center text-slate-500 py-12 flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shadow-inner">
                  <Search className="w-6 h-6 text-slate-400" />
                </div>
                <p className="font-medium">{studentsQuery.isLoading ? "Loading student records..." : "No student records found matching your filters"}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm mt-4">
          <span className="text-sm font-medium text-slate-500">Showing page <span className="text-slate-900 font-bold">{page}</span> of <span className="text-slate-900 font-bold">{totalPages}</span> <span className="text-slate-400">({totalStudents} total students)</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-xl border-slate-200 hover:bg-slate-50 font-medium transition-colors" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button size="sm" variant="outline" className="rounded-xl border-slate-200 hover:bg-slate-50 font-medium transition-colors" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <Dialog open={importOpen} onOpenChange={(val) => {
        setImportOpen(val);
        if (!val) {
          setImportFile(null);
          setBase64Data("");
          setImportSummary(null);
        }
      }}>
        <DialogContent className="w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Bulk Student Import</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-700">Need the template?</h4>
                <p className="text-xs text-slate-500">Download the required format with predefined mandatory and optional columns.</p>
              </div>
              <Button size="sm" variant="outline" className="flex items-center gap-2 border-slate-300 hover:bg-slate-100" onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 text-slate-600" />
                Download Template
              </Button>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-700 block">Upload spreadsheet file (.xlsx, .csv)</label>
              <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 transition-colors duration-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50/50 cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                {importFile ? (
                  <div className="text-center">
                    <span className="text-sm font-medium text-slate-700 block max-w-xs truncate">{importFile.name}</span>
                    <span className="text-xs text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <span className="text-sm font-medium text-slate-600">Drag & drop your file here or click to browse</span>
                    <span className="text-xs text-slate-400 block mt-1">Supports Microsoft Excel (.xlsx) and CSV (.csv) formats</span>
                  </div>
                )}
              </div>
            </div>

            {/* Field guidelines */}
            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-1.5">Important Guidelines</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-blue-800">
                <li><span className="font-medium text-blue-950">Mandatory Columns:</span> <span className="font-semibold text-red-600">Full Name</span>, <span className="font-semibold text-red-600">Phone Number</span>, and <span className="font-semibold text-red-600">Module</span> must be filled for every student.</li>
                <li><span className="font-medium text-blue-950">Username / Password:</span> Can be left blank. Usernames will automatically generate from the phone number. Passwords default to student123.</li>
                <li><span className="font-medium text-blue-950">Class Allocations:</span> You can specify <span className="italic">Total Class Assigned</span> and <span className="italic">Classes Completed</span> directly. <span className="italic">Balance Classes</span> is calculated automatically if left blank.</li>
                <li><span className="font-medium text-blue-950">Assigned Teacher:</span> Enter the exact name or username of the teacher. It is safer to use the username.</li>
                <li>Do not rename or rearrange the column headers from the downloaded template.</li>
              </ul>
            </div>

            {/* Detailed Import Summary if exists */}
            {importSummary && (() => {
              const skippedRows = importSummary.errors.filter(err => err.errors.some(msg => msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already")));
              const failedRows = importSummary.errors.filter(err => !err.errors.some(msg => msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already")));
              
              return (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-700">Import Summary Results</h4>
                  <div className="flex gap-2">
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">{importSummary.successfulImports} Success</span>
                    {skippedRows.length > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">{skippedRows.length} Skipped (Exists)</span>
                    )}
                    {failedRows.length > 0 && (
                      <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">{failedRows.length} Failures</span>
                    )}
                  </div>
                </div>
                
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {importSummary.errors.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">
                      All records imported successfully with no warnings.
                    </div>
                  ) : (
                    importSummary.errors.map((err, idx) => {
                      const isSkipped = err.errors.some(msg => msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already"));
                      return (
                      <div key={idx} className="px-4 py-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700">Row {err.row} {err.name ? `(${err.name})` : ""}</span>
                          {isSkipped ? (
                            <span className="text-amber-600 font-semibold">Skipped</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Failed</span>
                          )}
                        </div>
                        <ul className={`list-disc list-inside ${isSkipped ? 'text-amber-600' : 'text-rose-600'} space-y-0.5 font-medium pl-1`}>
                          {err.errors.map((msg, mIdx) => (
                            <li key={mIdx}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
              );
            })()}

            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importStudentsMutation.isPending}>
                Close
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                onClick={handleImport}
                disabled={importStudentsMutation.isPending || !base64Data}
              >
                {importStudentsMutation.isPending ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-t-transparent border-white rounded-full"></span>
                    Importing Records...
                  </>
                ) : (
                  "Start Import"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Student Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will permanently delete the student account, profile, all payments, and batch enrollments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteStudentMutation.mutate({ id: deleteId })}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fee Rules Confirmation Dialog */}
      <AlertDialog open={isConfirmingFeeRules} onOpenChange={setIsConfirmingFeeRules}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-800 font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm Fee Rules Change
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-xs text-slate-600 mt-2 text-left">
                <p>You are about to modify the fee rules for this student. This will recalculate their outstanding balance and recreate their future unpaid installments. <strong>Completed payments will remain untouched.</strong></p>

                {feeRulesState && profileQuery.data && (
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mt-3 text-xs text-left">
                    <div className="space-y-2">
                      <h5 className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Previous Configuration</h5>
                      <p><strong>Type:</strong> {profileQuery.data.student.profile?.paymentOption === "installment" ? "Installment" : "Full Payment"}</p>
                      <p><strong>Total Fee:</strong> ₹{parseFloat(profileQuery.data.student.profile?.totalCourseFee || profileQuery.data.student.profile?.feesTotal || "0").toLocaleString("en-IN")}</p>
                      <p><strong>Outstanding:</strong> ₹{parseFloat(profileQuery.data.student.profile?.feesBalance || "0").toLocaleString("en-IN")}</p>
                      <p><strong>Installments:</strong> {profileQuery.data.payments.filter((p: any) => p.type === "tuition").length}</p>
                    </div>

                    <div className="space-y-2 border-l pl-4">
                      <h5 className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">New Configuration</h5>
                      <p><strong>Type:</strong> {feeRulesState.paymentType === "INSTALLMENT" ? "Installment" : "Full Payment"}</p>
                      <p><strong>Total Fee:</strong> ₹{feeRulesState.totalCourseFee.toLocaleString("en-IN")}</p>
                      <p><strong>Outstanding:</strong> ₹{(feeRulesState.totalCourseFee - profileQuery.data.payments.filter((p: any) => p.type === "tuition" && p.status === "paid").reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0)).toLocaleString("en-IN")}</p>
                      <p><strong>Installments:</strong> {feeRulesState.installments.length}</p>
                    </div>
                  </div>
                )}

                {feeRulesState && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 space-y-1 text-left">
                    <p className="font-semibold">Effect Summary:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Unpaid future installments recreated: <strong>{feeRulesState.installments.filter(i => i.status === "unpaid").length}</strong></li>
                      <li>Preserved completed payments: <strong>{feeRulesState.installments.filter(i => i.status === "paid").length}</strong></li>
                      <li>Updated Outstanding Balance: <strong>₹{(feeRulesState.totalCourseFee - (profileQuery.data?.payments || []).filter((p: any) => p.type === "tuition" && p.status === "paid").reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0)).toLocaleString("en-IN")}</strong></li>
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              disabled={updateFeeRulesMutation.isPending}
              onClick={() => {
                if (!feeRulesState || !profileQuery.data?.student?.id) return;
                updateFeeRulesMutation.mutate({
                  studentId: profileQuery.data.student.id,
                  paymentType: feeRulesState.paymentType,
                  totalCourseFee: feeRulesState.totalCourseFee,
                  initialPayment: feeRulesState.initialPayment,
                  installments: feeRulesState.installments.map(inst => ({
                    installmentNumber: inst.installmentNumber,
                    amount: inst.amount,
                    dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
                    status: inst.status,
                  })),
                });
              }}
            >
              {updateFeeRulesMutation.isPending ? "Applying..." : "Confirm & Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credentials Modal */}
      <Dialog open={!!credentialsStudent} onOpenChange={() => { setCredentialsStudent(null); setNewPassword(""); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Login Credentials - {credentialsStudent?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-4 rounded-md space-y-3">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm font-semibold text-slate-500">Username:</span>
                <span className="col-span-2 font-mono font-semibold text-slate-900 bg-white px-2 py-1 border rounded">{credentialsStudent?.username}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm font-semibold text-slate-500">Password:</span>
                {credentialsStudent?.rawPassword ? (
                  <span className="col-span-2 font-mono font-semibold text-slate-900 bg-white px-2 py-1 border rounded">{credentialsStudent.rawPassword}</span>
                ) : (
                  <span className="col-span-2 text-xs italic text-slate-400">Encrypted / Hidden for security</span>
                )}
              </div>
            </div>
            
            {isAdmin && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Reset Password</p>
                <Input 
                  type="password" 
                  placeholder="Enter new password (min 6 chars)" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button 
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white" 
                  disabled={newPassword.length < 6 || updateStudentMutation.isPending}
                  onClick={() => {
                    updateStudentMutation.mutate({ 
                      id: credentialsStudent.id, 
                      password: newPassword 
                    }, {
                      onSuccess: () => {
                        setCredentialsStudent(null);
                        setNewPassword("");
                      }
                    });
                  }}
                >
                  {updateStudentMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] md:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl">
          <DialogHeader className="pb-2 border-b"><DialogTitle>Edit Student Account</DialogTitle></DialogHeader>
          {editStudent && (() => {
            const editCourse = activeCourses.find((c) => c.id === Number(editStudent.courseId));
            const editCourseBatches = editCourse?.batches?.filter((b: any) => b.status === "active") || [];
            const selectedEditBatch = batchesQuery.data?.find((b) => b.id === Number(editStudent.batchId));
            const editAvailableSeats = selectedEditBatch
              ? Math.max(0, (selectedEditBatch.maxStudents || 30) - (selectedEditBatch.enrollments?.length || 0))
              : 0;

            let editClassType = "-";
            let editSessionDuration = "-";

            if (selectedEditBatch) {
              editClassType = "Group Session";
              const allocation = editStudent.classAllocation;
              if (allocation) {
                if ((allocation.group?.sessions30 || 0) > 0) {
                  editSessionDuration = "30 min";
                } else if ((allocation.group?.sessions60 || 0) > 0) {
                  editSessionDuration = "60 min";
                } else {
                  editSessionDuration = "45 min";
                }
              } else {
                editSessionDuration = "45 min";
              }
            }

            return (
              <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4 min-h-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Full Name</label>
                      <Input value={editStudent.name} onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })} />
                    </div>
                    <PhoneNumberInput
                      label="Phone Number"
                      countryCode={editStudent.countryCode}
                      countryISO={editStudent.countryISO}
                      value={editStudent.phoneNumber}
                      onChange={(data) => setEditStudent({
                        ...editStudent,
                        countryCode: data.countryCode,
                        countryISO: data.countryISO,
                        phoneNumber: data.phoneNumber
                      })}
                    />
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Email Address</label>
                      <Input value={editStudent.email} onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Username *</label>
                      <Input value={editStudent.username} onChange={(e) => setEditStudent({ ...editStudent, username: e.target.value })} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">New Password <span className="font-normal text-gray-400">(Leave empty to keep unchanged)</span></label>
                      <Input type="password" value={editStudent.password} onChange={(e) => setEditStudent({ ...editStudent, password: e.target.value })} placeholder="Min 6 characters" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Status</label>
                      <select
                        className="border rounded h-9 px-3 text-sm bg-white w-full"
                        value={editStudent.status}
                        onChange={(e) => setEditStudent({ ...editStudent, status: e.target.value as any })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                        <option value="on_hold">On Hold</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Enrollment ID</label>
                      <Input
                        value={editStudent.enrollmentId || ""}
                        onChange={(e) => setEditStudent({ ...editStudent, enrollmentId: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Course / Module</label>
                      <select
                        className="border rounded h-9 px-3 text-sm bg-white w-full dark:bg-gray-800 dark:border-gray-700"
                        value={editStudent.courseId}
                        onChange={(e) => setEditStudent({ ...editStudent, courseId: e.target.value ? Number(e.target.value) : "", batchId: "" })}
                      >
                        <option value="">Select Existing Course</option>
                        {activeCourses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Batch</label>
                      <select
                        className="border rounded h-9 px-3 text-sm bg-white w-full dark:bg-gray-800 dark:border-gray-700"
                        value={editStudent.batchId}
                        onChange={(e) => setEditStudent({ ...editStudent, batchId: e.target.value ? Number(e.target.value) : "" })}
                      >
                        <option value="">Select Existing Batch</option>
                        {editCourseBatches.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Teacher (Read Only)</label>
                      <Input value={selectedEditBatch?.teacher?.name || "Not assigned"} disabled className="bg-gray-50 dark:bg-gray-900 cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Class Type (Read Only)</label>
                      <Input value={selectedEditBatch ? editClassType : ""} disabled className="bg-gray-50 dark:bg-gray-900 cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Session Duration (Read Only)</label>
                      <Input value={selectedEditBatch ? editSessionDuration : ""} disabled className="bg-gray-50 dark:bg-gray-900 cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Available Seats</label>
                      <Input value={selectedEditBatch ? `${editAvailableSeats} / ${selectedEditBatch.maxStudents || 30}` : ""} disabled className="bg-gray-50 dark:bg-gray-900 cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Batch Status</label>
                      <Input value={selectedEditBatch?.status || ""} disabled className="bg-gray-50 dark:bg-gray-900 cursor-not-allowed capitalize" />
                    </div>
                    {!selectedEditBatch && (
                      <div className="space-y-1 col-span-1 sm:col-span-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 w-full"
                          onClick={() => {
                            const alloc = (editStudent.classAllocation as any) || {};
                            setTempAllocation({
                              oneToOne: alloc.oneToOne || { teacherId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 },
                              group: alloc.group || { teacherId: "", batchId: "", designatedTime: "", sessions30: 0, sessions45: 0, sessions60: 0 }
                            });
                            setConfigStudentId(editStudent.id);
                            setIsConfiguringAllocation(true);
                          }}
                        >
                          Change Teacher & Session Allocation
                        </Button>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Preferred Class Time</label>
                      <Input value={editStudent.preferredClassTime} onChange={(e) => setEditStudent({ ...editStudent, preferredClassTime: e.target.value })} placeholder="e.g. 7 AM or Morning" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Total Course Fee (₹)</label>
                      <Input type="number" value={editStudent.feesTotal} onChange={(e) => setEditStudent({ ...editStudent, feesTotal: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Course Completion Date</label>
                      <Input type="date" value={editStudent.completionDate} onChange={(e) => setEditStudent({ ...editStudent, completionDate: e.target.value })} />
                    </div>
                  </div>

                  <div className="pt-2 border-t mt-2">
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Personal & Parent Info</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">Gender</label>
                          <select
                            className="border rounded h-9 px-3 text-sm bg-white w-full"
                            value={editStudent.gender}
                            onChange={(e) => setEditStudent({ ...editStudent, gender: e.target.value })}
                          >
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">DOB</label>
                          <Input type="date" value={editStudent.dob} onChange={(e) => setEditStudent({ ...editStudent, dob: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-xs text-gray-500">Address</label>
                        <Textarea placeholder="Full postal address" value={editStudent.address} onChange={(e) => setEditStudent({ ...editStudent, address: e.target.value })} rows={2} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Postal Code</label>
                        <Input value={editStudent.postalCode} onChange={(e) => setEditStudent({ ...editStudent, postalCode: e.target.value })} placeholder="e.g. 682001" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Educational Qualification</label>
                        <select
                          className="border rounded h-9 px-3 text-sm bg-white w-full"
                          value={editStudent.qualificationId}
                          onChange={(e) => {
                            const qid = e.target.value ? Number(e.target.value) : "";
                            const qObj = activeQualificationsQuery.data?.find(q => q.id === qid);
                            setEditStudent({ ...editStudent, qualificationId: qid, educationalQualification: qObj ? qObj.name : "" });
                          }}
                        >
                          <option value="">Select Qualification</option>
                          {activeQualificationsQuery.data?.map((q) => (
                            <option key={q.id} value={q.id}>{q.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Parent/Guardian Name</label>
                        <Input value={editStudent.parentName} onChange={(e) => setEditStudent({ ...editStudent, parentName: e.target.value })} />
                      </div>
                      <PhoneNumberInput
                        label="Parent Phone Number"
                        countryCode={editStudent.parentCountryCode}
                        countryISO={editStudent.parentCountryISO}
                        value={editStudent.parentPhoneNumber}
                        placeholder="Parent Phone"
                        onChange={(data) => setEditStudent({
                          ...editStudent,
                          parentCountryCode: data.countryCode,
                          parentCountryISO: data.countryISO,
                          parentPhoneNumber: data.phoneNumber,
                          parentPhone: data.fullNumber
                        })}
                      />
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-xs text-gray-500">Admin Notes</label>
                        <Textarea value={editStudent.notes} onChange={(e) => setEditStudent({ ...editStudent, notes: e.target.value })} rows={2} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t mt-4">
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={updateStudentMutation.isPending}>
                    {updateStudentMutation.isPending ? "Saving changes..." : "Save Student Changes"}
                  </Button>
                </div>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Student Profile Details Dialog */}
      <Dialog open={!!detailsStudentId} onOpenChange={(open) => !open && setDetailsStudentId(null)}>
        <DialogContent className="w-[95vw] md:max-w-5xl max-h-[90vh] flex flex-col overflow-hidden p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex justify-between items-start w-full">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-800">
                  <User className="w-5 h-5 text-emerald-600" />
                  {profileQuery.data?.student ? profileQuery.data.student.name : "Student Profile"}
                </DialogTitle>
                {profileQuery.data?.student && (
                  <p className="text-xs text-gray-400 font-mono font-bold mt-1">
                    Student ID: {profileQuery.data.student.profile?.enrollmentId || profileQuery.data.student.unionId}
                  </p>
                )}
              </div>
              {profileQuery.data?.student && getStatusBadge(profileQuery.data.student.status, profileQuery.data.student.profile?.completionDate)}
            </div>
          </DialogHeader>

          {profileQuery.isLoading ? (
            <div className="py-20 text-center text-gray-500">Loading student profile...</div>
          ) : profileQuery.data ? (
            <Tabs defaultValue="personal" className="flex-1 flex flex-col min-h-0 mt-4">
              <TabsList className="flex w-full items-center justify-start gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth select-none">
                <TabsTrigger value="personal" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Personal</TabsTrigger>
                <TabsTrigger value="course" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Course & Batches</TabsTrigger>
                <TabsTrigger value="attendance" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Attendance</TabsTrigger>
                <TabsTrigger value="fees" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Fees & Payments</TabsTrigger>
                <TabsTrigger value="documents" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Documents</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                {/* 1. Personal Details Tab */}
                <TabsContent value="personal" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Personal Information</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>Email:</strong> {profileQuery.data.student.email || "-"}</p>
                        <p><strong>Phone:</strong> {profileQuery.data.student.phone || "-"}</p>
                        <p><strong>Qualification:</strong> {(profileQuery.data.student as any).qualification?.name || (profileQuery.data.student.profile as any)?.qualification?.name || profileQuery.data.student.profile?.educationalQualification || profileQuery.data.student.educationalQualification || "-"}</p>
                        <p><strong>Postal Code:</strong> <span className="font-mono text-xs">{profileQuery.data.student.postalCode || profileQuery.data.student.profile?.postalCode || "-"}</span></p>
                        <p><strong>Address:</strong> {profileQuery.data.student.address || profileQuery.data.student.profile?.address || "-"}</p>
                        <p><strong>Gender:</strong> <span className="capitalize">{profileQuery.data.student.profile?.gender || "-"}</span></p>
                        <p><strong>DOB:</strong> {profileQuery.data.student.profile?.dob ? new Date(profileQuery.data.student.profile.dob).toLocaleDateString() : "-"}</p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Parent / Guardian Info</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>Parent Name:</strong> {profileQuery.data.student.profile?.parentName || "-"}</p>
                        <p><strong>Parent Phone:</strong> {profileQuery.data.student.profile?.parentPhone || "-"}</p>
                      </CardContent>
                    </Card>

                    <Card className="md:col-span-2 border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Additional Profile Info</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>LMS Username:</strong> <span className="font-mono text-xs bg-slate-100 px-1 rounded">{profileQuery.data.student.username}</span></p>
                        <p><strong>Enrollment Date:</strong> {profileQuery.data.student.profile?.admissionDate ? new Date(profileQuery.data.student.profile.admissionDate).toLocaleDateString() : "-"}</p>
                        <p><strong>Completion Date:</strong> {profileQuery.data.student.profile?.completionDate ? new Date(profileQuery.data.student.profile.completionDate).toLocaleDateString() : "Ongoing study"}</p>
                        <p><strong>Preferred Class Time:</strong> {profileQuery.data.student.profile?.preferredClassTime || "Not specified"}</p>
                        <p><strong>Admin Notes:</strong> {profileQuery.data.student.profile?.notes || "No notes registered."}</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* 2. Course & Batch Info Tab */}
                <TabsContent value="course" className="space-y-6 outline-none">
                  {(() => {
                    const activeEnrollment = profileQuery.data.enrollments?.find((e: any) => e.status === "active") || profileQuery.data.enrollments?.[0];
                    const classHistory = profileQuery.data.classHistory || [];
                    const auditLogs = profileQuery.data.studentCourseAuditLogs || [];
                    const classAllocation = profileQuery.data.classAllocation;

                    // Calculate stats — prefer classAllocation JSON (holds manually-set completed counts
                    // for historical/bulk-imported students) over raw classHistory DB records
                    const alloc = classAllocation as any;
                    const allocCompleted =
                      (alloc?.oneToOne?.completed30 || 0) + (alloc?.oneToOne?.completed45 || 0) + (alloc?.oneToOne?.completed60 || 0) +
                      (alloc?.group?.completed30 || 0) + (alloc?.group?.completed45 || 0) + (alloc?.group?.completed60 || 0);
                    const allocTotal =
                      (alloc?.oneToOne?.sessions30 || 0) + (alloc?.oneToOne?.sessions45 || 0) + (alloc?.oneToOne?.sessions60 || 0) +
                      (alloc?.group?.sessions30 || 0) + (alloc?.group?.sessions45 || 0) + (alloc?.group?.sessions60 || 0);

                    // DB-recorded session counts (from actual logged sessions)
                    const dbCompletedCount = classHistory.filter((c: any) => c.status === "completed").length;
                    const missedCount = classHistory.filter((c: any) => c.status === "absent").length;
                    const cancelledCount = classHistory.filter((c: any) => c.status === "cancelled").length;

                    // Use allocation-based count if it's higher (covers historical students)
                    const completedCount = Math.max(allocCompleted, dbCompletedCount);
                    const totalAllocated = allocTotal > 0 ? allocTotal : (profileQuery.data.student.profile?.totalAllocatedSessions || 0);
                    const totalRemaining = Math.max(0, totalAllocated - completedCount);
                    const pct = totalAllocated > 0 ? Math.min(100, Math.round((completedCount / totalAllocated) * 100)) : 0;
                    return (
                      <div className="space-y-6">
                        {/* Course & Batch Payment Details Card */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-slate-50/50">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Course & Fee Enrollment Details</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                            <div className="space-y-2">
                              <p><strong>Course:</strong> {activeEnrollment?.batch?.module?.name || profileQuery.data.student.profile?.course || "-"}</p>
                              <p><strong>Batch:</strong> {activeEnrollment?.batch?.name || profileQuery.data.student.profile?.batch || "-"}</p>
                              <p><strong>Enrollment Source:</strong> <span className="font-semibold text-emerald-700">{getEnrollmentSourceLabel(profileQuery.data.student.registrationSource)}</span></p>
                              <p><strong>Payment Option:</strong> <span className="capitalize">{profileQuery.data.student.profile?.paymentOption?.replace('_', ' ') || "Full Payment"}</span></p>
                            </div>
                            <div className="space-y-2">
                              <p><strong>Course Fee:</strong> ₹{parseFloat(profileQuery.data.student.profile?.totalCourseFee || profileQuery.data.student.profile?.feesTotal || "0").toLocaleString("en-IN")}</p>
                              <p><strong>Paid Amount:</strong> ₹{parseFloat(profileQuery.data.student.profile?.feesPaid || "0").toLocaleString("en-IN")}</p>
                              <p><strong>Remaining Balance:</strong> ₹{parseFloat(profileQuery.data.student.profile?.remainingBalance || profileQuery.data.student.profile?.feesBalance || "0").toLocaleString("en-IN")}</p>
                              <p className="flex items-center">
                                <strong>Payment Status:</strong> 
                                <Badge className={`ml-2 capitalize font-bold ${
                                  profileQuery.data.student.profile?.paymentStatus === "paid"
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                    : profileQuery.data.student.profile?.paymentStatus === "partial"
                                      ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                      : "bg-red-100 text-red-700 hover:bg-red-100"
                                }`}>
                                  {profileQuery.data.student.profile?.paymentStatus === "paid" ? "Paid" : profileQuery.data.student.profile?.paymentStatus === "partial" ? "Partial Paid" : "Unpaid"}
                                </Badge>
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 1. Class Allocation Summary */}
                        <ClassAllocationSummary
                          allocation={(classAllocation as any) || {
                            oneToOne: { teacherId: null, sessions30: 0, sessions45: 0, sessions60: 0, completed30: 0, completed45: 0, completed60: 0, remaining30: 0, remaining45: 0, remaining60: 0 },
                            group: { teacherId: null, batchId: null, sessions30: 0, sessions45: 0, sessions60: 0, completed30: 0, completed45: 0, completed60: 0, remaining30: 0, remaining45: 0, remaining60: 0 }
                          }}
                          oneToOneTeacherName={getTeacherName((classAllocation as any)?.oneToOne?.teacherId)}
                          groupTeacherName={getTeacherName((classAllocation as any)?.group?.teacherId)}
                          groupBatchName={getBatchName((classAllocation as any)?.group?.batchId)}
                          batchName={activeEnrollment?.batch?.name}
                          moduleName={activeEnrollment?.batch?.module?.name}
                          isAdmin={isAdmin}
                          onConfigureClick={() => {
                            const alloc = classAllocation || {
                              oneToOne: { teacherId: "", sessions30: 0, sessions45: 0, sessions60: 0 },
                              group: { teacherId: "", batchId: "", sessions30: 0, sessions45: 0, sessions60: 0 }
                            };
                            setTempAllocation({
                              oneToOne: {
                                teacherId: (alloc as any).oneToOne?.teacherId ?? "",
                                designatedTime: (alloc as any).oneToOne?.designatedTime ?? "",
                                sessions30: (alloc as any).oneToOne?.sessions30 ?? 0,
                                sessions45: (alloc as any).oneToOne?.sessions45 ?? 0,
                                sessions60: (alloc as any).oneToOne?.sessions60 ?? 0,
                                completed30: (alloc as any).oneToOne?.completed30 ?? 0,
                                completed45: (alloc as any).oneToOne?.completed45 ?? 0,
                                completed60: (alloc as any).oneToOne?.completed60 ?? 0,
                              },
                              group: {
                                teacherId: (alloc as any).group?.teacherId ?? "",
                                batchId: ((alloc as any).group?.batchId as any) ?? "",
                                designatedTime: (alloc as any).group?.designatedTime ?? "",
                                sessions30: (alloc as any).group?.sessions30 ?? 0,
                                sessions45: (alloc as any).group?.sessions45 ?? 0,
                                sessions60: (alloc as any).group?.sessions60 ?? 0,
                                completed30: (alloc as any).group?.completed30 ?? 0,
                                completed45: (alloc as any).group?.completed45 ?? 0,
                                completed60: (alloc as any).group?.completed60 ?? 0,
                              }
                            });
                            setIsConfiguringAllocation(true);
                          }}
                          onAdjustClick={(type) => {
                            setAdjustType(type);
                            setIsAdjustingBalance(true);
                          }}
                        />

                        {/* 4. Live Tracking (Progress) */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Live Package Tracking & Statistics</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Allocated</p>
                                <p className="text-2xl font-bold text-slate-800">{totalAllocated}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Attended</p>
                                <p className="text-2xl font-bold text-emerald-700">{completedCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Missed</p>
                                <p className="text-2xl font-bold text-red-600">{missedCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Cancelled</p>
                                <p className="text-2xl font-bold text-slate-500">{cancelledCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 col-span-2 md:col-span-1">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Remaining Classes</p>
                                <p className="text-2xl font-bold text-blue-700">{totalRemaining}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-2">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                <span>Package Completion Progress</span>
                                <span>{completedCount} / {totalAllocated} Classes ({pct}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                                <div className="bg-emerald-600 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 5. Session History */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Class & Session History</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto text-xs">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-semibold text-xs">Type</TableHead>
                                  <TableHead className="font-semibold text-xs">Title / Topic</TableHead>
                                  <TableHead className="font-semibold text-xs">Duration</TableHead>
                                  <TableHead className="font-semibold text-xs">Teacher</TableHead>
                                  <TableHead className="font-semibold text-xs">Date & Time</TableHead>
                                  <TableHead className="font-semibold text-xs text-center">Status</TableHead>
                                  <TableHead className="font-semibold text-xs">Notes</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {classHistory.map((rec: any) => (
                                  <TableRow key={rec.id}>
                                    <TableCell className="font-semibold capitalize">
                                      <Badge variant="outline" className={rec.sessionType === "one_to_one" ? "border-emerald-200 text-emerald-800 bg-emerald-50/30" : "border-blue-200 text-blue-800 bg-blue-50/30"}>
                                        {rec.sessionType === "one_to_one" ? "1-to-1" : "Group"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[150px] truncate" title={rec.title}>{rec.title}</TableCell>
                                    <TableCell className="font-mono text-gray-500">{rec.duration} mins</TableCell>
                                    <TableCell>{rec.teacherName}</TableCell>
                                    <TableCell className="font-mono text-gray-500">{new Date(rec.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                                    <TableCell className="text-center">
                                      <Badge className={`capitalize font-bold ${
                                        rec.status === "completed"
                                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                          : rec.status === "absent"
                                            ? "bg-red-100 text-red-700 hover:bg-red-100"
                                            : rec.status === "cancelled"
                                              ? "bg-slate-100 text-slate-600 hover:bg-slate-100"
                                              : rec.status === "rescheduled"
                                                ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                                : "bg-blue-100 text-blue-700 hover:bg-blue-100"
                                      }`}>
                                        {rec.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-gray-400 max-w-[150px] truncate" title={rec.notes}>{rec.notes || "-"}</TableCell>
                                  </TableRow>
                                ))}
                                {classHistory.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center text-slate-400 py-10">
                                      No session history logs found.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        {/* 6. Audit Log */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Course & Class Allocation Audit Trail</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto text-xs">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-semibold text-xs">Date & Time</TableHead>
                                  <TableHead className="font-semibold text-xs">Event Type</TableHead>
                                  <TableHead className="font-semibold text-xs">Previous Value</TableHead>
                                  <TableHead className="font-semibold text-xs">New Value</TableHead>
                                  <TableHead className="font-semibold text-xs">Changed By</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {auditLogs.map((log: any) => (
                                  <TableRow key={log.id}>
                                    <TableCell className="font-mono text-gray-500">{new Date(log.changedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                                    <TableCell className="font-semibold capitalize text-slate-700">
                                      <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
                                        {log.changeType.replace(/_/g, " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-red-600 font-mono" title={log.oldValue}>{log.oldValue || "-"}</TableCell>
                                    <TableCell className="text-emerald-700 font-mono font-semibold" title={log.newValue}>{log.newValue || "-"}</TableCell>
                                    <TableCell className="font-medium">{log.changedByUser?.name || "Admin"}</TableCell>
                                  </TableRow>
                                ))}
                                {auditLogs.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                                      No audit log trails found.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* 3. Attendance Summary Tab */}
                <TabsContent value="attendance" className="space-y-4 outline-none">
                  <div className="border rounded-xl overflow-hidden bg-white text-xs">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-xs">Date</TableHead>
                          <TableHead className="font-semibold text-xs">Class Title / Topic</TableHead>
                          <TableHead className="font-semibold text-xs">Batch</TableHead>
                          <TableHead className="font-semibold text-xs text-center">Attendance Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profileQuery.data.attendance.map((rec) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-mono text-gray-500">{rec.class?.scheduledAt ? new Date(rec.class.scheduledAt).toLocaleDateString() : "-"}</TableCell>
                            <TableCell className="font-medium">{rec.class?.title || "Live Class"}</TableCell>
                            <TableCell>{profileQuery.data!.student.profile?.batch}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={
                                rec.status === "present"
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                  : rec.status === "late"
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                    : "bg-red-100 text-red-700 hover:bg-red-100"
                              }>
                                {rec.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {profileQuery.data.attendance.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-400 py-10">
                              No attendance records registered.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* 4. Fee & Payment Details Tab */}
                <TabsContent value="fees" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Total Course Fee</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-gray-800">₹{profileQuery.data.student.profile?.feesTotal || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Amount Paid</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-emerald-700">₹{profileQuery.data.student.profile?.feesPaid || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Outstanding Balance</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-red-600">₹{profileQuery.data.student.profile?.feesBalance || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Payment Status</CardTitle></CardHeader>
                      <CardContent>
                        <Badge className={`capitalize font-bold ${
                          profileQuery.data.student.profile?.paymentStatus === "paid"
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : profileQuery.data.student.profile?.paymentStatus === "partial"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              : "bg-red-100 text-red-700 hover:bg-red-100"
                        }`}>
                          {profileQuery.data.student.profile?.paymentStatus || "unpaid"}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Installments Table */}
                    <Card className="border-slate-100">
                      <CardHeader className="py-3 border-b bg-slate-50/50"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Tuition Installments & Payments</CardTitle></CardHeader>
                      <CardContent className="p-0 overflow-x-auto text-xs">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Inst #</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {profileQuery.data.payments.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-bold">
                                  {p.installmentNumber ? `Installment #${p.installmentNumber}` : "Single Tuition"}
                                </TableCell>
                                <TableCell className="font-mono font-semibold">₹{p.amount}</TableCell>
                                <TableCell className="font-mono text-gray-500">{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "N/A"}</TableCell>
                                <TableCell>
                                  <Badge className={
                                    p.status === "paid"
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                      : "bg-red-100 text-red-700 hover:bg-red-100"
                                  }>
                                    {p.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {isAdmin && p.status !== "paid" ? (
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100" onClick={() => recordPaymentMutation.mutate({ paymentId: p.id, amount: Number(p.amount) })}>
                                      Record Pay
                                    </Button>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                            {profileQuery.data.payments.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                                  No installments generated.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Student Fee Rules Card (Admin only) */}
                    {isAdmin && feeRulesState && (
                      <Card className="col-span-1 md:col-span-2 border border-slate-200 bg-slate-50/50 p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4">
                          <div>
                            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Configure Student Fee Rules</h4>
                            <p className="text-xs text-gray-500 mt-1">Manage payment options, total fees, initial payments, and custom installment schedules.</p>
                          </div>
                          <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 font-bold capitalize mt-2 sm:mt-0 text-[10px]">
                            {feeRulesState.paymentType.replace("_", " ").toLowerCase()}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Payment Type</label>
                            <select
                              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 outline-none"
                              value={feeRulesState.paymentType}
                              onChange={(e) => {
                                const newType = e.target.value as "FULL_PAYMENT" | "INSTALLMENT";
                                setFeeRulesState((prev) => {
                                  if (!prev) return null;
                                  // Auto-adjust installments if type is switched
                                  const sumPaid = (profileQuery.data?.payments || [])
                                    .filter((p: any) => p.type === "tuition" && p.status === "paid")
                                    .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
                                  
                                  if (newType === "FULL_PAYMENT") {
                                    return {
                                      ...prev,
                                      paymentType: newType,
                                      numInstallments: 1,
                                      installments: [
                                        {
                                          installmentNumber: 1,
                                          amount: prev.totalCourseFee,
                                          dueDate: prev.installments[0]?.dueDate || "",
                                          status: sumPaid >= prev.totalCourseFee ? "paid" : "unpaid",
                                        }
                                      ]
                                    };
                                  } else {
                                    return {
                                      ...prev,
                                      paymentType: newType,
                                      numInstallments: Math.max(2, prev.numInstallments),
                                    };
                                  }
                                });
                              }}
                            >
                              <option value="FULL_PAYMENT">Full Payment</option>
                              <option value="INSTALLMENT">Installment Payment</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Total Course Fee (₹)</label>
                            <Input
                              type="number"
                              value={feeRulesState.totalCourseFee}
                              onChange={(e) => setFeeRulesState(prev => prev ? { ...prev, totalCourseFee: Number(e.target.value) } : null)}
                            />
                          </div>

                          {feeRulesState.paymentType === "INSTALLMENT" && (
                            <>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Initial Payment (₹)</label>
                                <Input
                                  type="number"
                                  value={feeRulesState.initialPayment}
                                  onChange={(e) => setFeeRulesState(prev => prev ? { ...prev, initialPayment: Number(e.target.value) } : null)}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">No. of Installments</label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={feeRulesState.numInstallments}
                                  onChange={(e) => setFeeRulesState(prev => prev ? { ...prev, numInstallments: Math.max(1, Number(e.target.value)) } : null)}
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Calculation summary info */}
                        <div className="bg-slate-100/50 p-3 rounded-lg flex flex-wrap gap-6 text-xs font-medium text-slate-700">
                          <div>
                            Total Course Fee: <span className="font-bold text-slate-900">₹{feeRulesState.totalCourseFee.toLocaleString("en-IN")}</span>
                          </div>
                          <div>
                            Already Paid: <span className="font-bold text-emerald-600">₹{
                              (profileQuery.data?.payments || [])
                                .filter((p: any) => p.type === "tuition" && p.status === "paid")
                                .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0)
                                .toLocaleString("en-IN")
                            }</span>
                          </div>
                          <div>
                            Outstanding Balance: <span className="font-bold text-red-600">₹{
                              Math.max(0, feeRulesState.totalCourseFee - (
                                (profileQuery.data?.payments || [])
                                  .filter((p: any) => p.type === "tuition" && p.status === "paid")
                                  .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0)
                              )).toLocaleString("en-IN")
                            }</span>
                          </div>
                        </div>

                        {/* Installment Schedule Section */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Installment Schedule</h5>
                            <div className="flex gap-2">
                              {feeRulesState.paymentType === "INSTALLMENT" && (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] bg-slate-100 hover:bg-slate-200 border-slate-200"
                                    onClick={recalculateStudentFeeRules}
                                  >
                                    Recalculate
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100"
                                    onClick={addFeeRulesInstallmentRow}
                                  >
                                    Add Installment Row
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="border rounded-lg overflow-hidden bg-white">
                            <Table className="text-xs">
                              <TableHeader className="bg-slate-50">
                                <TableRow>
                                  <TableHead className="w-16">Inst #</TableHead>
                                  <TableHead>Amount (₹)</TableHead>
                                  <TableHead>Due Date</TableHead>
                                  <TableHead className="w-24">Status</TableHead>
                                  {feeRulesState.paymentType === "INSTALLMENT" && <TableHead className="w-16 text-right">Action</TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {feeRulesState.installments.map((inst, index) => {
                                  const isPaid = inst.status === "paid";
                                  return (
                                    <TableRow key={index}>
                                      <TableCell className="font-bold text-slate-600">
                                        #{inst.installmentNumber}
                                      </TableCell>
                                      <TableCell>
                                        <Input
                                          type="number"
                                          disabled={isPaid}
                                          className="h-8 text-xs font-mono w-32 disabled:bg-slate-50"
                                          value={inst.amount}
                                          onChange={(e) => {
                                            const newAmount = Number(e.target.value);
                                            setFeeRulesState((prev) => {
                                              if (!prev) return null;
                                              const updated = [...prev.installments];
                                              updated[index] = { ...updated[index], amount: newAmount };
                                              return { ...prev, installments: updated };
                                            });
                                          }}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input
                                          type="date"
                                          disabled={isPaid}
                                          className="h-8 text-xs font-mono w-40 disabled:bg-slate-50"
                                          value={inst.dueDate}
                                          onChange={(e) => {
                                            const newDate = e.target.value;
                                            setFeeRulesState((prev) => {
                                              if (!prev) return null;
                                              const updated = [...prev.installments];
                                              updated[index] = { ...updated[index], dueDate: newDate };
                                              return { ...prev, installments: updated };
                                            });
                                          }}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={`font-bold text-[10px] capitalize ${
                                          isPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                        }`}>
                                          {isPaid ? "paid" : "pending"}
                                        </Badge>
                                      </TableCell>
                                      {feeRulesState.paymentType === "INSTALLMENT" && (
                                        <TableCell className="text-right">
                                          {!isPaid ? (
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                              onClick={() => removeFeeRulesInstallmentRow(inst.installmentNumber)}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                          ) : "-"}
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        {/* Save rules button */}
                        <div className="flex justify-end gap-3 border-t pt-4">
                          <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs px-6"
                            onClick={() => {
                              // Perform validation checks before triggering dialog
                              const sumPaid = (profileQuery.data?.payments || [])
                                .filter((p: any) => p.type === "tuition" && p.status === "paid")
                                .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

                              if (feeRulesState.totalCourseFee < sumPaid) {
                                toast.error(`Total Course Fee (₹${feeRulesState.totalCourseFee}) cannot be less than the amount already paid (₹${sumPaid}).`);
                                return;
                              }

                              const totalInstallmentsAmount = feeRulesState.installments.reduce((sum, inst) => sum + inst.amount, 0);
                              if (Math.abs(totalInstallmentsAmount - feeRulesState.totalCourseFee) > 0.01) {
                                toast.error(`Sum of all installments (₹${totalInstallmentsAmount.toLocaleString("en-IN")}) must equal the total course fee (₹${feeRulesState.totalCourseFee.toLocaleString("en-IN")}).`);
                                return;
                              }

                              const unpaidWithDates = feeRulesState.installments.filter(inst => inst.status === "unpaid" && !inst.dueDate);
                              if (feeRulesState.paymentType === "INSTALLMENT" && unpaidWithDates.length > 0) {
                                toast.error("Please specify a valid due date for all unpaid installments.");
                                return;
                              }

                              const dueDates = feeRulesState.installments
                                .map(inst => inst.dueDate)
                                .filter(d => !!d);
                              if (new Set(dueDates).size !== dueDates.length) {
                                toast.error("Installment due dates cannot overlap.");
                                return;
                              }

                              // Verify chronological order for installments
                              const sortedByNum = [...feeRulesState.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
                              for (let i = 0; i < sortedByNum.length - 1; i++) {
                                const currentD = sortedByNum[i].dueDate;
                                const nextD = sortedByNum[i+1].dueDate;
                                if (currentD && nextD && new Date(currentD).getTime() >= new Date(nextD).getTime()) {
                                  toast.error(`Installment due dates must be chronological. Installment #${sortedByNum[i].installmentNumber} is due on or after Installment #${sortedByNum[i+1].installmentNumber}.`);
                                  return;
                                }
                              }

                              setIsConfirmingFeeRules(true);
                            }}
                          >
                            Save Fee Rules
                          </Button>
                        </div>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* 5. Performance Reports Tab */}

                {/* 6. Documents Tab */}
                <TabsContent value="documents" className="space-y-4 outline-none">
                  {isAdmin && (
                    <Card className="border border-dashed border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="font-bold text-xs text-slate-800 mb-3 uppercase tracking-wider">Add Student Document Link</h4>
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <Input
                          placeholder="Document Name (e.g. TOEFL Certificate)"
                          className="h-9 text-xs"
                          value={newDoc.name}
                          onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                        />
                        <Input
                          placeholder="Document URL (e.g. https://drive.google.com/xyz)"
                          className="h-9 text-xs"
                          value={newDoc.url}
                          onChange={(e) => setNewDoc({ ...newDoc, url: e.target.value })}
                        />
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 h-9 text-xs" onClick={() => {
                          if (!newDoc.name || !newDoc.url) {
                            toast.error("Both document name and URL are required");
                            return;
                          }
                          addDocumentMutation.mutate({
                            studentId: profileQuery.data!.student.id,
                            name: newDoc.name,
                            url: newDoc.url,
                          });
                        }}>
                          <FileUp className="w-4 h-4 mr-2" />
                          Add Doc
                        </Button>
                      </div>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {((profileQuery.data.student.profile?.documents || []) as any[]).map((doc: any) => (
                      <div key={doc.id} className="flex justify-between items-center p-3 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <FileText className="w-8 h-8 text-emerald-600 bg-emerald-50 p-1.5 rounded-lg shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-slate-700 truncate max-w-[200px]" title={doc.name}>{doc.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ""}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a href={doc.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Eye className="w-4 h-4 text-slate-600" /></Button>
                          </a>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => {
                              deleteDocumentMutation.mutate({
                                studentId: profileQuery.data!.student.id,
                                documentId: doc.id,
                              });
                            }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!profileQuery.data.student.profile?.documents || (profileQuery.data.student.profile.documents as any[]).length === 0) && (
                      <div className="col-span-2 text-center py-10 text-slate-400 text-xs">
                        No uploaded student documents found.
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* 7. Communication History Tab */}
              </div>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Configure Allocation Dialog */}
      <Dialog open={isConfiguringAllocation} onOpenChange={(open) => {
        setIsConfiguringAllocation(open);
        if (!open) setConfigStudentId(null);
      }}>
        <DialogContent className="w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">Configure Student Class Allocation</DialogTitle>
            <DialogDescription className="text-xs">Adjust total allocated sessions, assign teachers, and select batches.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ClassAllocationForm
              value={tempAllocation}
              onChange={setTempAllocation}
              departmentId={studentDepartmentId}
              studentId={configStudentId || detailsStudentId}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl text-xs" onClick={() => setIsConfiguringAllocation(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              disabled={updateClassAllocationMutation.isPending}
              onClick={() => {
                updateClassAllocationMutation.mutate({
                  studentId: configStudentId || detailsStudentId || 0,
                  allocation: {
                      oneToOne: {
                      teacherId: tempAllocation.oneToOne.teacherId !== "" ? Number(tempAllocation.oneToOne.teacherId) : null,
                      designatedTime: tempAllocation.oneToOne.designatedTime || "",
                      sessions30: Number(tempAllocation.oneToOne.sessions30),
                      sessions45: Number(tempAllocation.oneToOne.sessions45),
                      sessions60: Number(tempAllocation.oneToOne.sessions60),
                      completed30: Number(tempAllocation.oneToOne.completed30 || 0),
                      completed45: Number(tempAllocation.oneToOne.completed45 || 0),
                      completed60: Number(tempAllocation.oneToOne.completed60 || 0),
                    },
                    group: {
                      teacherId: tempAllocation.group.teacherId !== "" ? Number(tempAllocation.group.teacherId) : null,
                      batchId: tempAllocation.group.batchId !== "" ? Number(tempAllocation.group.batchId) : null,
                      designatedTime: tempAllocation.group.designatedTime || "",
                      sessions30: Number(tempAllocation.group.sessions30),
                      sessions45: Number(tempAllocation.group.sessions45),
                      sessions60: Number(tempAllocation.group.sessions60),
                      completed30: Number(tempAllocation.group.completed30 || 0),
                      completed45: Number(tempAllocation.group.completed45 || 0),
                      completed60: Number(tempAllocation.group.completed60 || 0),
                    }
                  }
                });
              }}
            >
              {updateClassAllocationMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog */}
      {detailsStudentId && profileQuery.data?.classAllocation && (
        <ClassBalanceAdjustment
          open={isAdjustingBalance}
          onClose={() => setIsAdjustingBalance(false)}
          studentId={detailsStudentId}
          type={adjustType}
          currentAllocation={profileQuery.data.classAllocation as any}
          onSuccess={() => profileQuery.refetch()}
        />
      )}
    </div>
  );
}
