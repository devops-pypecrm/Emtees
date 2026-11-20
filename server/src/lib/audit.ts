import { auditLogs } from "@db/srs-schema";

/** SRS 19.1: record who did what, when, the previous and new value, and the reason. Never throws. */
export async function audit(
  db: any,
  actor: { id: number; name?: string | null } | undefined,
  action: string,
  entity: string,
  entityId: string | number | null,
  previousValue: unknown,
  newValue: unknown,
  reason?: string | null
) {
  try {
    await db.insert(auditLogs).values({
      userId: actor?.id ?? null,
      userName: actor?.name ?? null,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      reason: reason ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to write log", action, e);
  }
}
