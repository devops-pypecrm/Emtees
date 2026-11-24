import { useState } from "react";
import JSZip from "jszip";
import { Download, Check, X, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Button, Input, Pick, Loading, Empty } from "@/lib/kit";

type Student = { id: number; name: string; enrollmentId: string; days: Record<number, string>; present: number; absent: number };
type TeacherBlock = { id: number; name: string; students: Student[] };

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One teacher's sheet as an Excel-readable HTML table: a column per date, green tick = present, red cross = absent. */
function sheetHtml(t: TeacherBlock, month: string, days: number) {
  const [y, m] = month.split("-").map(Number);
  const head = Array.from({ length: days }, (_, i) => `<th style="width:26px">${i + 1}<br/><small>${WD[new Date(y, m - 1, i + 1).getDay()]}</small></th>`).join("");
  const rows = t.students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.enrollmentId)}</td>${Array.from({ length: days }, (_, d) => {
    const v = s.days[d + 1];
    return v === "present" ? `<td style="color:#16a34a;text-align:center;font-weight:bold">&#10004;</td>` : v === "absent" ? `<td style="color:#dc2626;text-align:center;font-weight:bold">&#10008;</td>` : `<td></td>`;
  }).join("")}<td style="text-align:center">${s.present}</td><td style="text-align:center">${s.absent}</td></tr>`).join("");
  return `<html><head><meta charset="utf-8"></head><body><h3>${esc(t.name)} — student attendance, ${month}</h3><table border="1" cellspacing="0" cellpadding="4"><thead><tr><th>#</th><th>Student</th><th>Student ID</th>${head}<th>Present</th><th>Absent</th></tr></thead><tbody>${rows}</tbody></table><p>&#10004; present &nbsp; &#10008; absent &nbsp; (blank = no class)</p></body></html>`;
}
const fileName = (s: string) => s.replace(/[^\w]+/g, "_");
const download = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

function Matrix({ t, month, days }: { t: TeacherBlock; month: string; days: number }) {
  const [y, m] = month.split("-").map(Number);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-100">
        <div className="font-semibold text-slate-900">{t.name} <span className="text-xs font-normal text-slate-400">· {t.students.length} students</span></div>
        <Button size="sm" variant="outline" onClick={() => download(new Blob([sheetHtml(t, month, days)], { type: "application/vnd.ms-excel" }), `${fileName(t.name)}_${month}.xls`)}><Download className="h-3.5 w-3.5 mr-1.5" />Excel</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium min-w-48">Student</th>
              {Array.from({ length: days }, (_, i) => { const wd = new Date(y, m - 1, i + 1).getDay(); return <th key={i} className={`w-8 px-0.5 py-1 font-medium ${wd === 0 ? "text-rose-400" : ""}`}><div>{i + 1}</div><div className="text-[9px] font-normal">{WD[wd]}</div></th>; })}
              <th className="px-3 py-2 font-medium">Present</th><th className="px-3 py-2 font-medium">Absent</th>
            </tr>
          </thead>
          <tbody>
            {t.students.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 bg-white px-3 py-2"><div className="font-medium text-slate-800">{s.name}</div><div className="text-[10px] text-slate-400">{s.enrollmentId}</div></td>
                {Array.from({ length: days }, (_, d) => { const v = s.days[d + 1]; return (
                  <td key={d} className="text-center px-0.5 py-1.5">{v === "present" ? <Check className="h-4 w-4 text-green-600 mx-auto" strokeWidth={3} /> : v === "absent" ? <X className="h-4 w-4 text-red-600 mx-auto" strokeWidth={3} /> : null}</td>); })}
                <td className="px-3 text-center font-semibold text-green-700">{s.present}</td><td className="px-3 text-center font-semibold text-red-600">{s.absent}</td>
              </tr>))}
            {!t.students.length && <tr><td colSpan={days + 3} className="p-6 text-center text-slate-400">No students</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Teacher-wise monthly student attendance (SRS 16). Pick a month and a teacher (or all); export one sheet or a zip with one file per teacher. */
export default function AttendanceSheet() {
  const { user } = useAuth();
  const isTeacher = user!.role === "teacher";
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [teacher, setTeacher] = useState("");
  const [dep, setDep] = useState("all");
  const teachers = trpc.reports.teachers.useQuery(undefined, { enabled: !isTeacher });
  const q = trpc.reports.attendanceMatrix.useQuery({ month, teacherId: teacher ? Number(teacher) : undefined, department: dep as any });
  const d = q.data;

  const zip = async () => {
    if (!d?.teachers.length) return toast.error("Nothing to export");
    const z = new JSZip();
    for (const t of d.teachers) z.file(`${fileName(t.name)}_${d.month}.xls`, sheetHtml(t as TeacherBlock, d.month, d.days));
    download(await z.generateAsync({ type: "blob" }), `Student_attendance_${d.month}_by_teacher.zip`);
    toast.success(`${d.teachers.length} teacher files zipped`);
  };

  return (
    <Page title="Student attendance" subtitle="Month sheet per teacher. Green tick = present, red cross = absent. Pick one teacher or see everyone."
      actions={d && d.teachers.length > 0 && <Button onClick={zip}><FileArchive className="h-4 w-4 mr-1.5" />Download ZIP (each teacher separately)</Button>}>
      <div className="flex flex-wrap items-end gap-3">
        <div><div className="text-xs text-slate-500 mb-1">Month</div><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></div>
        {!isTeacher && <div className="w-56"><div className="text-xs text-slate-500 mb-1">Teacher</div>
          <Pick value={teacher} onChange={setTeacher} placeholder="All teachers" options={(teachers.data || []).map((t: any) => ({ value: t.id, label: t.name }))} /></div>}
        {!isTeacher && user!.role !== "academic_head" && <div className="w-44"><div className="text-xs text-slate-500 mb-1">Department</div>
          <Pick value={dep} onChange={setDep} placeholder="All" options={[{ value: "all", label: "All" }, { value: "english", label: "Spoken English" }, { value: "hindi", label: "Spoken Hindi" }]} /></div>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <div className="text-sm text-red-600">{q.error.message}</div> : !d || !d.teachers.length ? <Empty text="No attendance for this month" />
        : <div className="space-y-6">{d.teachers.map((t: any) => <Matrix key={t.id} t={t} month={d.month} days={d.days} />)}</div>}
    </Page>
  );
}
