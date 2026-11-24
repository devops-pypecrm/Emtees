import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button, Field, Pick, FormDialog, Input } from "@/lib/kit";

/** Creates a registration link the student fills in themselves (self-enrolment). Counsellors get their own link; admin and academic head pick the counsellor. */
export default function RegistrationLink({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const own = user!.role === "sales_executive";
  const [open, setOpen] = useState(false);
  const [counsellorId, setCounsellorId] = useState("");
  const [url, setUrl] = useState("");
  const counsellors = trpc.staff.list.useQuery({ role: "counsellor" }, { enabled: open && !own });
  const create = trpc.admissions.createLink.useMutation({ onSuccess: (r) => { setUrl(`${window.location.origin}/register/${r.token}`); onDone?.(); }, onError: (e) => toast.error(e.message) });
  const copy = async () => { await navigator.clipboard.writeText(url); toast.success("Link copied — send it to the student on WhatsApp"); };
  const close = () => { setOpen(false); setUrl(""); setCounsellorId(""); };
  return (
    <>
      <Button variant="outline" onClick={() => (own ? (setOpen(true), create.mutate({})) : setOpen(true))}><Link2 className="h-4 w-4 mr-1.5" />Registration link</Button>
      <FormDialog open={open} onClose={close} title="Student registration link" submitLabel={url ? "Copy link" : "Create link"} busy={create.isPending}
        onSubmit={() => (url ? copy() : counsellorId ? create.mutate({ counsellorId: Number(counsellorId) }) : toast.error("Choose the counsellor"))}>
        {!own && !url && <Field label="Counsellor this student belongs to"><Pick value={counsellorId} onChange={setCounsellorId} options={(counsellors.data || []).map((c: any) => ({ value: c.id2 ?? c.id, label: c.name }))} /></Field>}
        {url && <><p className="text-sm text-slate-500">The student opens this link, fills in the form and uploads the payment receipt. Finance then verifies it. The link works once.</p><Input readOnly value={url} onFocus={(e) => e.target.select()} /></>}
        {own && !url && <p className="text-sm text-slate-500">Creating your link…</p>}
      </FormDialog>
    </>
  );
}
