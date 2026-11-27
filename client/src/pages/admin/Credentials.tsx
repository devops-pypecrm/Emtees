import { useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Download, KeyRound } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ROLE_LABEL } from "@/components/Layout";
import { Page, Table, Button, Input, Field, FormDialog, Chip, fmtDT, exportTable } from "@/lib/kit";

const TABS = [["", "All"], ["student", "Students"], ["teacher", "Teachers"], ["sales_executive", "Counsellors"], ["academic_head", "Academic heads"], ["accountant", "Accountants"], ["admin", "Admins"]] as const;
const LOGIN_URL = `${window.location.origin}/login`;

/** Every login in one place (the client asked for this): username and password, copy, change, export. Admin only. */
export default function Credentials() {
  const q = trpc.staff.credentials.useQuery();
  const save = trpc.staff.setCredentials.useMutation({ onSuccess: () => { toast.success("Credentials updated"); q.refetch(); setEdit(null); }, onError: (e) => toast.error(e.message) });
  const [role, setRole] = useState("");
  const [show, setShow] = useState(true);
  const [edit, setEdit] = useState<any | null>(null);
  const [f, setF] = useState({ username: "", password: "", reason: "" });
  const all: any[] = q.data || [];
  const inRole = (u: any, r: string) => !r || u.role === r || (r === "admin" && u.role === "super_admin");
  const rows = q.data ? all.filter((u) => inRole(u, role)) : undefined;
  const label = (r: string) => ROLE_LABEL[r] || r;
  const copy = async (u: any) => {
    await navigator.clipboard.writeText(`EMTEES Academy login\nName: ${u.name}\nUsername: ${u.username || "-"}\nPassword: ${u.password || "(not stored - set a new one)"}\nLogin: ${LOGIN_URL}`);
    toast.success(`Copied ${u.name}'s login`);
  };
  const exportRows = (kind: "xls" | "csv") => exportTable(`Login credentials${role ? " - " + label(role) : ""}`,
    [{ key: "name", label: "Name" }, { key: "roleLabel", label: "Role" }, { key: "studentId", label: "Student ID" }, { key: "username", label: "Username" }, { key: "password", label: "Password" }, { key: "phone", label: "Mobile" }, { key: "email", label: "Email" }, { key: "status", label: "Status" }],
    (rows || []).map((u) => ({ ...u, roleLabel: label(u.role) })), kind);

  return (
    <Page title="Login credentials" subtitle="Username and password of every account. Copy a login to send it on WhatsApp, or set a new one."
      actions={<>
        <Button variant="outline" onClick={() => setShow((s) => !s)}>{show ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}{show ? "Hide passwords" : "Show passwords"}</Button>
        <Button variant="outline" onClick={() => exportRows("xls")}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
        <Button variant="outline" onClick={() => exportRows("csv")}>CSV</Button>
      </>}>
      <div className="flex flex-wrap gap-2">{TABS.map(([v, l]) => (
        <button key={v} onClick={() => setRole(v)} className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${role === v ? "bg-[#1D2A44] text-white border-[#1D2A44]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          {l} <span className="opacity-60">{q.data ? all.filter((u) => inRole(u, v)).length : ""}</span></button>))}</div>
      <Table rows={rows} empty="No accounts" searchable cols={[
        { header: "Name", cell: (u: any) => <div><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.studentId || u.phone || ""}</div></div>, value: (u: any) => u.name },
        { header: "Role", cell: (u: any) => label(u.role) },
        { header: "Username", cell: (u: any) => <span className="font-mono text-[13px]">{u.username || "—"}</span>, value: (u: any) => u.username },
        { header: "Password", cell: (u: any) => u.password ? <span className="font-mono text-[13px]">{show ? u.password : "••••••"}</span> : <span className="text-xs text-amber-600">Not stored — set a new one</span>, value: (u: any) => u.password || "" },
        { header: "Status", cell: (u: any) => <Chip value={u.status} /> },
        { header: "Last login", cell: (u: any) => u.lastLoginAt ? fmtDT(u.lastLoginAt) : "Never", value: (u: any) => u.lastLoginAt || "" },
        { header: "", nofilter: true, cell: (u: any) => <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="outline" onClick={() => copy(u)}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => { setEdit(u); setF({ username: u.username || "", password: "", reason: "" }); }}><KeyRound className="h-3.5 w-3.5 mr-1" />Edit</Button></div> },
      ]} />
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={`Edit login — ${edit?.name || ""}`} busy={save.isPending}
        onSubmit={() => save.mutate({ id: edit.id, username: f.username && f.username !== edit.username ? f.username : undefined, password: f.password || undefined, reason: f.reason || undefined })}>
        <Field label="Username"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="New password" hint="Leave empty to keep the current one. At least 6 characters."><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Reason (audit log)"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </FormDialog>
    </Page>
  );
}
