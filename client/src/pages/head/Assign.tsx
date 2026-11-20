import { useState } from "react";
import { trpc } from "@/providers/trpc";
import StudentDetail from "@/components/StudentDetail";
import { Page, Table, Button, fmtDate, DEPT_LABEL } from "@/lib/kit";

/** Students whose payment is verified and who now need a teacher (SRS 6.2). */
export default function Assign() {
  const q = trpc.academic.awaitingAssignment.useQuery(undefined, { refetchInterval: 30000 });
  const [sel, setSel] = useState<number | null>(null);
  return (
    <Page title="Assign teachers" subtitle="Payment-verified students waiting for a teacher. Choose by preferred time, department and teacher availability.">
      <Table rows={q.data} empty="No students are waiting for a teacher"
        cols={[{ header: "Student", cell: (r: any) => <div><div className="font-medium">{r.fullName}</div><div className="text-xs text-slate-500">{r.mobile}</div></div> }, { header: "Course", cell: (r: any) => DEPT_LABEL[r.department] || "—" },
          { header: "Preferred timing", cell: (r: any) => r.preferredTiming || "—" }, { header: "Session", cell: (r: any) => r.sessionType }, { header: "Verified", cell: (r: any) => fmtDate(r.verifiedAt) },
          { header: "", cell: (r: any) => r.studentUserId ? <Button size="sm" onClick={() => setSel(r.studentUserId)}>Open & assign</Button> : <span className="text-xs text-amber-700">Resolve duplicate first</span> }]} />
      {sel && <StudentDetail id={sel} onClose={() => { setSel(null); q.refetch(); }} />}
    </Page>
  );
}
