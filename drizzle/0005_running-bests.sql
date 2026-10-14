CREATE TABLE "running_bests" (
	"user_id" uuid NOT NULL,
	"distance_code" text NOT NULL,
	"source_log_id" uuid NOT NULL,
	"source_distance_m" numeric(10, 2) NOT NULL,
	"source_duration_sec" integer NOT NULL,
	"time_basis" text NOT NULL,
	"performed_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "running_bests_user_id_distance_code_pk" PRIMARY KEY("user_id","distance_code"),
	CONSTRAINT "running_bests_distance" CHECK ("running_bests"."distance_code" IN ('5K', '10K', '21K', '42K')),
	CONSTRAINT "running_bests_time_basis" CHECK ("running_bests"."time_basis" IN ('ELAPSED', 'MOVING')),
	CONSTRAINT "running_bests_positive" CHECK ("running_bests"."source_distance_m" > 0 AND "running_bests"."source_duration_sec" > 0)
);
--> statement-breakpoint
ALTER TABLE "running_bests" ADD CONSTRAINT "running_bests_source_log_id_workout_logs_id_fk" FOREIGN KEY ("source_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_logs_running_distance" ON "workout_logs" USING btree ("user_id","distance_m") WHERE "workout_logs"."activity_type" = 'RUNNING' AND "workout_logs"."deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "running_bests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- One-time backfill from actual logs. Partial completion does not exclude
-- a continuous run that actually covers the reference distance. Freeform
-- splits are unrelated to repeated work/recovery and are not consulted.
INSERT INTO "running_bests" (
  "user_id", "distance_code", "source_log_id", "source_distance_m",
  "source_duration_sec", "time_basis", "performed_date"
)
SELECT DISTINCT ON (l.user_id, d.code)
  l.user_id, d.code, l.id, l.distance_m,
  COALESCE(l.elapsed_duration_sec, l.moving_duration_sec),
  CASE WHEN l.elapsed_duration_sec IS NOT NULL THEN 'ELAPSED' ELSE 'MOVING' END,
  l.performed_date
FROM "workout_logs" l
CROSS JOIN (VALUES ('5K', 5000::numeric), ('10K', 10000::numeric),
  ('21K', 21097.5::numeric), ('42K', 42195::numeric)) d(code, meters)
WHERE l.activity_type = 'RUNNING' AND l.deleted_at IS NULL
  AND l.running_workout_code IN ('RECOVERY_RUN', 'EASY_RUN', 'LONG_RUN', 'TEMPO', 'RACE_DAY')
  AND l.distance_m >= d.meters
  AND COALESCE(l.elapsed_duration_sec, l.moving_duration_sec) > 0
  AND NOT (COALESCE(l.planned_snapshot->>'runningWorkoutCode', l.running_workout_code) = l.running_workout_code
    AND COALESCE(jsonb_path_exists(l.planned_snapshot, '$.runningTarget ? (@.kind == "STRUCTURED").steps[*] ? (@.kind == "REPEAT")'), false))
ORDER BY l.user_id, d.code,
  COALESCE(l.elapsed_duration_sec, l.moving_duration_sec)::numeric / l.distance_m,
  CASE WHEN l.elapsed_duration_sec IS NOT NULL THEN 0 ELSE 1 END,
  l.distance_m, l.performed_date, l.id;
