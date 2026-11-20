import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Table, Chip, Button, Field, Textarea, Pick, FormDialog, fmtDT } from "@/lib/kit";

const TYPES = [["reschedule", "Class rescheduling"], ["teacher_change", "Teacher change"], ["timing_change", "Timing change"], ["hold", "Temporary course hold"], ["technical", "Technical support"], ["absence", "Report student absence"], ["other", "Other"]];

/** Students and teachers raise requests; heads/admins resolve them (SRS 12.3, 14, 15). */
export default function Requests() {
  const { user } = useAuth();
  const staff = ["admin", "super_admin", "academic_head"].includes(user!.role);
  const mine = trpc.academic.myRequests.useQuery(undefined, { enabled: !staff });
  const all = trpc.academic.requests.useQuery({}, { enabled: staff, refetchInterval: 30000 });
  const create = trpc.academic.createRequest.useMutation({ onSuccess: () => { toast.success("Request sent"); mine.refetch(); setOpen(false); setMsg(""); }, onError: (e) => toast.error(e.message) });
  const resolve = trpc.academic.resolveRequest.useMutation({ onSuccess: () => { all.refetch(); setRes(null); }, onError: (e) => toast.error(e.message) });
  const [open, setOpen] = useState(false); const [type, setType] = useState("reschedule"); const [msg, setMsg] = useState("");
  const [res, setRes] = useState<any | null>(null); const [resp, setResp] = useState("");
  const types = user!.role === "student" ? TYPES.filter((t) => t[0] !== "absence") : TYPES.filter((t) => ["reschedule", "technical", "absence", "other"].includes(t[0]));
  return (
    <Page title="Requests" subtitle={staff ? "Requests routed to you." : "Ask for a change or report a problem. It goes to the right department."}
      actions={!staff ? <Button onClick={() => setOpen(true)}>New request</Button> : undefined}>
      {staff ? (
        <Table rows={all.data} empty="No requests"
          cols={[{ header: "From", cell: (r: any) => <div><div className="font-medium">{r.fromName}</div><div className="text-xs text-slate-500">{r.fromRole}</div></div> }, { header: "Type", cell: (r: any) => r.type.replace("_", " ") }, { header: "Message", cell: (r: any) => r.message }, { header: "When", cell: (r: any) => fmtDT(r.createdAt) }, { header: "Status", cell: (r: any) => <div><Chip value={r.status} />{r.response && <div className="text-xs text-slate-500 mt-1">{r.response}</div>}</div> },
            { header: "", cell: (r: any) => r.status === "open" ? <Button size="sm" variant="outline" onClick={() => { setRes(r); setResp(""); }}>Respond</Button> : null }]} />
      ) : (
        <Table rows={mine.data} empty="You have not sent any requests"
          cols={[{ header: "Type", cell: (r: any) => r.type.replace("_", " ") }, { header: "Message", cell: (r: any) => r.message }, { header: "Sent", cell: (r: any) => fmtDT(r.createdAt) }, { header: "Status", cell: (r: any) => <div><Chip value={r.status} />{r.response && <div className="text-xs text-slate-500 mt-1">{r.response}</div>}</div> }]} />
      )}
      <FormDialog open={open} onClose={() => setOpen(false)} title="New request" busy={create.isPending} submitLabel="Send" onSubmit={() => create.mutate({ type: type as any, message: msg })}>
        <Field label="Type"><Pick value={type} onChange={setType} options={types.map(([v, l]) => ({ value: v, label: l }))} /></Field>
        <Field label="Details"><Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
      </FormDialog>
      <FormDialog open={!!res} onClose={() => setRes(null)} title="Respond to request" submitLabel="Mark resolved" busy={resolve.isPending} onSubmit={() => resolve.mutate({ id: res.id, status: "resolved", response: resp || undefined })}>
        <p className="text-sm text-slate-600">{res?.message}</p>
        <Field label="Response"><Textarea rows={3} value={resp} onChange={(e) => setResp(e.target.value)} /></Field>
        <Button variant="outline" onClick={() => resolve.mutate({ id: res.id, status: "rejected", response: resp || undefined })}>Reject instead</Button>
      </FormDialog>
    </Page>
  );
}
