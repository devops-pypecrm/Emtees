import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Field, Input, Textarea, FormDialog, fmtDate, inr, Stat, StatGrid, Pick } from "@/lib/kit";

/** Accountant dashboard: verify every registration payment before assignment (SRS 5.1). */
export default function Payments() {
  const [status, setStatus] = useState("payment_pending_verification");
  const list = trpc.admissions.list.useQuery({ status: status || undefined }, { refetchInterval: 30000 });
  const verify = trpc.admissions.verifyPayment.useMutation({ onSuccess: () => { toast.success("Saved"); list.refetch(); setSel(null); }, onError: (e) => toast.error(e.message) });
  const resolve = trpc.admissions.resolveDuplicate.useMutation({ onSuccess: () => { list.refetch(); }, onError: (e) => toast.error(e.message) });
  const [sel, setSel] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const pending = status === "payment_pending_verification" ? list.data?.length : undefined;

  return (
    <Page title="Payment verification" subtitle="Check the receipt against the bank record, enter the verified amount, then approve or reject.">
      <StatGrid><Stat label="Awaiting verification" value={pending ?? "…"} tone="warn" /></StatGrid>
      <div className="max-w-xs"><Pick value={status} onChange={setStatus} placeholder="All admissions"
        options={[{ value: "payment_pending_verification", label: "Awaiting verification" }, { value: "awaiting_assignment", label: "Verified — awaiting assignment" }, { value: "registration_completed", label: "Rejected / incomplete" }, { value: "active", label: "Active" }]} /></div>
      <Table rows={list.data} empty="No payments in this list"
        cols={[
          { header: "Student", cell: (r: any) => <div><div className="font-medium">{r.fullName || "—"}</div><div className="text-xs text-slate-500">{r.mobile}</div></div> },
          { header: "Counsellor", cell: (r: any) => <div>{r.counsellorName}<div className="text-xs text-slate-500">{r.counsellorEmpId} · {r.counsellorPhone}</div></div> },
          { header: "Payment", cell: (r: any) => <div><div className="font-medium">{inr(r.amountPaid)}</div><div className="text-xs text-slate-500">{r.paymentMethod} · {r.transactionRef} · {r.paymentDate}</div></div> },
          { header: "Receipt", cell: (r: any) => r.receiptUrl ? <a className="text-blue-600 underline" target="_blank" rel="noreferrer" href={r.receiptUrl}>View</a> : "—" },
          { header: "Status", cell: (r: any) => <div><Chip value={r.status} />{r.verifiedAmount && <div className="text-xs text-slate-500 mt-1">Verified {inr(r.verifiedAmount)}</div>}{r.rejectReason && <div className="text-xs text-red-600 mt-1">{r.rejectReason}</div>}</div> },
          { header: "", cell: (r: any) => r.status === "payment_pending_verification" ? (
            r.duplicateOfUserId && !r.duplicateResolved
              ? <Button size="sm" variant="outline" onClick={() => toast.info("Duplicate mobile — an administrator must resolve it first")}>Duplicate</Button>
              : <div className="flex gap-1"><Button size="sm" onClick={() => { setSel(r); setAmount(String(r.amountPaid)); setReason(""); setMode("approve"); }}>Verify</Button><Button size="sm" variant="outline" onClick={() => { setSel(r); setReason(""); setMode("reject"); }}>Reject</Button></div>) : null },
        ]} />
      <FormDialog open={!!sel} onClose={() => setSel(null)} title={mode === "approve" ? "Approve payment" : "Reject payment"} busy={verify.isPending} submitLabel={mode === "approve" ? "Approve" : "Reject"}
        onSubmit={() => verify.mutate({ admissionId: sel.id, approve: mode === "approve", verifiedAmount: mode === "approve" ? Number(amount) : undefined, reason: reason || undefined })}>
        {sel && <div className="text-sm text-slate-600">{sel.fullName} · claimed {inr(sel.amountPaid)} via {sel.paymentMethod} (ref {sel.transactionRef})</div>}
        {mode === "approve" && <Field label="Verified amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        <Field label={mode === "approve" ? "Note (optional)" : "Reason for rejecting *"}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormDialog>
      {/* Admins resolve duplicates from here too */}
      <DuplicateStrip rows={list.data} onResolve={(id) => resolve.mutate({ admissionId: id, useExisting: true })} />
    </Page>
  );
}

function DuplicateStrip({ rows, onResolve }: { rows: any[] | undefined; onResolve: (id: number) => void }) {
  const dups = (rows || []).filter((r) => r.duplicateOfUserId && !r.duplicateResolved);
  if (!dups.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm space-y-2">
      <div className="font-medium text-amber-900">Duplicate mobile numbers ({dups.length}) — an administrator must link each to the existing student</div>
      {dups.map((d) => <div key={d.id} className="flex items-center justify-between gap-2"><span>{d.fullName} · {d.mobile}</span><Button size="sm" variant="outline" onClick={() => onResolve(d.id)}>Link to existing student</Button></div>)}
    </div>
  );
}
