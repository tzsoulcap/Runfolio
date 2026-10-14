import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canRunDb } from "./db-gate";

describe.skipIf(!canRunDb)("pace data repair", () => {
  it("repairs legacy minutes, preserves correct targets and bumps only affected weeks", async () => {
    const { db } = await import("@/lib/db/client");
    const { sql } = await import("drizzle-orm");
    // Temporary tables shadow production tables on this transaction's connection.
    await db.transaction(async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE strength_exercise_masters (LIKE public.strength_exercise_masters INCLUDING ALL) ON COMMIT DROP`);
      await tx.execute(sql`CREATE TEMP TABLE weekly_plans (id int PRIMARY KEY, revision int, updated_at timestamptz) ON COMMIT DROP`);
      await tx.execute(sql`CREATE TEMP TABLE daily_plans (id int PRIMARY KEY, weekly_plan_id int) ON COMMIT DROP`);
      await tx.execute(sql`CREATE TEMP TABLE plan_items (id int PRIMARY KEY, daily_plan_id int, activity_type text, intensity_target jsonb, updated_at timestamptz, deleted_at timestamptz) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO weekly_plans VALUES (1, 3, now()), (2, 8, now())`);
      await tx.execute(sql`INSERT INTO daily_plans VALUES (1, 1), (2, 2)`);
      await tx.execute(sql`INSERT INTO plan_items (id, daily_plan_id, activity_type, intensity_target, deleted_at) VALUES
        (1, 1, 'RUNNING', '{"kind":"PACE","fastSecPerKm":6,"slowSecPerKm":6.5}', null),
        (2, 2, 'RUNNING', '{"kind":"PACE","fastSecPerKm":360,"slowSecPerKm":420}', null),
        (3, 2, 'RUNNING', '{"kind":"HR_ZONE","zoneMin":2,"zoneMax":2}', null),
        (4, 2, 'RUNNING', '{"kind":"PACE","fastSecPerKm":6,"slowSecPerKm":7}', now())`);
      for (const statement of readFileSync("drizzle/0004_add-reverse-lunge-and-fix-pace.sql", "utf8").split("--> statement-breakpoint")) {
        await tx.execute(sql.raw(statement));
      }
      const rows = await tx.execute(sql`SELECT intensity_target FROM plan_items ORDER BY id`);
      expect(rows[0].intensity_target).toEqual({kind: "PACE", fastSecPerKm: 360, slowSecPerKm: 390});
      expect(rows[1].intensity_target).toEqual({kind: "PACE", fastSecPerKm: 360, slowSecPerKm: 420});
      expect(rows[2].intensity_target).toEqual({kind: "HR_ZONE", zoneMin: 2, zoneMax: 2});
      expect(rows[3].intensity_target).toEqual({kind: "PACE", fastSecPerKm: 6, slowSecPerKm: 7});
      const weeks = await tx.execute(sql`SELECT revision FROM weekly_plans ORDER BY id`);
      expect(weeks.map((week) => week.revision)).toEqual([4, 8]);
      const masters = await tx.execute(sql`SELECT code, default_prescription FROM strength_exercise_masters`);
      expect(masters).toHaveLength(1);
      expect(masters[0].default_prescription).toMatchObject({sets: 3, reps: 10, countMode: "PER_SIDE"});
    });
  });
});
