import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useClassroom } from "@/components/Classroom";
import { Page, Stat, StatGrid, Table, Chip, Button, Field, Input, Textarea, Pick, FormDialog, fmtTime, fmtDT, Loading, useForm } from "@/lib/kit";

/** Teacher dashboard + automatically sorted schedule (SRS 7.2, 12.1, 12.3). */
export default function Today() {
  const sum = trpc.lms.teacherSummary.useQuery(undefined, { refetchInterval: 60000 });
  const sch = trpc.lms.mySchedule.useQuery(undefined, { refetchInterval: 30000 });
  const rm = useClassroom(() => { sch.refetch(); sum.refetch(); });
  const students = trpc.academic.myStudents.useQuery();
  const manual = trpc.lms.recordManualClass.useMutation({ onSuccess: (r) => { toast.success(`Recorded ${r.minutes} minutes`); setMeet(false); sch.refetch(); sum.refetch(); }, onError: (e) => toast.error(e.message) });
  const [meet, setMeet] = useState(false);
  const f = useForm({ studentId: "", link: "", date: new Date().toISOString().slice(0, 10), start: "", end: "", teacherPresent: "yes", studentPresent: "yes", reason: "", remarks: "" });
  const s = sum.data;
  const s1 = sch.data;
  const Row = ({ c, tone }: { c: any; tone?: string }) => (
    <div className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 ${tone === "now" ? "ring-2 ring-[#C8102E]" : ""} ${tone === "late" ? "border-red-300" : ""}`}>
      <div><div className="font-medium">{c.studentName}</div><div className="text-xs text-slate-500">{fmtTime(c.scheduledAt)} · {c.sessionLength} min{c.isManual ? " · via Google Meet" : ""}</div></div>
      <div className="flex gap-2 items-center">
        {tone === "late" && <Chip value="absent" label="Overdue" />}{tone === "done" && <Chip value="completed" />}
        {(tone === "now" || tone === "up" || tone === "late") && <Button size="sm" disabled={rm.busy} onClick={() => rm.open({ id: c.id, title: c.title, scheduledAt: c.scheduledAt })}>{c.status === "ongoing" ? "Rejoin" : "Start class"}</Button>}
      </div>
    </div>
  );
  const Group = ({ title, rows, tone }: { title: string; rows?: any[]; tone: string }) => rows && rows.length ? <section className="space-y-3"><h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>{rows.map((c) => <Row key={c.id} c={c} tone={tone} />)}</section> : null;
  return (
    <Page title="Today" subtitle="Your classes, earliest upcoming first." actions={<Button variant="outline" onClick={() => setMeet(true)}>Record Google Meet class</Button>}>
      {!s ? <Loading /> : (
        <StatGrid>
          <Stat label="Active students" value={s.activeStudents} hint={`English ${s.english} · Hindi ${s.hindi}`} /><Stat label="Upcoming today" value={s.upcomingToday} />
          <Stat label="Completed today" value={s.completedToday} tone="good" hint={`Week ${s.completedWeek} · Month ${s.completedMonth}`} /><Stat label="Missed this month" value={s.missedMonth} tone={s.missedMonth ? "bad" : undefined} />
        </StatGrid>
      )}
      {!s1 ? <Loading /> : (s1.current.length + s1.upcoming.length + s1.completed.length + s1.missed.length + s1.hold.length === 0)
        ? <div className="text-center text-sm text-slate-500 py-10 border border-dashed rounded-lg bg-white">No classes scheduled for today</div>
        : <>
          <Group title="Happening now" rows={s1.current} tone="now" />
          <Group title="Upcoming" rows={s1.upcoming} tone="up" />
          <Group title="Overdue / missed" rows={s1.missed} tone="late" />
          <Group title="Completed" rows={s1.completed} tone="done" />
          <Group title="Students on hold" rows={s1.hold} tone="hold" />
        </>}
      {rm.element}
      <FormDialog wide open={meet} onClose={() => setMeet(false)} title="Record a class held on Google Meet" busy={manual.isPending}
        onSubmit={() => { const v = f.v; if (!v.studentId || !v.start || !v.end || !v.reason) return toast.error("Fill in the student, times and reason"); manual.mutate({ studentId: Number(v.studentId), meetLink: v.link || undefined, startedAt: new Date(`${v.date}T${v.start}:00`), endedAt: new Date(`${v.date}T${v.end}:00`), teacherPresent: v.teacherPresent === "yes", studentPresent: v.studentPresent === "yes", reason: v.reason, remarks: v.remarks || undefined }); }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Student"><Pick value={f.v.studentId} onChange={(x) => f.set("studentId", x)} options={(students.data || []).map((st: any) => ({ value: st.id, label: st.name }))} /></Field>
          <Field label="Google Meet link"><Input value={f.v.link} onChange={(e) => f.set("link", e.target.value)} placeholder="https://meet.google.com/…" /></Field>
          <Field label="Date"><Input type="date" value={f.v.date} onChange={(e) => f.set("date", e.target.value)} /></Field><div />
          <Field label="Start time"><Input type="time" value={f.v.start} onChange={(e) => f.set("start", e.target.value)} /></Field>
          <Field label="End time"><Input type="time" value={f.v.end} onChange={(e) => f.set("end", e.target.value)} /></Field>
          <Field label="Teacher attended"><Pick value={f.v.teacherPresent} onChange={(x) => f.set("teacherPresent", x)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Field>
          <Field label="Student attended"><Pick value={f.v.studentPresent} onChange={(x) => f.set("studentPresent", x)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Field>
        </div>
        <Field label="Reason for using Google Meet *"><Input value={f.v.reason} onChange={(e) => f.set("reason", e.target.value)} /></Field>
        <Field label="Remarks"><Textarea rows={2} value={f.v.remarks} onChange={(e) => f.set("remarks", e.target.value)} /></Field>
        <p className="text-xs text-slate-500">This record is marked as manually entered by you. The same minimum-duration and class-credit rules apply.</p>
      </FormDialog>
    </Page>
  );
}
