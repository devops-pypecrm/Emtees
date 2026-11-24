import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Page, Table, Loading, Button, fmtDate, Chip } from "@/lib/kit";
import { ArrowRight } from "lucide-react";

const REASON: Record<string, string> = {
  initial: "First assignment", student_request: "Student request", teacher_resigned: "Teacher resignation", teacher_health: "Teacher health issues",
  teacher_unavailable: "Teacher unavailability", performance: "Performance-related issues", administrative: "Administrative decision", other: "Other reasons",
};
const why = (r: any) => `${REASON[r.reason] || r.reason || "—"}${r.reasonNote ? ` — ${r.reasonNote}` : ""}`;

type Row = any;
type Student = { id: number; name: string; enrollmentId: string; department: string; current: string; stints: Row[]; changes: Row[] };

/** Teacher change history (SRS 6.3): a plain log, and a per-student view that opens the full journey. */
export default function TeacherChanges() {
  const q = trpc.academic.changeHistory.useQuery();
  const [tab, setTab] = useState<"log" | "student">("log");
  const [open, setOpen] = useState<Student | null>(null);

  const { log, students } = useMemo(() => {
    const by = new Map<number, Row[]>();
    for (const r of (q.data || []) as Row[]) { if (!by.has(r.studentId)) by.set(r.studentId, []); by.get(r.studentId)!.push(r); }
    const log: any[] = []; const students: Student[] = [];
    by.forEach((rows, id) => {
      const stints = [...rows].sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt));
      stints.forEach((r, i) => log.push({ ...r, event: i === 0 ? "Assigned" : "Changed", from: i === 0 ? "" : stints[i - 1].teacher, to: r.teacher }));
      const cur = stints.find((r) => !r.endedAt) || stints[stints.length - 1];
      students.push({ id, name: stints[0].student, enrollmentId: stints[0].enrollmentId || "", department: stints[0].department || "", current: cur.teacher, stints, changes: stints.slice(1) });
    });
    log.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
    students.sort((a, b) => b.changes.length - a.changes.length || a.name.localeCompare(b.name));
    return { log, students };
  }, [q.data]);

  return (
    <Page title="Teacher changes" subtitle="Every teacher assignment and replacement. The student keeps the same Student ID, course and class balance when the teacher changes.">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {([["log", "Log"], ["student", "Per student"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === k ? "bg-[#1D2A44] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>))}
      </div>
      {!q.data ? <Loading /> : tab === "log" ? (
        <Table rows={log} empty="No teacher assignments yet" cols={[
          { header: "Date", cell: (r: any) => fmtDate(r.startedAt), value: (r: any) => new Date(r.startedAt).toISOString() },
          { header: "Student", cell: (r: any) => <div><div className="font-medium">{r.student}</div><div className="text-xs text-slate-500">{r.enrollmentId}</div></div> },
          { header: "Event", cell: (r: any) => <Chip value={r.event === "Assigned" ? "teacher_assigned" : "on_hold"} label={r.event} /> },
          { header: "From teacher", cell: (r: any) => r.from || "—" },
          { header: "To teacher", cell: (r: any) => <span className="font-medium">{r.to}</span> },
          { header: "Reason", cell: (r: any) => why(r), value: (r: any) => REASON[r.reason] || r.reason },
          { header: "Balance at that time", cell: (r: any) => r.classesAtStart ?? "—" },
          { header: "Changed by", cell: (r: any) => r.assignedBy || "—" },
        ]} />
      ) : (
        <Table rows={students} empty="No students" onRow={(s: Student) => setOpen(s)} cols={[
          { header: "Student", cell: (s: Student) => <div><div className="font-medium">{s.name}</div><div className="text-xs text-slate-500">{s.enrollmentId}</div></div> },
          { header: "Department", cell: (s: Student) => s.department || "—" },
          { header: "Current teacher", cell: (s: Student) => s.current },
          { header: "Changes", cell: (s: Student) => s.changes.length, className: "text-center" },
          { header: "Change history", nofilter: true, value: (s: Student) => s.changes.map((c) => `${c.teacher} ${why(c)}`).join(" "),
            cell: (s: Student) => !s.changes.length ? <span className="text-slate-400 text-xs">No change yet</span> : (
              <div className="space-y-1">
                {s.changes.slice(0, 2).map((c, i) => (
                  <div key={c.id} className="text-xs flex flex-wrap items-center gap-1.5"><span className="text-slate-500">{s.stints[i].teacher}</span><ArrowRight className="h-3 w-3 text-slate-400" /><span className="font-medium text-slate-800">{c.teacher}</span><span className="text-slate-500">· {REASON[c.reason] || c.reason} · {fmtDate(c.startedAt)}</span></div>))}
                {s.changes.length > 2 && <button className="text-xs text-[#C8102E] hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(s); }}>+{s.changes.length - 2} more — view all</button>}
              </div>) },
        ]} />
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open?.name} <span className="text-sm font-normal text-slate-500">· {open?.enrollmentId}</span></DialogTitle></DialogHeader>
          {open && (
            <ol className="relative border-l border-slate-200 ml-3 space-y-6 py-2">
              {open.stints.map((r, i) => (
                <li key={r.id} className="ml-6">
                  <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#1D2A44]" />
                  <div className="text-xs text-slate-400">{i === 0 ? "First teacher" : `Teacher ${i + 1}`}</div>
                  <div className="font-semibold text-slate-900">{r.teacher}</div>
                  <div className="text-sm text-slate-600">{fmtDate(r.startedAt)} → {r.endedAt ? fmtDate(r.endedAt) : "now"}{r.classesAtStart != null && <> · {r.classesAtStart} classes left when they started</>}</div>
                  {i > 0 && <div className="text-sm mt-1"><span className="text-slate-500">Changed from {open.stints[i - 1].teacher}.</span> <b>Reason:</b> {why(r)}{r.assignedBy && <span className="text-slate-500"> (by {r.assignedBy})</span>}</div>}
                </li>))}
            </ol>
          )}
          <div className="flex justify-end"><Button variant="outline" onClick={() => setOpen(null)}>Close</Button></div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
