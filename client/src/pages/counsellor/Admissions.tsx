import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Pick, Field, FormDialog, fmtDate, inr, STATUS_LABEL, Stat, StatGrid } from "@/lib/kit";

const linkFor = (t: string) => `${window.location.origin}/register/${t}`;

/** Counsellor home: generate links, follow every admission through the 11 statuses (SRS 3). */
export default function CounsellorAdmissions() {
  const list = trpc.admissions.list.useQuery(undefined, { refetchInterval: 30000 });
  const create = trpc.admissions.createLink.useMutation({ onSuccess: (r) => { list.refetch(); copy(linkFor(r.token)); } });
  const [dep, setDep] = useState("");
  const [open, setOpen] = useState(false);
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Registration link copied"));
  const rows = list.data;
  const n = (s: string) => rows?.filter((r: any) => r.status === s).length ?? 0;
  return (
    <Page title="Admissions" subtitle="Create a registration link, share it on WhatsApp, and follow each admission to activation."
      actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New registration link</Button>}>
      <StatGrid>
        <Stat label="Links waiting" value={n("link_generated")} />
        <Stat label="Payment pending" value={n("payment_pending_verification")} tone="warn" />
        <Stat label="Awaiting teacher" value={n("awaiting_assignment")} />
        <Stat label="Active" value={n("active") + n("teacher_assigned")} tone="good" />
      </StatGrid>
      <Table rows={rows} empty="No admissions yet — create a registration link to start."
        cols={[
          { header: "Student", cell: (r: any) => <div><div className="font-medium">{r.fullName || "— not registered yet —"}</div><div className="text-xs text-slate-500">{r.mobile}</div></div> },
          { header: "Course", cell: (r: any) => r.department ? (r.department === "hindi" ? "Spoken Hindi" : "Spoken English") : "—" },
          { header: "Paid", cell: (r: any) => r.amountPaid ? inr(r.amountPaid) : "—" },
          { header: "Status", cell: (r: any) => <div><Chip value={r.status} />{r.rejectReason && <div className="text-xs text-red-600 mt-1">Rejected: {r.rejectReason}</div>}{r.duplicateOfUserId && !r.duplicateResolved && <div className="text-xs text-amber-700 mt-1">Mobile already exists — admin review</div>}</div> },
          { header: "Created", cell: (r: any) => fmtDate(r.createdAt) },
          { header: "", cell: (r: any) => r.status === "link_generated" ? (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => copy(linkFor(r.token))}><Copy className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" asChild><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent("Please complete your EMTEES Academy registration: " + linkFor(r.token))}`}><MessageCircle className="h-3.5 w-3.5" /></a></Button>
            </div>) : null },
        ]} />
      <FormDialog open={open} onClose={() => setOpen(false)} title="New registration link" submitLabel="Generate link" busy={create.isPending}
        onSubmit={() => create.mutate(dep ? { department: dep as any } : undefined, { onSuccess: () => setOpen(false) })}>
        <Field label="Course (optional)" hint="You can leave this empty; the student chooses it in the form."><Pick value={dep} onChange={setDep} options={[{ value: "english", label: "Spoken English" }, { value: "hindi", label: "Spoken Hindi" }]} /></Field>
        <p className="text-xs text-slate-500">The link is copied automatically. Your counsellor details are attached to it.</p>
      </FormDialog>
    </Page>
  );
}
