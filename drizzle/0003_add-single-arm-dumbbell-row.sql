ALTER TABLE "strength_exercise_masters" DROP CONSTRAINT "strength_masters_muscle";--> statement-breakpoint
ALTER TABLE "strength_exercise_masters" ADD CONSTRAINT "strength_masters_muscle" CHECK ("strength_exercise_masters"."muscle_group" IN ('SINGLE_LEG', 'GLUTES_HIPS', 'CALVES_ANKLES', 'CORE', 'UPPER_BODY'));--> statement-breakpoint
INSERT INTO "strength_exercise_masters" (
  "code", "name_th", "name_en", "muscle_group", "is_unilateral", "rep_label",
  "default_variant", "default_prescription", "guidance", "hint",
  "seed_version", "is_active", "sort_order"
) VALUES (
  'SINGLE_ARM_DUMBBELL_ROW', 'ดึงดัมเบลแขนเดียว', 'Single-Arm Dumbbell Row',
  'UPPER_BODY', true, 'REPS', 'STANDARD',
  '{"measurement":"REPS","sets":3,"reps":10,"countMode":"PER_SIDE","loadKg":null}'::jsonb,
  'ดึงดัมเบลทีละแขน แยกนับซ้ายและขวา',
  'ระบุน้ำหนักดัมเบลที่ใช้ในแต่ละข้าง', 1, true, 14
) ON CONFLICT ("code") DO NOTHING;
