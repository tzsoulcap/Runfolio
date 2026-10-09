CREATE TABLE "actual_running_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_log_id" uuid NOT NULL,
	"split_index" integer NOT NULL,
	"distance_m" numeric(10, 2),
	"duration_sec" integer,
	CONSTRAINT "actual_splits_log_index" UNIQUE("workout_log_id","split_index"),
	CONSTRAINT "actual_splits_value" CHECK ("actual_running_splits"."distance_m" IS NOT NULL OR "actual_running_splits"."duration_sec" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "actual_strength_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_log_id" uuid NOT NULL,
	"planned_exercise_id" uuid,
	"exercise_code" text NOT NULL,
	"variant" text,
	"count_mode" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"master_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actual_exercises_count_mode" CHECK ("actual_strength_exercises"."count_mode" IN ('TOTAL', 'PER_SIDE', 'TOTAL_ALTERNATING', 'PER_DIRECTION'))
);
--> statement-breakpoint
CREATE TABLE "actual_strength_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actual_exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"side" text NOT NULL,
	"measurement" text NOT NULL,
	"reps" integer,
	"duration_sec" integer,
	"load_kg" numeric(10, 2),
	"note" text,
	CONSTRAINT "actual_sets_exercise_index_side" UNIQUE("actual_exercise_id","set_index","side"),
	CONSTRAINT "actual_sets_side" CHECK ("actual_strength_sets"."side" IN ('BOTH', 'LEFT', 'RIGHT', 'ALTERNATING', 'OUTBOUND', 'RETURN')),
	CONSTRAINT "actual_sets_measurement" CHECK ("actual_strength_sets"."measurement" IN ('REPS', 'TIME'))
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_rest_day" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_week_date" UNIQUE("weekly_plan_id","date")
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_plan_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"running_workout_code" text,
	"title" text NOT NULL,
	"planned_start_time" text,
	"running_target" jsonb,
	"intensity_target" jsonb,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"plan_state" text DEFAULT 'SCHEDULED' NOT NULL,
	"skip_reason" text,
	"master_snapshot" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_state" CHECK ("plan_items"."plan_state" IN ('SCHEDULED', 'SKIPPED')),
	CONSTRAINT "plan_items_activity" CHECK ("plan_items"."activity_type" IN ('RUNNING', 'STRENGTH'))
);
--> statement-breakpoint
CREATE TABLE "plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_strength_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"exercise_code" text NOT NULL,
	"variant" text NOT NULL,
	"prescription" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"master_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"distance_code" text NOT NULL,
	"distance_m" numeric(10, 2) NOT NULL,
	"goal_type" text NOT NULL,
	"event_name" text,
	"event_date" date,
	"target_time_sec" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"result_workout_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_goals_target_time" CHECK ("race_goals"."target_time_sec" IS NULL OR "race_goals"."target_time_sec" > 0),
	CONSTRAINT "race_goals_status" CHECK ("race_goals"."status" IN ('ACTIVE', 'ACHIEVED', 'ARCHIVED')),
	CONSTRAINT "race_goals_type" CHECK ("race_goals"."goal_type" IN ('FINISH', 'TARGET_TIME'))
);
--> statement-breakpoint
CREATE TABLE "running_workout_masters" (
	"code" text PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text NOT NULL,
	"activity_type" text NOT NULL,
	"purpose" text NOT NULL,
	"zone_min" integer,
	"zone_max" integer,
	"guidance" text NOT NULL,
	"default_target" jsonb,
	"hint" text,
	"seed_version" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "running_masters_activity" CHECK ("running_workout_masters"."activity_type" IN ('RUNNING', 'REST')),
	CONSTRAINT "running_masters_purpose" CHECK ("running_workout_masters"."purpose" IN ('RECOVERY', 'AEROBIC_BASE', 'ENDURANCE', 'QUALITY_SPEED', 'POWER_FORM', 'NEUROMUSCULAR', 'COMPETITION'))
);
--> statement-breakpoint
CREATE TABLE "strength_exercise_masters" (
	"code" text PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text NOT NULL,
	"muscle_group" text NOT NULL,
	"is_unilateral" boolean NOT NULL,
	"default_variant" text NOT NULL,
	"default_prescription" jsonb NOT NULL,
	"rep_label" text NOT NULL,
	"guidance" text NOT NULL,
	"hint" text,
	"seed_version" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strength_masters_muscle" CHECK ("strength_exercise_masters"."muscle_group" IN ('SINGLE_LEG', 'GLUTES_HIPS', 'CALVES_ANKLES', 'CORE')),
	CONSTRAINT "strength_masters_rep_label" CHECK ("strength_exercise_masters"."rep_label" IN ('REPS', 'STEPS'))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"locale" text DEFAULT 'th-TH' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"title" text,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plans_user_week" UNIQUE("user_id","week_start_date"),
	CONSTRAINT "weekly_plans_monday" CHECK (EXTRACT(ISODOW FROM "weekly_plans"."week_start_date") = 1)
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_mutation_id" text NOT NULL,
	"plan_item_id" uuid,
	"activity_type" text NOT NULL,
	"running_workout_code" text,
	"performed_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"outcome" text DEFAULT 'COMPLETED' NOT NULL,
	"distance_m" numeric(10, 2),
	"moving_duration_sec" integer,
	"elapsed_duration_sec" integer,
	"session_duration_sec" integer,
	"avg_heart_rate" integer,
	"rpe" integer,
	"feeling" text,
	"note" text,
	"planned_snapshot" jsonb,
	"master_snapshot" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_logs_user_mutation" UNIQUE("user_id","client_mutation_id"),
	CONSTRAINT "workout_logs_outcome" CHECK ("workout_logs"."outcome" IN ('COMPLETED', 'PARTIAL')),
	CONSTRAINT "workout_logs_activity" CHECK ("workout_logs"."activity_type" IN ('RUNNING', 'STRENGTH'))
);
--> statement-breakpoint
ALTER TABLE "actual_running_splits" ADD CONSTRAINT "actual_running_splits_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_strength_exercises" ADD CONSTRAINT "actual_strength_exercises_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_strength_exercises" ADD CONSTRAINT "actual_strength_exercises_planned_exercise_id_planned_strength_exercises_id_fk" FOREIGN KEY ("planned_exercise_id") REFERENCES "public"."planned_strength_exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_strength_exercises" ADD CONSTRAINT "actual_strength_exercises_exercise_code_strength_exercise_masters_code_fk" FOREIGN KEY ("exercise_code") REFERENCES "public"."strength_exercise_masters"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_strength_sets" ADD CONSTRAINT "actual_strength_sets_actual_exercise_id_actual_strength_exercises_id_fk" FOREIGN KEY ("actual_exercise_id") REFERENCES "public"."actual_strength_exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_weekly_plan_id_weekly_plans_id_fk" FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_daily_plan_id_daily_plans_id_fk" FOREIGN KEY ("daily_plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_running_workout_code_running_workout_masters_code_fk" FOREIGN KEY ("running_workout_code") REFERENCES "public"."running_workout_masters"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_strength_exercises" ADD CONSTRAINT "planned_strength_exercises_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_strength_exercises" ADD CONSTRAINT "planned_strength_exercises_exercise_code_strength_exercise_masters_code_fk" FOREIGN KEY ("exercise_code") REFERENCES "public"."strength_exercise_masters"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_goals" ADD CONSTRAINT "race_goals_result_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("result_workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_running_workout_code_running_workout_masters_code_fk" FOREIGN KEY ("running_workout_code") REFERENCES "public"."running_workout_masters"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_day_order" ON "plan_items" USING btree ("daily_plan_id","sort_order");--> statement-breakpoint
CREATE INDEX "plan_templates_user" ON "plan_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "planned_exercises_item_order" ON "planned_strength_exercises" USING btree ("plan_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "race_goals_user" ON "race_goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_goals_one_active_primary" ON "race_goals" USING btree ("user_id") WHERE "race_goals"."status" = 'ACTIVE' AND "race_goals"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_logs_one_active_per_plan" ON "workout_logs" USING btree ("plan_item_id") WHERE "workout_logs"."plan_item_id" IS NOT NULL AND "workout_logs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workout_logs_user_date" ON "workout_logs" USING btree ("user_id","performed_date" desc);--> statement-breakpoint
CREATE INDEX "workout_logs_user_activity_date" ON "workout_logs" USING btree ("user_id","activity_type","performed_date");