import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Page, Table, Input, fmtDate, fmtDT, Chip } from "@/lib/kit";
import { toast } from "sonner";

/** Only the students assigned to this teacher, next class first (SRS 12.2). Admin/heads use the Students page. */
export default function MyStudents() {
  const q = trpc.academic.myStudents.useQuery();
  const [s, setS] = useState("");
  const rows = (q.data || []).filter((r: any) => !s || r.name.toLowerCase().includes(s.toLowerCase()));
  return (
    <Page title="My students" subtitle="Sorted by next scheduled class.">
      <div className="max-w-xs"><Input placeholder="Search" value={s} onChange={(e) => setS(e.target.value)} /></div>
      <Table rows={q.data ? rows : undefined} empty="No students assigned yet"
        cols={[{ header: "Student", cell: (r: any) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.enrollmentId} · {r.phone}</div></div> }, { header: "Course", cell: (r: any) => r.course || "—" },
          { header: "Allocated", cell: (r: any) => r.allocated }, { header: "Completed", cell: (r: any) => r.consumed }, { header: "Balance", cell: (r: any) => <b>{r.balance}</b> }, { header: "Expiry", cell: (r: any) => r.validityEndDate ? fmtDate(r.validityEndDate) : "—" },
          { header: "Last class", cell: (r: any) => fmtDate(r.lastAttendedAt) }, { header: "Next class", cell: (r: any) => fmtDT(r.nextClassAt) }, { header: "", cell: (r: any) => r.admissionStatus === "on_hold" ? <Chip value="on_hold" /> : null }]} />
    </Page>
  );
}
