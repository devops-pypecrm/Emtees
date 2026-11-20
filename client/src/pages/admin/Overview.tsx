import { Link } from "react-router-dom";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Stat, StatGrid, Table, Loading, DEPT_LABEL } from "@/lib/kit";

/** Dashboard for administrators and academic heads (SRS 15). A head sees only their own department. */
export default function Overview() {
  const { user } = useAuth();
  const d = trpc.lms.headDashboard.useQuery(undefined, { refetchInterval: 30000 });
  const att = trpc.academic.attention.useQuery();
  const pay = trpc.admissions.list.useQuery({ status: "payment_pending_verification" }, { enabled: user!.role !== "academic_head" });
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <Page title="Overview" subtitle={x.department ? DEPT_LABEL[x.department] : "All departments"}>
      <StatGrid>
        <Stat label="Active students" value={x.activeStudents} /><Stat label="New admissions (30 days)" value={x.newAdmissions} />
        <Link to="/assign"><Stat label="Awaiting teacher" value={x.awaitingAssignment} tone={x.awaitingAssignment ? "warn" : undefined} hint="Click to assign" /></Link>
        {user!.role !== "academic_head" && <Link to="/payments"><Stat label="Payments to verify" value={pay.data?.length ?? "…"} tone={pay.data?.length ? "warn" : undefined} /></Link>}
        <Stat label="Completed today" value={x.completedToday} tone="good" /><Stat label="Missed today" value={x.missedToday} tone={x.missedToday ? "bad" : undefined} />
        <Link to="/requests"><Stat label="Open requests" value={x.pendingRequests} tone={x.pendingRequests ? "warn" : undefined} /></Link>
        <Link to="/teachers"><Stat label="Availability requests" value={x.pendingAvailability} tone={x.pendingAvailability ? "warn" : undefined} /></Link>
      </StatGrid>
      <div className="grid md:grid-cols-2 gap-8">
        <section><h2 className="text-base font-semibold text-slate-900 mb-3">Students nearing expiry</h2>
          <Table rows={att.data?.nearExpiry} empty="Nobody is close to expiry" cols={[{ header: "Student", cell: (s: any) => s.name }, { header: "Days left", cell: (s: any) => <span className="text-amber-700 font-medium">{s.days}</span> }]} /></section>
        <section><h2 className="text-base font-semibold text-slate-900 mb-3">Low class balance (≤ {att.data?.lowBalanceThreshold ?? 3})</h2>
          <Table rows={att.data?.lowBalance} empty="No low balances" cols={[{ header: "Student", cell: (s: any) => s.name }, { header: "Classes left", cell: (s: any) => s.remaining }]} /></section>
      </div>
    </Page>
  );
}
