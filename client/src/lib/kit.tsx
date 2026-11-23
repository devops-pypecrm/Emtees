import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

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

export type Col<T> = { header: string; cell: (r: T) => ReactNode; className?: string };
export function Table<T>({ cols, rows, empty = "Nothing to show", onRow, searchable }: { cols: Col<T>[]; rows: T[] | undefined; empty?: string; onRow?: (r: T) => void; searchable?: boolean }) {
  const [q, setQ] = useState("");
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty text={empty} />;
  // A search box appears by itself on longer lists; pages with their own search pass searchable={false}.
  const showSearch = searchable ?? rows.length >= 8;
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => { try { return JSON.stringify(r).toLowerCase().includes(needle); } catch { return true; } }) : rows;
  return (
    <div className="space-y-3">
    {showSearch && <div className="max-w-xs"><Input placeholder="Search this list…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <tr>{cols.map((c, i) => <th key={i} className={`px-5 py-3 font-medium whitespace-nowrap ${c.className || ""}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((r, i) => (
            <tr key={i} className={`${onRow ? "cursor-pointer" : ""} hover:bg-slate-50/70 transition-colors`} onClick={() => onRow?.(r)}>
              {cols.map((c, j) => <td key={j} className={`px-5 py-3.5 align-middle text-slate-700 ${c.className || ""}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <div className="p-8 text-center text-sm text-slate-400">No matches for “{q}”</div>}
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
