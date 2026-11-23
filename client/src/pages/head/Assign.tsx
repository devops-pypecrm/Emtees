import { useState } from "react";
import { trpc } from "@/providers/trpc";
import StudentDetail from "@/components/StudentDetail";
import { Page, Table, Button, Input, fmtDate, DEPT_LABEL } from "@/lib/kit";

/** Students whose payment is verified and who now need a teacher (SRS 6.2). */
export default function Assign() {
  const q = trpc.academic.awaitingAssignment.useQuery(undefined, { refetchInterval: 30000 });
  const [sel, setSel] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const rows = q.data && (needle ? q.data.filter((r: any) => [r.fullName, r.mobile, r.preferredTiming, r.department].some((x) => String(x || "").toLowerCase().includes(needle))) : q.data);
  return (
    <Page title="Assign teachers" subtitle="Payment-verified students waiting for a teacher. Choose by preferred time, department and teacher availability.">
      <div className="max-w-sm"><Input placeholder="Search name, mobile or timing…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Table searchable={false} rows={rows} empty="No students are waiting for a teacher"
        cols={[{ header: "Student", cell: (r: any) => <div><div className="font-medium">{r.fullName}</div><div className="text-xs text-slate-500">{r.mobile}</div></div> }, { header: "Course", cell: (r: any) => DEPT_LABEL[r.department] || "—" },
          { header: "Preferred timing", cell: (r: any) => r.preferredTiming || "—" }, { header: "Session", cell: (r: any) => r.sessionType }, { header: "Verified", cell: (r: any) => fmtDate(r.verifiedAt) },
          { header: "", cell: (r: any) => r.studentUserId ? <Button size="sm" onClick={() => setSel(r.studentUserId)}>Open & assign</Button> : <span className="text-xs text-amber-700">Resolve duplicate first</span> }]} />
      {sel && <StudentDetail id={sel} onClose={() => { setSel(null); q.refetch(); }} />}
    </Page>
  );
}
