import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, fmtDT, inr, Stat, StatGrid, exportTable } from "@/lib/kit";

const monthRange = (ym: string) => { const [y, m] = ym.split("-").map(Number); return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) }; };

/** Remuneration settlement (SRS 13.5): verify → approve → pay, corrections as separate entries, statements. */
export default function TeacherPay() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const range = monthRange(month);
  const sum = trpc.finance.settlementSummary.useQuery(range);
  const [teacher, setTeacher] = useState<any | null>(null);
  const entries = trpc.finance.entries.useQuery({ teacherId: teacher?.teacherId, ...range }, { enabled: !!teacher });
  const approve = trpc.finance.approveEntries.useMutation({ onSuccess: () => { entries.refetch(); sum.refetch(); toast.success("Approved"); } });
  const pay = trpc.finance.markPaid.useMutation({ onSuccess: (r) => { toast.success(`Recorded ${inr(r.total)} for ${r.paidEntries} entries`); entries.refetch(); sum.refetch(); setPayOpen(false); }, onError: (e) => toast.error(e.message) });
  const corr = trpc.finance.addCorrection.useMutation({ onSuccess: () => { toast.success("Correction added"); entries.refetch(); sum.refetch(); setCorrOpen(false); }, onError: (e) => toast.error(e.message) });
  const [payOpen, setPayOpen] = useState(false), [corrOpen, setCorrOpen] = useState(false);
  const [p, setP] = useState({ date: new Date().toISOString().slice(0, 10), txn: "", method: "" });
  const [c, setC] = useState({ amount: "", reason: "" });
  const canPay = ["admin", "accountant", "super_admin"].includes(user!.role);

  const totals = (sum.data || []).reduce((a: any, r: any) => ({ pending: a.pending + r.pending, approved: a.approved + r.approved, paid: a.paid + r.paid }), { pending: 0, approved: 0, paid: 0 });
  const rows = entries.data || [];
  const download = (kind: "xls" | "pdf") => exportTable(`Statement ${teacher?.name} ${month}`, [
    { key: "when", label: "Date" }, { key: "kind", label: "Type" }, { key: "student", label: "Student" }, { key: "amount", label: "Amount" }, { key: "status", label: "Status" }, { key: "ref", label: "Payment ref" }, { key: "reason", label: "Reason" },
  ], rows.map((e: any) => ({ when: fmtDT(e.earnedAt), kind: e.kind, student: e.studentName || "", amount: e.amount, status: e.status, ref: e.transactionId || "", reason: e.reason || "" })), kind);

  return (
    <Page title="Teacher remuneration" subtitle="Entries are created automatically when a class qualifies, at the rate valid on that day. Corrections are added as separate entries."
      actions={<div className="w-44"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}>
      <StatGrid><Stat label="Pending approval" value={inr(totals.pending)} tone="warn" /><Stat label="Approved, unpaid" value={inr(totals.approved)} /><Stat label="Paid" value={inr(totals.paid)} tone="good" /></StatGrid>
      <Table rows={sum.data} empty="No remuneration entries in this month"
        cols={[{ header: "Teacher", cell: (r: any) => <span className="font-medium">{r.name}</span> }, { header: "Classes", cell: (r: any) => r.classes }, { header: "Pending", cell: (r: any) => inr(r.pending) }, { header: "Approved", cell: (r: any) => inr(r.approved) }, { header: "Paid", cell: (r: any) => inr(r.paid) }, { header: "", cell: (r: any) => <Button size="sm" variant="outline" onClick={() => setTeacher(r)}>Open</Button> }]} />

      <FormDialog wide open={!!teacher} onClose={() => setTeacher(null)} title={`${teacher?.name} — ${month}`} submitLabel="Close" onSubmit={() => setTeacher(null)}>
        <div className="flex flex-wrap gap-2">
          {canPay && <Button size="sm" onClick={() => approve.mutate({ ids: rows.filter((e: any) => e.status === "pending").map((e: any) => e.id) })} disabled={!rows.some((e: any) => e.status === "pending")}>Approve all pending</Button>}
          {canPay && <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} disabled={!rows.some((e: any) => e.status === "approved")}>Record payment</Button>}
          {canPay && <Button size="sm" variant="outline" onClick={() => setCorrOpen(true)}>Add correction</Button>}
          <Button size="sm" variant="outline" onClick={() => download("xls")}>Excel statement</Button>
          <Button size="sm" variant="outline" onClick={() => download("pdf")}>PDF statement</Button>
        </div>
        <Table rows={rows} cols={[{ header: "Date", cell: (e: any) => fmtDT(e.earnedAt) }, { header: "Type", cell: (e: any) => e.kind.replace("_", " ") }, { header: "Student", cell: (e: any) => e.studentName || "—" }, { header: "Amount", cell: (e: any) => inr(e.amount) }, { header: "Status", cell: (e: any) => <Chip value={e.status} /> }, { header: "Note", cell: (e: any) => e.reason || e.transactionId || "" }]} />
      </FormDialog>

      <FormDialog open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" busy={pay.isPending} onSubmit={() => pay.mutate({ teacherId: teacher.teacherId, paymentDate: p.date, transactionId: p.txn, paymentMethod: p.method })}>
        <p className="text-sm text-slate-600">Marks every approved entry of {teacher?.name} as paid.</p>
        <Field label="Payment date"><Input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
        <Field label="Payment method"><Pick value={p.method} onChange={(x) => setP({ ...p, method: x })} options={["Bank transfer", "UPI", "Cash", "Cheque"].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Transaction ID"><Input value={p.txn} onChange={(e) => setP({ ...p, txn: e.target.value })} /></Field>
      </FormDialog>
      <FormDialog open={corrOpen} onClose={() => setCorrOpen(false)} title="Add correction entry" busy={corr.isPending} onSubmit={() => corr.mutate({ teacherId: teacher.teacherId, amount: Number(c.amount), reason: c.reason })}>
        <Field label="Amount (₹, negative to deduct)"><Input inputMode="decimal" value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value })} /></Field>
        <Field label="Reason *"><Textarea rows={2} value={c.reason} onChange={(e) => setC({ ...c, reason: e.target.value })} /></Field>
      </FormDialog>
    </Page>
  );
}
