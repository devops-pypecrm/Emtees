import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import StudentDetail from "@/components/StudentDetail";
import { Page, Table, Chip, Input, Button, Field, FormDialog, useForm } from "@/lib/kit";
import { toast } from "sonner";

export default function Students() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const q = trpc.staff.students.useQuery({ search: search || undefined, limit: 150 });
  const upd = trpc.staff.updateStudent.useMutation({ onSuccess: () => { toast.success("Saved"); q.refetch(); setEdit(null); }, onError: (e) => toast.error(e.message) });
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const f = useForm({ name: "", phone: "", email: "", status: "active", password: "", reason: "" });
  const isAdmin = user!.role === "admin" || user!.role === "super_admin";
  const detail = ["admin", "super_admin", "academic_head", "accountant"].includes(user!.role);
  return (
    <Page title="Students" subtitle="Search by name, mobile or Student ID.">
      <div className="max-w-sm"><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Table rows={q.data} empty="No students found" onRow={detail ? (r: any) => setSel(r.id) : undefined}
        cols={[
          { header: "Student ID", cell: (r: any) => r.enrollment_id || "—" }, { header: "Name", cell: (r: any) => <span className="font-medium">{r.name}</span> }, { header: "Mobile", cell: (r: any) => r.phone },
          { header: "Course", cell: (r: any) => r.department || r.course || "—" }, { header: "Counsellor", cell: (r: any) => r.counsellor || "—" }, { header: "Teacher", cell: (r: any) => r.teacher || "—" },
          { header: "Classes", cell: (r: any) => r.allocated ?? 0 }, { header: "Status", cell: (r: any) => <Chip value={r.status} /> },
          ...(isAdmin ? [{ header: "Login", cell: (r: any) => <span className="text-xs">{r.username}<div className="text-slate-500">{r.raw_password}</div></span> }, { header: "", cell: (r: any) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEdit(r); f.setAll({ name: r.name, phone: r.phone || "", email: r.email || "", status: r.status, password: "", reason: "" }); }}>Edit</Button> }] : []),
        ]} />
      {sel && <StudentDetail id={sel} onClose={() => setSel(null)} />}
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.name || ""}`} busy={upd.isPending}
        onSubmit={() => upd.mutate({ id: edit.id, name: f.v.name, phone: f.v.phone, email: f.v.email, status: f.v.status as any, password: f.v.password || undefined, reason: f.v.reason || undefined })}>
        <Field label="Name"><Input value={f.v.name} onChange={(e) => f.set("name", e.target.value)} /></Field>
        <Field label="Mobile"><Input value={f.v.phone} onChange={(e) => f.set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input value={f.v.email} onChange={(e) => f.set("email", e.target.value)} /></Field>
        <Field label="New password" hint="Leave empty to keep it."><Input value={f.v.password} onChange={(e) => f.set("password", e.target.value)} /></Field>
        <Field label="Reason for change (audit log)"><Input value={f.v.reason} onChange={(e) => f.set("reason", e.target.value)} /></Field>
      </FormDialog>
    </Page>
  );
}
