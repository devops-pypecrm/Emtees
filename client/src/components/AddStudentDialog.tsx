import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Field, Input, Pick, FormDialog, useForm, DEPT_OPTIONS, Textarea } from "@/lib/kit";

const METHODS = ["Bank transfer", "UPI", "Cash", "Card", "Cheque", "Other"].map((x) => ({ value: x, label: x }));
const blank = {
  name: "", mobile: "", whatsapp: "", email: "", gender: "", dateOfBirth: "", place: "", state: "", country: "India", address: "", postalCode: "", parentName: "", parentPhone: "",
  department: "english", sessionType: "individual", timing: "", counsellorId: "", idMode: "auto", enrollmentId: "", username: "", password: "",
  amountPaid: "", paymentDate: new Date().toISOString().slice(0, 10), method: "Bank transfer", ref: "",
  classes: "", duration: "30", special: "", validity: "", teacherId: "",
};

const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="space-y-4 pt-5 first:pt-0 border-t first:border-0 border-slate-100">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1D2A44]">{n}. {title}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

/** Admin adds a student in one go: personal details, enrolment, payment, class allocation and teacher (the original flow). */
export default function AddStudentDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const f = useForm(blank);
  const [created, setCreated] = useState<any | null>(null);
  const counsellors = trpc.staff.list.useQuery({ role: "counsellor" }, { enabled: open });
  const teachers = trpc.academic.teachersForDepartment.useQuery({ department: f.v.department as any }, { enabled: open });
  const add = trpc.admissions.addStudent.useMutation({ onSuccess: (r) => { setCreated(r); onDone(); }, onError: (e) => toast.error(e.message) });
  const set = (k: keyof typeof blank) => (e: any) => f.set(k, e.target.value);
  const close = () => { setCreated(null); f.reset(); onClose(); };

  if (created) return (
    <FormDialog open={open} onClose={close} title="Student added" submitLabel="Done" onSubmit={close}>
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
        <div>Student ID: <b>{created.enrollmentId}</b></div>
        <div>Username: <b>{created.username}</b></div>
        <div>Password: <b>{created.password}</b></div>
      </div>
      <p className="text-sm text-slate-500">Share these login details with the student. The student is now linked to the counsellor, payment and class allocation{f.v.teacherId ? " and teacher" : ""}.</p>
    </FormDialog>
  );

  const v = f.v;
  const submit = () => {
    if (!v.name.trim() || !v.mobile.trim()) return toast.error("Name and mobile number are required");
    if (!v.counsellorId) return toast.error("Choose the counsellor who enrolled this student");
    if (!v.timing.trim()) return toast.error("Preferred class timing is required");
    if (v.amountPaid === "") return toast.error("Enter the amount paid (0 if nothing has been paid)");
    if (v.teacherId && !Number(v.classes)) return toast.error("Allocate classes before choosing a teacher");
    add.mutate({
      name: v.name, mobile: v.mobile, whatsapp: v.whatsapp || undefined, email: v.email || undefined, gender: v.gender || undefined, dateOfBirth: v.dateOfBirth || undefined,
      place: v.place || undefined, state: v.state || undefined, country: v.country || undefined, address: v.address || undefined, postalCode: v.postalCode || undefined,
      parentName: v.parentName || undefined, parentPhone: v.parentPhone || undefined,
      department: v.department as any, sessionType: v.sessionType as any, preferredTiming: v.timing, counsellorId: Number(v.counsellorId),
      enrollmentId: v.idMode === "manual" ? v.enrollmentId || undefined : undefined, username: v.username || undefined, password: v.password || undefined,
      amountPaid: Number(v.amountPaid), paymentDate: v.paymentDate || undefined, paymentMethod: v.method || undefined, transactionRef: v.ref || undefined,
      classes: Number(v.classes) || 0, durationMinutes: Number(v.duration) || 30, specialConditions: v.special || undefined, validityEndDate: v.validity || undefined,
      teacherId: v.teacherId ? Number(v.teacherId) : undefined,
    });
  };

  return (
    <FormDialog wide open={open} onClose={close} title="Add student" submitLabel="Create student" busy={add.isPending} onSubmit={submit}>
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
          <Field label="Enrolled by (counsellor) *"><Pick value={v.counsellorId} onChange={(x) => f.set("counsellorId", x)} options={(counsellors.data || []).map((c: any) => ({ value: c.id2 ?? c.id, label: c.name }))} /></Field>
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
        </Section>

        <Section n={4} title="Class allocation and teacher">
          <Field label="Total classes" hint="Decided by you — there is no fixed fee-to-class rule."><Input inputMode="numeric" value={v.classes} onChange={set("classes")} /></Field>
          <Field label="Class duration (minutes)"><Input inputMode="numeric" value={v.duration} onChange={set("duration")} /></Field>
          <Field label="Course expiry date" hint="Optional. Otherwise validity starts at the first class."><Input type="date" value={v.validity} onChange={set("validity")} /></Field>
          <Field label="Special conditions"><Input value={v.special} onChange={set("special")} /></Field>
          <div className="sm:col-span-2"><Field label="Assign teacher now (optional)" hint="You can also do this later from Assign teachers.">
            <Pick value={v.teacherId} onChange={(x) => f.set("teacherId", x)} options={(teachers.data || []).map((t: any) => ({ value: t.id, label: `${t.name} · ${t.students} students` }))} /></Field></div>
        </Section>
      </div>
    </FormDialog>
  );
}
