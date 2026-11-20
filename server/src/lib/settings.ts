import { eq } from "drizzle-orm";
import { systemSettings } from "@db/schema";

/** Admin-editable settings (table `system_settings`). Every value has a default so a fresh database works. */
export const SETTING_DEFAULTS = {
  /** Minutes both people must be connected together for one class to count (SRS 8.3). */
  class_duration_threshold: 20,
  /** A dropped person who rejoins within this many minutes continues the same logical session (SRS 8.4). */
  reconnection_window_minutes: 5,
  /** Course validity in days, counted from the first actual class (SRS 11). */
  course_validity_days: 60,
  /** Consecutive absences before an alert is raised. */
  absent_consecutive_threshold: 7,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getNumberSetting(db: any, key: SettingKey): Promise<number> {
  const row = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, key) });
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : SETTING_DEFAULTS[key];
}
