import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  actualRunningSplits,
  actualStrengthExercises,
  actualStrengthSets,
  dailyPlans,
  plannedStrengthExercises,
  planItems,
  raceGoals,
  runningWorkoutMasters,
  strengthExerciseMasters,
  userProfiles,
  weeklyPlans,
  workoutLogs,
} from "@/lib/db/schema";
import {
  assertNotFuture,
  RunningLogInputSchema,
  StrengthLogInputSchema,
  type StrengthLogInput,
} from "@/lib/domain/log";
import { todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/week";

import { ServiceError } from "./errors";
import { considerRunningBest, lockRunningBests, replaceRunningBestSource } from "./running-bests";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function validation(message: string): ServiceError {
  return new ServiceError("VALIDATION", message);
}

async function findByMutationId(
  runner: Pick<typeof db, "select"> | DbTx,
  userId: string,
  clientMutationId: string,
) {
  const [row] = await (runner as typeof db)
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        eq(workoutLogs.clientMutationId, clientMutationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// A lost race surfaces as 23505 after our pre-checks passed: map it to the
// shaped outcome (§16) instead of leaking a raw DB error.
async function resolveUniqueViolation(
  userId: string,
  clientMutationId: string,
  err: unknown,
): Promise<{ log: typeof workoutLogs.$inferSelect; deduped: true }> {
  const pg = err as { code?: string } | null;
  if (!pg || pg.code !== "23505") throw err;
  // Same mutation id means our own retry (dedupe), else a genuine conflict.
  const row = await findByMutationId(db, userId, clientMutationId);
  if (row) return { log: row, deduped: true };
  throw new ServiceError("CONFLICT", "already saved; refetch and retry");
}

async function profileTimezone(
  tx: DbTx,
  userId: string,
): Promise<string> {
  const [profile] = await tx
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return profile?.timezone ?? "Asia/Bangkok";
}

type LockedPlan = {
  item: typeof planItems.$inferSelect;
  day: typeof dailyPlans.$inferSelect;
  week: typeof weeklyPlans.$inferSelect;
};

// Locks the plan row and its week so a concurrent plan move/delete cannot
// race this save (§13). Single week: no lock-order hazard.
async function lockOwnedPlan(
  tx: DbTx,
  userId: string,
  planItemId: string,
  activityType: "RUNNING" | "STRENGTH",
): Promise<LockedPlan> {
  const [item] = await tx
    .select()
    .from(planItems)
    .where(and(eq(planItems.id, planItemId), isNull(planItems.deletedAt)))
    .limit(1)
    .for("update");
  if (!item) throw new ServiceError("NOT_FOUND", "plan not found");
  const [day] = await tx
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.id, item.dailyPlanId))
    .limit(1);
  const [week] = day
    ? await tx
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, day.weeklyPlanId))
        .limit(1)
        .for("update")
    : [];
  if (!day || !week || week.userId !== userId) {
    throw new ServiceError("NOT_FOUND", "plan not found");
  }
  if (item.activityType !== activityType) {
    throw new ServiceError(
      "CONFLICT",
      activityType === "RUNNING"
        ? "plan is not a running session"
        : "plan is not a strength session",
    );
  }
  return { item, day, week };
}

async function assertNoActiveLog(
  tx: DbTx,
  planItemId: string,
  clientMutationId: string,
): Promise<
  { log: typeof workoutLogs.$inferSelect; deduped: true } | null
> {
  const [clash] = await tx
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.planItemId, planItemId),
        isNull(workoutLogs.deletedAt),
      ),
    )
    .limit(1);
  if (!clash) return null;
  // Same mutation id, seen late (READ COMMITTED): our own retry.
  if (clash.clientMutationId === clientMutationId) {
    return { log: clash, deduped: true };
  }
  throw new ServiceError("CONFLICT", "plan already has an active log");
}

async function unskip(tx: DbTx, item: typeof planItems.$inferSelect) {
  if (item.planState !== "SKIPPED") return;
  await tx
    .update(planItems)
    .set({ planState: "SCHEDULED", skipReason: null, updatedAt: new Date() })
    .where(eq(planItems.id, item.id));
}

