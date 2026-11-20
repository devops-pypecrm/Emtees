import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Page, Table, Input, fmtDT } from "@/lib/kit";

export default function Audit() {
  const [entity, setEntity] = useState("");
  const q = trpc.academic.auditLog.useQuery({ entity: entity || undefined, limit: 300 });
  const j = (v: any) => (v == null ? "" : JSON.stringify(v));
  return (
    <Page title="Audit log" subtitle="Every important action: who did it, when, the previous value, the new value and the reason.">
      <div className="max-w-xs"><Input placeholder="Filter by type (student, admission, settings…)" value={entity} onChange={(e) => setEntity(e.target.value)} /></div>
      <Table rows={q.data} empty="No audit entries yet"
        cols={[{ header: "When", cell: (a: any) => fmtDT(a.createdAt) }, { header: "User", cell: (a: any) => a.userName || a.userId }, { header: "Action", cell: (a: any) => <b>{a.action.replace(/_/g, " ")}</b> }, { header: "Record", cell: (a: any) => `${a.entity}${a.entityId ? " #" + a.entityId : ""}` },
          { header: "Previous", cell: (a: any) => <span className="text-xs text-slate-600 break-all">{j(a.previousValue)}</span> }, { header: "New", cell: (a: any) => <span className="text-xs text-slate-600 break-all">{j(a.newValue)}</span> }, { header: "Reason", cell: (a: any) => a.reason || "" }]} />
    </Page>
  );
}
