import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canRunDb } from "./db-gate";

describe.skipIf(!canRunDb)("running best backfill", () => {
  it("backfills existing history with elapsed priority, repetition exclusions and per-user winners", async () => {
    const { db } = await import("@/lib/db/client");
    const { sql } = await import("drizzle-orm");
    const marker = new Error("rollback scratch migration");
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`SET LOCAL search_path = pg_temp, public`);
        await tx.execute(sql`CREATE TEMP TABLE workout_logs (
          id uuid PRIMARY KEY, user_id uuid, activity_type text, running_workout_code text,
          distance_m numeric(10,2), moving_duration_sec int, elapsed_duration_sec int,
          planned_snapshot jsonb, performed_date date, deleted_at timestamptz
        ) ON COMMIT DROP`);
        const userId = crypto.randomUUID();
        const other = crypto.randomUUID();
        const sources = [
          {id: crypto.randomUUID(), userId, code: "EASY_RUN", distance: 5000, moving: 1800, elapsed: 1860, snapshot: null},
          {id: crypto.randomUUID(), userId, code: "LONG_RUN", distance: 6000, moving: 2000, elapsed: 2160, snapshot: null},
          {id: crypto.randomUUID(), userId, code: "INTERVAL", distance: 10000, moving: 1000, elapsed: 1100, snapshot: null},
          {id: crypto.randomUUID(), userId, code: "EASY_RUN", distance: 10000, moving: 1000, elapsed: 1100, snapshot: JSON.stringify({runningWorkoutCode: "EASY_RUN", runningTarget: {kind: "STRUCTURED", steps: [{kind: "REPEAT"}]}})},
          {id: crypto.randomUUID(), userId: other, code: "RACE_DAY", distance: 10000, moving: 3600, elapsed: null, snapshot: null},
        ];
        for (const source of sources) await tx.execute(sql`INSERT INTO workout_logs VALUES
          (${source.id}, ${source.userId}, 'RUNNING', ${source.code}, ${source.distance}, ${source.moving}, ${source.elapsed}, ${source.snapshot}::jsonb, '2026-10-12', null)`);
        const migration = readFileSync("drizzle/0005_running-bests.sql", "utf8")
          .replace('REFERENCES "public"."workout_logs"', 'REFERENCES "workout_logs"');
        for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
        const rows = await tx.execute(sql`SELECT * FROM running_bests ORDER BY user_id, distance_code`);
        const mine = rows.filter(row => row.user_id === userId);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({distance_code: "5K", source_log_id: sources[1].id, time_basis: "ELAPSED", source_duration_sec: 2160});
        expect(rows.filter(row => row.user_id === other)).toHaveLength(2);
        expect(rows.find(row => row.user_id === other)?.time_basis).toBe("MOVING");
        throw marker;
      });
    } catch (error) { if (error !== marker) throw error; }
  });
});
