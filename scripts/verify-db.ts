// Verify database state: master counts + blanket-deny RLS on all tables.
import { config } from "dotenv";

config({ path: ".env.local" });

const EXPECTED = [
  "actual_running_splits",
  "actual_strength_exercises",
  "actual_strength_sets",
  "daily_plans",
  "plan_items",
  "plan_templates",
  "planned_strength_exercises",
  "race_goals",
  "running_workout_masters",
  "strength_exercise_masters",
  "user_profiles",
  "weekly_plans",
  "workout_logs",
];

async function main() {
  const { db } = await import("@/lib/db/client");
  const { sql } = await import("drizzle-orm");
  const { runningWorkoutMasters, strengthExerciseMasters } = await import(
    "@/lib/db/schema"
  );
  const { count } = await import("drizzle-orm");

  const rows = (await db.execute(sql`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ${EXPECTED}
    ORDER BY tablename
  `)) as unknown as Array<{ tablename: string; rowsecurity: boolean }>;

  let ok = true;
  for (const name of EXPECTED) {
    const row = rows.find((r) => r.tablename === name);
    const status =
      row && row.rowsecurity ? "rls=on" : row ? "RLS OFF" : "MISSING";
    console.log(`${name}: ${status}`);
    if (!row || !row.rowsecurity) ok = false;
  }

  const [running] = await db
    .select({ n: count() })
    .from(runningWorkoutMasters);
  const [strength] = await db
    .select({ n: count() })
    .from(strengthExerciseMasters);
  console.log(`masters: running=${running?.n} strength=${strength?.n}`);
  if (running?.n !== 10 || strength?.n !== 14) ok = false;

  if (!ok) {
    console.error("VERIFY FAILED");
    process.exit(1);
  }
  console.log("VERIFY OK");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
