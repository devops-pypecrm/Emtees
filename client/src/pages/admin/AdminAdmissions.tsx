import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, fmtDate, inr, STATUS_LABEL, useForm } from "@/lib/kit";

/** Admin view of every admission: manual class allocation after verification (SRS 5.2), duplicates, status. */
export default function AdminAdmissions() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const list = trpc.admissions.list.useQuery({ status: status || undefined, search: search || undefined });
  const hist = trpc.admissions.history.useQuery({ admissionId: 0 }, { enabled: false });
  const allocate = trpc.admissions.allocate.useMutation({ onSuccess: () => { toast.success("Classes allocated"); list.refetch(); setSel(null); }, onError: (e) => toast.error(e.message) });
  const resolve = trpc.admissions.resolveDuplicate.useMutation({ onSuccess: () => list.refetch(), onError: (e) => toast.error(e.message) });
  const setSt = trpc.admissions.setStatus.useMutation({ onSuccess: () => { list.refetch(); setSt2(null); }, onError: (e) => toast.error(e.message) });
  const [sel, setSel] = useState<any | null>(null);
  const [st2, setSt2] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState(""); const [why, setWhy] = useState("");
  const f = useForm({ classes: "", duration: "30", sessionType: "individual", special: "", amount: "" });
  const [timeline, setTimeline] = useState<number | null>(null);
  const tl = trpc.admissions.history.useQuery({ admissionId: timeline || 0 }, { enabled: !!timeline });

  return (
    <Page title="Admissions" subtitle="Every admission from registration link to completion.">
      <div className="flex flex-wrap gap-3"><div className="w-64"><Pick value={status} onChange={setStatus} placeholder="All statuses" options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} /></div><Input className="w-64" placeholder="Search name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Table rows={list.data} empty="No admissions"
        cols={[
          { header: "Student", cell: (r: any) => <div><div className="font-medium">{r.fullName || "— link only —"}</div><div className="text-xs text-slate-500">{r.mobile}</div></div> },
          { header: "Counsellor", cell: (r: any) => r.counsellorName }, { header: "Course", cell: (r: any) => r.department || "—" },
          { header: "Paid / verified", cell: (r: any) => r.amountPaid ? `${inr(r.amountPaid)} / ${r.verifiedAmount ? inr(r.verifiedAmount) : "—"}` : "—" },
          { header: "Status", cell: (r: any) => <div><button onClick={() => setTimeline(r.id)}><Chip value={r.status} /></button>{r.duplicateOfUserId && !r.duplicateResolved && <div className="text-xs text-amber-700 mt-1">Duplicate mobile</div>}</div> },
          { header: "Date", cell: (r: any) => fmtDate(r.createdAt) },
          { header: "", cell: (r: any) => (
            <div className="flex flex-wrap gap-1">
              {r.duplicateOfUserId && !r.duplicateResolved && <Button size="sm" variant="outline" onClick={() => resolve.mutate({ admissionId: r.id, useExisting: true })}>Link to existing</Button>}
              {r.studentUserId && ["awaiting_assignment", "payment_verified"].includes(r.status) && <Button size="sm" onClick={() => { setSel(r); f.reset(); }}>Allocate classes</Button>}
              <Button size="sm" variant="outline" onClick={() => { setSt2(r); setNewStatus(""); setWhy(""); }}>Status</Button>
            </div>) },
        ]} />
      <FormDialog open={!!sel} onClose={() => setSel(null)} title={`Allocate classes — ${sel?.fullName || ""}`} busy={allocate.isPending}
        onSubmit={() => allocate.mutate({ studentUserId: sel.studentUserId, admissionId: sel.id, kind: "initial", classes: Number(f.v.classes), durationMinutes: Number(f.v.duration), sessionType: f.v.sessionType as any, amount: sel.verifiedAmount ? Number(sel.verifiedAmount) : undefined, specialConditions: f.v.special || undefined })}>
        <p className="text-xs text-slate-500">No fixed fee-to-class rule: you decide the number of classes from the amount paid ({sel?.verifiedAmount ? inr(sel.verifiedAmount) : "—"}), duration, package and any special offer.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Total classes"><Input inputMode="numeric" value={f.v.classes} onChange={(e) => f.set("classes", e.target.value)} /></Field>
          <Field label="Class duration (min)"><Input inputMode="numeric" value={f.v.duration} onChange={(e) => f.set("duration", e.target.value)} /></Field>
          <Field label="Session type"><Pick value={f.v.sessionType} onChange={(x) => f.set("sessionType", x)} options={[{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }]} /></Field>
          <Field label="Special conditions"><Input value={f.v.special} onChange={(e) => f.set("special", e.target.value)} /></Field>
        </div>
        <p className="text-xs text-slate-500">Validity (60 days) starts at the first actual class and the expiry date is calculated automatically.</p>
      </FormDialog>
      <FormDialog open={!!st2} onClose={() => setSt2(null)} title="Change admission status" busy={setSt.isPending} onSubmit={() => setSt.mutate({ admissionId: st2.id, status: newStatus as any, reason: why || undefined })}>
        <Field label="New status"><Pick value={newStatus} onChange={setNewStatus} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Reason"><Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      </FormDialog>
      <FormDialog open={!!timeline} onClose={() => setTimeline(null)} title="Status history" submitLabel="Close" onSubmit={() => setTimeline(null)}>
        <ol className="space-y-2 text-sm">{(tl.data || []).map((h: any) => <li key={h.id} className="border-l-2 pl-3"><Chip value={h.toStatus} /> <span className="text-slate-500 text-xs ml-2">{fmtDate(h.createdAt)}</span>{h.note && <div className="text-xs text-slate-600">{h.note}</div>}</li>)}</ol>
      </FormDialog>
    </Page>
  );
}
