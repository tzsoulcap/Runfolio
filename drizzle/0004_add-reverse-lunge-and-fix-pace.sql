INSERT INTO "strength_exercise_masters" (
  "code", "name_th", "name_en", "muscle_group", "is_unilateral", "rep_label",
  "default_variant", "default_prescription", "guidance", "seed_version", "is_active", "sort_order"
) VALUES (
  'REVERSE_LUNGE_TO_KNEE_DRIVE', 'ลันจ์ถอยหลังยกเข่า', 'Reverse Lunge to Knee Drive',
  'SINGLE_LEG', true, 'REPS', 'STANDARD',
  '{"measurement":"REPS","sets":3,"reps":10,"countMode":"PER_SIDE","loadKg":0}'::jsonb,
  'ก้าวถอยหลังทำลันจ์แล้วกลับขึ้นมายกเข่าข้างเดิม แยกนับซ้ายและขวา', 1, true, 15
) ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- The old numeric-only pace input treated a value such as 6 as seconds.
-- User confirmed these existing sub-minute targets mean minutes (6 -> 360).
-- Preserve correct targets >= 60 seconds and all training logs.
WITH repaired AS (
  UPDATE "plan_items"
  SET "intensity_target" = "intensity_target" || jsonb_build_object(
    'fastSecPerKm', CASE
      WHEN ("intensity_target"->>'fastSecPerKm')::numeric > 0
        AND ("intensity_target"->>'fastSecPerKm')::numeric < 60
      THEN round(("intensity_target"->>'fastSecPerKm')::numeric * 60)
      ELSE ("intensity_target"->>'fastSecPerKm')::numeric END,
    'slowSecPerKm', CASE
      WHEN ("intensity_target"->>'slowSecPerKm')::numeric > 0
        AND ("intensity_target"->>'slowSecPerKm')::numeric < 60
      THEN round(("intensity_target"->>'slowSecPerKm')::numeric * 60)
      ELSE ("intensity_target"->>'slowSecPerKm')::numeric END
  ), "updated_at" = now()
  WHERE "activity_type" = 'RUNNING' AND "deleted_at" IS NULL
    AND "intensity_target"->>'kind' = 'PACE'
    AND (
      ("intensity_target"->>'fastSecPerKm')::numeric BETWEEN 0.000001 AND 59.999999
      OR ("intensity_target"->>'slowSecPerKm')::numeric BETWEEN 0.000001 AND 59.999999
    )
  RETURNING "daily_plan_id"
)
UPDATE "weekly_plans"
SET "revision" = "revision" + 1, "updated_at" = now()
WHERE "id" IN (
  SELECT "weekly_plan_id" FROM "daily_plans"
  WHERE "id" IN (SELECT "daily_plan_id" FROM repaired)
);
