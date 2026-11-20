import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Page, Table, Button, Input, Pick, Loading, exportTable } from "@/lib/kit";
import { Download } from "lucide-react";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS: [string, () => [Date, Date]][] = [
  ["Today", () => [new Date(), new Date()]],
  ["Last 7 days", () => [new Date(Date.now() - 6 * 864e5), new Date()]],
  ["This month", () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; }],
  ["Last month", () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; }],
  ["Last 90 days", () => [new Date(Date.now() - 89 * 864e5), new Date()]],
];

/** All SRS section 17 reports in one screen: custom date range, department filter, search, Excel / PDF export. */
export default function Reports() {
  const { user } = useAuth();
  const cat = trpc.reports.catalog.useQuery();
  const [key, setKey] = useState("");
  const [from, setFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date()));
  const [dep, setDep] = useState("all");
  const [search, setSearch] = useState("");
  useEffect(() => { if (!key && cat.data?.length) setKey(cat.data[0].key); }, [cat.data, key]);
  const run = trpc.reports.run.useQuery({ key, from: new Date(from + "T00:00:00"), to: new Date(to + "T00:00:00"), department: dep as any, search }, { enabled: !!key, keepPreviousData: true } as any);
  if (!cat.data) return <Loading />;
  const groups = Array.from(new Set(cat.data.map((c: any) => c.group)));
  const r = run.data;
  return (
    <Page title="Reports" subtitle="Pick a report, a date range and filters, then download it as Excel or PDF."
      actions={r && <><Button variant="outline" onClick={() => exportTable(r.title, r.columns, r.rows, "xls")}><Download className="h-4 w-4 mr-1" />Excel</Button><Button variant="outline" onClick={() => exportTable(r.title, r.columns, r.rows, "csv")}>CSV</Button><Button variant="outline" onClick={() => exportTable(r.title, r.columns, r.rows, "pdf")}>PDF</Button></>}>
      <div className="grid md:grid-cols-[16rem_1fr] gap-5">
        <aside className="space-y-3">
          {groups.map((g) => (
            <div key={g as string}><div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{g as string}</div>
              {cat.data!.filter((c: any) => c.group === g).map((c: any) => <button key={c.key} onClick={() => setKey(c.key)} className={`block w-full text-left text-sm px-3 py-1.5 rounded-md ${key === c.key ? "bg-[#1D2A44] text-white" : "hover:bg-slate-100"}`}>{c.title}</button>)}
            </div>))}
        </aside>
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-end gap-3">
            <div><div className="text-xs text-slate-500 mb-1">From</div><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><div className="text-xs text-slate-500 mb-1">To</div><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="flex gap-1 flex-wrap">{PRESETS.map(([l, f]) => <Button key={l} size="sm" variant="outline" onClick={() => { const [a, b] = f(); setFrom(iso(a)); setTo(iso(b)); }}>{l}</Button>)}</div>
            {user!.role !== "academic_head" && <div className="w-40"><div className="text-xs text-slate-500 mb-1">Department</div><Pick value={dep} onChange={setDep} placeholder="All" options={[{ value: "all", label: "All" }, { value: "english", label: "English" }, { value: "hindi", label: "Hindi" }]} /></div>}
            <div className="w-56"><div className="text-xs text-slate-500 mb-1">Search</div><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, mobile, ID…" /></div>
          </div>
          {run.isLoading ? <Loading /> : run.error ? <div className="text-red-600 text-sm">{run.error.message}</div> : r && (
            <><div className="text-sm text-slate-500">{r.title} · {r.rows.length} rows</div>
              <Table rows={r.rows} empty="No data for these filters" cols={r.columns.map((c: any) => ({ header: c.label, cell: (row: any) => String(row[c.key] ?? "") }))} /></>)}
        </div>
      </div>
    </Page>
  );
}
