import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Page, Stat, StatGrid, Table, Chip, Input, fmtDT, inr, Loading } from "@/lib/kit";

/** Remuneration dashboard for the teacher (SRS 13.4). Read-only: teachers cannot change rates. */
export default function Earnings() {
  const d = trpc.finance.myDashboard.useQuery();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const e = trpc.finance.entries.useQuery({ from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) });
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <Page title="Earnings" subtitle="Pay is recorded for every qualifying class at the rate valid on that day.">
      <StatGrid><Stat label="Today" value={inr(x.today)} /><Stat label="This week" value={inr(x.week)} /><Stat label="This month" value={inr(x.month)} /><Stat label="Completed classes" value={x.completedClasses} /></StatGrid>
      <StatGrid><Stat label="Regular classes" value={inr(x.regular)} /><Stat label="Group classes" value={inr(x.group)} /><Stat label="Demo payments" value={inr(x.demo)} /><Stat label="Demo conversion bonus" value={inr(x.demoBonus)} /></StatGrid>
      <StatGrid><Stat label="Total payable" value={inr(x.totalPayable)} /><Stat label="Pending approval" value={inr(x.pendingApproval)} tone="warn" /><Stat label="Approved, unpaid" value={inr(x.approved)} /><Stat label="Already paid" value={inr(x.paid)} tone="good" /></StatGrid>
      <div className="w-44"><Input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} /></div>
      <Table rows={e.data} empty="No entries in this month" cols={[{ header: "Date", cell: (r: any) => fmtDT(r.earnedAt) }, { header: "Type", cell: (r: any) => r.kind.replace("_", " ") }, { header: "Student", cell: (r: any) => r.studentName || "—" }, { header: "Amount", cell: (r: any) => inr(r.amount) }, { header: "Status", cell: (r: any) => <Chip value={r.status} /> }, { header: "Note", cell: (r: any) => r.reason || r.transactionId || "" }]} />
    </Page>
  );
}
