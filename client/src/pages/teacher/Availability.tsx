import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Page, Table, Chip, Button, Field, Input, DAYS, Card } from "@/lib/kit";

/** Teacher availability changes go through an approval request (SRS 12.4). */
export default function Availability() {
  const mine = trpc.academic.myAvailability.useQuery();
  const req = trpc.academic.requestAvailability.useMutation({ onSuccess: () => { toast.success("Sent to your Academic Head for approval"); mine.refetch(); }, onError: (e) => toast.error(e.message) });
  const [a, setA] = useState<any>({ days: ["1", "2", "3", "4", "5", "6"], start: "09:00", end: "18:00", bs: "", be: "", max: "" });
  return (
    <Page title="Availability" subtitle="Working days, daily hours and break. Changes need your Academic Head's approval.">
      <Card className="p-7 gap-5 max-w-xl shadow-none border-slate-200">
        <Field label="Working days"><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = a.days.includes(String(i)); return <button type="button" key={d} onClick={() => setA({ ...a, days: on ? a.days.filter((x: string) => x !== String(i)) : [...a.days, String(i)] })} className={`px-3 py-1 rounded-full border text-sm ${on ? "bg-[#1D2A44] text-white" : "bg-white"}`}>{d}</button>; })}</div></Field>
        <div className="grid grid-cols-2 gap-4"><Field label="Daily hours from"><Input type="time" value={a.start} onChange={(e) => setA({ ...a, start: e.target.value })} /></Field><Field label="to"><Input type="time" value={a.end} onChange={(e) => setA({ ...a, end: e.target.value })} /></Field>
          <Field label="Break from"><Input type="time" value={a.bs} onChange={(e) => setA({ ...a, bs: e.target.value })} /></Field><Field label="Break to"><Input type="time" value={a.be} onChange={(e) => setA({ ...a, be: e.target.value })} /></Field></div>
        <Field label="Maximum workload (students)"><Input inputMode="numeric" value={a.max} onChange={(e) => setA({ ...a, max: e.target.value })} /></Field>
        <Button disabled={req.isPending} onClick={() => req.mutate({ workingDays: a.days.map(Number), startTime: a.start, endTime: a.end, breakStart: a.bs || undefined, breakEnd: a.be || undefined, maxWorkload: a.max ? Number(a.max) : undefined })}>Request change</Button>
      </Card>
      <Table rows={mine.data} empty="No availability on record" cols={[{ header: "Days", cell: (x: any) => x.workingDays.split(",").map((d: string) => DAYS[Number(d)]).join(", ") }, { header: "Hours", cell: (x: any) => `${x.startTime}–${x.endTime}` }, { header: "Break", cell: (x: any) => x.breakStart ? `${x.breakStart}–${x.breakEnd}` : "—" }, { header: "Status", cell: (x: any) => <Chip value={x.status} /> }]} />
    </Page>
  );
}
