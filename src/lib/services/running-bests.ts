import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { runningBests, workoutLogs } from "@/lib/db/schema";
import type { GoalDistanceCode } from "@/lib/domain/goal";
import { BEST_DISTANCES, CONTINUOUS_RUN_CODES, runningBestCandidate, type BestSourceLog } from "@/lib/domain/running-best";
import type { DbTx } from "./planner";

// Take this lock before plan/log row locks. It serializes changes for one
// runner, including replacement of a deleted winner and concurrent inserts.
export async function lockRunningBests(tx: DbTx, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'running-bests:' + userId}, 0))`);
}

export async function listRunningBests(userId: string) {
  return db.select().from(runningBests).where(eq(runningBests.userId, userId));
}

export async function considerRunningBest(tx: DbTx, userId: string, log: BestSourceLog) {
  const candidate = runningBestCandidate(log);
  if (!candidate) return;
  const values = BEST_DISTANCES.filter(([, meters]) => candidate.sourceDistanceM >= meters)
    .map(([distanceCode]) => ({ userId, distanceCode, ...candidate }));
  if (values.length === 0) return;
  await tx.insert(runningBests).values(values).onConflictDoUpdate({
    target: [runningBests.userId, runningBests.distanceCode],
    set: {
      sourceLogId: sql`excluded.source_log_id`,
      sourceDistanceM: sql`excluded.source_distance_m`,
      sourceDurationSec: sql`excluded.source_duration_sec`,
      timeBasis: sql`excluded.time_basis`,
      performedDate: sql`excluded.performed_date`,
      updatedAt: new Date(),
    },
    // Compare exact products, not rounded display paces. Ties prefer elapsed,
    // then the closest distance, then the first date and a stable source id.
    setWhere: sql`
      excluded.source_duration_sec::numeric * ${runningBests.sourceDistanceM}
        < ${runningBests.sourceDurationSec}::numeric * excluded.source_distance_m
      OR (excluded.source_duration_sec::numeric * ${runningBests.sourceDistanceM}
        = ${runningBests.sourceDurationSec}::numeric * excluded.source_distance_m
        AND (CASE WHEN excluded.time_basis = 'ELAPSED' THEN 0 ELSE 1 END,
          excluded.source_distance_m, excluded.performed_date, excluded.source_log_id)
        < (CASE WHEN ${runningBests.timeBasis} = 'ELAPSED' THEN 0 ELSE 1 END,
          ${runningBests.sourceDistanceM}, ${runningBests.performedDate}, ${runningBests.sourceLogId}))`,
  });
}

// Used only for backfills or when an edited/deleted log was the winner.
// Read paths never scan history, and ordinary inserts only compare four rows.
export async function rebuildRunningBests(tx: DbTx, userId: string, codes: GoalDistanceCode[] = BEST_DISTANCES.map(([code]) => code)) {
  if (codes.length === 0) return;
  await tx.delete(runningBests).where(and(eq(runningBests.userId, userId), inArray(runningBests.distanceCode, codes)));
  const distances = sql.join(BEST_DISTANCES.filter(([code]) => codes.includes(code)).map(([code, meters]) => sql`(${code}::text, ${meters}::numeric)`), sql`, `);
  const allowed = sql.join(CONTINUOUS_RUN_CODES.map(code => sql`${code}`), sql`, `);
  await tx.execute(sql`
    INSERT INTO running_bests
      (user_id, distance_code, source_log_id, source_distance_m, source_duration_sec, time_basis, performed_date)
    SELECT DISTINCT ON (d.code) l.user_id, d.code, l.id, l.distance_m,
      COALESCE(l.elapsed_duration_sec, l.moving_duration_sec),
      CASE WHEN l.elapsed_duration_sec IS NOT NULL THEN 'ELAPSED' ELSE 'MOVING' END, l.performed_date
    FROM ${workoutLogs} l CROSS JOIN (VALUES ${distances}) d(code, meters)
    WHERE l.user_id = ${userId} AND l.activity_type = 'RUNNING' AND l.deleted_at IS NULL
      AND l.running_workout_code IN (${allowed}) AND l.distance_m >= d.meters
      AND COALESCE(l.elapsed_duration_sec, l.moving_duration_sec) > 0
      AND NOT (COALESCE(l.planned_snapshot->>'runningWorkoutCode', l.running_workout_code) = l.running_workout_code
        AND COALESCE(jsonb_path_exists(l.planned_snapshot, '$.runningTarget ? (@.kind == "STRUCTURED").steps[*] ? (@.kind == "REPEAT")'), false))
    ORDER BY d.code, COALESCE(l.elapsed_duration_sec, l.moving_duration_sec)::numeric / l.distance_m,
      CASE WHEN l.elapsed_duration_sec IS NOT NULL THEN 0 ELSE 1 END,
      l.distance_m, l.performed_date, l.id
  `);
}

export async function replaceRunningBestSource(tx: DbTx, userId: string, logId: string, updated?: BestSourceLog) {
  const affected = await tx.select({ code: runningBests.distanceCode }).from(runningBests)
    .where(and(eq(runningBests.userId, userId), eq(runningBests.sourceLogId, logId)));
  await rebuildRunningBests(tx, userId, affected.map(row => row.code));
  if (updated) await considerRunningBest(tx, userId, updated);
}
