import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Plus, Clock, Users, UserPlus, UserMinus, Trash2, CreditCard, Printer, Wallet, CheckCircle, AlertCircle, Edit, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


export default function BatchesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("modules");
  const [openModule, setOpenModule] = useState(false);
  const [openBatch, setOpenBatch] = useState(false);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [selectedEnrollBatch, setSelectedEnrollBatch] = useState<any>(null);
  const [openEnrollModal, setOpenEnrollModal] = useState(false);
  const [enrollPaymentOption, setEnrollPaymentOption] = useState<"full_payment" | "installment">("full_payment");
  const [enrollDownPayment, setEnrollDownPayment] = useState<string>("");
  const [openEnrollSimulator, setOpenEnrollSimulator] = useState(false);
  const [openEditFeeModal, setOpenEditFeeModal] = useState(false);
  const [editFeeBatchId, setEditFeeBatchId] = useState<number | null>(null);
  const [editFeeValue, setEditFeeValue] = useState<number>(0);
  const [openEditBatch, setOpenEditBatch] = useState(false);
  const [editBatchData, setEditBatchData] = useState({
    id: 0,
    name: "",
    description: "",
    timeSlot: "",
    maxStudents: 30,
    teacherId: 0,
    startDate: "",
    duration: "",
    status: "active",
    moduleId: 0,
  });
  const [openAuditLogs, setOpenAuditLogs] = useState(false);
  const auditLogsQuery = trpc.learning.listBatchAuditLogs.useQuery(undefined, { enabled: openAuditLogs });

  const updateBatch = trpc.learning.updateBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch updated successfully!");
      setOpenEditBatch(false);
      batchesQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update batch");
    },
  });
  const [enrollSimulatorData, setEnrollSimulatorData] = useState<{ orderId: string; amount: number } | null>(null);
  const [deleteModuleId, setDeleteModuleId] = useState<number | null>(null);
  const [deleteBatchId, setDeleteBatchId] = useState<number | null>(null);
  const [viewStudentsBatchId, setViewStudentsBatchId] = useState<number | null>(null);
  const batchStudents = trpc.learning.listBatchStudents.useQuery({ batchId: viewStudentsBatchId || 0 }, { enabled: !!viewStudentsBatchId });

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isStrictAdmin = ["super_admin", "admin"].includes(user?.role || "");

  const modulesQuery = trpc.learning.listModules.useQuery();
  const departmentsQuery = trpc.department.list.useQuery(undefined, { enabled: isAdmin });
  const batchesQuery = trpc.learning.listBatches.useQuery(
    selectedModule ? { moduleId: selectedModule } : undefined
  );
  const myBatches = trpc.user.myBatches.useQuery(undefined, { enabled: !isAdmin });
  const teachersQuery = trpc.user.list.useQuery({ role: "teacher", limit: 100, offset: 0 }, { enabled: isAdmin });

  const createModule = trpc.learning.createModule.useMutation({
    onSuccess: () => {
      toast.success("Module created");
      setOpenModule(false);
      setModuleForm({
        name: "",
        description: "",
        learningObjectives: "",
        topics: "",
        teacherId: 0,
        duration: "",
        status: "active",
        maxStudents: 50,
        minStudents: 5,
        courseFee: 0,
        minimumDownPayment: 0,
        departmentId: 0,
      });
      modulesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateModule = trpc.learning.updateModule.useMutation({
    onSuccess: () => {
      toast.success("Module updated");
      setOpenEditModule(false);
      modulesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const createBatch = trpc.learning.createBatch.useMutation({
    onSuccess: () => { toast.success("Batch created"); setOpenBatch(false); batchesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const enrollStudent = trpc.learning.enrollStudent.useMutation({
    onSuccess: () => {
      toast.success("Student enrolled");
      setEnrollStudentId("");
      setEnrollPaymentType("FULL_PAYMENT");
      setEnrollFeesTotal(0);
      setEnrollInstallmentCount(2);
      setEnrollInstallments([]);
      batchesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeStudent = trpc.learning.removeStudent.useMutation({
    onSuccess: () => { toast.success("Student removed"); batchesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteModule = trpc.learning.deleteModule.useMutation({
    onSuccess: () => { toast.success("Module deleted"); setDeleteModuleId(null); setSelectedModule(null); modulesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteBatch = trpc.learning.deleteBatch.useMutation({
    onSuccess: () => { toast.success("Batch deleted"); setDeleteBatchId(null); batchesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateBatchFee = trpc.learning.updateBatchFee.useMutation({
    onSuccess: () => {
      toast.success("Batch fee updated successfully!");
      setOpenEditFeeModal(false);
      batchesQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update batch fee");
    },
  });

  const [accordionMode, setAccordionMode] = useState<"single" | "multiple">("multiple");
  const [openEditModule, setOpenEditModule] = useState(false);
  const [editModuleData, setEditModuleData] = useState({
    id: 0,
    name: "",
    description: "",
    learningObjectives: "",
    topics: "",
    teacherId: 0,
    duration: "",
    status: "active",
    maxStudents: 50,
    minStudents: 5,
    courseFee: 0,
    minimumDownPayment: 0,
    departmentId: 0,
  });

  const [moduleForm, setModuleForm] = useState({
    name: "",
    description: "",
    learningObjectives: "",
    topics: "",
    teacherId: 0,
    duration: "",
    status: "active",
    maxStudents: 50,
    minStudents: 5,
    courseFee: 0,
    minimumDownPayment: 0,
    departmentId: 0,
  });
  const [batchForm, setBatchForm] = useState({ moduleId: 0, name: "", timeSlot: "", sessionType: "group", maxStudents: 30, teacherId: 0, startDate: "", duration: "", courseFee: 0 });
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const matchingStudentsQuery = trpc.learning.getMatchingWaitingStudents.useQuery(
    { moduleId: batchForm.moduleId, timeSlot: batchForm.timeSlot, sessionType: (batchForm.sessionType as any) || "group" },
    { enabled: openBatch && batchForm.moduleId > 0 && !!batchForm.timeSlot.trim() }
  );
  const [enrollBatchId, setEnrollBatchId] = useState<number | null>(null);
  const [enrollStudentId, setEnrollStudentId] = useState("");
  const [enrollPaymentType, setEnrollPaymentType] = useState<"FULL_PAYMENT" | "INSTALLMENT">("FULL_PAYMENT");
  const [enrollFeesTotal, setEnrollFeesTotal] = useState<number>(0);
  const [enrollInstallmentCount, setEnrollInstallmentCount] = useState<number>(2);
  const [enrollInstallments, setEnrollInstallments] = useState<Array<{ installmentNumber: number; amount: number; dueDate?: string }>>([]);

  const studentFeeConfigQuery = trpc.learning.getStudentFeeConfig.useQuery(
    { studentId: enrollStudentId },
    { enabled: !!enrollBatchId && !!enrollStudentId.trim() }
  );

  useEffect(() => {
    if (enrollPaymentType === "INSTALLMENT" && enrollFeesTotal > 0) {
      const baseAmount = Math.floor(enrollFeesTotal / enrollInstallmentCount);
      const remainder = enrollFeesTotal % enrollInstallmentCount;
      setEnrollInstallments((prev) => {
        const count = enrollInstallmentCount;
        return Array.from({ length: count }, (_, i) => {
          const prevInst = prev[i];
          return {
            installmentNumber: i + 1,
            amount: baseAmount + (i === count - 1 ? remainder : 0),
            dueDate: prevInst?.dueDate || "",
          };
        });
      });
    } else {
      setEnrollInstallments([]);
    }
  }, [enrollPaymentType, enrollInstallmentCount, enrollFeesTotal]);

  const isEnrollInstallmentsValid = enrollPaymentType === "FULL_PAYMENT" ||
    (enrollInstallments.reduce((sum, inst) => sum + inst.amount, 0) === enrollFeesTotal);

  const [removeBatchId, setRemoveBatchId] = useState<number | null>(null);
  const [removeStudentId, setRemoveStudentId] = useState("");

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            {(user?.role === "student" || user?.role === "teacher") && <TabsTrigger value="my">{user?.role === "student" ? "My Batches" : "My Assigned Batches"}</TabsTrigger>}
          </TabsList>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpenAuditLogs(true)}>
                <Clock className="w-4 h-4 mr-2" /> Audit Logs
              </Button>
              <Dialog open={openModule} onOpenChange={setOpenModule}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Module</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Create Module</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createModule.mutate({ ...moduleForm, teacherId: moduleForm.teacherId || undefined, departmentId: Number(moduleForm.departmentId) }); }} className="space-y-4 mt-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Module Name *</label>
                      <Input required placeholder="Module Name" value={moduleForm.name} onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Department *</label>
                      <select required className="w-full border rounded-md px-3 py-2 text-sm" value={moduleForm.departmentId} onChange={(e) => setModuleForm({ ...moduleForm, departmentId: Number(e.target.value) })}>
                        <option value="">Select Department</option>
                        {departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Description</label>
                      <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Description" rows={3} value={moduleForm.description} onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Learning Objectives</label>
                      <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Learning Objectives" rows={3} value={moduleForm.learningObjectives} onChange={(e) => setModuleForm({ ...moduleForm, learningObjectives: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Topics/Lessons Included</label>
                      <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Topics/Lessons" rows={3} value={moduleForm.topics} onChange={(e) => setModuleForm({ ...moduleForm, topics: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Assigned Teacher</label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={moduleForm.teacherId} onChange={(e) => setModuleForm({ ...moduleForm, teacherId: Number(e.target.value) })}>
                          <option value={0}>Select Teacher</option>
                          {teachersQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Duration</label>
                        <Input placeholder="e.g. 3 Months" value={moduleForm.duration} onChange={(e) => setModuleForm({ ...moduleForm, duration: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Min Students</label>
                        <Input type="number" value={moduleForm.minStudents} onChange={(e) => setModuleForm({ ...moduleForm, minStudents: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Max Students</label>
                        <Input type="number" value={moduleForm.maxStudents} onChange={(e) => setModuleForm({ ...moduleForm, maxStudents: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Course Fee (₹)</label>
                        <Input type="number" min="0" value={moduleForm.courseFee} onChange={(e) => setModuleForm({ ...moduleForm, courseFee: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Min Down Payment (₹)</label>
                        <Input type="number" min="0" value={moduleForm.minimumDownPayment} onChange={(e) => setModuleForm({ ...moduleForm, minimumDownPayment: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={moduleForm.status} onChange={(e) => setModuleForm({ ...moduleForm, status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={createModule.isPending}>
                      {createModule.isPending ? "Creating..." : "Create Module"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={openBatch} onOpenChange={setOpenBatch}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-2" /> Batch</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Create Batch</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { 
                    e.preventDefault(); 
                    createBatch.mutate({ 
                      ...batchForm, 
                      sessionType: (batchForm.sessionType as any) || "group",
                      teacherId: batchForm.teacherId || undefined,
                      startDate: batchForm.startDate ? new Date(batchForm.startDate) : undefined,
                      courseFee: batchForm.courseFee || undefined,
                      duration: batchForm.duration || undefined,
                      studentIds: selectedStudentIds,
                    }); 
                  }} className="space-y-4 mt-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Select Module *</label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={batchForm.moduleId} onChange={(e) => {
                        const mId = Number(e.target.value);
                        const selectedM = modulesQuery.data?.find((m) => m.id === mId);
                        setBatchForm({ ...batchForm, moduleId: mId, courseFee: selectedM ? parseFloat(selectedM.courseFee || "0") : batchForm.courseFee });
                        setSelectedStudentIds([]);
                      }}>
                        <option value={0}>Select Module</option>
                        {modulesQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Batch Name *</label>
                      <Input placeholder="Batch Name" value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Time Slot *</label>
                        <Input placeholder="Time Slot (e.g. 7 AM)" value={batchForm.timeSlot} onChange={(e) => setBatchForm({ ...batchForm, timeSlot: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Session Type</label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={batchForm.sessionType} onChange={(e) => setBatchForm({ ...batchForm, sessionType: e.target.value })}>
                          <option value="group">Group Batch</option>
                          <option value="both">Both (Group + 1-on-1)</option>
                        </select>
                      </div>
                    </div>

                    {/* Matching Waiting Students Section */}
                    <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-amber-800 dark:text-amber-400 uppercase tracking-wider">
                          Matching Waiting Students ({matchingStudentsQuery.data?.length || 0})
                        </h4>
                        {matchingStudentsQuery.data && matchingStudentsQuery.data.length > 0 && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-amber-700 hover:underline"
                            onClick={() => {
                              if (selectedStudentIds.length === matchingStudentsQuery.data.length) {
                                setSelectedStudentIds([]);
                              } else {
                                setSelectedStudentIds(matchingStudentsQuery.data.map(s => s.id));
                              }
                            }}
                          >
                            {selectedStudentIds.length === matchingStudentsQuery.data.length ? "Deselect All" : "Select All"}
                          </button>
                        )}
                      </div>

                      {batchForm.moduleId > 0 && batchForm.timeSlot.trim() ? (
                        matchingStudentsQuery.isLoading ? (
                          <p className="text-xs text-amber-600">Filtering matching students...</p>
                        ) : matchingStudentsQuery.data && matchingStudentsQuery.data.length > 0 ? (
                          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                            {matchingStudentsQuery.data.map((student: any) => {
                              const isChecked = selectedStudentIds.includes(student.id);
                              return (
                                <label key={student.id} className="flex items-center justify-between p-2 rounded-lg border bg-white dark:bg-slate-900 text-xs cursor-pointer hover:bg-slate-50">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedStudentIds([...selectedStudentIds, student.id]);
                                        } else {
                                          setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.id));
                                        }
                                      }}
                                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <div>
                                      <p className="font-medium text-slate-800 dark:text-slate-200">{student.name} ({student.unionId})</p>
                                      <p className="text-[10px] text-slate-500">Slot: {student.preferredClassTime || "Any"} | Session: {student.sessionType}</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Matching</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-700">No unassigned waiting students match this module and time slot.</p>
                        )
                      ) : (
                        <p className="text-xs text-amber-700 font-light">Select a Module and enter a Time Slot to view eligible students.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Max Students</label>
                        <Input type="number" placeholder="Max Students" value={batchForm.maxStudents} onChange={(e) => setBatchForm({ ...batchForm, maxStudents: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Assigned Teacher</label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={batchForm.teacherId} onChange={(e) => setBatchForm({ ...batchForm, teacherId: Number(e.target.value) })}>
                          <option value={0}>Select Teacher (optional)</option>
                          {teachersQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Start Date</label>
                        <Input type="date" value={batchForm.startDate} onChange={(e) => setBatchForm({ ...batchForm, startDate: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Duration</label>
                        <Input placeholder="e.g. 3 Months" value={batchForm.duration} onChange={(e) => setBatchForm({ ...batchForm, duration: e.target.value })} />
                      </div>
                    </div>
                    <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase">Course Fee (₹) *</label>
                       <Input type="number" placeholder="e.g. 5000" value={batchForm.courseFee || ""} onChange={(e) => setBatchForm({ ...batchForm, courseFee: Number(e.target.value) })} />
                     </div>
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={createBatch.isPending}>
                      {createBatch.isPending ? "Creating..." : `Create Batch (${selectedStudentIds.length} Students)`}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <TabsContent value="modules">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Expand Mode</p>
                <p className="text-xs text-muted-foreground font-light">Choose if you want to expand one or multiple modules at once.</p>
              </div>
              <div className="flex items-center gap-1.5 border rounded-lg p-1 bg-white dark:bg-gray-950 shadow-sm self-start sm:self-auto">
                <Button
                  variant={accordionMode === "single" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs px-3 font-medium transition-all"
                  onClick={() => setAccordionMode("single")}
                >
                  Single
                </Button>
                <Button
                  variant={accordionMode === "multiple" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs px-3 font-medium transition-all"
                  onClick={() => setAccordionMode("multiple")}
                >
                  Multiple
                </Button>
              </div>
            </div>

            {modulesQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="border rounded-lg p-5 space-y-3 animate-pulse bg-gray-50 dark:bg-gray-950">
                    <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            ) : modulesQuery.data?.length === 0 ? (
              <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
                <p className="text-muted-foreground text-sm">No modules found. Create one to get started!</p>
              </Card>
            ) : (
              <Accordion 
                type={accordionMode as any} 
                {...(accordionMode === "single" ? { collapsible: true } : {})} 
                className="space-y-3"
              >
                {modulesQuery.data?.map((mod) => (
                  <AccordionItem 
                    value={String(mod.id)} 
                    key={mod.id} 
                    className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 shadow-sm transition-all hover:border-gray-200 dark:hover:border-gray-700"
                  >
                    <AccordionTrigger className="px-6 py-4 hover:no-underline font-semibold text-lg text-gray-800 dark:text-gray-200">
                      <div className="flex items-center gap-3">
                        <span>{mod.name}</span>
                        <Badge 
                          variant={mod.status === "active" ? "default" : "secondary"} 
                          className={`text-xs font-normal capitalize ${
                            mod.status === "active" 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-50" 
                              : "bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-50"
                          }`}
                        >
                          {mod.status || "active"}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6 pt-2 border-t border-gray-50 dark:border-gray-900">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mt-3">
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Module Description</h4>
                            <p className="mt-1.5 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                              {mod.description || "No description provided."}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Learning Objectives</h4>
                            <p className="mt-1.5 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                              {mod.learningObjectives || "No learning objectives defined."}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Topics/Lessons Included</h4>
                            <p className="mt-1.5 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                              {mod.topics || "No topics listed."}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                              <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Assigned Teacher</h4>
                              <p className="mt-1 text-gray-800 dark:text-gray-200 font-medium">{mod.teacher?.name || "Not assigned"}</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                              <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Duration</h4>
                              <p className="mt-1 text-gray-800 dark:text-gray-200 font-medium">{mod.duration || "Not specified"}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                              <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Min / Max Capacity</h4>
                              <p className="mt-1 text-gray-800 dark:text-gray-200">
                                {mod.minStudents || 5} min / {mod.maxStudents || 50} max
                              </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                              <h4 className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Created Date</h4>
                              <p className="mt-1 text-gray-800 dark:text-gray-200 font-light">
                                {new Date(mod.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                              </p>
                            </div>
                          </div>

                          <div className="pt-4 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-900">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 min-w-[120px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100"
                              onClick={() => {
                                setSelectedModule(mod.id);
                                setActiveTab("batches");
                              }}
                            >
                              View Batches
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 min-w-[120px]"
                                  onClick={() => {
                                    setEditModuleData({
                                      id: mod.id,
                                      name: mod.name,
                                      description: mod.description || "",
                                      learningObjectives: mod.learningObjectives || "",
                                      topics: mod.topics || "",
                                      teacherId: mod.teacherId || 0,
                                      duration: mod.duration || "",
                                      status: mod.status || "active",
                                      maxStudents: mod.maxStudents || 50,
                                      minStudents: mod.minStudents || 5,
                                      courseFee: mod.courseFee ? Number(mod.courseFee) : 0,
                                      minimumDownPayment: mod.minimumDownPayment ? Number(mod.minimumDownPayment) : 0,
                                      departmentId: mod.departmentModules?.[0]?.departmentId || 0,
                                    });
                                    setOpenEditModule(true);
                                  }}
                                >
                                  <Edit className="w-3.5 h-3.5 mr-1" /> Edit Module
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="flex-1 min-w-[120px]"
                                  onClick={() => setDeleteModuleId(mod.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Module
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </TabsContent>

        <TabsContent value="batches">
          <div className="space-y-4">
            {selectedModule && (
              <p className="text-sm text-gray-500">
                Showing batches for: {modulesQuery.data?.find((m) => m.id === selectedModule)?.name}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {batchesQuery.data?.map((batch) => {
                const isStudentEnrolled = myBatches.data?.some((e) => e.batchId === batch.id && e.status === "active");
                const availableSeats = Math.max(0, (batch.maxStudents || 30) - (batch.enrollments?.length || 0));

                return (
                  <Card key={batch.id} className="relative group overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-bold text-gray-800 dark:text-gray-200">{batch.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={batch.status === "active" ? "default" : "secondary"} className="capitalize">{batch.status}</Badge>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                              onClick={() => {
                                if (user?.role !== "super_admin") {
                                  toast.error("Access Denied: Only Super Admin can delete batches.");
                                  return;
                                }
                                setDeleteBatchId(batch.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <p className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                          <Clock className="w-4 h-4 text-emerald-600" /> {batch.timeSlot || "Not set"}
                        </p>
                        <p><strong>Course:</strong> {batch.module?.name || "-"}</p>
                        <p><strong>Teacher:</strong> {batch.teacher?.name || "Not assigned"}</p>
                        <p><strong>Start Date:</strong> {batch.startDate ? new Date(batch.startDate).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Not set"}</p>
                        <p><strong>Duration:</strong> {batch.duration || "Not specified"}</p>
                        <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold text-base mt-1">
                          <span>Course Fee: ₹{batch.courseFee || "0"}</span>
                          {isStrictAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 h-7 px-2 font-medium text-xs flex items-center gap-1"
                              onClick={() => {
                                if (user?.role !== "super_admin") {
                                  toast.error("Access Denied: Only Super Admin can edit batch details.");
                                  return;
                                }
                                setEditFeeBatchId(batch.id);
                                setEditFeeValue(Number(batch.courseFee) || 0);
                                setOpenEditFeeModal(true);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" /> Edit Fee
                            </Button>
                          )}
                        </div>
                        <p className="font-semibold text-gray-700 dark:text-gray-300">
                          Available Seats: <span className={availableSeats > 5 ? "text-emerald-600" : "text-amber-600 font-bold"}>{availableSeats}</span> / {batch.maxStudents || 30}
                        </p>
                      </div>


                      {(isAdmin || user?.role === "teacher") && (
                        <div className="flex flex-col gap-2 mt-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => setViewStudentsBatchId(batch.id)}
                          >
                            <Users className="w-3 h-3 mr-1" /> View Students
                          </Button>
                          {isAdmin && (
                            <>
                              <div className="flex gap-2">
                                <Dialog open={enrollBatchId === batch.id} onOpenChange={(open) => {
                                  setEnrollBatchId(open ? batch.id : null);
                                  setEnrollStudentId("");
                                  setEnrollPaymentType("FULL_PAYMENT");
                                  setEnrollFeesTotal(open ? parseFloat(batch.courseFee || "0") : 0);
                                  setEnrollInstallmentCount(2);
                                  setEnrollInstallments([]);
                                }}>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="flex-1"><UserPlus className="w-3 h-3 mr-1" /> Enroll</Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border">
                                    <DialogHeader><DialogTitle>Enroll Student in {batch.name}</DialogTitle></DialogHeader>
                                    <div className="space-y-3 mt-2">
                                       <div className="space-y-1">
                                         <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Student ID / Union ID *</label>
                                         <Input placeholder="Student ID (e.g. STU-1001)" type="text" value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)} />
                                       </div>

                                       {studentFeeConfigQuery.isLoading && enrollStudentId && (
                                         <div className="p-3 text-xs text-gray-500 text-center animate-pulse">Loading fee configuration...</div>
                                       )}

                                       {studentFeeConfigQuery.data && (
                                         <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-2 text-xs">
                                           <div className="font-semibold text-gray-900 dark:text-gray-100 border-b pb-1">
                                             Student Fee Configuration ({studentFeeConfigQuery.data.studentName})
                                           </div>
                                           <div className="grid grid-cols-2 gap-2 pt-1 text-gray-700 dark:text-gray-300">
                                             <div>Total Course Fee: <span className="font-medium">₹{studentFeeConfigQuery.data.totalCourseFee}</span></div>
                                             <div>Discount: <span className="font-medium text-emerald-600">₹{studentFeeConfigQuery.data.discount}</span></div>
                                             <div>Final Fee: <span className="font-semibold text-gray-900 dark:text-white">₹{studentFeeConfigQuery.data.finalFee}</span></div>
                                             <div>Amount Paid: <span className="font-semibold text-emerald-600">₹{studentFeeConfigQuery.data.amountPaid}</span></div>
                                             <div className="col-span-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 pt-1 border-t mt-1">
                                               Remaining Balance: ₹{studentFeeConfigQuery.data.remainingBalance}
                                             </div>
                                             <div>Payment Mode: <span className="font-medium">{studentFeeConfigQuery.data.paymentMode}</span></div>
                                           </div>
                                           {studentFeeConfigQuery.data.remainingInstallments.length > 0 && (
                                             <div className="mt-2 pt-2 border-t text-[11px]">
                                               <div className="font-semibold text-gray-600 dark:text-gray-400 mb-1">Unpaid Installments ({studentFeeConfigQuery.data.remainingInstallments.length})</div>
                                               {studentFeeConfigQuery.data.remainingInstallments.map((inst, idx) => (
                                                 <div key={idx} className="flex justify-between py-0.5">
                                                   <span>Inst #{inst.installmentNumber || idx + 1} ({inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : 'No due date'}):</span>
                                                   <span className="font-medium">₹{inst.amount}</span>
                                                 </div>
                                               ))}
                                             </div>
                                           )}
                                         </div>
                                       )}

                                       {!studentFeeConfigQuery.data && (
                                         <>
                                           <div className="space-y-1">
                                             <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Payment Mode</label>
                                             <select
                                               className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                                               value={enrollPaymentType}
                                               onChange={(e) => setEnrollPaymentType(e.target.value as any)}
                                             >
                                               <option value="FULL_PAYMENT">Full Payment</option>
                                               <option value="INSTALLMENT">Installment Payment</option>
                                             </select>
                                           </div>

                                           {enrollPaymentType === "INSTALLMENT" && (
                                             <div className="space-y-3 mt-2 border p-3 rounded-lg bg-gray-50/50 dark:bg-slate-900/50">
                                               <div className="space-y-1">
                                                 <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Number of Installments</label>
                                                 <Input
                                                   type="number"
                                                   min={2}
                                                   max={12}
                                                   value={enrollInstallmentCount}
                                                   onChange={(e) => setEnrollInstallmentCount(Math.max(2, Number(e.target.value)))}
                                                 />
                                               </div>
                                               <div className="space-y-2">
                                                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">Installment Schedule</label>
                                                 {enrollInstallments.map((inst, index) => (
                                                   <div key={index} className="grid grid-cols-2 gap-2 border-b pb-2 last:border-b-0">
                                                     <div className="space-y-1">
                                                       <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Installment #{inst.installmentNumber} Amount (₹)</label>
                                                       <Input
                                                         type="number"
                                                         value={inst.amount}
                                                         onChange={(e) => {
                                                           const updated = [...enrollInstallments];
                                                           updated[index].amount = Number(e.target.value);
                                                           setEnrollInstallments(updated);
                                                         }}
                                                       />
                                                     </div>
                                                     <div className="space-y-1">
                                                       <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Due Date (Optional)</label>
                                                       <Input
                                                         type="date"
                                                         value={inst.dueDate || ""}
                                                         onChange={(e) => {
                                                           const updated = [...enrollInstallments];
                                                           updated[index].dueDate = e.target.value;
                                                           setEnrollInstallments(updated);
                                                         }}
                                                       />
                                                     </div>
                                                   </div>
                                                 ))}
                                                 {!isEnrollInstallmentsValid && (
                                                   <p className="text-[11px] text-red-500 font-medium">
                                                     ⚠ Sum of installments (₹{enrollInstallments.reduce((sum, inst) => sum + inst.amount, 0)}) must equal Course Fee (₹{enrollFeesTotal}).
                                                   </p>
                                                 )}
                                               </div>
                                             </div>
                                           )}
                                         </>
                                       )}

                                      <Button
                                        className="w-full bg-emerald-600 mt-2"
                                        onClick={() => {
                                          if (!studentFeeConfigQuery.data && enrollPaymentType === "INSTALLMENT" && !isEnrollInstallmentsValid) {
                                            toast.error("Installment amounts must sum up to the total course fee");
                                            return;
                                          }
                                          enrollStudent.mutate({
                                            batchId: batch.id,
                                            studentId: isNaN(Number(enrollStudentId)) ? enrollStudentId : Number(enrollStudentId),
                                            paymentType: (studentFeeConfigQuery.data?.paymentMode as any) || enrollPaymentType,
                                            feesTotal: studentFeeConfigQuery.data?.finalFee || enrollFeesTotal,
                                            installments: (!studentFeeConfigQuery.data && enrollPaymentType === "INSTALLMENT") ? enrollInstallments : undefined,
                                          });
                                          setEnrollBatchId(null);
                                        }}
                                        disabled={!enrollStudentId || (!studentFeeConfigQuery.data && enrollPaymentType === "INSTALLMENT" && !isEnrollInstallmentsValid)}
                                      >
                                        Enroll
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                <Dialog open={removeBatchId === batch.id} onOpenChange={(open) => { setRemoveBatchId(open ? batch.id : null); setRemoveStudentId(""); }}>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="flex-1 text-red-600 hover:text-red-700"><UserMinus className="w-3 h-3 mr-1" /> Remove</Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader><DialogTitle>Remove Student from {batch.name}</DialogTitle></DialogHeader>
                                    <div className="space-y-3 mt-2">
                                      <Input placeholder="Student ID" type="text" value={removeStudentId} onChange={(e) => setRemoveStudentId(e.target.value)} />
                                      <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => { removeStudent.mutate({ batchId: batch.id, studentId: isNaN(Number(removeStudentId)) ? removeStudentId : Number(removeStudentId) }); setRemoveBatchId(null); }} disabled={!removeStudentId}>Remove</Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => {
                                  if (user?.role !== "super_admin") {
                                    toast.error("Access Denied: Only Super Admin can edit batch details.");
                                    return;
                                  }
                                  setEditBatchData({
                                    id: batch.id,
                                    name: batch.name,
                                    description: batch.description || "",
                                    timeSlot: batch.timeSlot || "",
                                    maxStudents: batch.maxStudents || 30,
                                    teacherId: batch.teacherId || 0,
                                    startDate: batch.startDate ? new Date(batch.startDate).toISOString().split("T")[0] : "",
                                    duration: batch.duration || "",
                                    status: batch.status || "active",
                                    moduleId: batch.moduleId,
                                  });
                                  setOpenEditBatch(true);
                                }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit Batch Details
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {(user?.role === "student" || user?.role === "teacher") && (
          <TabsContent value="my">

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myBatches.data?.map((enrollment) => (
                <Card key={enrollment.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{enrollment.batch?.name}</CardTitle>
                      {user?.role === "teacher" && (
                        <Badge>Teacher</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-600">Module: {enrollment.batch?.module?.name}</p>
                      <p className="text-gray-600">Time: {enrollment.batch?.timeSlot}</p>
                      {user?.role === "student" && (
                        <p className="text-gray-600">Teacher: {enrollment.batch?.teacher?.name || "Not assigned"}</p>
                      )}
                      <Badge variant="secondary">{enrollment.status}</Badge>
                    </div>
                    {user?.role === "teacher" && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setViewStudentsBatchId(enrollment.batchId)}
                        >
                          <Users className="w-3 h-3 mr-1" /> View Students
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Module Dialog */}
      <Dialog open={openEditModule} onOpenChange={setOpenEditModule}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Module</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateModule.mutate({ ...editModuleData, teacherId: editModuleData.teacherId || null, departmentId: Number(editModuleData.departmentId) }); }} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Module Name *</label>
              <Input required placeholder="Module Name" value={editModuleData.name} onChange={(e) => setEditModuleData({ ...editModuleData, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Department *</label>
              <select required className="w-full border rounded-md px-3 py-2 text-sm" value={editModuleData.departmentId} onChange={(e) => setEditModuleData({ ...editModuleData, departmentId: Number(e.target.value) })}>
                <option value="">Select Department</option>
                {departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Description</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Description" rows={3} value={editModuleData.description} onChange={(e) => setEditModuleData({ ...editModuleData, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Learning Objectives</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Learning Objectives" rows={3} value={editModuleData.learningObjectives} onChange={(e) => setEditModuleData({ ...editModuleData, learningObjectives: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Topics/Lessons Included</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Topics/Lessons" rows={3} value={editModuleData.topics} onChange={(e) => setEditModuleData({ ...editModuleData, topics: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Assigned Teacher</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={editModuleData.teacherId} onChange={(e) => setEditModuleData({ ...editModuleData, teacherId: Number(e.target.value) })}>
                  <option value={0}>Select Teacher</option>
                  {teachersQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Duration</label>
                <Input placeholder="e.g. 3 Months" value={editModuleData.duration} onChange={(e) => setEditModuleData({ ...editModuleData, duration: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Min Students</label>
                <Input type="number" value={editModuleData.minStudents} onChange={(e) => setEditModuleData({ ...editModuleData, minStudents: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Max Students</label>
                <Input type="number" value={editModuleData.maxStudents} onChange={(e) => setEditModuleData({ ...editModuleData, maxStudents: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Course Fee (₹)</label>
                <Input type="number" min="0" value={editModuleData.courseFee} onChange={(e) => setEditModuleData({ ...editModuleData, courseFee: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Min Down Payment (₹)</label>
                <Input type="number" min="0" value={editModuleData.minimumDownPayment} onChange={(e) => setEditModuleData({ ...editModuleData, minimumDownPayment: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={editModuleData.status} onChange={(e) => setEditModuleData({ ...editModuleData, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={updateModule.isPending}>
              {updateModule.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Module Dialog */}
      <AlertDialog open={!!deleteModuleId} onOpenChange={(open) => { if (!open) setDeleteModuleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Module</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this module? All batches, scheduled classes, chat messages, and learning materials under this module will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteModuleId && deleteModule.mutate({ moduleId: deleteModuleId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Batch Dialog */}
      <AlertDialog open={!!deleteBatchId} onOpenChange={(open) => { if (!open) setDeleteBatchId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this batch? All scheduled classes, chat messages, and learning materials under this batch will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteBatchId && deleteBatch.mutate({ batchId: deleteBatchId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Students Dialog */}
      <Dialog open={!!viewStudentsBatchId} onOpenChange={(open) => { if (!open) setViewStudentsBatchId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Students in Batch</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {batchStudents.isLoading && <p className="text-sm text-gray-500">Loading students...</p>}
            {batchStudents.data?.length === 0 && <p className="text-sm text-gray-500">No students enrolled in this batch.</p>}
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {batchStudents.data?.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div>
                    <p className="font-semibold text-gray-900">{student.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{student.profile?.enrollmentId || student.unionId}</p>
                    <p className="text-xs text-gray-500">
                      Phone: {student.phone || "-"} | Email: {student.email || "-"}
                      {student.profile && (
                        <>
                          {" | "}
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            1-to-1: {student.profile.remainingOneToOneSessions} left
                          </span>
                          {" | "}
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            Group: {student.profile.remainingGroupSessions} left
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <Badge variant={student.status === "active" ? "default" : "secondary"}>
                    {student.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Batch Fee Dialog */}
      <Dialog open={openEditFeeModal} onOpenChange={setOpenEditFeeModal}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-950 rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
              <Edit className="w-5 h-5 text-emerald-600" />
              Edit Course Fee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 flex gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-400 space-y-1">
                <p className="font-semibold">Important Notice</p>
                <p>Updating the course fee will only apply to future student enrollments and payments. Existing completed payment records will not be changed.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">New Course Fee (₹) *</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 5000"
                className="mt-1"
                value={editFeeValue || ""}
                onChange={(e) => setEditFeeValue(Number(e.target.value))}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setOpenEditFeeModal(false)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={updateBatchFee.isPending}
                onClick={() => {
                  if (editFeeBatchId) {
                    if (editFeeValue <= 0 || isNaN(editFeeValue)) {
                      toast.error("Please enter a positive numeric value for the fee.");
                      return;
                    }
                    updateBatchFee.mutate({ batchId: editFeeBatchId, courseFee: editFeeValue });
                  }
                }}
              >
                {updateBatchFee.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={openEditBatch} onOpenChange={setOpenEditBatch}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-950 rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Edit className="w-5 h-5 text-emerald-600" />
              Edit Batch Details
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            updateBatch.mutate({
              id: editBatchData.id,
              name: editBatchData.name,
              description: editBatchData.description || null,
              timeSlot: editBatchData.timeSlot,
              teacherId: editBatchData.teacherId || null,
              maxStudents: editBatchData.maxStudents,
              status: editBatchData.status,
              moduleId: editBatchData.moduleId,
              startDate: editBatchData.startDate ? new Date(editBatchData.startDate) : null,
              duration: editBatchData.duration || null,
            });
          }} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Select Course/Module *</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={editBatchData.moduleId} onChange={(e) => setEditBatchData({ ...editBatchData, moduleId: Number(e.target.value) })}>
                <option value={0}>Select Module</option>
                {modulesQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Batch Name *</label>
              <Input placeholder="Batch Name" value={editBatchData.name} onChange={(e) => setEditBatchData({ ...editBatchData, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Batch Description</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Batch Description" rows={3} value={editBatchData.description} onChange={(e) => setEditBatchData({ ...editBatchData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Time Slot *</label>
                <Input placeholder="Time Slot" value={editBatchData.timeSlot} onChange={(e) => setEditBatchData({ ...editBatchData, timeSlot: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Max Students</label>
                <Input type="number" placeholder="Max Students" value={editBatchData.maxStudents} onChange={(e) => setEditBatchData({ ...editBatchData, maxStudents: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Assigned Teacher</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={editBatchData.teacherId} onChange={(e) => setEditBatchData({ ...editBatchData, teacherId: Number(e.target.value) })}>
                <option value={0}>Select Teacher (optional)</option>
                {teachersQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Start Date</label>
                <Input type="date" value={editBatchData.startDate} onChange={(e) => setEditBatchData({ ...editBatchData, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Duration</label>
                <Input placeholder="e.g. 3 Months" value={editBatchData.duration} onChange={(e) => setEditBatchData({ ...editBatchData, duration: e.target.value })} />
              </div>
            </div>
            <div>
               <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
               <select className="w-full border rounded-md px-3 py-2 text-sm" value={editBatchData.status} onChange={(e) => setEditBatchData({ ...editBatchData, status: e.target.value })}>
                 <option value="active">Active</option>
                 <option value="inactive">Inactive</option>
               </select>
             </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={updateBatch.isPending}>
              {updateBatch.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Audit Logs Dialog */}
      <Dialog open={openAuditLogs} onOpenChange={setOpenAuditLogs}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-950 rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
              <Clock className="w-5 h-5 text-emerald-600" />
              Batch Modification Audit Logs
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {auditLogsQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading audit logs...</p>
            ) : auditLogsQuery.data?.length === 0 ? (
              <p className="text-sm text-gray-500">No batch modifications recorded yet.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Date & Time</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Super Admin</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Batch</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Field</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Previous Value</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Updated Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                    {auditLogsQuery.data?.map((log: any) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {new Date(log.changedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                          {log.changedByUser?.name}
                        </td>
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                          {log.batch?.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                          {log.fieldName}
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-gray-500 text-xs" title={log.previousValue || ""}>
                          {log.previousValue || <span className="text-gray-400 font-light italic">empty</span>}
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-gray-900 dark:text-gray-100 text-xs font-medium" title={log.newValue || ""}>
                          {log.newValue || <span className="text-gray-400 font-light italic">empty</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
