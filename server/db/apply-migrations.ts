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

