// ONE-OFF (not run at boot): drops the tables of features that were removed because they are not in the SRS.
// A full database backup was taken first (see HANDOVER.md > Backups). Row counts are printed before dropping.
//   cd ~/emtees-api/server && npx tsx db/drop-removed-features.ts           -> dry run (counts only)
//   cd ~/emtees-api/server && npx tsx db/drop-removed-features.ts --apply   -> drops them
import { sql } from "drizzle-orm";
import { getDb } from "../src/queries/connection";

const TABLES = [
  "announcement_dismissals", "announcements", "feedback", "violations",
  "learning_materials", "learning_notes", "learning_videos", "assignment_submissions", "assignments",
  "community_post_reactions", "community_saved_careers", "community_lesson_views", "community_comments",
  "community_posts", "community_lessons", "community_careers", "community_success_stories", "community_active_users",
  "performance_reports", "performance_configs", "sales_points_rules", "lead_campaigns", "sales_leads",
  "messages", "private_message_audit_logs", "private_messages",
  "report_templates", "class_sessions", "student_enrollments", "teacher_class_summary",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();
  let existing = 0, rows = 0;
  for (const t of TABLES) {
    const ex: any = await db.execute(sql.raw(`select to_regclass('public.${t}') as r`));
    if (!((ex.rows ?? ex)[0] as any).r) { console.log(`${t.padEnd(32)} (already gone)`); continue; }
    const c: any = await db.execute(sql.raw(`select count(*)::int as n from public."${t}"`));
    const n = ((c.rows ?? c)[0] as any).n;
    existing++; rows += n;
    console.log(`${t.padEnd(32)} ${String(n).padStart(6)} rows`);
    if (apply) await db.execute(sql.raw(`drop table if exists public."${t}" cascade`));
  }
  console.log(`\n${apply ? "DROPPED" : "WOULD DROP"} ${existing} table(s), ${rows} row(s) in total.`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
