import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import DemoRoom from "@/components/DemoRoom";
import { Page, Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, useForm, fmtDT, Stat, StatGrid, DEPT_OPTIONS } from "@/lib/kit";

/** Demo module for counsellors (book), teachers (accept, conduct, complete) and staff (monitor) — SRS 4. */
export default function Demos() {
  const { user } = useAuth();
  const role = user!.role;
  const demos = trpc.lms.demos.useQuery(undefined, { refetchInterval: 30000 });
  const teachers = trpc.lms.demoTeachers.useQuery(undefined, { enabled: role === "sales_executive" || role === "admin" || role === "super_admin" });
  const create = trpc.lms.createDemo.useMutation({ onSuccess: () => { toast.success("Demo booked"); demos.refetch(); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const accept = trpc.lms.acceptDemo.useMutation({ onSuccess: () => demos.refetch() });
  const finish = trpc.lms.finishDemo.useMutation({ onSuccess: () => { toast.success("Demo recorded"); demos.refetch(); setFin(null); }, onError: (e) => toast.error(e.message) });
  const toAdm = trpc.lms.demoToAdmission.useMutation({ onSuccess: (r) => { navigator.clipboard?.writeText(`${window.location.origin}/register/${r.token}`); toast.success("Registration link copied — share it with the student"); demos.refetch(); } });

  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<number | null>(null);
  const [fin, setFin] = useState<any | null>(null);
  const f = useForm({ studentName: "", mobile: "", whatsapp: "", course: "", preferredDate: "", preferredTime: "", teacherId: "" });
  const g = useForm({ attended: "yes", feedback: "", remarks: "" });

  const rows: any[] | undefined = demos.data;
  const done = rows?.filter((d) => d.status === "completed").length ?? 0;
  const conv = rows?.filter((d) => d.convertedToEnrollment).length ?? 0;

  return (
    <Page title="Demo classes" subtitle="20–30 minute one-to-one demos for prospective students."
      actions={(role === "sales_executive" || role === "admin" || role === "super_admin") ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Book a demo</Button> : undefined}>
      <StatGrid><Stat label="Demos" value={rows?.length ?? "…"} /><Stat label="Completed" value={done} tone="good" /><Stat label="Enrolled after demo" value={conv} tone="good" /><Stat label="Pending" value={rows?.filter((d) => d.status === "pending").length ?? 0} tone="warn" /></StatGrid>
      <Table rows={rows} empty="No demo classes yet"
        cols={[
          { header: "Prospect", cell: (d: any) => <div><div className="font-medium">{d.studentName}</div><div className="text-xs text-slate-500">{d.studentPhone}{d.whatsapp && d.whatsapp !== d.studentPhone ? ` · WA ${d.whatsapp}` : ""}</div></div> },
          { header: "When", cell: (d: any) => fmtDT(d.scheduledAt) },
          { header: "Teacher", cell: (d: any) => d.teacherName },
          { header: "Counsellor", cell: (d: any) => d.counsellorName || "—" },
          { header: "Status", cell: (d: any) => <div><Chip value={d.status} />{d.status === "pending" && d.acceptedAt && <div className="text-xs text-slate-500 mt-1">Accepted</div>}{d.studentAttended === false && <div className="text-xs text-red-600 mt-1">Did not attend</div>}{d.convertedToEnrollment && <div className="text-xs text-emerald-700 mt-1">Enrolled ✓</div>}</div> },
          { header: "", cell: (d: any) => (
            <div className="flex flex-wrap gap-1">
              {role === "teacher" && d.status === "pending" && !d.acceptedAt && <Button size="sm" variant="outline" onClick={() => accept.mutate({ id: d.id })}>Accept</Button>}
              {(role === "teacher" || role === "admin" || role === "super_admin") && d.status === "pending" && <Button size="sm" onClick={() => setRoom(d.id)}>Start / join</Button>}
              {role === "teacher" && d.status === "pending" && <Button size="sm" variant="outline" onClick={() => { setFin(d); g.reset(); }}>Complete</Button>}
              {role === "sales_executive" && d.status === "pending" && <Button size="sm" variant="outline" onClick={() => setRoom(d.id)}>Join</Button>}
              {role === "sales_executive" && d.status === "completed" && !d.admissionStatus && <Button size="sm" variant="outline" onClick={() => toAdm.mutate({ demoId: d.id })}>Admission link</Button>}
              {d.admissionStatus && <Chip value={d.admissionStatus} />}
            </div>) },
        ]} />

      <FormDialog open={open} onClose={() => setOpen(false)} title="Book a demo class" busy={create.isPending} submitLabel="Book demo"
        onSubmit={() => { const v = f.v; if (!v.studentName || !v.mobile || !v.course || !v.preferredDate || !v.preferredTime || !v.teacherId) return toast.error("Fill in all fields"); create.mutate({ ...v, course: v.course as any, teacherId: Number(v.teacherId), whatsapp: v.whatsapp || undefined }); }}>
        <Field label="Prospective student's name"><Input value={f.v.studentName} onChange={(e) => f.set("studentName", e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Mobile"><Input value={f.v.mobile} onChange={(e) => f.set("mobile", e.target.value)} /></Field><Field label="WhatsApp"><Input value={f.v.whatsapp} onChange={(e) => f.set("whatsapp", e.target.value)} /></Field></div>
        <Field label="Course requested"><Pick value={f.v.course} onChange={(x) => f.set("course", x)} options={DEPT_OPTIONS} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Preferred date"><Input type="date" value={f.v.preferredDate} onChange={(e) => f.set("preferredDate", e.target.value)} /></Field><Field label="Preferred time"><Input type="time" value={f.v.preferredTime} onChange={(e) => f.set("preferredTime", e.target.value)} /></Field></div>
        <Field label="Demo teacher"><Pick value={f.v.teacherId} onChange={(x) => f.set("teacherId", x)} options={(teachers.data || []).map((t: any) => ({ value: t.id, label: `${t.name}${t.department ? " · " + t.department : ""}` }))} /></Field>
      </FormDialog>

      <FormDialog open={!!fin} onClose={() => setFin(null)} title={`Complete demo — ${fin?.studentName || ""}`} busy={finish.isPending}
        onSubmit={() => finish.mutate({ id: fin.id, attended: g.v.attended === "yes", feedback: g.v.feedback || undefined, remarks: g.v.remarks || undefined })}>
        <Field label="Did the student attend?"><Pick value={g.v.attended} onChange={(x) => g.set("attended", x)} options={[{ value: "yes", label: "Yes, attended" }, { value: "no", label: "No, did not attend" }]} /></Field>
        <Field label="Feedback"><Textarea rows={3} value={g.v.feedback} onChange={(e) => g.set("feedback", e.target.value)} /></Field>
        <Field label="Remarks"><Textarea rows={2} value={g.v.remarks} onChange={(e) => g.set("remarks", e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Demo pay is created only for a completed demo that the student attended.</p>
      </FormDialog>
      {room && <DemoRoom demoId={room} onClose={() => { setRoom(null); demos.refetch(); }} />}
    </Page>
  );
}
