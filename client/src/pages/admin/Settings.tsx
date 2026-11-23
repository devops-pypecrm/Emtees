import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Page, Button, Input, Field, Loading, Card, Pick } from "@/lib/kit";

/** Every rule value from SRS section 19 in one place. Changes are written to the audit log. */
export default function SettingsPage() {
  const q = trpc.staff.configGet.useQuery();
  const save = trpc.staff.configSave.useMutation({ onSuccess: (r) => { toast.success(r.changed ? "Settings saved" : "Nothing changed"); q.refetch(); }, onError: (e) => toast.error(e.message) });
  const [v, setV] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  useEffect(() => { if (q.data) setV(Object.fromEntries(q.data.map((x: any) => [x.key, x.value]))); }, [q.data]);
  if (!q.data) return <Loading />;
  const groups: [string, string[]][] = [
    ["Class rules", ["class_duration_threshold", "default_class_duration", "reconnection_window_minutes", "course_validity_days", "absent_consecutive_threshold"]],
    ["Default teacher pay (rules in “Pay rates” override these)", ["rate_regular_30min", "rate_demo", "rate_demo_bonus"]],
    ["Alerts", ["expiry_alert_days", "low_balance_threshold"]],
    ["Classroom & notifications", ["meet_fallback_enabled", "video_start_muted", "video_start_camera_off", "notify_email", "notify_whatsapp"]],
    ["Student support contact", ["support_phone", "support_email"]],
  ];
  const by = Object.fromEntries(q.data.map((x: any) => [x.key, x]));
  return (
    <Page title="Settings" subtitle="Changing a value here only affects future classes — what is already recorded never changes."
      actions={<Button disabled={save.isPending} onClick={() => save.mutate({ values: v, reason: reason || undefined })}>Save settings</Button>}>
      {groups.map(([title, keys]) => (
        <Card key={title} className="p-5 gap-4"><h2 className="font-semibold">{title}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {keys.map((k) => by[k] && (
              <Field key={k} label={by[k].label}>
                {by[k].type === "toggle"
                  ? <Pick value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
                  : <Input inputMode={by[k].type === "number" ? "numeric" : undefined} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
              </Field>
            ))}
          </div></Card>
      ))}
      <Field label="Reason for this change (kept in the audit log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Page>
  );
}
