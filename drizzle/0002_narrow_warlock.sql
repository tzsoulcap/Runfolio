ALTER TABLE "plan_items" ADD COLUMN "race_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_race_goal_id_race_goals_id_fk" FOREIGN KEY ("race_goal_id") REFERENCES "public"."race_goals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_race_goal" ON "plan_items" USING btree ("race_goal_id");