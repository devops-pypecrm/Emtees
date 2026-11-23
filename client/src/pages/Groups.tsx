import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useClassroom } from "@/components/Classroom";
import { Page, Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, useForm, fmtDT, DEPT_OPTIONS } from "@/lib/kit";

/** Group sessions: one teacher with 2 or 3 students. One class record, separate attendance and credit per student (SRS 9). */
export default function Groups() {
  const { user } = useAuth();
  const canManage = ["admin", "super_admin", "academic_head"].includes(user!.role);
  const q = trpc.lms.groups.useQuery(undefined, { refetchInterval: 20000 });
  const rm = useClassroom(() => q.refetch());
  const teachers = trpc.academic.teachersForDepartment.useQuery(undefined, { enabled: canManage });
  const studs = trpc.lms.studentsForGroup.useQuery(undefined, { enabled: canManage });
  const create = trpc.lms.createGroup.useMutation({ onSuccess: () => { toast.success("Group session created"); q.refetch(); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const more = trpc.lms.scheduleGroupClass.useMutation({ onSuccess: () => { toast.success("Class scheduled"); q.refetch(); setMore(null); }, onError: (e) => toast.error(e.message) });
  const [open, setOpen] = useState(false);
  const [moreFor, setMore] = useState<any | null>(null);
  const [when, setWhen] = useState("");
  const [search, setSearch] = useState("");
  const f = useForm({ name: "", department: "english", teacherId: "", s1: "", s2: "", s3: "", duration: "30", credits: "1", at: "", pay: "", special: "" });
  const opts = (studs.data || []).filter((s: any) => !search || s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 200).map((s: any) => ({ value: s.id, label: `${s.name} (${s.enrollment_id || s.id})` }));

  return (
    <Page title="Group sessions" subtitle="One teacher, two or three students. Attendance and class credits are recorded separately for each student."
      actions={canManage ? <Button onClick={() => { f.reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New group</Button> : undefined}>
      <Table searchable={false} rows={q.data} empty="No group sessions yet"
        cols={[
          { header: "Group", cell: (g: any) => <div><div className="font-medium">{g.name}</div><div className="text-xs text-slate-500">{g.course} · {g.teacherName}</div></div> },
          { header: "Students", cell: (g: any) => g.students.map((s: any) => s.name).join(", ") },
          { header: "Next class", cell: (g: any) => g.nextClass ? <div>{fmtDT(g.nextClass.scheduledAt)}<div className="text-xs text-slate-500">{g.nextClass.duration} min · {g.nextClass.credits} credit(s) each</div></div> : "—" },
          { header: "Status", cell: (g: any) => g.nextClass ? <Chip value={g.nextClass.status} /> : null },
          { header: "", cell: (g: any) => (
            <div className="flex gap-1">
              {g.nextClass && user!.role !== "admin" && user!.role !== "super_admin" && user!.role !== "academic_head" && <Button size="sm" disabled={rm.busy} onClick={() => rm.openGroup({ id: g.nextClass.id, title: g.name, scheduledAt: g.nextClass.scheduledAt })}>{user!.role === "teacher" ? (g.nextClass.status === "ongoing" ? "Rejoin" : "Start class") : "Join"}</Button>}
              {canManage && <Button size="sm" variant="outline" onClick={() => { setMore(g); setWhen(""); }}>Schedule class</Button>}
            </div>) },
        ]} />
      {rm.element}
      <FormDialog wide open={open} onClose={() => setOpen(false)} title="New group session" busy={create.isPending}
        onSubmit={() => { const v = f.v; const ids = [v.s1, v.s2, v.s3].filter(Boolean).map(Number); if (!v.name || !v.teacherId || !v.at) return toast.error("Fill in name, teacher and time"); if (new Set(ids).size < 2) return toast.error("Choose 2 or 3 different students"); create.mutate({ name: v.name, department: v.department as any, teacherId: Number(v.teacherId), studentIds: ids, durationMinutes: Number(v.duration), credits: Number(v.credits), scheduledAt: new Date(v.at), payOverride: v.pay ? Number(v.pay) : undefined, specialConditions: v.special || undefined }); }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Group name"><Input value={f.v.name} onChange={(e) => f.set("name", e.target.value)} /></Field>
          <Field label="Department"><Pick value={f.v.department} onChange={(x) => f.set("department", x)} options={DEPT_OPTIONS} /></Field>
          <Field label="Teacher"><Pick value={f.v.teacherId} onChange={(x) => f.set("teacherId", x)} options={(teachers.data || []).map((t: any) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Date & time"><Input type="datetime-local" value={f.v.at} onChange={(e) => f.set("at", e.target.value)} /></Field>
          <div className="md:col-span-2"><Input placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Field label="Student 1"><Pick value={f.v.s1} onChange={(x) => f.set("s1", x)} options={opts} /></Field>
          <Field label="Student 2"><Pick value={f.v.s2} onChange={(x) => f.set("s2", x)} options={opts} /></Field>
          <Field label="Student 3 (optional)"><Pick value={f.v.s3} onChange={(x) => f.set("s3", x)} options={opts} /></Field>
          <Field label="Duration (min)"><Input inputMode="numeric" value={f.v.duration} onChange={(e) => f.set("duration", e.target.value)} /></Field>
          <Field label="Class credits deducted per student"><Input inputMode="numeric" value={f.v.credits} onChange={(e) => f.set("credits", e.target.value)} /></Field>
          <Field label="Teacher pay for this group (₹)" hint="Leave empty to use the group rate rules."><Input inputMode="decimal" value={f.v.pay} onChange={(e) => f.set("pay", e.target.value)} /></Field>
        </div>
        <Field label="Special payment conditions"><Textarea rows={2} value={f.v.special} onChange={(e) => f.set("special", e.target.value)} /></Field>
      </FormDialog>
      <FormDialog open={!!moreFor} onClose={() => setMore(null)} title={`Schedule class — ${moreFor?.name || ""}`} busy={more.isPending} onSubmit={() => when ? more.mutate({ batchId: moreFor.batchId, scheduledAt: new Date(when) }) : toast.error("Pick date and time")}>
        <Field label="Date & time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      </FormDialog>
    </Page>
  );
}
