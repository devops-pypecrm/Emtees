import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Field, Input, Pick, FormDialog, useForm, DEPT_OPTIONS, Textarea, uploadStaffDoc, DOC_TYPES } from "@/lib/kit";
import { useAuth } from "@/hooks/useAuth";

const METHODS = ["Bank transfer", "UPI", "Cash", "Card", "Cheque", "Other"].map((x) => ({ value: x, label: x }));
const blank = {
  name: "", mobile: "", whatsapp: "", email: "", gender: "", dateOfBirth: "", place: "", state: "", country: "India", address: "", postalCode: "", parentName: "", parentPhone: "",
  department: "english", sessionType: "individual", timing: "", counsellorId: "", idMode: "auto", enrollmentId: "", username: "", password: "",
  amountPaid: "", paymentDate: new Date().toISOString().slice(0, 10), method: "Bank transfer", ref: "",
  classes: "", duration: "30", special: "", validity: "", teacherId: "", pay: "",
};

const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="space-y-4 pt-5 first:pt-0 border-t first:border-0 border-slate-100">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1D2A44]">{n}. {title}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

/** Admin adds a student in one go: personal details, enrolment, payment, class allocation and teacher (the original flow). */
export default function AddStudentDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const isAdmin = user!.role === "admin" || user!.role === "super_admin";
  const isCounsellor = user!.role === "sales_executive";
  const f = useForm(blank);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [extra, setExtra] = useState<{ file: File; type: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<any | null>(null);
  const counsellors = trpc.staff.list.useQuery({ role: "counsellor" }, { enabled: open && !isCounsellor && user!.role !== "accountant" });
  const teachers = trpc.academic.teachersForDepartment.useQuery({ department: f.v.department as any }, { enabled: open && isAdmin });
  const add = trpc.admissions.addStudent.useMutation({ onSuccess: (r) => { setCreated(r); onDone(); }, onError: (e) => toast.error(e.message) });
  const set = (k: keyof typeof blank) => (e: any) => f.set(k, e.target.value);
  const close = () => { setCreated(null); f.reset(); setReceipt(null); setExtra([]); onClose(); };

  if (created) return (
    <FormDialog open={open} onClose={close} title="Student added" submitLabel="Done" onSubmit={close}>
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
        <div>Student ID: <b>{created.enrollmentId}</b></div>
        <div>Username: <b>{created.username}</b></div>
        <div>Password: <b>{created.password}</b></div>
      </div>
      <p className="text-sm text-slate-500">Share these login details with the student. {created.status === "payment_pending_verification" ? "The payment now waits for finance to verify it; after that the academic head allocates classes and assigns a teacher." : "The student is now linked to the counsellor, payment and class allocation" + (f.v.teacherId ? " and teacher." : ".")}</p>
    </FormDialog>
  );

  const v = f.v;
  const submit = async () => {
    if (!v.name.trim() || !v.mobile.trim()) return toast.error("Name and mobile number are required");
    if (!isCounsellor && !v.counsellorId) return toast.error("Choose the counsellor who enrolled this student");
    if (!v.timing.trim()) return toast.error("Preferred class timing is required");
    if (v.amountPaid === "") return toast.error("Enter the amount paid (0 if nothing has been paid)");
    if (v.teacherId && !Number(v.classes)) return toast.error("Allocate classes before choosing a teacher");
    let receiptUrl: string | undefined; const documents: { name: string; url: string; type: string }[] = [];
    try {
      setBusy(true);
      if (receipt) receiptUrl = await uploadStaffDoc(receipt);
      for (const d of extra) documents.push({ name: d.file.name, url: await uploadStaffDoc(d.file), type: d.type });
    } catch (e: any) { setBusy(false); return toast.error(e.message); }
    setBusy(false);
    add.mutate({
      receiptUrl, documents, payPerClass: isAdmin && v.pay !== "" ? Number(v.pay) : undefined,
      name: v.name, mobile: v.mobile, whatsapp: v.whatsapp || undefined, email: v.email || undefined, gender: v.gender || undefined, dateOfBirth: v.dateOfBirth || undefined,
      place: v.place || undefined, state: v.state || undefined, country: v.country || undefined, address: v.address || undefined, postalCode: v.postalCode || undefined,
      parentName: v.parentName || undefined, parentPhone: v.parentPhone || undefined,
      department: v.department as any, sessionType: v.sessionType as any, preferredTiming: v.timing, counsellorId: v.counsellorId ? Number(v.counsellorId) : undefined,
      enrollmentId: v.idMode === "manual" ? v.enrollmentId || undefined : undefined, username: v.username || undefined, password: v.password || undefined,
      amountPaid: Number(v.amountPaid), paymentDate: v.paymentDate || undefined, paymentMethod: v.method || undefined, transactionRef: v.ref || undefined,
      classes: isAdmin ? Number(v.classes) || 0 : 0, durationMinutes: Number(v.duration) || 30, specialConditions: v.special || undefined, validityEndDate: v.validity || undefined,
      teacherId: isAdmin && v.teacherId ? Number(v.teacherId) : undefined,
    });
  };

  return (
    <FormDialog wide open={open} onClose={close} title="Add student" submitLabel="Create student" busy={add.isPending || busy} onSubmit={submit}>
      <div className="space-y-6">
        <Section n={1} title="Personal details">
          <Field label="Full name *"><Input value={v.name} onChange={set("name")} /></Field>
          <Field label="Mobile number *"><Input inputMode="tel" value={v.mobile} onChange={set("mobile")} /></Field>
          <Field label="WhatsApp number" hint="Leave empty if same as mobile."><Input inputMode="tel" value={v.whatsapp} onChange={set("whatsapp")} /></Field>
          <Field label="Email"><Input type="email" value={v.email} onChange={set("email")} /></Field>
          <Field label="Gender (optional)"><Pick value={v.gender} onChange={(x) => f.set("gender", x)} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} /></Field>
          <Field label="Date of birth (optional)"><Input type="date" value={v.dateOfBirth} onChange={set("dateOfBirth")} /></Field>
          <Field label="Place"><Input value={v.place} onChange={set("place")} /></Field>
          <Field label="State"><Input value={v.state} onChange={set("state")} /></Field>
          <Field label="Country"><Input value={v.country} onChange={set("country")} /></Field>
          <Field label="Postal code"><Input inputMode="numeric" value={v.postalCode} onChange={set("postalCode")} /></Field>
          <div className="sm:col-span-2"><Field label="Full address"><Textarea rows={2} value={v.address} onChange={set("address")} /></Field></div>
          <Field label="Parent / guardian name"><Input value={v.parentName} onChange={set("parentName")} /></Field>
          <Field label="Parent / guardian phone"><Input inputMode="tel" value={v.parentPhone} onChange={set("parentPhone")} /></Field>
        </Section>

        <Section n={2} title="Enrolment">
          <Field label="Course *"><Pick value={v.department} onChange={(x) => f.set("department", x)} options={DEPT_OPTIONS} /></Field>
          <Field label="Session type *"><Pick value={v.sessionType} onChange={(x) => f.set("sessionType", x)} options={[{ value: "individual", label: "Individual (one-to-one)" }, { value: "group", label: "Group" }]} /></Field>
          <Field label="Preferred class timing *"><Input placeholder="e.g. 7 AM or Evening" value={v.timing} onChange={set("timing")} /></Field>
          {!isCounsellor && <Field label="Enrolled by (counsellor) *"><Pick value={v.counsellorId} onChange={(x) => f.set("counsellorId", x)} options={(counsellors.data || []).map((c: any) => ({ value: c.id2 ?? c.id, label: c.name }))} /></Field>}
          <Field label="Student ID"><Pick value={v.idMode} onChange={(x) => f.set("idMode", x)} options={[{ value: "auto", label: "Generate automatically" }, { value: "manual", label: "Enter manually" }]} /></Field>
          {v.idMode === "manual" && <Field label="Student ID / admission number"><Input value={v.enrollmentId} onChange={(e) => f.set("enrollmentId", e.target.value.toUpperCase())} /></Field>}
          <Field label="Login username" hint="Leave empty to use the Student ID."><Input value={v.username} onChange={set("username")} /></Field>
          <Field label="Login password" hint="Leave empty to generate one."><Input value={v.password} onChange={set("password")} /></Field>
        </Section>

        <Section n={3} title="Payment">
          <Field label="Amount paid (₹) *"><Input inputMode="decimal" value={v.amountPaid} onChange={set("amountPaid")} /></Field>
          <Field label="Payment date"><Input type="date" value={v.paymentDate} onChange={set("paymentDate")} /></Field>
          <Field label="Payment method"><Pick value={v.method} onChange={(x) => f.set("method", x)} options={METHODS} /></Field>
          <Field label="Transaction ID / reference"><Input value={v.ref} onChange={set("ref")} /></Field>
          <div className="sm:col-span-2"><Field label="Payment screenshot / receipt" hint="PNG, JPG, WEBP or PDF, up to 5 MB. Finance uses it to verify the payment."><input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => setReceipt(e.target.files?.[0] || null)} /></Field></div>
          <div className="sm:col-span-2 space-y-2">
            <div className="text-sm font-medium text-slate-700">Other documents (optional)</div>
            {extra.map((d, i) => <div key={i} className="flex items-center gap-2 text-sm"><span className="truncate flex-1">{d.file.name}</span><span className="text-xs text-slate-500">{DOC_TYPES.find((t) => t.value === d.type)?.label}</span><button className="text-red-600 text-xs" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}>Remove</button></div>)}
            <div className="flex flex-wrap items-center gap-2">
              <select id="doctype" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" defaultValue="id_proof">{DOC_TYPES.filter((t) => t.value !== "payment_receipt").map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) setExtra((x) => [...x, { file, type: (document.getElementById("doctype") as HTMLSelectElement).value }]); e.target.value = ""; }} />
            </div>
          </div>
        </Section>

        {isAdmin && <Section n={4} title="Class allocation and teacher">
          <Field label="Total classes" hint="Decided by you — there is no fixed fee-to-class rule."><Input inputMode="numeric" value={v.classes} onChange={set("classes")} /></Field>
          <Field label="Class duration (minutes)"><Input inputMode="numeric" value={v.duration} onChange={set("duration")} /></Field>
          <Field label="Course expiry date" hint="Optional. Otherwise validity starts at the first class."><Input type="date" value={v.validity} onChange={set("validity")} /></Field>
          <Field label="Special conditions"><Input value={v.special} onChange={set("special")} /></Field>
          <div className="sm:col-span-2"><Field label="Assign teacher now (optional)" hint="You can also do this later from Assign teachers.">
            <Pick value={v.teacherId} onChange={(x) => f.set("teacherId", x)} options={(teachers.data || []).map((t: any) => ({ value: t.id, label: `${t.name} · ${t.students} students` }))} /></Field></div>
          {v.teacherId && <div className="sm:col-span-2"><Field label="Teacher pay per class for this student (₹)" hint="Specific to this teacher and this student."><Input inputMode="decimal" value={v.pay} onChange={set("pay")} /></Field></div>}
        </Section>}
        {!isAdmin && <p className="text-sm text-slate-500 rounded-lg bg-slate-50 border border-slate-200 p-3">After you save, finance verifies the payment. Then the academic head allocates the classes, assigns the teacher and sets the teacher's pay for this student.</p>}
      </div>
    </FormDialog>
  );
}
