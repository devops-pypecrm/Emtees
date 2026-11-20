import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, Loading, fmtDate, fmtDT, DAYS, Stat, StatGrid, inr } from "@/lib/kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REASONS = [["student_request", "Student request"], ["teacher_resigned", "Teacher resignation"], ["teacher_health", "Teacher health issues"], ["teacher_unavailable", "Teacher unavailability"], ["performance", "Performance-related issues"], ["administrative", "Administrative decision"], ["other", "Other reasons"]];

/** Complete picture of one student with the actions each role is allowed to take (SRS 5, 6, 7, 10, 11). */
export default function StudentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { user } = useAuth();
  const role = user!.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const canAcademic = isAdmin || role === "academic_head";
  const ov = trpc.academic.studentOverview.useQuery({ studentUserId: id });
  const alloc = trpc.admissions.allocations.useQuery({ studentUserId: id }, { enabled: role !== "student" && role !== "sales_executive" });
  const hist = trpc.academic.assignmentHistory.useQuery({ studentUserId: id });
  const exts = trpc.academic.extensions.useQuery({ studentUserId: id }, { enabled: canAcademic || role === "accountant" });
  const teachers = trpc.academic.teachersForDepartment.useQuery(undefined, { enabled: canAcademic });
  const tt = trpc.academic.timetable.useQuery({ studentUserId: id }, { enabled: canAcademic });
  const refresh = () => { ov.refetch(); hist.refetch(); alloc.refetch(); exts.refetch(); tt.refetch(); };
  const ok = (m: string) => () => { toast.success(m); refresh(); setDlg(null); };
  const bad = (e: any) => toast.error(e.message);
  const change = trpc.academic.changeTeacher.useMutation({ onSuccess: ok("Teacher changed — balance unchanged"), onError: bad });
  const assign = trpc.academic.assignTeacher.useMutation({ onSuccess: ok("Teacher assigned"), onError: bad });
  const extend = trpc.academic.extendValidity.useMutation({ onSuccess: ok("Validity extended"), onError: bad });
  const allocate = trpc.admissions.allocate.useMutation({ onSuccess: ok("Classes added"), onError: bad });
  const hold = trpc.academic.holdStudent.useMutation({ onSuccess: ok("Updated"), onError: bad });
  const setTT = trpc.academic.setTimetable.useMutation({ onSuccess: ok("Timetable saved"), onError: bad });
  const [dlg, setDlg] = useState<null | "teacher" | "extend" | "allocate" | "hold" | "tt">(null);
  const [f, setF] = useState<any>({});
  const sp = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const o: any = ov.data;
  const slot = (tt.data || [])[0];

  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{o ? `${o.name} · ${o.enrollmentId || ""}` : "Student"}</DialogTitle></DialogHeader>
        {!o ? <Loading /> : (
          <div className="space-y-8">
            <div className="text-sm text-slate-600 flex flex-wrap gap-x-5 gap-y-1">
              <span>{o.phone}</span><span>{o.course || "—"}</span><span>{o.sessionType === "group" ? "Group" : "Individual"}</span>
              <span>Teacher: <b>{o.teacher?.name || "not assigned"}</b></span>{o.admissionStatus && <Chip value={o.admissionStatus} />}
            </div>
            <StatGrid>
              <Stat label="Allocated" value={o.allocated} /><Stat label="Completed" value={o.consumed} tone="good" /><Stat label="Balance" value={o.balance} tone={o.balance <= 3 ? "warn" : undefined} />
              <Stat label="Validity" value={o.validityEndDate ? `${o.remainingDays}d` : "—"} hint={o.validityEndDate ? `until ${fmtDate(o.validityEndDate)}` : "starts at first class"} tone={o.remainingDays != null && o.remainingDays <= 7 ? "warn" : undefined} />
            </StatGrid>
            <div className="text-sm text-slate-600">Last class: {fmtDate(o.lastAttendedAt)} · Next class: {fmtDT(o.nextClassAt)}{slot && <> · Timetable: {slot.weekdays.split(",").map((d: string) => DAYS[Number(d)]).join(", ")} at {slot.timeOfDay}{slot.onHold ? " (on hold)" : ""}</>}</div>

            {canAcademic && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setF({ teacherId: "", reason: "student_request", note: "" }); setDlg("teacher"); }}>{o.teacher ? "Change teacher" : "Assign teacher"}</Button>
                <Button size="sm" variant="outline" onClick={() => { setF({ days: ["1", "2", "3", "4", "5"], time: "17:00", duration: "30", teacherId: o.teacher?.id || "" }); setDlg("tt"); }}>Set timetable</Button>
                <Button size="sm" variant="outline" onClick={() => { setF({ reason: "" }); setDlg("hold"); }}>{o.admissionStatus === "on_hold" ? "Resume student" : "Place on hold"}</Button>
                {isAdmin && <Button size="sm" variant="outline" onClick={() => { setF({ kind: "additional", classes: "", duration: "30", sessionType: o.sessionType === "group" ? "group" : "individual", amount: "", reason: "", special: "" }); setDlg("allocate"); }}>Add / adjust classes</Button>}
                {isAdmin && <Button size="sm" variant="outline" onClick={() => { setF({ days: "", reactivate: "0", reason: "" }); setDlg("extend"); }}>Extend validity</Button>}
              </div>
            )}

            <section><h3 className="text-sm font-semibold text-slate-900 mb-3">Teacher history</h3>
              <Table rows={hist.data} empty="No assignments yet" cols={[{ header: "Teacher", cell: (a: any) => a.teacherName }, { header: "From", cell: (a: any) => fmtDate(a.startedAt) }, { header: "Until", cell: (a: any) => a.endedAt ? fmtDate(a.endedAt) : "Current" }, { header: "Balance at start", cell: (a: any) => a.classesAtStart ?? "—" }, { header: "Reason", cell: (a: any) => (REASONS.find((r) => r[0] === a.reason)?.[1] || a.reason) + (a.reasonNote ? ` — ${a.reasonNote}` : "") }]} /></section>
            {role !== "student" && role !== "sales_executive" && <section><h3 className="text-sm font-semibold text-slate-900 mb-3">Class allocations</h3>
              <Table rows={alloc.data} empty="No allocation entries (older students use their profile total)" cols={[{ header: "Date", cell: (a: any) => fmtDate(a.createdAt) }, { header: "Type", cell: (a: any) => a.kind }, { header: "Classes", cell: (a: any) => a.classes }, { header: "Duration", cell: (a: any) => `${a.durationMinutes} min ${a.sessionType}` }, { header: "Amount", cell: (a: any) => a.amount ? inr(a.amount) : "—" }, { header: "Reason", cell: (a: any) => a.reason || a.specialConditions || "" }]} /></section>}
            {(exts.data || []).length > 0 && <section><h3 className="text-sm font-semibold text-slate-900 mb-3">Validity extensions</h3>
              <Table rows={exts.data} cols={[{ header: "Date", cell: (a: any) => fmtDate(a.createdAt) }, { header: "Original expiry", cell: (a: any) => fmtDate(a.originalExpiry) }, { header: "Revised expiry", cell: (a: any) => fmtDate(a.revisedExpiry) }, { header: "Reason", cell: (a: any) => a.reason }]} /></section>}
          </div>
        )}

        <FormDialog open={dlg === "teacher"} onClose={() => setDlg(null)} title={o?.teacher ? "Change teacher" : "Assign teacher"} busy={change.isPending || assign.isPending}
          onSubmit={() => { if (!f.teacherId) return toast.error("Choose a teacher"); o.teacher ? change.mutate({ studentUserId: id, newTeacherId: Number(f.teacherId), reason: f.reason, reasonNote: f.note || undefined }) : assign.mutate({ studentUserId: id, teacherId: Number(f.teacherId), admissionId: o.admissionId || undefined }); }}>
          <Field label="Teacher (availability shown)"><Pick value={f.teacherId} onChange={(x) => sp("teacherId", x)} options={(teachers.data || []).filter((t: any) => t.id !== o?.teacher?.id).map((t: any) => ({ value: t.id, label: `${t.name} — ${t.students} students${t.availability ? ` — ${t.availability.startTime}-${t.availability.endTime}, ${t.availability.workingDays.split(",").map((d: string) => DAYS[Number(d)]).join("/")}` : ""}` }))} /></Field>
          {o?.teacher && <><Field label="Reason for change"><Pick value={f.reason} onChange={(x) => sp("reason", x)} options={REASONS.map(([v, l]) => ({ value: v, label: l }))} /></Field>
            <Field label="Note"><Textarea rows={2} value={f.note || ""} onChange={(e) => sp("note", e.target.value)} /></Field>
            <p className="text-xs text-slate-500">The student keeps the same ID, course and class balance ({o.balance} left). The new teacher sees only the remaining classes.</p></>}
        </FormDialog>
        <FormDialog open={dlg === "tt"} onClose={() => setDlg(null)} title="Set weekly timetable" busy={setTT.isPending}
          onSubmit={() => { if (!f.teacherId) return toast.error("Assign a teacher first"); setTT.mutate({ studentUserId: id, teacherId: Number(f.teacherId), weekdays: (f.days || []).map(Number), timeOfDay: f.time, durationMinutes: Number(f.duration) }); }}>
          <Field label="Days"><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = (f.days || []).includes(String(i)); return <button type="button" key={d} onClick={() => sp("days", on ? f.days.filter((x: string) => x !== String(i)) : [...(f.days || []), String(i)])} className={`px-3 py-1 rounded-full border text-sm ${on ? "bg-[#1D2A44] text-white" : "bg-white"}`}>{d}</button>; })}</div></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Time (IST)"><Input type="time" value={f.time || ""} onChange={(e) => sp("time", e.target.value)} /></Field><Field label="Duration (min)"><Input inputMode="numeric" value={f.duration || ""} onChange={(e) => sp("duration", e.target.value)} /></Field></div>
          <p className="text-xs text-slate-500">Classes are created automatically for the next days. A teacher cannot be double-booked.</p>
        </FormDialog>
        <FormDialog open={dlg === "hold"} onClose={() => setDlg(null)} title={o?.admissionStatus === "on_hold" ? "Resume student" : "Place student on hold"} busy={hold.isPending} onSubmit={() => hold.mutate({ studentUserId: id, hold: o.admissionStatus !== "on_hold", reason: f.reason })}>
          <Field label="Reason *"><Textarea rows={2} value={f.reason || ""} onChange={(e) => sp("reason", e.target.value)} /></Field>
        </FormDialog>
        <FormDialog open={dlg === "allocate"} onClose={() => setDlg(null)} title="Add or adjust classes" busy={allocate.isPending}
          onSubmit={() => allocate.mutate({ studentUserId: id, kind: f.kind, classes: Number(f.classes), durationMinutes: Number(f.duration), sessionType: f.sessionType, amount: f.amount ? Number(f.amount) : undefined, reason: f.reason || undefined, specialConditions: f.special || undefined })}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type"><Pick value={f.kind} onChange={(x) => sp("kind", x)} options={[{ value: "additional", label: "Additional purchase" }, { value: "adjustment", label: "Adjustment (+/−)" }]} /></Field>
            <Field label="Classes"><Input inputMode="numeric" value={f.classes || ""} onChange={(e) => sp("classes", e.target.value)} /></Field>
            <Field label="Duration (min)"><Input inputMode="numeric" value={f.duration || ""} onChange={(e) => sp("duration", e.target.value)} /></Field>
            <Field label="Session type"><Pick value={f.sessionType} onChange={(x) => sp("sessionType", x)} options={[{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }]} /></Field>
            <Field label="Amount paid (₹)"><Input inputMode="decimal" value={f.amount || ""} onChange={(e) => sp("amount", e.target.value)} /></Field>
            <Field label="Special conditions"><Input value={f.special || ""} onChange={(e) => sp("special", e.target.value)} /></Field>
          </div>
          <Field label="Reason *"><Textarea rows={2} value={f.reason || ""} onChange={(e) => sp("reason", e.target.value)} /></Field>
        </FormDialog>
        <FormDialog open={dlg === "extend"} onClose={() => setDlg(null)} title="Extend course validity" busy={extend.isPending}
          onSubmit={() => extend.mutate({ studentUserId: id, daysToAdd: Number(f.days), reactivateClasses: Number(f.reactivate || 0), reason: f.reason })}>
          <div className="grid grid-cols-2 gap-4"><Field label="Days to add"><Input inputMode="numeric" value={f.days || ""} onChange={(e) => sp("days", e.target.value)} /></Field><Field label="Reactivate expired classes"><Input inputMode="numeric" value={f.reactivate || ""} onChange={(e) => sp("reactivate", e.target.value)} /></Field></div>
          <Field label="Reason *"><Textarea rows={2} value={f.reason || ""} onChange={(e) => sp("reason", e.target.value)} /></Field>
          <p className="text-xs text-slate-500">The original expiry date is kept; the revised date is recorded next to it.</p>
        </FormDialog>
      </DialogContent>
    </Dialog>
  );
}
