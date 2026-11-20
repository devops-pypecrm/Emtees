import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button, Input, Textarea, Field, Pick, Loading, DEPT_OPTIONS, useForm } from "@/lib/kit";
import { CheckCircle2 } from "lucide-react";

/** Public student registration form opened from the counsellor's link (SRS 3.2). */
export default function Register() {
  const { token = "" } = useParams();
  const info = trpc.admissions.publicGet.useQuery({ token }, { retry: false });
  const submit = trpc.admissions.publicSubmit.useMutation();
  const f = useForm({ fullName: "", mobile: "", whatsapp: "", email: "", gender: "", dateOfBirth: "", place: "", state: "", country: "India", department: "", preferredTiming: "", sessionType: "", amountPaid: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "", transactionRef: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ dup: boolean } | null>(null);

  if (info.isLoading) return <div className="min-h-screen flex items-center justify-center"><Loading /></div>;
  if (info.error) return <div className="min-h-screen flex items-center justify-center p-6 text-center text-slate-600">{info.error.message}</div>;
  if (info.data?.done && !done) return <div className="min-h-screen flex items-center justify-center p-6 text-center text-slate-600">This registration has already been submitted. Thank you.</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3"><CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
        <h1 className="text-xl font-semibold">Registration received</h1>
        <p className="text-slate-600 text-sm">Our accounts team will verify your payment. Once it is verified your teacher will be assigned and you will receive your login details.</p>
        {done.dup && <p className="text-amber-700 text-sm">This mobile number is already in our records, so an administrator will review your registration first.</p>}
      </div>
    </div>
  );

  const c = info.data!.counsellor;
  const send = async () => {
    const v = f.v;
    const need: [string, string][] = [["fullName", "full name"], ["mobile", "mobile number"], ["place", "place"], ["state", "state"], ["country", "country"], ["department", "course"], ["preferredTiming", "preferred class timing"], ["sessionType", "session type"], ["amountPaid", "amount paid"], ["paymentMethod", "payment method"], ["transactionRef", "transaction ID / reference"]];
    for (const [k, l] of need) if (!(v as any)[k]) return toast.error(`Please enter ${l}`);
    if (!file) return toast.error("Please upload your payment receipt");
    setBusy(true);
    try {
      const b64: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      const up = await fetch(`/api/uploads/receipt/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, dataBase64: b64 }) });
      const uj = await up.json();
      if (!up.ok) throw new Error(uj.error || "Receipt upload failed");
      const r = await submit.mutateAsync({ token, ...v, amountPaid: Number(v.amountPaid), department: v.department as any, sessionType: v.sessionType as any, receiptUrl: uj.url, email: v.email || undefined, whatsapp: v.whatsapp || undefined });
      setDone({ dup: r.flaggedDuplicate });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border p-5 md:p-7 space-y-6">
        <div className="text-center"><img src="/logo.jpg" className="h-14 mx-auto rounded" alt="" /><h1 className="text-xl font-semibold mt-2">EMTEES Academy — Student Registration</h1></div>
        {c && <div className="rounded-lg bg-slate-50 border p-3 text-sm"><div className="font-medium mb-1">Your counsellor</div>{c.name} · ID {c.employeeId} · {c.phone}</div>}

        <section className="space-y-3"><h2 className="font-semibold">Personal information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full name *"><Input value={f.v.fullName} onChange={(e) => f.set("fullName", e.target.value)} /></Field>
            <Field label="Mobile number *"><Input inputMode="tel" value={f.v.mobile} onChange={(e) => f.set("mobile", e.target.value)} /></Field>
            <Field label="WhatsApp number"><Input inputMode="tel" value={f.v.whatsapp} onChange={(e) => f.set("whatsapp", e.target.value)} placeholder="Same as mobile if empty" /></Field>
            <Field label="Email address"><Input type="email" value={f.v.email} onChange={(e) => f.set("email", e.target.value)} /></Field>
            <Field label="Gender (optional)"><Pick value={f.v.gender} onChange={(x) => f.set("gender", x)} options={["Male", "Female", "Other"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Date of birth (optional)"><Input type="date" value={f.v.dateOfBirth} onChange={(e) => f.set("dateOfBirth", e.target.value)} /></Field>
            <Field label="Place *"><Input value={f.v.place} onChange={(e) => f.set("place", e.target.value)} /></Field>
            <Field label="State *"><Input value={f.v.state} onChange={(e) => f.set("state", e.target.value)} /></Field>
            <Field label="Country *"><Input value={f.v.country} onChange={(e) => f.set("country", e.target.value)} /></Field>
          </div></section>

        <section className="space-y-3"><h2 className="font-semibold">Course information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Course *"><Pick value={f.v.department} onChange={(x) => f.set("department", x)} options={DEPT_OPTIONS} /></Field>
            <Field label="Session type *"><Pick value={f.v.sessionType} onChange={(x) => f.set("sessionType", x)} options={[{ value: "individual", label: "Individual session" }, { value: "group", label: "Group session" }]} /></Field>
            <div className="md:col-span-2"><Field label="Preferred class timing *"><Input value={f.v.preferredTiming} onChange={(e) => f.set("preferredTiming", e.target.value)} placeholder="e.g. 7:00 PM – 8:00 PM" /></Field></div>
          </div></section>

        <section className="space-y-3"><h2 className="font-semibold">Payment information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Amount paid (₹) *"><Input inputMode="decimal" value={f.v.amountPaid} onChange={(e) => f.set("amountPaid", e.target.value)} /></Field>
            <Field label="Payment date *"><Input type="date" value={f.v.paymentDate} onChange={(e) => f.set("paymentDate", e.target.value)} /></Field>
            <Field label="Payment method *"><Pick value={f.v.paymentMethod} onChange={(x) => f.set("paymentMethod", x)} options={["UPI", "Bank transfer", "Card", "Cash", "Other"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Transaction ID / reference *"><Input value={f.v.transactionRef} onChange={(e) => f.set("transactionRef", e.target.value)} /></Field>
            <div className="md:col-span-2"><Field label="Payment receipt (image or PDF, max 5 MB) *"><Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field></div>
          </div></section>

        <Button className="w-full bg-[#C8102E] hover:bg-[#A50C22]" disabled={busy} onClick={send}>{busy ? "Submitting…" : "Submit registration"}</Button>
      </div>
    </div>
  );
}
