import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-02-11"); // 2026-02-09
const WEDNESDAY = "2026-02-11";
const TUESDAY = "2026-02-10";

function runActual() {
  return {
    performedDate: WEDNESDAY,
    runningWorkoutCode: "EASY_RUN" as const,
    distanceM: 5000,
    movingDurationSec: 2280,
  };
}

describe.skipIf(!canRunDb)("full logging", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      actualRunningSplits,
      actualStrengthExercises,
      actualStrengthSets,
      dailyPlans,
      plannedStrengthExercises,
      planItems,
      userProfiles,
      weeklyPlans,
      workoutLogs,
    } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (users.length > 0) {
      const logs = await db
        .select({ id: workoutLogs.id })
        .from(workoutLogs)
        .where(inArray(workoutLogs.userId, users));
      const logIds = logs.map((l) => l.id);
      if (logIds.length > 0) {
        const exercises = await db
          .select({ id: actualStrengthExercises.id })
          .from(actualStrengthExercises)
          .where(inArray(actualStrengthExercises.workoutLogId, logIds));
        const exIds = exercises.map((e) => e.id);
        if (exIds.length > 0) {
          await db
            .delete(actualStrengthSets)
            .where(inArray(actualStrengthSets.actualExerciseId, exIds));
          await db
            .delete(actualStrengthExercises)
            .where(inArray(actualStrengthExercises.id, exIds));
        }
        await db
          .delete(actualRunningSplits)
          .where(inArray(actualRunningSplits.workoutLogId, logIds));
        await db.delete(workoutLogs).where(inArray(workoutLogs.id, logIds));
      }
    }
    if (weeks.length > 0) {
      const days = await db
        .select({ id: dailyPlans.id })
        .from(dailyPlans)
        .where(inArray(dailyPlans.weeklyPlanId, weeks));
      const dayIds = days.map((d) => d.id);
      if (dayIds.length > 0) {
        const items = await db
          .select({ id: planItems.id })
          .from(planItems)
          .where(inArray(planItems.dailyPlanId, dayIds));
        const itemIds = items.map((i) => i.id);
        if (itemIds.length > 0) {
          await db
            .delete(plannedStrengthExercises)
            .where(inArray(plannedStrengthExercises.planItemId, itemIds));
        }
        await db.delete(planItems).where(inArray(planItems.dailyPlanId, dayIds));
        await db.delete(dailyPlans).where(inArray(dailyPlans.id, dayIds));
      }
      await db.delete(weeklyPlans).where(inArray(weeklyPlans.id, weeks));
      weeks.length = 0;
    }
    if (users.length > 0) {
      await db.delete(userProfiles).where(inArray(userProfiles.userId, users));
      users.length = 0;
    }
  });

  async function setupUser() {
    const userId = crypto.randomUUID();
    users.push(userId);
    return userId;
  }

  async function setupWeek(userId: string) {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const { week } = await getOrCreateWeek(userId, MONDAY);
    weeks.push(week.id);
    return week;
  }

  async function addRunPlan(userId: string, revision: number) {
    const { addPlanItem } = await import("@/lib/services/planner");
    return addPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "RUNNING",
        runningWorkoutCode: "INTERVAL",
        runningTarget: { kind: "DISTANCE", distanceM: 8000 },
        intensityTarget: { kind: "NONE" },
      },
      revision,
    );
  }

  async function addStrengthPlan(userId: string, revision: number) {
    const { addStrengthPlanItem } = await import("@/lib/services/planner");
    return addStrengthPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "STRENGTH",
        title: "Legs and core",
        exercises: [
          {
            exerciseCode: "BULGARIAN_SPLIT_SQUAT",
            variant: "STANDARD",
            prescription: {
              measurement: "REPS",
              sets: 2,
              reps: 10,
              countMode: "PER_SIDE",
              loadKg: 8,
            },
          },
          {
            exerciseCode: "PLANK",
            variant: "STANDARD",
            prescription: {
              measurement: "TIME",
              sets: 2,
              durationSec: 45,
              countMode: "TOTAL",
              loadKg: 0,
            },
          },
        ],
      },
      revision,
    );
  }

  it("saves running HR, splits, and start time; totals stay user-typed", async () => {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { getLogDetail } = await import("@/lib/services/journal");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addRunPlan(userId, week.revision);

    const { log, deduped } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        ...runActual(),
        avgHeartRate: 142,
        startTime: "06:30",
        elapsedDurationSec: 2400,
        outcome: "PARTIAL",
        feeling: "เหนื่อย",
        splits: [
          { distanceM: 800, durationSec: 240 },
          { distanceM: 800, durationSec: 238 },
        ],
      },
    });
    expect(deduped).toBe(false);
    expect(log.avgHeartRate).toBe(142);
    expect(log.outcome).toBe("PARTIAL");
    // Bangkok 06:30 = 23:30 UTC the day before.
    expect((log.startedAt as Date).toISOString()).toBe(
      "2026-02-10T23:30:00.000Z",
    );

    const detail = await getLogDetail(userId, log.id);
    expect(detail.splits.map((s) => s.distanceM)).toEqual([800, 800]);
    // Splits sum (1600 m) never overrides the typed total (5000 m).
    expect(detail.log.distanceM).toBe(5000);
  });

  it("dedupes running retries and blocks a second log per plan", async () => {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addRunPlan(userId, week.revision);

    const mutationId = crypto.randomUUID();
    const first = await saveWorkoutLog(userId, {
      clientMutationId: mutationId,
      planItemId: plan.item.id,
      actual: runActual(),
    });
    const retry = await saveWorkoutLog(userId, {
      clientMutationId: mutationId,
      planItemId: plan.item.id,
      actual: { ...runActual(), distanceM: 9999 },
    });
    expect(retry.deduped).toBe(true);
    expect(retry.log.id).toBe(first.log.id);
    expect(retry.log.distanceM).toBe(5000);

    // Off-plan retry dedupes too.
    const offId = crypto.randomUUID();
    const off = await saveWorkoutLog(userId, {
      clientMutationId: offId,
      actual: runActual(),
    });
    const offRetry = await saveWorkoutLog(userId, {
      clientMutationId: offId,
      actual: runActual(),
    });
    expect(offRetry.deduped).toBe(true);
    expect(offRetry.log.id).toBe(off.log.id);

    await expect(
      saveWorkoutLog(userId, {
        clientMutationId: crypto.randomUUID(),
        planItemId: plan.item.id,
        actual: runActual(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("saves strength actuals per set with sides, plank seconds, load meanings", async () => {
    const { saveStrengthLog } = await import("@/lib/services/logging");
    const { getLogDetail } = await import("@/lib/services/journal");
    const { listWeek } = await import("@/lib/services/planner");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addStrengthPlan(userId, week.revision);
    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const planned =
      days.find((d) => d.date === WEDNESDAY)?.items[0]?.exercises ?? [];
    const splitSquat = planned.find(
      (e) => e.exerciseCode === "BULGARIAN_SPLIT_SQUAT",
    );
    const plank = planned.find((e) => e.exerciseCode === "PLANK");

    const { log } = await saveStrengthLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        sessionDurationSec: 2700,
        outcome: "PARTIAL",
        exercises: [
          {
            plannedExerciseId: splitSquat?.id,
            exerciseCode: "BULGARIAN_SPLIT_SQUAT",
            variant: "STANDARD",
            countMode: "PER_SIDE",
            sets: [
              { setNumber: 1, side: "LEFT", measurement: "REPS", reps: 10, loadKg: 8 },
              { setNumber: 1, side: "RIGHT", measurement: "REPS", reps: 8, loadKg: 8 },
              { setNumber: 2, side: "LEFT", measurement: "REPS", reps: 10, loadKg: 8 },
              // Skipped set: shape kept, no result recorded.
              { setNumber: 2, side: "RIGHT", measurement: "REPS", loadKg: null },
            ],
          },
          {
            plannedExerciseId: plank?.id,
            exerciseCode: "PLANK",
            variant: "STANDARD",
            countMode: "TOTAL",
            sets: [
              { setNumber: 1, side: "BOTH", measurement: "TIME", durationSec: 45, loadKg: 0 },
              { setNumber: 2, side: "BOTH", measurement: "TIME", durationSec: 40, loadKg: null },
            ],
          },
          // Off-plan exercise alongside planned ones.
          {
            exerciseCode: "DEAD_BUG",
            variant: "STANDARD",
            countMode: "TOTAL_ALTERNATING",
            sets: [
              { setNumber: 1, side: "ALTERNATING", measurement: "REPS", reps: 12, loadKg: 0 },
            ],
          },
        ],
      },
    });
    expect(log.activityType).toBe("STRENGTH");
    expect(log.outcome).toBe("PARTIAL");

    const detail = await getLogDetail(userId, log.id);
    expect(detail.strength).toHaveLength(3);
    const squat = detail.strength.find(
      (e) => e.exercise.exerciseCode === "BULGARIAN_SPLIT_SQUAT",
    );
    expect(squat?.exercise.plannedExerciseId).toBe(splitSquat?.id);
    const right1 = squat?.sets.find(
      (s) => s.setIndex === 1 && s.side === "RIGHT",
    );
    expect(right1?.reps).toBe(8);
    const skipped = squat?.sets.find(
      (s) => s.setIndex === 2 && s.side === "RIGHT",
    );
    expect(skipped?.reps).toBeNull();
    expect(skipped?.loadKg).toBeNull();
    const planks = detail.strength.find(
      (e) => e.exercise.exerciseCode === "PLANK",
    );
    expect(planks?.sets[0]?.durationSec).toBe(45);
    expect(planks?.sets[0]?.reps).toBeNull();
    expect(planks?.sets[0]?.loadKg).toBe(0);
    expect(planks?.sets[1]?.loadKg).toBeNull();
  });

  it("guards strength plan links, idempotency, and future dates", async () => {
    const { saveStrengthLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addStrengthPlan(userId, week.revision);
    const actual = {
      performedDate: TUESDAY,
      exercises: [
        {
          exerciseCode: "PLANK",
          variant: "STANDARD",
          countMode: "TOTAL" as const,
          sets: [
            { setNumber: 1, side: "BOTH" as const, measurement: "TIME" as const, durationSec: 45, loadKg: 0 },
          ],
        },
      ],
    };

    // Planned link without a plan is rejected.
    await expect(
      saveStrengthLog(userId, {
        clientMutationId: crypto.randomUUID(),
        actual: {
          ...actual,
          exercises: [
            {
              ...actual.exercises[0],
              plannedExerciseId: crypto.randomUUID(),
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const mutationId = crypto.randomUUID();
    const first = await saveStrengthLog(userId, {
      clientMutationId: mutationId,
      actual,
    });
    const retry = await saveStrengthLog(userId, {
      clientMutationId: mutationId,
      actual,
    });
    expect(retry.deduped).toBe(true);
    expect(retry.log.id).toBe(first.log.id);

    await expect(
      saveStrengthLog(userId, {
        clientMutationId: crypto.randomUUID(),
        planItemId: plan.item.id,
        actual: {
          ...actual,
          exercises: [
            {
              ...actual.exercises[0],
              plannedExerciseId: crypto.randomUUID(),
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      saveStrengthLog(userId, {
        clientMutationId: crypto.randomUUID(),
        planItemId: plan.item.id,
        actual: { ...actual, performedDate: "2999-01-01" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects future running dates and cross-activity plans", async () => {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const strength = await addStrengthPlan(userId, week.revision);

    await expect(
      saveWorkoutLog(userId, {
        clientMutationId: crypto.randomUUID(),
        actual: { ...runActual(), performedDate: "2999-01-01" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      saveWorkoutLog(userId, {
        clientMutationId: crypto.randomUUID(),
        planItemId: strength.item.id,
        actual: runActual(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