// Locks one owned, active log of the expected activity. Edits and deletes
// address the log id directly (PUT semantics); no mutation id needed.
async function lockOwnedLog(
  tx: DbTx,
  userId: string,
  logId: string,
  activityType: "RUNNING" | "STRENGTH",
) {
  const [log] = await tx
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.id, logId),
        eq(workoutLogs.userId, userId),
        isNull(workoutLogs.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!log) throw new ServiceError("NOT_FOUND", "log not found");
  if (log.activityType !== activityType) {
    throw new ServiceError("CONFLICT", "log is not of this activity type");
  }
  return log;
}

type PlannedById = Map<string, typeof plannedStrengthExercises.$inferSelect>;
type StrengthMasterByCode = Map<
  string,
  typeof strengthExerciseMasters.$inferSelect
>;

// Shared by save + update: update deletes children first, then re-inserts.
async function insertStrengthChildren(
  tx: DbTx,
  logId: string,
  exercises: StrengthLogInput["exercises"],
  plannedById: PlannedById,
  byCode: StrengthMasterByCode,
) {
  for (const [index, exercise] of exercises.entries()) {
    const master = byCode.get(exercise.exerciseCode);
    const planned = exercise.plannedExerciseId
      ? plannedById.get(exercise.plannedExerciseId)
      : undefined;
    const [inserted] = await tx
      .insert(actualStrengthExercises)
      .values({
        workoutLogId: logId,
        plannedExerciseId: exercise.plannedExerciseId ?? null,
        exerciseCode: exercise.exerciseCode,
        variant: exercise.variant ?? planned?.variant ?? "STANDARD",
        countMode: exercise.countMode,
        sortOrder: index,
        masterSnapshot: master
          ? {
              code: master.code,
              nameTh: master.nameTh,
              nameEn: master.nameEn,
              muscleGroup: master.muscleGroup,
              repLabel: master.repLabel,
              guidance: master.guidance,
            }
          : null,
      })
      .returning({ id: actualStrengthExercises.id });
    if (!inserted) {
      throw new ServiceError("CONFLICT", "log insert failed");
    }
    await tx.insert(actualStrengthSets).values(
      exercise.sets.map((s) => ({
        actualExerciseId: inserted.id,
        setIndex: s.setNumber,
        side: s.side,
        measurement: s.measurement,
        reps: s.reps ?? null,
        durationSec: s.durationSec ?? null,
        loadKg: s.loadKg ?? null,
        note: s.note ?? null,
      })),
    );
  }
}

export async function saveWorkoutLog(
  userId: string,
  args: { clientMutationId: string; planItemId?: string; actual: unknown },
) {
  const parsed = RunningLogInputSchema.safeParse(args.actual);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid log");
  }
  if (!args.clientMutationId) {
    throw validation("clientMutationId is required");
  }
  const actual = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      await lockRunningBests(tx, userId);
      const existing = await findByMutationId(
        tx,
        userId,
        args.clientMutationId,
      );
      // Retry with the same id returns the original row as-is; never restores.
      if (existing) return { log: existing, deduped: true };

      const timezone = await profileTimezone(tx, userId);
      assertNotFuture(actual.performedDate, todayInTimeZone(timezone));

      const [master] = await tx
        .select()
        .from(runningWorkoutMasters)
        .where(eq(runningWorkoutMasters.code, actual.runningWorkoutCode))
        .limit(1);
      if (!master || !master.isActive) {
        throw new ServiceError("NOT_FOUND", "workout master not found");
      }

      let plannedSnapshot: Record<string, unknown> | null = null;
      if (args.planItemId) {
        const { item, day } = await lockOwnedPlan(
          tx,
          userId,
          args.planItemId,
          "RUNNING",
        );
        const late = await assertNoActiveLog(
          tx,
          item.id,
          args.clientMutationId,
        );
        if (late) return late;
        plannedSnapshot = {
          planItemId: item.id,
          date: day.date,
          title: item.title,
          runningWorkoutCode: item.runningWorkoutCode,
          runningTarget: item.runningTarget,
        };
        await unskip(tx, item);
      }

      const [log] = await tx
        .insert(workoutLogs)
        .values({
          userId,
          clientMutationId: args.clientMutationId,
          planItemId: args.planItemId ?? null,
          activityType: "RUNNING",
          runningWorkoutCode: master.code,
          performedDate: actual.performedDate,
          startedAt: actual.startTime
            ? zonedTimeToUtc(actual.performedDate, actual.startTime, timezone)
            : null,
          outcome: actual.outcome,
          distanceM: actual.distanceM,
          movingDurationSec: actual.movingDurationSec,
          elapsedDurationSec: actual.elapsedDurationSec ?? null,
          avgHeartRate: actual.avgHeartRate ?? null,
          rpe: actual.rpe ?? null,
          feeling: actual.feeling ?? null,
          note: actual.note ?? null,
          plannedSnapshot,
          masterSnapshot: {
            code: master.code,
            nameTh: master.nameTh,
            nameEn: master.nameEn,
          },
        })
        .returning();
      if (!log) throw new ServiceError("CONFLICT", "log insert failed");
      // Totals stay user-typed; splits are ordered freeform reference (§6).
      if (actual.splits && actual.splits.length > 0) {
        await tx.insert(actualRunningSplits).values(
          actual.splits.map((s, index) => ({
            workoutLogId: log.id,
            splitIndex: index,
            distanceM: s.distanceM ?? null,
            durationSec: s.durationSec ?? null,
          })),
        );
      }
      await considerRunningBest(tx, userId, log);
      return { log, deduped: false };
    });
  } catch (err) {
    return resolveUniqueViolation(userId, args.clientMutationId, err);
  }
}

