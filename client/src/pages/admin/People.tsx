import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Input, Field, Pick, FormDialog, useForm, fmtDate } from "@/lib/kit";
import { ROLE_LABEL } from "@/components/Layout";

const ROLE_OPTS = [{ value: "teacher", label: "Teacher" }, { value: "counsellor", label: "Academic Counsellor" }, { value: "academic_head", label: "Academic Head" }, { value: "accountant", label: "Accountant" }, { value: "admin", label: "Administrator" }];
const DEPT_MULTI = [{ value: "english", label: "Spoken English only" }, { value: "hindi", label: "Spoken Hindi only" }, { value: "english,hindi", label: "Both English and Hindi" }];

/** Staff management: teachers, counsellors, heads, accountants, admins (SRS 19, 3.1, 12.4). */
export default function People() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const list = trpc.staff.list.useQuery({ role: role || undefined, search: search || undefined });
  const create = trpc.staff.create.useMutation({ onSuccess: (r) => { toast.success(`Created — employee ID ${r.employeeId}`); list.refetch(); setOpen(false); f.reset(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.staff.update.useMutation({ onSuccess: () => { toast.success("Saved"); list.refetch(); setEdit(null); }, onError: (e) => toast.error(e.message) });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const f = useForm({ role: "teacher", name: "", username: "", password: "", phone: "", whatsapp: "", email: "", dept: "english", qualification: "", languages: "", team: "", joiningDate: "", employeeId: "" });
  const e = useForm({ name: "", phone: "", whatsapp: "", email: "", password: "", status: "active", dept: "", qualification: "", team: "" });
  const needsDept = f.v.role === "teacher" || f.v.role === "academic_head";
  const showDept = (v: any) => (v.departments ? String(v.departments).split(",").filter(Boolean).map((d: string) => (d === "hindi" ? "Hindi" : "English")).join(" + ") : "—");

  return (
    <Page title="Staff" subtitle="Teachers, counsellors, academic heads, accountants and administrators."
      actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add staff</Button>}>
      <div className="flex flex-wrap gap-3 max-w-xl"><div className="w-52"><Pick value={role} onChange={setRole} placeholder="All roles" options={ROLE_OPTS} /></div><Input className="w-64" placeholder="Search name, phone, username" value={search} onChange={(x) => setSearch(x.target.value)} /></div>
      <Table rows={list.data} empty="No staff found"
        cols={[
          { header: "Name", cell: (u: any) => <div><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.employeeId || ""}</div></div> },
          { header: "Role", cell: (u: any) => ROLE_LABEL[u.role === "counsellor" ? "sales_executive" : u.role] || u.role },
          { header: "Dept", cell: showDept }, { header: "Contact", cell: (u: any) => <div className="text-xs">{u.phone}<div>{u.email}</div></div> },
          { header: "Login", cell: (u: any) => <div className="text-xs">{u.username}<div className="text-slate-500">{u.rawPassword}</div></div> },
          { header: "Joined", cell: (u: any) => u.joiningDate || "—" }, { header: "Status", cell: (u: any) => <Chip value={u.status} /> },
          { header: "", cell: (u: any) => <Button size="sm" variant="outline" onClick={() => { setEdit(u); e.setAll({ name: u.name, phone: u.phone || "", whatsapp: u.whatsapp || "", email: u.email || "", password: "", status: u.status, dept: u.departments || "", qualification: u.qualification || "", team: u.team || "" }); }}>Edit</Button> },
        ]} />

      <FormDialog wide open={open} onClose={() => setOpen(false)} title="Add staff member" busy={create.isPending}
        onSubmit={() => { const v = f.v; create.mutate({ role: v.role as any, name: v.name, username: v.username, password: v.password, phone: v.phone, whatsapp: v.whatsapp || undefined, email: v.email || undefined, departments: needsDept ? (v.dept.split(",") as any) : [], qualification: v.qualification || undefined, languages: v.languages || undefined, team: v.team || undefined, joiningDate: v.joiningDate || undefined, employeeId: v.employeeId || undefined }); }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Role"><Pick value={f.v.role} onChange={(x) => f.set("role", x)} options={ROLE_OPTS} /></Field>
          {needsDept && <Field label="Department" hint={f.v.role === "academic_head" ? "A head belongs to one department." : "Teachers can handle one or both."}><Pick value={f.v.dept} onChange={(x) => f.set("dept", x)} options={f.v.role === "academic_head" ? DEPT_MULTI.slice(0, 2) : DEPT_MULTI} /></Field>}
          <Field label="Full name"><Input value={f.v.name} onChange={(x) => f.set("name", x.target.value)} /></Field>
          <Field label="Employee ID" hint="Leave empty to generate."><Input value={f.v.employeeId} onChange={(x) => f.set("employeeId", x.target.value)} /></Field>
          <Field label="Mobile"><Input value={f.v.phone} onChange={(x) => f.set("phone", x.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={f.v.whatsapp} onChange={(x) => f.set("whatsapp", x.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.v.email} onChange={(x) => f.set("email", x.target.value)} /></Field>
          <Field label="Date of joining"><Input type="date" value={f.v.joiningDate} onChange={(x) => f.set("joiningDate", x.target.value)} /></Field>
          <Field label="Username"><Input value={f.v.username} onChange={(x) => f.set("username", x.target.value)} /></Field>
          <Field label="Password"><Input value={f.v.password} onChange={(x) => f.set("password", x.target.value)} /></Field>
          {(f.v.role === "teacher") && <><Field label="Qualification"><Input value={f.v.qualification} onChange={(x) => f.set("qualification", x.target.value)} /></Field><Field label="Languages handled"><Input value={f.v.languages} onChange={(x) => f.set("languages", x.target.value)} placeholder="English, Hindi, Malayalam" /></Field></>}
          {f.v.role === "counsellor" && <Field label="Team / department"><Input value={f.v.team} onChange={(x) => f.set("team", x.target.value)} /></Field>}
        </div>
      </FormDialog>

      <FormDialog wide open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.name || ""}`} busy={update.isPending}
        onSubmit={() => update.mutate({ id: edit.id, name: e.v.name, phone: e.v.phone, whatsapp: e.v.whatsapp, email: e.v.email, password: e.v.password || undefined, status: e.v.status as any, qualification: e.v.qualification, team: e.v.team, departments: e.v.dept ? (e.v.dept.split(",") as any) : undefined })}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Name"><Input value={e.v.name} onChange={(x) => e.set("name", x.target.value)} /></Field>
          <Field label="Status"><Pick value={e.v.status} onChange={(x) => e.set("status", x)} options={["active", "inactive", "suspended", "on_hold"].map((x) => ({ value: x, label: x.replace("_", " ") }))} /></Field>
          <Field label="Mobile"><Input value={e.v.phone} onChange={(x) => e.set("phone", x.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={e.v.whatsapp} onChange={(x) => e.set("whatsapp", x.target.value)} /></Field>
          <Field label="Email"><Input value={e.v.email} onChange={(x) => e.set("email", x.target.value)} /></Field>
          <Field label="New password" hint="Leave empty to keep the current one."><Input value={e.v.password} onChange={(x) => e.set("password", x.target.value)} /></Field>
          {edit && (edit.role === "teacher" || edit.role === "academic_head") && <Field label="Department"><Pick value={e.v.dept} onChange={(x) => e.set("dept", x)} options={DEPT_MULTI} /></Field>}
          <Field label="Qualification"><Input value={e.v.qualification} onChange={(x) => e.set("qualification", x.target.value)} /></Field>
        </div>
      </FormDialog>
    </Page>
  );
}
