import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import StudentDetail from "@/components/StudentDetail";
import AddStudentDialog from "@/components/AddStudentDialog";
import { Plus } from "lucide-react";
import { Page, Table, Chip, Input, Button, Field, FormDialog, useForm, Pick, DEPT_OPTIONS } from "@/lib/kit";
import { toast } from "sonner";

export default function Students() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const q = trpc.staff.students.useQuery({ search: search || undefined, limit: 150 });
  const upd = trpc.staff.updateStudent.useMutation({ onSuccess: () => { toast.success("Saved"); q.refetch(); setEdit(null); }, onError: (e) => toast.error(e.message) });
  const [sel, setSel] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const counsellors = trpc.staff.list.useQuery({ role: "counsellor" }, { enabled: user!.role === "admin" || user!.role === "super_admin" });
  const f = useForm({ name: "", phone: "", email: "", status: "active", password: "", reason: "", department: "", sessionType: "", timing: "", counsellorId: "", validity: "" });
  const isAdmin = user!.role === "admin" || user!.role === "super_admin";
  const detail = ["admin", "super_admin", "academic_head", "accountant"].includes(user!.role);
  return (
    <Page title="Students" subtitle="Search by name, mobile or Student ID." actions={isAdmin ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />Add student</Button> : undefined}>
      <div className="max-w-sm"><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Table searchable={false} rows={q.data} empty="No students found" onRow={detail ? (r: any) => setSel(r.id) : undefined}
        cols={[
          { header: "Student ID", cell: (r: any) => r.enrollment_id || "—" }, { header: "Name", cell: (r: any) => <span className="font-medium">{r.name}</span> }, { header: "Mobile", cell: (r: any) => r.phone },
          { header: "Course", cell: (r: any) => r.department || r.course || "—" }, { header: "Counsellor", cell: (r: any) => r.counsellor || "—" }, { header: "Teacher", cell: (r: any) => r.teacher || "—" },
          { header: "Classes", cell: (r: any) => r.allocated ?? 0 }, { header: "Status", cell: (r: any) => <Chip value={r.status} /> },
          ...(isAdmin ? [{ header: "Login", cell: (r: any) => <span className="text-xs">{r.username}<div className="text-slate-500">{r.raw_password}</div></span> }, { header: "", cell: (r: any) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEdit(r); f.setAll({ name: r.name, phone: r.phone || "", email: r.email || "", status: r.status, password: "", reason: "", department: /hindi/i.test(r.department || "") ? "hindi" : r.department ? "english" : "", sessionType: r.session_type === "group" ? "group" : r.session_type ? "individual" : "", timing: r.preferred_class_time || "", counsellorId: r.counsellor_id ? String(r.counsellor_id) : "", validity: r.validity_end_date ? String(r.validity_end_date).slice(0, 10) : "" }); }}>Edit</Button> }] : []),
        ]} />
      {isAdmin && <AddStudentDialog open={adding} onClose={() => setAdding(false)} onDone={() => q.refetch()} />}
      {sel && <StudentDetail id={sel} onClose={() => setSel(null)} />}
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.name || ""}`} busy={upd.isPending}
        onSubmit={() => upd.mutate({ id: edit.id, name: f.v.name, phone: f.v.phone, email: f.v.email, status: f.v.status as any, password: f.v.password || undefined, reason: f.v.reason || undefined, department: (f.v.department || undefined) as any, sessionType: (f.v.sessionType || undefined) as any, preferredTiming: f.v.timing || undefined, counsellorId: f.v.counsellorId ? Number(f.v.counsellorId) : undefined, validityEndDate: f.v.validity || undefined })}>
        <Field label="Name"><Input value={f.v.name} onChange={(e) => f.set("name", e.target.value)} /></Field>
        <Field label="Mobile"><Input value={f.v.phone} onChange={(e) => f.set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input value={f.v.email} onChange={(e) => f.set("email", e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Course"><Pick value={f.v.department} onChange={(x) => f.set("department", x)} options={DEPT_OPTIONS} /></Field>
          <Field label="Session type"><Pick value={f.v.sessionType} onChange={(x) => f.set("sessionType", x)} options={[{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }]} /></Field>
          <Field label="Preferred timing"><Input value={f.v.timing} onChange={(e) => f.set("timing", e.target.value)} /></Field>
          <Field label="Counsellor"><Pick value={f.v.counsellorId} onChange={(x) => f.set("counsellorId", x)} options={(counsellors.data || []).map((c: any) => ({ value: c.id2 ?? c.id, label: c.name }))} /></Field>
        </div>
        <Field label="Course expiry date" hint="Set this for existing students whose validity should follow the 60-day rule."><Input type="date" value={f.v.validity} onChange={(e) => f.set("validity", e.target.value)} /></Field>
        <Field label="New password" hint="Leave empty to keep it."><Input value={f.v.password} onChange={(e) => f.set("password", e.target.value)} /></Field>
        <Field label="Reason for change (audit log)"><Input value={f.v.reason} onChange={(e) => f.set("reason", e.target.value)} /></Field>
      </FormDialog>
    </Page>
  );
}
