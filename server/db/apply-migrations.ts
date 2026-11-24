import pg from "pg";
import { env } from "../src/lib/env";

export async function applyMigrations() {
  console.log("Applying manual migrations...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("Adding sales_executive value to role enum...");
    // Add value if not exists requires a check block in Postgres if done inside transaction or just running it
    // Alter type add value cannot be executed inside a transaction block in older postgres version, pg_enum is checked
    const enumCheck = await client.query(`
      SELECT 1 FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'role' AND e.enumlabel = 'sales_executive';
    `);
    
    if (enumCheck.rows.length === 0) {
      await client.query(`ALTER TYPE "role" ADD VALUE 'sales_executive';`);
      console.log("Added 'sales_executive' to role enum.");
    } else {
      console.log("'sales_executive' already exists in role enum.");
    }


    console.log("Creating sales_executives table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "sales_executives" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "employee_id" varchar(50) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "email" varchar(320),
        "phone" varchar(50),
        "country_code" varchar(10),
        "country_iso" varchar(10),
        "phone_number" varchar(20),
        "full_international_number" varchar(50),
        "username" varchar(100) NOT NULL,
        "password" varchar(255) NOT NULL,
        "referral_code" varchar(50) NOT NULL UNIQUE,
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Creating unique indexes on sales_executives...");
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "referral_code_idx" ON "sales_executives" USING btree ("referral_code");`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "employee_id_idx" ON "sales_executives" USING btree ("employee_id");`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "exec_full_phone_idx" ON "sales_executives" USING btree ("full_international_number");`);

    console.log("Adding columns to users table...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sales_executive_id" integer REFERENCES "sales_executives"("id") ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" varchar(50);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_source" varchar(50) DEFAULT 'direct';`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country_iso" varchar(10);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_international_number" varchar(50);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "full_int_phone_idx" ON "users" ("full_international_number");`);
    
    console.log("Adding teacher columns to users table...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(50);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_of_birth" timestamp;`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "educational_qualification" text;`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "specialization" varchar(255);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teaching_experience" integer;`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" text;`);



    console.log("Adding package_config to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "package_config" json DEFAULT '{"oneToOne": {"total": 0, "min30": 0, "min45": 0, "min60": 0}, "group": {"total": 0, "min30": 0, "min45": 0, "min60": 0}}';`);

    console.log("Adding payment_option, down_payment, remaining_balance, total_course_fee to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "payment_option" varchar(20) DEFAULT 'full_payment';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "down_payment" decimal(10, 2) DEFAULT '0';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "remaining_balance" decimal(10, 2) DEFAULT '0';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "total_course_fee" decimal(10, 2) DEFAULT '0';`);

    console.log("Adding course_fee and minimum_down_payment to modules...");
    await client.query(`ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "course_fee" decimal(10, 2) DEFAULT '0';`);
    await client.query(`ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "minimum_down_payment" decimal(10, 2) DEFAULT '0';`);

    console.log("Adding assigned_teachers to batch_enrollments...");
    await client.query(`ALTER TABLE "batch_enrollments" ADD COLUMN IF NOT EXISTS "assigned_teachers" json DEFAULT '[]';`);

    console.log("Creating student_course_audit_logs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "student_course_audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "changed_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "change_type" varchar(50) NOT NULL,
        "old_value" text,
        "new_value" text,
        "changed_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Adding enrollment_id to profiles table...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "enrollment_id" varchar(255);`);

    console.log("Creating unique index enrollment_id_unique on profiles...");
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "enrollment_id_unique" ON "profiles" ("enrollment_id");`);

    console.log("Adding parent phone standardized columns to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_country_code" varchar(10);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_country_iso" varchar(10);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_phone_number" varchar(20);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_full_international_number" varchar(50);`);
    await client.query(`CREATE INDEX IF NOT EXISTS "parent_full_phone_idx" ON "profiles" ("parent_full_international_number");`);

    console.log("Creating student_id_sequence table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "student_id_sequence" (
        "prefix" varchar(50) PRIMARY KEY NOT NULL,
        "last_number" integer NOT NULL DEFAULT 0,
        "number_length" integer NOT NULL DEFAULT 4
      );
    `);

    console.log("Initializing default student ID sequence prefix STU...");
    await client.query(`
      INSERT INTO "student_id_sequence" ("prefix", "last_number", "number_length")
      VALUES ('STU', 0, 4)
      ON CONFLICT DO NOTHING;
    `);

    console.log("Backfilling existing student profiles with union_id as enrollment_id...");
    await client.query(`
      UPDATE "profiles"
      SET "enrollment_id" = u."union_id"
      FROM "users" u
      WHERE "profiles"."user_id" = u."id"
        AND u."role" = 'student'
        AND "profiles"."enrollment_id" IS NULL;
    `);

    console.log("Adding salary enhancement columns...");
    await client.query(`
      ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "actual_duration" integer;

      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_30min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_45min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_60min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_30min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_45min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_60min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;

      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_30min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_45min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_60min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_30min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_45min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_60min_count" integer DEFAULT 0;

      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_30min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_45min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_60min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_30min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_45min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_60min_rate" decimal(10, 2) DEFAULT '0';

      -- Teacher Report Enhancements
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "specialization" text;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "experience" text;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "address" text;

      ALTER TABLE "teacher_salary_configs" DROP COLUMN IF EXISTS "bonus_amount";
      ALTER TABLE "teacher_salary_configs" DROP COLUMN IF EXISTS "deduction_amount";

      ALTER TABLE "teacher_salaries" DROP COLUMN IF EXISTS "bonus_amount";
      ALTER TABLE "teacher_salaries" DROP COLUMN IF EXISTS "deduction_amount";
      ALTER TABLE "teacher_salaries" DROP COLUMN IF EXISTS "incentive_amount";
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "net_salary" decimal(10, 2) DEFAULT '0';
    `);

    console.log("Creating student_enrollments table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "student_enrollments" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "batch_id" integer NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
        "teacher_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "session_type" varchar(50) NOT NULL,
        "class_duration" integer NOT NULL,
        "total_classes" integer NOT NULL,
        "completed_classes" integer DEFAULT 0 NOT NULL,
        "remaining_classes" integer NOT NULL,
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "start_date" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Adding start_date column to student_enrollments if not exists...");
    await client.query(`
      ALTER TABLE "student_enrollments" ADD COLUMN IF NOT EXISTS "start_date" timestamp;
    `);

    console.log("Creating class_sessions table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "class_sessions" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "teacher_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "batch_id" integer NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
        "enrollment_id" integer NOT NULL REFERENCES "student_enrollments"("id") ON DELETE CASCADE,
        "session_type" varchar(50) NOT NULL,
        "duration" integer NOT NULL,
        "started_at" timestamp,
        "ended_at" timestamp,
        "actual_duration" integer,
        "attendance_status" varchar(50),
        "remarks" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Creating teacher_class_summary table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "teacher_class_summary" (
        "id" serial PRIMARY KEY NOT NULL,
        "teacher_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "total_assigned_classes" integer DEFAULT 0 NOT NULL,
        "completed_classes" integer DEFAULT 0 NOT NULL,
        "remaining_classes" integer DEFAULT 0 NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Adding session type and preferred timing columns to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "payment_type" varchar(50) DEFAULT 'full_payment';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "one_on_one_enabled" boolean DEFAULT false NOT NULL;`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "group_session_enabled" boolean DEFAULT false NOT NULL;`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "preferred_class_time" varchar(50);`);

    console.log("Backfilling one_on_one_enabled and group_session_enabled for existing students...");
    await client.query(`
      UPDATE "profiles"
      SET 
        "one_on_one_enabled" = CASE 
          WHEN "allocated_one_to_one_sessions" > 0 OR "batch" ILIKE '%one%' OR "batch" ILIKE '%1:1%' THEN true
          ELSE true
        END,
        "group_session_enabled" = CASE 
          WHEN "allocated_group_sessions" > 0 OR "batch" ILIKE '%group%' THEN true
          ELSE true
        END,
        "payment_type" = COALESCE("payment_type", "payment_option", 'full_payment')
      WHERE "one_on_one_enabled" = false AND "group_session_enabled" = false;
    `);

    console.log("Creating qualifications table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "qualifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255) NOT NULL UNIQUE,
        "is_active" boolean DEFAULT true NOT NULL,
        "display_order" integer DEFAULT 0 NOT NULL,
        "created_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await client.query(`ALTER TABLE "qualifications" ADD COLUMN IF NOT EXISTS "created_by" integer;`);

    console.log("Creating qualification_audit_logs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "qualification_audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "qualification_id" integer,
        "action" varchar(50) NOT NULL,
        "performed_by" integer,
        "old_value" text,
        "new_value" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Adding postal_code and qualification_id columns to users and profiles...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postal_code" varchar(20);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "raw_password" varchar(255);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qualification_id" integer REFERENCES "qualifications"("id") ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "postal_code" varchar(20);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "qualification_id" integer REFERENCES "qualifications"("id") ON DELETE SET NULL;`);

    console.log("Seeding default qualifications if table is empty...");
    const qualCheck = await client.query(`SELECT COUNT(*) FROM "qualifications"`);
    if (parseInt(qualCheck.rows[0].count, 10) === 0) {
      const defaultQuals = ["SSLC", "Plus Two", "Diploma", "ITI", "Bachelor's Degree", "Master's Degree", "PhD", "Other"];
      for (let i = 0; i < defaultQuals.length; i++) {
        await client.query(
          `INSERT INTO "qualifications" ("name", "is_active", "display_order") VALUES ($1, true, $2) ON CONFLICT DO NOTHING`,
          [defaultQuals[i], i + 1]
        );
      }
    }

    console.log("Adding session_type, enrollment_status, module_id to profiles and session_type to batches...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "session_type" varchar(50) DEFAULT 'group';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "enrollment_status" varchar(50) DEFAULT 'waiting_for_batch';`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "module_id" bigint REFERENCES "modules"("id") ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "session_type" varchar(50) DEFAULT 'group';`);

    console.log("Adding department column to users and profiles...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" varchar(255);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "department" varchar(255);`);

    console.log("Adding attendance statuses interrupted / technical_issue...");
    await client.query(`ALTER TYPE "attendance_status" ADD VALUE IF NOT EXISTS 'interrupted';`);
    await client.query(`ALTER TYPE "attendance_status" ADD VALUE IF NOT EXISTS 'technical_issue';`);

    console.log("Creating SRS tables (admissions, audit, allocations, remuneration...)...");
    await client.query(`ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'accountant';`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "admissions" (
        "id" serial PRIMARY KEY, "token" varchar(64) NOT NULL UNIQUE, "counsellor_id" bigint NOT NULL,
        "student_user_id" bigint, "status" varchar(40) NOT NULL DEFAULT 'link_generated',
        "department" varchar(20), "session_type" varchar(20), "preferred_timing" varchar(100),
        "full_name" varchar(255), "mobile" varchar(30), "whatsapp" varchar(30), "email" varchar(320),
        "gender" varchar(20), "date_of_birth" varchar(20), "place" varchar(255), "state" varchar(255), "country" varchar(255),
        "amount_paid" decimal(10,2), "payment_date" varchar(20), "payment_method" varchar(50), "transaction_ref" varchar(255),
        "receipt_url" varchar(500), "verified_amount" decimal(10,2), "verified_by" bigint, "verified_at" timestamp,
        "reject_reason" text, "duplicate_of_user_id" bigint, "duplicate_resolved" boolean NOT NULL DEFAULT false, "demo_id" bigint,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "admission_status_history" (
        "id" serial PRIMARY KEY, "admission_id" bigint NOT NULL, "from_status" varchar(40), "to_status" varchar(40) NOT NULL,
        "changed_by" bigint, "note" text, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" serial PRIMARY KEY, "user_id" bigint, "user_name" varchar(255), "action" varchar(80) NOT NULL, "entity" varchar(60) NOT NULL,
        "entity_id" varchar(60), "previous_value" jsonb, "new_value" jsonb, "reason" text, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_logs" ("entity","entity_id");
      CREATE TABLE IF NOT EXISTS "course_allocations" (
        "id" serial PRIMARY KEY, "student_user_id" bigint NOT NULL, "admission_id" bigint, "kind" varchar(20) NOT NULL DEFAULT 'initial',
        "classes" integer NOT NULL, "duration_minutes" integer NOT NULL DEFAULT 30, "session_type" varchar(20) NOT NULL DEFAULT 'individual',
        "amount" decimal(10,2), "special_conditions" text, "reason" text, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "teacher_assignments" (
        "id" serial PRIMARY KEY, "student_user_id" bigint NOT NULL, "teacher_id" bigint NOT NULL, "department" varchar(20),
        "preferred_timing" varchar(100), "duration_minutes" integer, "classes_at_start" integer, "reason" varchar(50), "reason_note" text,
        "assigned_by" bigint, "started_at" timestamp NOT NULL DEFAULT now(), "ended_at" timestamp);
      CREATE TABLE IF NOT EXISTS "course_extensions" (
        "id" serial PRIMARY KEY, "student_user_id" bigint NOT NULL, "original_expiry" timestamp, "revised_expiry" timestamp NOT NULL,
        "days_added" integer, "reactivated_classes" integer DEFAULT 0, "reason" text NOT NULL, "approved_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "remuneration_rules" (
        "id" serial PRIMARY KEY, "teacher_id" bigint, "student_user_id" bigint, "course" varchar(20), "session_type" varchar(20),
        "group_size" integer, "duration_minutes" integer, "kind" varchar(20) NOT NULL DEFAULT 'regular', "amount" decimal(10,2) NOT NULL,
        "active" boolean NOT NULL DEFAULT true, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "remuneration_entries" (
        "id" serial PRIMARY KEY, "teacher_id" bigint NOT NULL, "kind" varchar(20) NOT NULL, "one_to_one_session_id" bigint, "class_id" bigint,
        "demo_id" bigint, "student_user_id" bigint, "rule_id" bigint, "amount" decimal(10,2) NOT NULL, "reason" text,
        "status" varchar(20) NOT NULL DEFAULT 'pending', "approved_by" bigint, "paid_at" timestamp, "payment_method" varchar(50),
        "transaction_id" varchar(255), "earned_at" timestamp NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX IF NOT EXISTS "rem_entry_session_uq" ON "remuneration_entries" ("one_to_one_session_id","kind") WHERE "one_to_one_session_id" IS NOT NULL AND "kind" IN ('regular','group');
      CREATE UNIQUE INDEX IF NOT EXISTS "rem_entry_bonus_uq" ON "remuneration_entries" ("demo_id","kind") WHERE "demo_id" IS NOT NULL;
      CREATE TABLE IF NOT EXISTS "teacher_availability" (
        "id" serial PRIMARY KEY, "teacher_id" bigint NOT NULL, "working_days" varchar(40) NOT NULL DEFAULT '1,2,3,4,5,6',
        "start_time" varchar(5) NOT NULL DEFAULT '09:00', "end_time" varchar(5) NOT NULL DEFAULT '18:00', "break_start" varchar(5), "break_end" varchar(5),
        "max_workload" integer, "status" varchar(20) NOT NULL DEFAULT 'approved', "decided_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS "support_requests" (
        "id" serial PRIMARY KEY, "from_user_id" bigint NOT NULL, "type" varchar(30) NOT NULL, "department" varchar(20),
        "routed_to" varchar(30) NOT NULL DEFAULT 'academic_head', "message" text, "status" varchar(20) NOT NULL DEFAULT 'open',
        "response" text, "resolved_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());
    `);
    await client.query(`CREATE TABLE IF NOT EXISTS "timetable_slots" (
      "id" serial PRIMARY KEY, "student_user_id" bigint NOT NULL, "teacher_id" bigint NOT NULL, "weekdays" varchar(20) NOT NULL,
      "time_of_day" varchar(5) NOT NULL, "duration_minutes" integer NOT NULL DEFAULT 30, "starts_on" timestamp NOT NULL DEFAULT now(),
      "active" boolean NOT NULL DEFAULT true, "on_hold" boolean NOT NULL DEFAULT false, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now());`);
    // One-off backfill: existing students get a current teacher assignment from their latest session (only if they have none).
    await client.query(`INSERT INTO teacher_assignments (student_user_id, teacher_id, reason, started_at)
      SELECT DISTINCT ON (s.student_id) s.student_id, s.teacher_id, 'initial', now()
      FROM one_to_one_sessions s
      WHERE NOT EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.student_user_id = s.student_id)
      ORDER BY s.student_id, s.scheduled_at DESC;`);
    await client.query(`CREATE TABLE IF NOT EXISTS "staff_profiles" (
      "id" serial PRIMARY KEY, "user_id" bigint NOT NULL UNIQUE, "employee_id" varchar(50), "whatsapp" varchar(30), "departments" varchar(40),
      "languages" varchar(255), "qualification" varchar(255), "team" varchar(100), "joining_date" varchar(20), "employment_status" varchar(30) DEFAULT 'active',
      "created_at" timestamp NOT NULL DEFAULT now());`);
    // ---- Existing student data -> SRS records (idempotent: only fills what is missing) ----
    console.log("Backfilling allocations and admissions for existing students...");
    await client.query(`INSERT INTO course_allocations (student_user_id, kind, classes, duration_minutes, session_type, reason)
      SELECT p.user_id, 'initial', p.total_allocated_sessions, 30,
             CASE WHEN p.session_type = 'group' THEN 'group' ELSE 'individual' END, 'Imported from existing student record'
      FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE u.role = 'student' AND p.total_allocated_sessions > 0
        AND NOT EXISTS (SELECT 1 FROM course_allocations c WHERE c.student_user_id = p.user_id);`);
    await client.query(`INSERT INTO admissions (token, counsellor_id, student_user_id, status, department, session_type, preferred_timing, full_name, mobile, email,
        amount_paid, verified_amount, verified_at, payment_method, created_at)
      SELECT md5(random()::text || u.id::text), COALESCE(u.sales_executive_id, (SELECT min(id) FROM sales_executives)), u.id,
        CASE
          WHEN p.validity_end_date IS NOT NULL AND p.validity_end_date < now() THEN 'expired'
          WHEN COALESCE(p.total_allocated_sessions,0) > 0 AND EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.student_user_id = u.id AND a.ended_at IS NULL) THEN 'active'
          WHEN COALESCE(p.total_allocated_sessions,0) > 0 THEN 'awaiting_assignment'
          ELSE 'registration_completed' END,
        CASE WHEN COALESCE(p.department, u.department, '') ILIKE '%hindi%' THEN 'hindi' ELSE 'english' END,
        CASE WHEN p.session_type = 'group' THEN 'group' ELSE 'individual' END, p.preferred_class_time, u.name, u.phone, u.email,
        (SELECT sum(pay.amount) FROM payments pay WHERE pay.student_id = u.id AND pay.payment_status = 'paid'),
        (SELECT sum(pay.amount) FROM payments pay WHERE pay.student_id = u.id AND pay.payment_status = 'paid'),
        CASE WHEN EXISTS (SELECT 1 FROM payments pay WHERE pay.student_id = u.id AND pay.payment_status = 'paid') THEN now() END,
        'imported', u.created_at
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.role = 'student' AND EXISTS (SELECT 1 FROM sales_executives)
        AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.student_user_id = u.id);`);
    await client.query(`INSERT INTO admission_status_history (admission_id, to_status, note)
      SELECT a.id, a.status, 'Imported from existing student record' FROM admissions a
      WHERE a.payment_method = 'imported' AND NOT EXISTS (SELECT 1 FROM admission_status_history h WHERE h.admission_id = a.id);`);
    // Testing: minimum qualifying minutes 1 -> 5 (one time only; later changes in Settings are never overwritten).
    await client.query(`ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "documents" jsonb DEFAULT '[]'::jsonb;`);
    // A student counts as inactive when, over their last N class days (Sundays excluded), they never attended.
    await client.query(`
      CREATE OR REPLACE FUNCTION student_activity(uid bigint, n int) RETURNS text AS $$
        SELECT CASE WHEN count(*) >= n AND NOT coalesce(bool_or(p), false) THEN 'Inactive' ELSE 'Active' END FROM (
          SELECT d, bool_or(p) p FROM (
            SELECT (s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date d,
                   EXISTS (SELECT 1 FROM attendance a WHERE a.one_to_one_session_id = s.id AND a.attendance_status = 'present') p
            FROM one_to_one_sessions s
            WHERE s.student_id = uid AND s.scheduled_at < now() AND s.session_status NOT IN ('cancelled', 'ongoing')
              AND extract(dow FROM s.scheduled_at AT TIME ZONE 'Asia/Kolkata') <> 0
          ) t GROUP BY d ORDER BY d DESC LIMIT n
        ) z
      $$ LANGUAGE sql STABLE;
    `);
    console.log("Creating password_resets table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "password_resets" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" bigint NOT NULL,
        "code_hash" varchar(255) NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "attempts" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    const m5 = await client.query(`INSERT INTO system_settings (key, value) VALUES ('migration_min5_applied','yes') ON CONFLICT (key) DO NOTHING RETURNING key`);
    if (m5.rowCount) {
      await client.query(`INSERT INTO system_settings (key, value) VALUES ('class_duration_threshold','5')
        ON CONFLICT (key) DO UPDATE SET value='5', updated_at=now();`);
    }
    await client.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "credits" integer NOT NULL DEFAULT 1;`);
    await client.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "pay_override" decimal(10,2);`);
    await client.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "special_conditions" text;`);
    await client.query(`ALTER TABLE "one_to_one_sessions" ADD COLUMN IF NOT EXISTS "is_manual" boolean NOT NULL DEFAULT false;`);
    await client.query(`ALTER TABLE "one_to_one_sessions" ADD COLUMN IF NOT EXISTS "meet_link" varchar(500);`);
    await client.query(`ALTER TABLE "one_to_one_sessions" ADD COLUMN IF NOT EXISTS "manual_reason" text;`);
    await client.query(`ALTER TABLE "one_to_one_sessions" ADD COLUMN IF NOT EXISTS "entered_by" bigint;`);
    await client.query(`ALTER TABLE "demo_classes" ADD COLUMN IF NOT EXISTS "whatsapp" varchar(50);`);
    await client.query(`ALTER TABLE "demo_classes" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp;`);
    await client.query(`ALTER TABLE "demo_classes" ADD COLUMN IF NOT EXISTS "student_attended" boolean;`);
    await client.query(`ALTER TABLE "demo_classes" ADD COLUMN IF NOT EXISTS "feedback" text;`);

    console.log("Creating holidays table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "holidays" (
        "id" serial PRIMARY KEY NOT NULL,
        "date" timestamp NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "holiday_date_idx" ON "holidays" USING btree ("date");`);

    console.log("Altering attendance table columns...");
    await client.query(`
      ALTER TABLE "attendance" ALTER COLUMN "class_id" DROP NOT NULL;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "one_to_one_session_id" bigint REFERENCES "one_to_one_sessions"("id") ON DELETE CASCADE;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "teacher_id" bigint REFERENCES "users"("id") ON DELETE SET NULL;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "batch_id" bigint REFERENCES "batches"("id") ON DELETE SET NULL;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "module_id" bigint REFERENCES "modules"("id") ON DELETE SET NULL;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "meeting_id" varchar(255);
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "attendance_date" timestamp;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "session_type" varchar(50) DEFAULT 'group';
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "remarks" text;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL;
      ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "updated_by" bigint REFERENCES "users"("id") ON DELETE SET NULL;
    `);

    console.log("Creating unique and single column indexes on attendance...");
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "unique_oto_attendance_idx" ON "attendance" ("one_to_one_session_id", "student_id");
      CREATE INDEX IF NOT EXISTS "attendance_teacher_idx" ON "attendance" ("teacher_id");
      CREATE INDEX IF NOT EXISTS "attendance_student_idx" ON "attendance" ("student_id");
      CREATE INDEX IF NOT EXISTS "attendance_date_idx" ON "attendance" ("attendance_date");
      CREATE INDEX IF NOT EXISTS "attendance_batch_idx" ON "attendance" ("batch_id");
      CREATE INDEX IF NOT EXISTS "attendance_module_idx" ON "attendance" ("module_id");
    `);

    console.log("Backfilling existing attendance records...");
    await client.query(`
      UPDATE "attendance" a
      SET
        "teacher_id" = COALESCE(a."teacher_id", c."teacher_id"),
        "batch_id" = COALESCE(a."batch_id", c."batch_id"),
        "module_id" = COALESCE(a."module_id", b."module_id"),
        "meeting_id" = COALESCE(a."meeting_id", c."meeting_room_id"),
        "attendance_date" = COALESCE(a."attendance_date", c."scheduled_at", a."recorded_at"),
        "session_type" = COALESCE(a."session_type", c."class_type"::text, 'group'),
        "created_by" = COALESCE(a."created_by", c."teacher_id"),
        "updated_by" = COALESCE(a."updated_by", c."teacher_id")
      FROM "classes" c
      LEFT JOIN "batches" b ON c."batch_id" = b."id"
      WHERE a."class_id" = c."id"
        AND (a."teacher_id" IS NULL OR a."batch_id" IS NULL OR a."module_id" IS NULL OR a."attendance_date" IS NULL);
    `);

    console.log("Backfilling completed 1-to-1 sessions into attendance table...");
    await client.query(`
      INSERT INTO "attendance" (
        "one_to_one_session_id",
        "student_id",
        "teacher_id",
        "attendance_date",
        "session_type",
        "attendance_status",
        "duration",
        "meeting_id",
        "remarks",
        "created_by",
        "updated_by",
        "recorded_at"
      )
      SELECT
        s."id",
        s."student_id",
        s."teacher_id",
        s."scheduled_at",
        'one_to_one',
        CASE WHEN s."student_attendance" = 'present' THEN 'present'::attendance_status ELSE 'absent'::attendance_status END,
        s."actual_duration",
        s."meeting_room_id",
        s."remarks",
        s."created_by",
        s."teacher_id",
        COALESCE(s."completed_at", s."created_at")
      FROM "one_to_one_sessions" s
      WHERE s."session_status" = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM "attendance" a WHERE a."one_to_one_session_id" = s."id"
        )
      ON CONFLICT DO NOTHING;
    `);

    console.log("Migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes("apply-migrations")) {
  applyMigrations().catch(() => process.exit(1));
}