export async function saveStrengthLog(
  userId: string,
  args: { clientMutationId: string; planItemId?: string; actual: unknown },
) {
  const parsed = StrengthLogInputSchema.safeParse(args.actual);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid log");
  }
  if (!args.clientMutationId) {
    throw validation("clientMutationId is required");
  }
  const actual = parsed.data;
  const wantsPlannedLink = actual.exercises.some(
    (e) => e.plannedExerciseId !== undefined,
  );
  if (wantsPlannedLink && !args.planItemId) {
    throw validation("planned exercises need a plan");
  }
  try {
    return await db.transaction(async (tx) => {
      const existing = await findByMutationId(
        tx,
        userId,
        args.clientMutationId,
      );
      if (existing) return { log: existing, deduped: true };

      const timezone = await profileTimezone(tx, userId);
      assertNotFuture(actual.performedDate, todayInTimeZone(timezone));

      const codes = [...new Set(actual.exercises.map((e) => e.exerciseCode))];
      const masters = await tx
        .select()
        .from(strengthExerciseMasters)
        .where(inArray(strengthExerciseMasters.code, codes));
      const byCode = new Map(masters.map((m) => [m.code, m]));
      for (const code of codes) {
        const master = byCode.get(code);
        if (!master || !master.isActive) {
          throw new ServiceError("NOT_FOUND", "exercise master not found");
        }
      }

      let plannedSnapshot: Record<string, unknown> | null = null;
      let plannedById = new Map<
        string,
        typeof plannedStrengthExercises.$inferSelect
      >();
      if (args.planItemId) {
        const { item, day } = await lockOwnedPlan(
          tx,
          userId,
          args.planItemId,
          "STRENGTH",
        );
        const late = await assertNoActiveLog(
          tx,
          item.id,
          args.clientMutationId,
        );
        if (late) return late;
        const planned = await tx
          .select()
          .from(plannedStrengthExercises)
          .where(eq(plannedStrengthExercises.planItemId, item.id))
          .orderBy(asc(plannedStrengthExercises.sortOrder));
        plannedById = new Map(planned.map((p) => [p.id, p]));
        for (const e of actual.exercises) {
          if (
            e.plannedExerciseId !== undefined &&
            !plannedById.has(e.plannedExerciseId)
          ) {
            throw new ServiceError("NOT_FOUND", "planned exercise not found");
          }
        }
        plannedSnapshot = {
          planItemId: item.id,
          date: day.date,
          title: item.title,
          exercises: planned.map((p) => ({
            plannedExerciseId: p.id,
            exerciseCode: p.exerciseCode,
            prescription: p.prescription,
          })),
        };
        await unskip(tx, item);
      }

      const [log] = await tx
        .insert(workoutLogs)
        .values({
          userId,
          clientMutationId: args.clientMutationId,
          planItemId: args.planItemId ?? null,
          activityType: "STRENGTH",
          performedDate: actual.performedDate,
          startedAt: actual.startTime
            ? zonedTimeToUtc(actual.performedDate, actual.startTime, timezone)
            : null,
          outcome: actual.outcome,
          sessionDurationSec: actual.sessionDurationSec ?? null,
          rpe: actual.rpe ?? null,
          feeling: actual.feeling ?? null,
          note: actual.note ?? null,
          plannedSnapshot,
        })
        .returning();
      if (!log) throw new ServiceError("CONFLICT", "log insert failed");

      await insertStrengthChildren(
        tx,
        log.id,
        actual.exercises,
        plannedById,
        byCode,
      );
      return { log, deduped: false };
    });
  } catch (err) {
    return resolveUniqueViolation(userId, args.clientMutationId, err);
  }
}

