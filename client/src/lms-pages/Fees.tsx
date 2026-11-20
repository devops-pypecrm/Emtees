import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Wallet,
  Printer,
  Calendar,
  Download,
  Send,
  Sliders,
} from "lucide-react";

export default function FeesPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>("all");
  const [selectedDueDateFilter, setSelectedDueDateFilter] = useState<string>("");

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  // TRPC queries and mutations
  const paymentsQuery = trpc.admin.listPayments.useQuery(
    isAdmin
      ? {
          status: statusFilter !== "all" ? statusFilter : undefined,
          batchId: selectedBatchFilter !== "all" ? Number(selectedBatchFilter) : undefined,
          dueDate: selectedDueDateFilter ? new Date(selectedDueDateFilter) : undefined,
        }
      : undefined,
    { enabled: isAdmin }
  );

  const myPayments = trpc.student.myPayments.useQuery(
    undefined,
    { enabled: !isAdmin && !!user?.id }
  );

  const myProfile = trpc.user.myProfile.useQuery(undefined, { enabled: !isAdmin });
  const overdueQuery = trpc.admin.listOverdueStudents.useQuery(undefined, { enabled: isAdmin });
  const batchesQuery = trpc.learning.listBatches.useQuery(undefined, { enabled: isAdmin });

  const createPayment = trpc.admin.createPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment record created");
      setOpen(false);
      paymentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPayment = trpc.admin.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      paymentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendManualReminder = trpc.admin.sendManualReminder.useMutation({
    onSuccess: () => {
      toast.success("Manual reminder notification sent to student");
    },
    onError: (err) => toast.error(err.message),
  });

  const adjustStudentFees = trpc.admin.adjustStudentFees.useMutation({
    onSuccess: () => {
      toast.success("Fees & configuration adjusted successfully");
      paymentsQuery.refetch();
      overdueQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const exportQuery = trpc.admin.exportPaymentReport.useQuery(
    {
      batchId: selectedBatchFilter !== "all" ? Number(selectedBatchFilter) : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      format: "excel",
    },
    { enabled: false }
  );


  // Dialog & Form States
  const [form, setForm] = useState({ studentId: 0, amount: 0, type: "tuition", dueDate: "" });
  
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    studentId: 0,
    feesTotal: 0,
    discount: 0,
    discountType: "flat" as "flat" | "percentage",
    paymentMode: "FULL_PAYMENT" as "FULL_PAYMENT" | "INSTALLMENT",
    feesPaid: 0,
    minInitialPayment: 0,
    paymentDueDate: "",
    gracePeriodDays: 7,
  });

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [activePayPaymentId, setActivePayPaymentId] = useState<number | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [openSimulator, setOpenSimulator] = useState(false);
  const [simulatorOrderData, setSimulatorOrderData] = useState<{ orderId: string; amount: number } | null>(null);



  // Constants for student validations
  const balance = myProfile.data?.profile
    ? parseFloat(myProfile.data.profile.feesBalance ?? "0")
    : 0;
  const feesPaid = myProfile.data?.profile
    ? parseFloat(myProfile.data.profile.feesPaid ?? "0")
    : 0;
  const minInitial = myProfile.data?.profile
    ? parseFloat(myProfile.data.profile.minInitialPayment ?? "0")
    : 0;
  const isFirstPayment = feesPaid === 0 && minInitial > 0;
  const minRequiredAmount = isFirstPayment ? Math.min(minInitial, balance) : 0;
  const isAmountValid = payAmount >= (minRequiredAmount || 1) && payAmount <= balance;

  // Actions
  const handleOpenAdjust = (studentId: number, profile?: any, feeConfig?: any) => {
    setAdjustForm({
      studentId,
      feesTotal: feeConfig ? parseFloat(feeConfig.totalCourseFee || "0") : (profile ? parseFloat(profile.totalCourseFee || profile.feesTotal || "0") : 0),
      discount: feeConfig ? parseFloat(feeConfig.discount || "0") : 0,
      discountType: feeConfig?.discountType || "flat",
      paymentMode: feeConfig?.paymentMode || (profile?.paymentOption?.toUpperCase() === "INSTALLMENT" ? "INSTALLMENT" : "FULL_PAYMENT"),
      feesPaid: profile ? parseFloat(profile.feesPaid || "0") : 0,
      minInitialPayment: profile ? parseFloat(profile.minInitialPayment || "0") : 0,
      paymentDueDate: profile?.paymentDueDate ? new Date(profile.paymentDueDate).toISOString().split("T")[0] : "",
      gracePeriodDays: profile?.gracePeriodDays ?? 7,
    });
    setAdjustOpen(true);
  };

  const handleExport = async () => {
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `fee-payment-report-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("JSON payment report exported successfully");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to export report");
    }
  };



  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-emerald-100 text-emerald-700">
            <CheckCircle className="w-3 h-3 mr-1" /> Paid
          </Badge>
        );
      case "unpaid":
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" /> Unpaid
          </Badge>
        );
      case "partial":
        return <Badge className="bg-yellow-100 text-yellow-700">Partial</Badge>;
      case "overdue":
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (!user) return null;

  if (user.role === "academic_head") {
    return (
      <div className="flex flex-col items-center justify-center p-8 py-16 border rounded-xl bg-white space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-gray-800">Access Denied</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Academic Head does not have permission to access financial or payment management.
          </p>
        </div>
      </div>
    );
  }

  if (myProfile.isLoading && !isAdmin) {
    return <div className="p-8 text-center text-gray-500">Loading fee profile...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Student View Header & Banner */}
      {!isAdmin && myProfile.data?.profile && (
        <div className="space-y-6">
          {myProfile.data?.isRestricted && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 shadow-sm animate-pulse rounded-xl">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">Access Restricted Due to Outstanding Fees.</h4>
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Your account access has been restricted due to outstanding dues. Please clear your outstanding balance to regain access to live classes, recorded sessions, group chats, and learning resources.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50/20 to-teal-50/10 dark:from-emerald-950/5 dark:to-slate-900/5 shadow-sm rounded-xl">
            <CardHeader className="pb-2 border-b border-gray-50/50 dark:border-gray-900/50 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                <Wallet className="w-5 h-5 text-emerald-600" /> My Fees & Payment Summary
                {myProfile.data?.enrollments?.[0]?.paymentType === "INSTALLMENT" ? (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ml-2">Installment Payment</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ml-2">Full Payment</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-white dark:bg-gray-950 p-3 rounded-lg border">
                  <p className="text-xs text-gray-500">Total Course Fee</p>
                  <p className="text-xl font-bold text-gray-800 dark:text-gray-200 mt-1">₹{myProfile.data.profile.feesTotal || 0}</p>
                </div>
                <div className="bg-white dark:bg-gray-950 p-3 rounded-lg border">
                  <p className="text-xs text-gray-500">Amount Paid</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">₹{myProfile.data.profile.feesPaid || 0}</p>
                </div>
                <div className="bg-white dark:bg-gray-950 p-3 rounded-lg border">
                  <p className="text-xs text-gray-500">Outstanding Balance</p>
                  <p className="text-xl font-bold text-red-600 mt-1">₹{balance}</p>
                </div>
                <div className="bg-white dark:bg-gray-950 p-3 rounded-lg border">
                  <p className="text-xs text-gray-500">Payment Due Date</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2">
                    {myProfile.data.profile.paymentDueDate ? new Date(myProfile.data.profile.paymentDueDate).toLocaleDateString() : "-"}
                  </p>
                  {myProfile.data.profile.gracePeriodDays ? (
                    <p className="text-[10px] text-gray-400">Grace: {myProfile.data.profile.gracePeriodDays} days</p>
                  ) : null}
                </div>
              </div>

              {isFirstPayment && (
                <div className="mt-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Minimum Initial Payment Requirement: </span>
                    You must pay at least <span className="font-bold">₹{minInitial}</span> for your first installment to activate full access.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Student Installment Schedule Table */}
          {myProfile.data?.enrollments?.[0]?.paymentType === "INSTALLMENT" && (
            <Card className="border shadow-sm rounded-xl">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-blue-600" /> Installment Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Installment #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const tuitionPayments = myPayments.data?.filter(p => p.type === "tuition" && p.installmentNumber !== null) || [];
                      const sortedInst = [...tuitionPayments].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
                      
                      if (sortedInst.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-gray-400 py-4">
                              No installments configured.
                            </TableCell>
                          </TableRow>
                        );
                      }
                      
                      return sortedInst.map((inst) => (
                        <TableRow key={inst.id}>
                          <TableCell className="font-semibold">Installment #{inst.installmentNumber}</TableCell>
                          <TableCell className="font-medium">₹{inst.amount}</TableCell>
                          <TableCell>{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>{getStatusBadge(inst.status)}</TableCell>
                          <TableCell>{inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : (inst.paidAt ? new Date(inst.paidAt).toLocaleDateString() : "-")}</TableCell>
                          <TableCell className="text-right py-2">
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Admin View */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Fee Administration</h3>
              <p className="text-xs text-gray-500">Configure parameters, adjustments, track balances, and export audit reports.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleOpenAdjust(0)} variant="outline" className="border-gray-300 hover:bg-gray-50 text-xs flex items-center gap-1.5 h-9">
                <Sliders className="w-4 h-4 text-gray-500" /> Adjust Student Fees
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5 h-9">
                    <Plus className="w-4 h-4" /> Create Payment Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] md:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
                  <DialogHeader><DialogTitle className="text-base font-bold">Create Fee Invoice Record</DialogTitle></DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createPayment.mutate({
                        ...form,
                        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
                      });
                    }}
                    className="space-y-3 mt-2"
                  >
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Student User ID *</label>
                      <Input type="number" required placeholder="Student ID" value={form.studentId || ""} onChange={(e) => setForm({ ...form, studentId: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Invoice Amount *</label>
                      <Input type="number" required placeholder="Amount" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Payment Type</label>
                      <Input placeholder="tuition/exam/other" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Due Date</label>
                      <Input type="date" placeholder="Due Date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                    </div>
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Create Invoice</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Tabs defaultValue="payments" className="space-y-4">
            <TabsList className="bg-gray-100 dark:bg-slate-900 border p-1 rounded-lg">
              <TabsTrigger value="payments">Payment Records</TabsTrigger>
              <TabsTrigger value="overdue">Overdue Students</TabsTrigger>
            </TabsList>

            <TabsContent value="payments" className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block">Payment Status</label>
                    <select className="border rounded-md px-3 py-1.5 text-xs bg-white dark:bg-gray-950 max-w-[150px] w-full h-8 outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">All Statuses</option>
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="partial">Partial</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block">Batch Filter</label>
                    <select className="border rounded-md px-3 py-1.5 text-xs bg-white dark:bg-gray-950 max-w-[150px] w-full h-8 outline-none" value={selectedBatchFilter} onChange={(e) => setSelectedBatchFilter(e.target.value)}>
                      <option value="all">All Batches</option>
                      {batchesQuery.data?.map((b) => (
                        <option key={b.id} value={String(b.id)}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block">Due Date</label>
                    <Input type="date" className="h-8 text-xs max-w-[150px] py-1" value={selectedDueDateFilter} onChange={(e) => setSelectedDueDateFilter(e.target.value)} />
                  </div>
                </div>

                <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1.5 self-end h-8">
                  <Download className="w-3.5 h-3.5" /> Export Report (JSON)
                </Button>
              </div>

              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  {paymentsQuery.isLoading ? (
                    <p className="text-center text-gray-400 py-10">Loading payments list...</p>
                  ) : !paymentsQuery.data || paymentsQuery.data.length === 0 ? (
                    <p className="text-center text-gray-400 py-10">No payments match selected filters.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Paid At</TableHead>
                          <TableHead>Transaction ID</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentsQuery.data.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-semibold">{p.student?.name}</div>
                              <div className="text-[10px] text-gray-400 font-mono">ID: {p.student?.profile?.enrollmentId || p.student?.unionId}</div>
                            </TableCell>
                            <TableCell>
                              <div>{p.batch?.name || "-"}</div>
                              {p.installmentNumber !== null && (
                                <div className="text-[10px] text-blue-600 font-semibold mt-0.5">Installment #{p.installmentNumber}</div>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">₹{p.amount}</TableCell>
                            <TableCell className="capitalize">{p.type}</TableCell>
                            <TableCell>{getStatusBadge(p.status)}</TableCell>
                            <TableCell>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "-"}</TableCell>
                            <TableCell>{p.paidDate ? new Date(p.paidDate).toLocaleDateString() : (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "-")}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[120px] truncate">{p.transactionId || "-"}</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-1.5 py-3">
                              {p.status !== "paid" && (
                                <Button size="sm" variant="outline" className="h-7 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100 flex items-center" onClick={() => recordPayment.mutate({ paymentId: p.id, amount: Number(p.amount) })}>
                                  <CreditCard className="w-3 h-3 mr-1" /> Record
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 text-[10px] flex items-center" onClick={() => handleOpenAdjust(p.studentId, p.student?.profile, (p.student as any)?.feeConfig)}>
                                <Sliders className="w-3 h-3 mr-1" /> Adjust
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overdue" className="space-y-4">
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  {overdueQuery.isLoading ? (
                    <p className="text-center text-gray-400 py-10">Loading overdue list...</p>
                  ) : !overdueQuery.data || overdueQuery.data.length === 0 ? (
                    <p className="text-center text-emerald-600 py-10 font-medium">✓ No overdue student fee profiles found!</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Course</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Total Fee</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Grace Period</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overdueQuery.data.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>
                              <div className="font-semibold">{o.user?.name}</div>
                              <div className="text-[10px] text-gray-400 font-mono">ID: {o.enrollmentId || o.user?.unionId}</div>
                            </TableCell>
                            <TableCell>{o.course || "-"}</TableCell>
                            <TableCell>{o.batch || "-"}</TableCell>
                            <TableCell>₹{o.feesTotal}</TableCell>
                            <TableCell className="text-emerald-600 font-medium">₹{o.feesPaid}</TableCell>
                            <TableCell className="text-red-600 font-bold">₹{o.feesBalance}</TableCell>
                            <TableCell className="text-red-500 font-medium">{o.paymentDueDate ? new Date(o.paymentDueDate).toLocaleDateString() : "-"}</TableCell>
                            <TableCell>{o.gracePeriodDays} days</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-1.5 py-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-100 flex items-center gap-1"
                                onClick={() => sendManualReminder.mutate({ studentId: o.userId })}
                                disabled={sendManualReminder.isPending}
                              >
                                <Send className="w-3 h-3" /> Remind
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] flex items-center gap-1" onClick={() => handleOpenAdjust(o.userId, o)}>
                                <Sliders className="w-3 h-3" /> Adjust
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* General Table of Payments for Student */}
      {!isAdmin && (
        <Card>
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" /> My Payment Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {myPayments.isLoading ? (
              <p className="text-center text-gray-400 py-10">Loading transactions...</p>
            ) : !myPayments.data || myPayments.data.length === 0 ? (
              <p className="text-center text-gray-400 py-10">No payment transactions recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead>Transaction ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myPayments.data.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.batch?.name || "-"}</TableCell>
                      <TableCell className="font-semibold">₹{p.amount}</TableCell>
                      <TableCell className="capitalize">{p.type}</TableCell>
                      <TableCell>{getStatusBadge(p.status)}</TableCell>
                      <TableCell>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.transactionId || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adjust Student Fees Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="w-[95vw] md:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-800 dark:text-gray-200">Student Fee Configuration</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              adjustStudentFees.mutate({
                studentId: Number(adjustForm.studentId),
                feesTotal: Number(adjustForm.feesTotal),
                discount: Number(adjustForm.discount),
                discountType: adjustForm.discountType,
                paymentMode: adjustForm.paymentMode,
                feesPaid: Number(adjustForm.feesPaid),
                minInitialPayment: Number(adjustForm.minInitialPayment),
                paymentDueDate: adjustForm.paymentDueDate ? new Date(adjustForm.paymentDueDate) : undefined,
                gracePeriodDays: Number(adjustForm.gracePeriodDays),
              });
              setAdjustOpen(false);
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Student User ID *</label>
              <Input type="number" required placeholder="User ID" value={adjustForm.studentId || ""} onChange={(e) => setAdjustForm({ ...adjustForm, studentId: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Total Course Fee (₹)</label>
                <Input type="number" placeholder="Total Fees" value={adjustForm.feesTotal || 0} onChange={(e) => setAdjustForm({ ...adjustForm, feesTotal: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Payment Mode</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm outline-none"
                  value={adjustForm.paymentMode}
                  onChange={(e) => setAdjustForm({ ...adjustForm, paymentMode: e.target.value as any })}
                >
                  <option value="FULL_PAYMENT">Full Payment</option>
                  <option value="INSTALLMENT">Installment</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Discount</label>
                <Input type="number" placeholder="0" value={adjustForm.discount || 0} onChange={(e) => setAdjustForm({ ...adjustForm, discount: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Discount Type</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm outline-none"
                  value={adjustForm.discountType}
                  onChange={(e) => setAdjustForm({ ...adjustForm, discountType: e.target.value as any })}
                >
                  <option value="flat">Flat Amount (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
            </div>

            <div className="p-2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-xs flex justify-between font-medium">
              <span>Calculated Final Fee:</span>
              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                ₹{adjustForm.discountType === "percentage" 
                  ? Math.max(0, adjustForm.feesTotal - (adjustForm.feesTotal * adjustForm.discount / 100))
                  : Math.max(0, adjustForm.feesTotal - adjustForm.discount)}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Minimum Initial Payment (₹)</label>
              <Input type="number" placeholder="Minimum Initial Payment" value={adjustForm.minInitialPayment || 0} onChange={(e) => setAdjustForm({ ...adjustForm, minInitialPayment: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Payment Due Date</label>
              <Input type="date" value={adjustForm.paymentDueDate} onChange={(e) => setAdjustForm({ ...adjustForm, paymentDueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Grace Period (Days)</label>
              <Input type="number" placeholder="7" value={adjustForm.gracePeriodDays || 0} onChange={(e) => setAdjustForm({ ...adjustForm, gracePeriodDays: Number(e.target.value) })} />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold pt-2" disabled={adjustStudentFees.isPending}>
              {adjustStudentFees.isPending ? "Updating..." : "Save Student Fee Configuration"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
