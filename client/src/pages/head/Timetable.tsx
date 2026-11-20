import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Table, Pick, Chip, fmtTime, DAYS } from "@/lib/kit";

/** Weekly timetable (calendar) and today's classes (daily view) — SRS 7.1. */
export default function Timetable() {
  const { user } = useAuth();
  const tt = trpc.academic.timetable.useQuery({});
  const teachers = trpc.academic.teachersForDepartment.useQuery();
  const [teacher, setTeacher] = useState("");
  const rows = (tt.data || []).filter((s: any) => !teacher || String(s.teacherId) === teacher);
  const byDay: Record<number, any[]> = {};
  for (const s of rows) for (const d of s.weekdays.split(",").map(Number)) (byDay[d] ||= []).push(s);
  const today = new Date().getDay();
  return (
    <Page title="Timetable" subtitle="Each student's recurring class time. Classes are created automatically from these slots.">
      <div className="max-w-xs"><Pick value={teacher} onChange={setTeacher} placeholder="All teachers" options={(teachers.data || []).map((t: any) => ({ value: t.id, label: t.name }))} /></div>
      <div className="grid md:grid-cols-7 gap-2">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className={`rounded-lg border bg-white p-2 min-h-32 ${d === today ? "ring-2 ring-[#C8102E]" : ""}`}>
            <div className="text-xs font-semibold text-slate-500 mb-1">{DAYS[d]}{d === today ? " · today" : ""}</div>
            <div className="space-y-1">
              {(byDay[d] || []).sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)).map((s) => (
                <div key={s.id + "-" + d} className={`rounded px-1.5 py-1 text-xs ${s.onHold ? "bg-orange-50 text-orange-800" : "bg-slate-100"}`}><b>{s.timeOfDay}</b> {s.studentName}<div className="text-slate-500">{s.teacherName}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Table rows={rows} empty="No timetable slots yet — set one from a student's page"
        cols={[{ header: "Student", cell: (s: any) => s.studentName }, { header: "Teacher", cell: (s: any) => s.teacherName }, { header: "Days", cell: (s: any) => s.weekdays.split(",").map((d: string) => DAYS[Number(d)]).join(", ") }, { header: "Time (IST)", cell: (s: any) => s.timeOfDay }, { header: "Minutes", cell: (s: any) => s.durationMinutes }, { header: "", cell: (s: any) => s.onHold ? <Chip value="on_hold" /> : null }]} />
    </Page>
  );
}