// Soft delete (§7): the plan item stays; its derived status reverts to
// PLANNED/MISSED because no active log links it anymore. Stats read active
// logs only, so they update too.
export async function deleteWorkoutLog(
  userId: string,
  logId: string,
): Promise<{ planItemId: string | null }> {
  return db.transaction(async (tx) => {
    await lockRunningBests(tx, userId);
    const [log] = await tx
      .select()
      .from(workoutLogs)
      .where(
        and(
          eq(workoutLogs.id, logId),
          eq(workoutLogs.userId, userId),
          isNull(workoutLogs.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!log) throw new ServiceError("NOT_FOUND", "log not found");
    await tx
      .update(workoutLogs)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(workoutLogs.id, log.id));
    // A deleted result log clears goal links (§8) but never the user-set
    // goal status.
    await tx
      .update(raceGoals)
      .set({ resultWorkoutLogId: null, updatedAt: new Date() })
      .where(eq(raceGoals.resultWorkoutLogId, log.id));
    if (log.activityType === "RUNNING") await replaceRunningBestSource(tx, userId, log.id);
    return { planItemId: log.planItemId };
  });
}

export async function undeleteWorkoutLog(
  userId: string,
  logId: string,
): Promise<{ log: typeof workoutLogs.$inferSelect }> {
  return db.transaction(async (tx) => {
    await lockRunningBests(tx, userId);
    const [log] = await tx
      .select()
      .from(workoutLogs)
      .where(and(eq(workoutLogs.id, logId), eq(workoutLogs.userId, userId)))
      .limit(1)
      .for("update");
    if (!log || !log.deletedAt) {
      throw new ServiceError("NOT_FOUND", "log not found");
    }
    // Restoring must not resurrect a clash: the plan may have been re-logged.
    if (log.planItemId) {
      const [clash] = await tx
        .select({ id: workoutLogs.id })
        .from(workoutLogs)
        .where(
          and(
            eq(workoutLogs.planItemId, log.planItemId),
            isNull(workoutLogs.deletedAt),
          ),
        )
        .limit(1);
      if (clash) {
        throw new ServiceError("CONFLICT", "plan already has an active log");
      }
    }
    const [restored] = await tx
      .update(workoutLogs)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(workoutLogs.id, log.id))
      .returning();
    if (!restored) throw new ServiceError("CONFLICT", "log restore failed");
    if (restored.activityType === "RUNNING") await considerRunningBest(tx, userId, restored);
    return { log: restored };
  });
}

