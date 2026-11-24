import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, SlidersHorizontal, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export const inr = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtTime = (d: any) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—");
export const fmtDT = (d: any) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : "—");
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DEPT_LABEL: Record<string, string> = { english: "Spoken English", hindi: "Spoken Hindi" };

export const STATUS_LABEL: Record<string, string> = {
  link_generated: "Link generated", registration_completed: "Registration completed", payment_pending_verification: "Payment pending verification",
  payment_verified: "Payment verified", awaiting_assignment: "Awaiting assignment", teacher_assigned: "Teacher assigned", active: "Active",
  on_hold: "On hold", completed: "Completed", expired: "Expired", cancelled: "Cancelled",
};
const TONE: Record<string, string> = {
  link_generated: "bg-slate-100 text-slate-700", registration_completed: "bg-blue-100 text-blue-700", payment_pending_verification: "bg-amber-100 text-amber-800",
  payment_verified: "bg-emerald-100 text-emerald-700", awaiting_assignment: "bg-violet-100 text-violet-700", teacher_assigned: "bg-cyan-100 text-cyan-700",
  active: "bg-green-100 text-green-700", on_hold: "bg-orange-100 text-orange-700", completed: "bg-teal-100 text-teal-700", expired: "bg-red-100 text-red-700", cancelled: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-800", approved: "bg-blue-100 text-blue-700", paid: "bg-green-100 text-green-700", open: "bg-amber-100 text-amber-800", resolved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
  present: "bg-green-100 text-green-700", absent: "bg-red-100 text-red-700", interrupted: "bg-orange-100 text-orange-700", late: "bg-yellow-100 text-yellow-800", scheduled: "bg-slate-100 text-slate-700",
  ongoing: "bg-rose-100 text-rose-700", cancelled_: "bg-red-100 text-red-700",
};
export function Chip({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE[value] || "bg-slate-100 text-slate-700"}`}>{label ?? STATUS_LABEL[value] ?? value.replace(/_/g, " ")}</span>;
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "warn" | "good" | "bad" }) {
  const c = tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <Card className="p-5 gap-2 shadow-none border-slate-200 h-full hover:border-slate-300 transition-colors">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className={`text-[28px] leading-none font-semibold tracking-tight ${c}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </Card>
  );
}
export const StatGrid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>;

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center"><Loader2 className="h-4 w-4 animate-spin" />{text}</div>;
}
export const Empty = ({ text }: { text: string }) => <div className="text-center text-sm text-slate-400 py-16 border border-dashed border-slate-200 rounded-xl bg-white">{text}</div>;

export type Col<T> = { header: string; cell: (r: T) => ReactNode; className?: string; /** value used to sort/filter when the cell is not plain text */ value?: (r: T) => string | number | null | undefined; nofilter?: boolean };

