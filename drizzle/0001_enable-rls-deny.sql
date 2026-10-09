-- Blanket-deny RLS: enable row-level security on every app table with NO
-- policies, so anon/authenticated REST access is denied by default.
-- Ownership is enforced app-side (§3); migrations/seeds run as the
-- superuser (service connection string), which bypasses RLS.
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "weekly_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "daily_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "planned_strength_exercises" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workout_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actual_strength_exercises" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actual_strength_sets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actual_running_splits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "race_goals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "running_workout_masters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "strength_exercise_masters" ENABLE ROW LEVEL SECURITY;