// Full running-log edit (§7): same validation as save, plan link unchanged,
// splits replaced wholesale.
export async function updateWorkoutLog(
  userId: string,
  logId: string,
  actualRaw: unknown,
) {
  const parsed = RunningLogInputSchema.safeParse(actualRaw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid log");
  }
  const actual = parsed.data;
  return db.transaction(async (tx) => {
    await lockRunningBests(tx, userId);
    const log = await lockOwnedLog(tx, userId, logId, "RUNNING");
    const timezone = await profileTimezone(tx, userId);
    assertNotFuture(actual.performedDate, todayInTimeZone(timezone));

    const [master] = await tx
      .select()
      .from(runningWorkoutMasters)
      .where(eq(runningWorkoutMasters.code, actual.runningWorkoutCode))
      .limit(1);
    if (!master || !master.isActive) {
      throw new ServiceError("NOT_FOUND", "workout master not found");
    }

    const [updated] = await tx
      .update(workoutLogs)
      .set({
        performedDate: actual.performedDate,
        startedAt: actual.startTime
          ? zonedTimeToUtc(actual.performedDate, actual.startTime, timezone)
          : null,
        runningWorkoutCode: master.code,
        outcome: actual.outcome,
        distanceM: actual.distanceM,
        movingDurationSec: actual.movingDurationSec,
        elapsedDurationSec: actual.elapsedDurationSec ?? null,
        avgHeartRate: actual.avgHeartRate ?? null,
        rpe: actual.rpe ?? null,
        feeling: actual.feeling ?? null,
        note: actual.note ?? null,
        masterSnapshot: {
          code: master.code,
          nameTh: master.nameTh,
          nameEn: master.nameEn,
        },
        updatedAt: new Date(),
      })
      .where(eq(workoutLogs.id, log.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "log update failed");

    await tx
      .delete(actualRunningSplits)
      .where(eq(actualRunningSplits.workoutLogId, log.id));
    if (actual.splits && actual.splits.length > 0) {
      await tx.insert(actualRunningSplits).values(
        actual.splits.map((s, index) => ({
          workoutLogId: log.id,
          splitIndex: index,
          distanceM: s.distanceM ?? null,
          durationSec: s.durationSec ?? null,
        })),
      );
    }
    await replaceRunningBestSource(tx, userId, log.id, updated);
    return { log: updated };
  });
}

// Full strength-log edit (§7): same validation as save, plan link unchanged,
// exercises/sets replaced wholesale. Planned links must belong to the log's
// own plan; an off-plan log cannot gain planned links by edit.
export async function updateStrengthLog(
  userId: string,
  logId: string,
  actualRaw: unknown,
) {
  const parsed = StrengthLogInputSchema.safeParse(actualRaw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid log");
  }
  const actual = parsed.data;
  const wantsPlannedLink = actual.exercises.some(
    (e) => e.plannedExerciseId !== undefined,
  );
  return db.transaction(async (tx) => {
    const log = await lockOwnedLog(tx, userId, logId, "STRENGTH");
    if (wantsPlannedLink && !log.planItemId) {
      throw validation("planned exercises need a plan");
    }
    const timezone = await profileTimezone(tx, userId);
    assertNotFuture(actual.performedDate, todayInTimeZone(timezone));

    const codes = [...new Set(actual.exercises.map((e) => e.exerciseCode))];
    const masters = await tx
      .select()
      .from(strengthExerciseMasters)
      .where(inArray(strengthExerciseMasters.code, codes));
    const byCode = new Map(masters.map((m) => [m.code, m]));
    for (const code of codes) {
      const master = byCode.get(code);
      if (!master || !master.isActive) {
        throw new ServiceError("NOT_FOUND", "exercise master not found");
      }
    }

    let plannedById: PlannedById = new Map();
    if (log.planItemId) {
      const planned = await tx
        .select()
        .from(plannedStrengthExercises)
        .where(eq(plannedStrengthExercises.planItemId, log.planItemId));
      plannedById = new Map(planned.map((p) => [p.id, p]));
      for (const e of actual.exercises) {
        if (
          e.plannedExerciseId !== undefined &&
          !plannedById.has(e.plannedExerciseId)
        ) {
          throw new ServiceError("NOT_FOUND", "planned exercise not found");
        }
      }
    }

    const [updated] = await tx
      .update(workoutLogs)
      .set({
        performedDate: actual.performedDate,
        startedAt: actual.startTime
          ? zonedTimeToUtc(actual.performedDate, actual.startTime, timezone)
          : null,
        outcome: actual.outcome,
        sessionDurationSec: actual.sessionDurationSec ?? null,
        rpe: actual.rpe ?? null,
        feeling: actual.feeling ?? null,
        note: actual.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(workoutLogs.id, log.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "log update failed");

    const oldExercises = await tx
      .select({ id: actualStrengthExercises.id })
      .from(actualStrengthExercises)
      .where(eq(actualStrengthExercises.workoutLogId, log.id));
    const oldIds = oldExercises.map((e) => e.id);
    if (oldIds.length > 0) {
      await tx
        .delete(actualStrengthSets)
        .where(inArray(actualStrengthSets.actualExerciseId, oldIds));
      await tx
        .delete(actualStrengthExercises)
        .where(inArray(actualStrengthExercises.id, oldIds));
    }
    await insertStrengthChildren(
      tx,
      log.id,
      actual.exercises,
      plannedById,
      byCode,
    );
    return { log: updated };
  });
}
