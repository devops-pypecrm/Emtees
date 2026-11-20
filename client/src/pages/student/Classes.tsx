import { trpc } from "@/providers/trpc";
import { useClassroom } from "@/components/Classroom";
import { Page, Table, Chip, Button, fmtDT } from "@/lib/kit";

export default function StudentClasses() {
  const q = trpc.lms.myClasses.useQuery(undefined, { refetchInterval: 20000 });
  const rm = useClassroom(() => q.refetch());
  return (
    <Page title="Classes" subtitle="Your class history with attendance.">
      <Table rows={q.data} empty="No classes yet"
        cols={[{ header: "Date & time", cell: (c: any) => fmtDT(c.scheduledAt) }, { header: "Teacher", cell: (c: any) => c.teacherName }, { header: "Length", cell: (c: any) => `${c.sessionLength} min` },
          { header: "Status", cell: (c: any) => <Chip value={c.status} /> }, { header: "Attendance", cell: (c: any) => c.attendance ? <div><Chip value={c.attendance} />{c.attendedMinutes != null && <span className="text-xs text-slate-500 ml-2">{c.attendedMinutes} min</span>}</div> : "—" },
          { header: "", cell: (c: any) => c.status === "ongoing" ? <Button size="sm" onClick={() => rm.open({ id: c.id, title: c.title, scheduledAt: c.scheduledAt, teacherName: c.teacherName })}>Join</Button> : null }]} />
      {rm.element}
    </Page>
  );
}