/** Plain text of whatever a cell renders, so any column can be sorted and filtered without extra code. */
function nodeText(n: any): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).filter(Boolean).join(" ");
  const p = n.props || {};
  if (p.label != null && typeof p.label === "string") return p.label;
  if (p.value != null && typeof p.value === "string" && n.type && (n.type as any).name === "Chip") return STATUS_LABEL[p.value] ?? p.value.replace(/_/g, " ");
  return nodeText(p.children);
}
const numOf = (t: string) => { const m = t.replace(/[₹,\s%]/g, ""); return m !== "" && /^-?\d+(\.\d+)?$/.test(m) ? Number(m) : null; };
const dateOf = (t: string) => (/^\d{1,2} [A-Za-z]{3} \d{4}|^\d{4}-\d{2}-\d{2}/.test(t) ? Date.parse(t.replace(/,.*$/, "")) || null : null);
function compare(a: string, b: string) {
  if (!a && !b) return 0; if (!a) return 1; if (!b) return -1; // empty values always last
  const na = numOf(a), nb = numOf(b); if (na != null && nb != null) return na - nb;
  const da = dateOf(a), db = dateOf(b); if (da != null && db != null) return da - db;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function Table<T>({ cols, rows, empty = "Nothing to show", onRow, searchable }: { cols: Col<T>[]; rows: T[] | undefined; empty?: string; onRow?: (r: T) => void; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<number, string>>({});
  const text = (c: Col<T>, r: T) => { const v = c.value ? c.value(r) : undefined; return v != null ? String(v) : nodeText(c.cell(r)).trim(); };
  const matrix = useMemo(() => (rows || []).map((r) => cols.map((c) => text(c, r))), [rows, cols]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => cols.map((_, i) => { const u = Array.from(new Set(matrix.map((m) => m[i]).filter(Boolean))); return u.length > 1 && u.length <= 15 ? u.sort((a, b) => compare(a, b)) : null; }), [matrix, cols]);
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty text={empty} />;
  // A search box appears by itself on longer lists; pages with their own search pass searchable={false}.
  const showSearch = searchable ?? rows.length >= 8;
  const needle = q.trim().toLowerCase();
  const active = Object.entries(filters).filter(([, v]) => v);
  let idx = rows.map((_, i) => i).filter((i) => {
    if (needle && !matrix[i].join(" ").toLowerCase().includes(needle)) return false;
    return active.every(([ci, v]) => (options[Number(ci)] ? matrix[i][Number(ci)] === v : matrix[i][Number(ci)].toLowerCase().includes(v.toLowerCase())));
  });
  if (sort) idx = [...idx].sort((x, y) => sort.dir * compare(matrix[x][sort.i], matrix[y][sort.i]));
  const clickSort = (i: number) => setSort((s) => (!s || s.i !== i ? { i, dir: 1 } : s.dir === 1 ? { i, dir: -1 } : null));
  const clear = () => { setFilters({}); setQ(""); setSort(null); };
  const dirty = active.length > 0 || !!needle || !!sort;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {showSearch && <div className="w-full sm:w-64"><Input placeholder="Search this list…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
        {rows.length >= 5 && <Button size="sm" variant={showFilters ? "default" : "outline"} onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Filters{active.length ? ` (${active.length})` : ""}</Button>}
        {dirty && <Button size="sm" variant="ghost" onClick={clear}>Clear all</Button>}
        <span className="text-xs text-slate-400 ml-auto">{idx.length === rows.length ? `${rows.length} rows` : `${idx.length} of ${rows.length} rows`}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>{cols.map((c, i) => (
              <th key={i} className={`px-5 py-3 font-medium whitespace-nowrap ${c.className || ""}`}>
                {c.header ? <button type="button" onClick={() => clickSort(i)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-800">
                  {c.header}{sort?.i === i ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</button> : null}
              </th>))}</tr>
            {showFilters && rows.length >= 5 && <tr className="bg-white normal-case tracking-normal">{cols.map((c, i) => (
              <th key={i} className="px-3 py-2 font-normal">
                {!c.header || c.nofilter ? null : options[i]
                  ? <select className="h-8 w-full min-w-24 rounded-md border border-slate-200 bg-white px-2 text-xs" value={filters[i] || ""} onChange={(e) => setFilters((f) => ({ ...f, [i]: e.target.value }))}><option value="">All</option>{options[i]!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : <input className="h-8 w-full min-w-24 rounded-md border border-slate-200 px-2 text-xs" placeholder="Filter…" value={filters[i] || ""} onChange={(e) => setFilters((f) => ({ ...f, [i]: e.target.value }))} />}
              </th>))}</tr>}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {idx.map((ri) => { const r = rows[ri]; return (
              <tr key={ri} className={`${onRow ? "cursor-pointer" : ""} hover:bg-slate-50/70 transition-colors`} onClick={() => onRow?.(r)}>
                {cols.map((c, j) => <td key={j} className={`px-5 py-3.5 align-middle text-slate-700 ${c.className || ""}`}>{c.cell(r)}</td>)}
              </tr>); })}
          </tbody>
        </table>
        {!idx.length && <div className="p-8 text-center text-sm text-slate-400">No rows match these filters</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="space-y-2"><Label className="text-sm font-medium text-slate-700">{label}</Label>{children}{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>;
}
export function Pick({ value, onChange, options, placeholder = "Select…", disabled }: { value: string | number | undefined | null; onChange: (v: string) => void; options: { value: string | number; label: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <select disabled={disabled} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export const DEPT_OPTIONS = [{ value: "english", label: "Spoken English" }, { value: "hindi", label: "Spoken Hindi" }];

/** A small form dialog: title, body, confirm button that shows a spinner. */
export function FormDialog({ open, onClose, title, children, onSubmit, submitLabel = "Save", busy, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; onSubmit: () => void; submitLabel?: string; busy?: boolean; wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl p-5 sm:p-7`}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useForm<T extends Record<string, any>>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((p) => ({ ...p, [k]: val }));
  return { v, set, reset: () => setV(initial), setAll: setV };
}
export { Button, Input, Textarea, Label, Card };

/** Excel (HTML table .xls opens in Excel) and PDF (print dialog -> Save as PDF) export for any table. */
export function exportTable(title: string, columns: { key: string; label: string }[], rows: any[], kind: "xls" | "csv" | "pdf") {
  const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const table = `<table border="1"><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const name = title.replace(/[^\w]+/g, "_");
  if (kind === "pdf") {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${esc(title)}</title><style>body{font-family:Arial;font-size:11px;padding:16px}h2{margin:0 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#f1f5f9}</style></head><body><h2>EMTEES Academy — ${esc(title)}</h2><div>${new Date().toLocaleString("en-IN")}</div><br/>${table}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    return;
  }
  let blob: Blob;
  if (kind === "csv") {
    const q = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    blob = new Blob(["﻿" + [columns.map((c) => q(c.label)).join(","), ...rows.map((r) => columns.map((c) => q(r[c.key])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" });
  } else blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${table}</body></html>`], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${name}.${kind}`; a.click(); URL.revokeObjectURL(a.href);
}


/** Uploads one file with the signed-in staff login and returns its URL. Public registration uses its own token-based upload. */
export async function uploadStaffDoc(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("File must be under 5 MB");
  const b64: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const up = await fetch("/api/uploads/doc", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` }, body: JSON.stringify({ filename: file.name, dataBase64: b64 }) });
  const j = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(j.error || "Upload failed");
  return j.url as string;
}
export const DOC_TYPES = [{ value: "payment_receipt", label: "Payment screenshot / receipt" }, { value: "id_proof", label: "ID proof" }, { value: "address_proof", label: "Address proof" }, { value: "other", label: "Other document" }];
