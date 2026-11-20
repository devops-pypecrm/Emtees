import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Page, Table, Button, Chip, Input, Field, Pick, FormDialog, DAYS, Stat, StatGrid } from "@/lib/kit";

const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

/** Teacher availability, workload and performance for the head (SRS 12.4, 15). */
export default function Teachers() {
  const [from] = useState(monthStart());
  const [to] = useState(new Date());
  const wl = trpc.lms.teacherWorkload.useQuery({ from, to });
  const pend = trpc.academic.pendingAvailability.useQuery();
  const decide = trpc.academic.decideAvailability.useMutation({ onSuccess: () => { pend.refetch(); toast.success("Done"); } });
  const teachers = trpc.academic.teachersForDepartment.useQuery();
  const setAv = trpc.academic.setAvailabilityDirect.useMutation({ onSuccess: () => { toast.success("Availability saved"); teachers.refetch(); setEdit(null); }, onError: (e) => toast.error(e.message) });
  const [edit, setEdit] = useState<any | null>(null);
  const [a, setA] = useState<any>({ days: ["1", "2", "3", "4", "5", "6"], start: "09:00", end: "18:00", bs: "", be: "", max: "" });
  const av = (t: any) => teachers.data?.find((x: any) => x.id === t.id)?.availability;
  return (
    <Page title="Teachers" subtitle="Workload this month, availability and pending availability requests.">
      {(pend.data || []).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-2 text-sm"><div className="font-medium text-amber-900">Availability requests ({pend.data!.length})</div>
          {pend.data!.map((p: any) => <div key={p.id} className="flex items-center justify-between gap-2"><span>{p.teacherName}: {p.workingDays.split(",").map((d: string) => DAYS[Number(d)]).join("/")} {p.startTime}–{p.endTime}{p.breakStart ? `, break ${p.breakStart}–${p.breakEnd}` : ""}</span><span className="flex gap-1"><Button size="sm" onClick={() => decide.mutate({ id: p.id, approve: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: p.id, approve: false })}>Reject</Button></span></div>)}
        </div>)}
      <Table rows={wl.data} empty="No teachers"
        cols={[{ header: "Teacher", cell: (t: any) => <div><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.department || ""}</div></div> }, { header: "Students", cell: (t: any) => t.students }, { header: "Completed", cell: (t: any) => t.completed }, { header: "Missed", cell: (t: any) => <span className={t.missed ? "text-red-600" : ""}>{t.missed}</span> }, { header: "Hours", cell: (t: any) => t.hours },
          { header: "Availability", cell: (t: any) => { const x = av(t); return x ? <span className="text-xs">{x.workingDays.split(",").map((d: string) => DAYS[Number(d)]).join("/")} {x.startTime}–{x.endTime}</span> : <span className="text-xs text-slate-400">not set</span>; } },
          { header: "", cell: (t: any) => <Button size="sm" variant="outline" onClick={() => setEdit(t)}>Set availability</Button> }]} />
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={`Availability — ${edit?.name || ""}`} busy={setAv.isPending}
        onSubmit={() => setAv.mutate({ teacherId: edit.id, workingDays: a.days.map(Number), startTime: a.start, endTime: a.end, breakStart: a.bs || undefined, breakEnd: a.be || undefined, maxWorkload: a.max ? Number(a.max) : undefined })}>
        <Field label="Working days"><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = a.days.includes(String(i)); return <button type="button" key={d} onClick={() => setA({ ...a, days: on ? a.days.filter((x: string) => x !== String(i)) : [...a.days, String(i)] })} className={`px-3 py-1 rounded-full border text-sm ${on ? "bg-[#1D2A44] text-white" : "bg-white"}`}>{d}</button>; })}</div></Field>
        <div className="grid grid-cols-2 gap-4"><Field label="From"><Input type="time" value={a.start} onChange={(e) => setA({ ...a, start: e.target.value })} /></Field><Field label="To"><Input type="time" value={a.end} onChange={(e) => setA({ ...a, end: e.target.value })} /></Field>
          <Field label="Break from"><Input type="time" value={a.bs} onChange={(e) => setA({ ...a, bs: e.target.value })} /></Field><Field label="Break to"><Input type="time" value={a.be} onChange={(e) => setA({ ...a, be: e.target.value })} /></Field></div>
        <Field label="Maximum workload (students)"><Input inputMode="numeric" value={a.max} onChange={(e) => setA({ ...a, max: e.target.value })} /></Field>
      </FormDialog>
    </Page>
  );
}
