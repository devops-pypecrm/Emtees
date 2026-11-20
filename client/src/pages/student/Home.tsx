import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useClassroom } from "@/components/Classroom";
import { Page, Stat, StatGrid, Button, Card, fmtDT, fmtDate, Loading, Table, DAYS } from "@/lib/kit";

/** Student portal home (SRS 14): next class, join button, balance, validity, teacher. */
export default function StudentHome() {
  const { user } = useAuth();
  const ov = trpc.academic.studentOverview.useQuery({ studentUserId: user!.id }, { refetchInterval: 30000 });
  const cls = trpc.lms.myClasses.useQuery(undefined, { refetchInterval: 15000 });
  const tt = trpc.academic.timetable.useQuery({});
  const rm = useClassroom(() => { ov.refetch(); cls.refetch(); });
  if (!ov.data) return <Loading />;
  const o: any = ov.data;
  const live = (cls.data || []).find((c: any) => c.status === "ongoing");
  const next = (cls.data || []).filter((c: any) => c.status === "scheduled" && new Date(c.scheduledAt).getTime() > Date.now() - 30 * 60000).sort((a: any, b: any) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];
  const expiring = o.remainingDays != null && o.remainingDays <= 7;
  return (
    <Page title={`Welcome, ${o.name}`} subtitle={`${o.course || "Course"} · Student ID ${o.enrollmentId || "—"}`}>
      {live && <Card className="p-4 flex-row items-center justify-between border-2 border-rose-500"><div><div className="font-semibold text-rose-700">Your class is live</div><div className="text-sm text-slate-600">with {live.teacherName}</div></div><Button disabled={rm.busy} onClick={() => rm.open({ id: live.id, title: live.title, scheduledAt: live.scheduledAt, teacherName: live.teacherName })}>Join classroom</Button></Card>}
      <StatGrid>
        <Stat label="Next class" value={<span className="text-lg">{fmtDT(next?.scheduledAt || o.nextClassAt)}</span>} hint={o.teacher ? `Teacher: ${o.teacher.name}` : "Teacher not assigned yet"} />
        <Stat label="Classes allocated" value={o.allocated} /><Stat label="Completed" value={o.consumed} tone="good" /><Stat label="Balance" value={o.balance} tone={o.balance <= 3 ? "warn" : undefined} />
      </StatGrid>
      <StatGrid><Stat label="Course validity" value={o.validityEndDate ? `${o.remainingDays} days` : "Starts with first class"} hint={o.validityEndDate ? `Expires ${fmtDate(o.validityEndDate)}` : undefined} tone={expiring ? "warn" : undefined} />
        <Stat label="Last attended" value={<span className="text-lg">{fmtDate(o.lastAttendedAt)}</span>} /></StatGrid>
      {expiring && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Your course expires in {o.remainingDays} days. Please use your remaining classes or contact us to extend.</div>}
      {(tt.data || []).length > 0 && <section><h2 className="font-semibold mb-2">Your timetable</h2><Table rows={tt.data} cols={[{ header: "Days", cell: (s: any) => s.weekdays.split(",").map((d: string) => DAYS[Number(d)]).join(", ") }, { header: "Time (IST)", cell: (s: any) => s.timeOfDay }, { header: "Teacher", cell: (s: any) => s.teacherName }, { header: "Minutes", cell: (s: any) => s.durationMinutes }]} /></section>}
      {rm.element}
    </Page>
  );
}
