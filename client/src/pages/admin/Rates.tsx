import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Field, Input, Pick, FormDialog, inr, DEPT_OPTIONS } from "@/lib/kit";

/** Remuneration rules (SRS 13.2): teacher / student / course / session / duration / group-wise. Most specific rule wins. */
export default function Rates() {
  const rules = trpc.finance.rules.useQuery();
  const teachers = trpc.staff.list.useQuery({ role: "teacher" });
  const save = trpc.finance.saveRule.useMutation({ onSuccess: () => { toast.success("Rule saved"); rules.refetch(); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<any>({ kind: "regular", amount: "", teacherId: "", course: "", sessionType: "", groupSize: "", durationMinutes: "", reason: "" });
  const sp = (k: string, v: any) => setR((p: any) => ({ ...p, [k]: v }));
  const n = (v: any) => (v === "" || v == null ? null : Number(v));
  return (
    <Page title="Pay rates" subtitle="Defaults are set in Settings. Add a rule to override them for a teacher, course, session type or duration — the most specific rule wins. Already-recorded pay never changes."
      actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add rule</Button>}>
      <Table rows={rules.data} empty="No rules yet — the default rates from Settings apply to everyone."
        cols={[
          { header: "Applies to", cell: (x: any) => <div className="text-sm">{[x.teacherName && `Teacher: ${x.teacherName}`, x.studentName && `Student: ${x.studentName}`, x.course && DEPT_OPTIONS.find((d) => d.value === x.course)?.label, x.sessionType && (x.sessionType === "group" ? `Group${x.groupSize ? " of " + x.groupSize : ""}` : "Individual"), x.durationMinutes && `${x.durationMinutes} min`].filter(Boolean).join(" · ") || "Everyone"}</div> },
          { header: "Type", cell: (x: any) => x.kind.replace("_", " ") }, { header: "Amount", cell: (x: any) => <b>{inr(x.amount)}</b> },
          { header: "Active", cell: (x: any) => <Chip value={x.active ? "active" : "cancelled"} label={x.active ? "Active" : "Off"} /> },
          { header: "", cell: (x: any) => <Button size="sm" variant="outline" onClick={() => save.mutate({ id: x.id, teacherId: x.teacherId, studentUserId: x.studentUserId, course: x.course, sessionType: x.sessionType, groupSize: x.groupSize, durationMinutes: x.durationMinutes, kind: x.kind, amount: Number(x.amount), active: !x.active, reason: "Toggled" })}>{x.active ? "Turn off" : "Turn on"}</Button> },
        ]} />
      <FormDialog wide open={open} onClose={() => setOpen(false)} title="New remuneration rule" busy={save.isPending}
        onSubmit={() => { if (!r.amount) return toast.error("Enter the amount"); save.mutate({ kind: r.kind, amount: Number(r.amount), teacherId: n(r.teacherId), course: r.course || null, sessionType: r.sessionType || null, groupSize: n(r.groupSize), durationMinutes: n(r.durationMinutes), reason: r.reason || undefined }); }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Pay type"><Pick value={r.kind} onChange={(x) => sp("kind", x)} options={[{ value: "regular", label: "Class" }, { value: "demo", label: "Demo completed" }, { value: "demo_bonus", label: "Demo conversion bonus" }]} /></Field>
          <Field label="Amount (₹)"><Input inputMode="decimal" value={r.amount} onChange={(e) => sp("amount", e.target.value)} /></Field>
          <Field label="Teacher (optional)"><Pick value={r.teacherId} onChange={(x) => sp("teacherId", x)} placeholder="Any teacher" options={(teachers.data || []).map((t: any) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Course (optional)"><Pick value={r.course} onChange={(x) => sp("course", x)} placeholder="Any course" options={DEPT_OPTIONS} /></Field>
          <Field label="Session type (optional)"><Pick value={r.sessionType} onChange={(x) => sp("sessionType", x)} placeholder="Any" options={[{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }]} /></Field>
          <Field label="Group size (optional)"><Pick value={r.groupSize} onChange={(x) => sp("groupSize", x)} placeholder="Any" options={[{ value: 2, label: "2 students" }, { value: 3, label: "3 students" }]} /></Field>
          <Field label="Duration in minutes (optional)"><Input inputMode="numeric" value={r.durationMinutes} onChange={(e) => sp("durationMinutes", e.target.value)} placeholder="e.g. 30" /></Field>
          <Field label="Reason / note"><Input value={r.reason} onChange={(e) => sp("reason", e.target.value)} /></Field>
        </div>
      </FormDialog>
    </Page>
  );
}
