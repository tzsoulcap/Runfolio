import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-02-11"); // 2026-02-09
const TUESDAY = "2026-02-10";
const WEDNESDAY = "2026-02-11";

describe.skipIf(!canRunDb)("journal timeline", () => {
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

  async function addRunPlan(
    userId: string,
    revision: number,
    date = WEDNESDAY,
  ) {
    const { addPlanItem } = await import("@/lib/services/planner");
    return addPlanItem(
      userId,
      {
        date,
        activityType: "RUNNING",
        runningWorkoutCode: "EASY_RUN",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        intensityTarget: { kind: "NONE" },
      },
      revision,
    );
  }

  async function addStrengthPlan(
    userId: string,
    revision: number,
    title = "Legs and core",
  ) {
    const { addStrengthPlanItem } = await import("@/lib/services/planner");
    return addStrengthPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "STRENGTH",
        title,
        exercises: [
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

  async function saveRun(
    userId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    return saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
        ...overrides,
      },
    });
  }

  async function saveStrength(userId: string, planItemId?: string) {
    const { saveStrengthLog } = await import("@/lib/services/logging");
    return saveStrengthLog(userId, {
      clientMutationId: crypto.randomUUID(),
      ...(planItemId ? { planItemId } : {}),
      actual: {
        performedDate: TUESDAY,
        outcome: "COMPLETED",
        exercises: [
          {
            exerciseCode: "PLANK",
            countMode: "TOTAL",
            sets: [
              {
                setNumber: 1,
                side: "BOTH",
                measurement: "TIME",
                durationSec: 45,
              },
            ],
          },
        ],
      },
    });
  }

  it("filters by activity, outcome, code, date, and search", async () => {
    const { listLogs } = await import("@/lib/services/journal");
    const userId = await setupUser();
    await saveRun(userId, { note: "ฝนตกเช้านี้" });
    await saveRun(userId, {
      runningWorkoutCode: "TEMPO",
      outcome: "PARTIAL",
      performedDate: TUESDAY,
      note: "tempo night",
    });
    await saveStrength(userId);

    expect((await listLogs(userId, {})).total).toBe(3);
    expect(
      (await listLogs(userId, { activity: "STRENGTH" })).entries.map(
        (e) => e.log.activityType,
      ),
    ).toEqual(["STRENGTH"]);
    expect(
      (await listLogs(userId, { outcome: "PARTIAL" })).total,
    ).toBe(1);
    expect(
      (await listLogs(userId, { workoutCode: "TEMPO" })).total,
    ).toBe(1);
    expect(
      (await listLogs(userId, { from: TUESDAY, to: TUESDAY })).total,
    ).toBe(2);
    expect((await listLogs(userId, { q: "ฝนตก" })).total).toBe(1);
    expect((await listLogs(userId, { q: "tempo" })).total).toBe(1);
  });

  it("paginates newest-first with a total", async () => {
    const { listLogs } = await import("@/lib/services/journal");
    const userId = await setupUser();
    await saveRun(userId, { performedDate: TUESDAY });
    await saveRun(userId, { performedDate: WEDNESDAY });

    const first = await listLogs(userId, { limit: 1 });
    expect(first.total).toBe(2);
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]?.log.performedDate).toBe(WEDNESDAY);
    const second = await listLogs(userId, { limit: 1, offset: 1 });
    expect(second.entries[0]?.log.performedDate).toBe(TUESDAY);
  });

  it("counts logs per day in a range", async () => {
    const { countLogsByDay } = await import("@/lib/services/journal");
    const userId = await setupUser();
    await saveRun(userId, { performedDate: TUESDAY });
    await saveRun(userId, { performedDate: TUESDAY });
    await saveStrength(userId);

    expect(await countLogsByDay(userId, MONDAY, WEDNESDAY, {})).toEqual({
      [MONDAY]: 0,
      [TUESDAY]: 3,
      [WEDNESDAY]: 0,
    });
    expect(
      await countLogsByDay(userId, MONDAY, WEDNESDAY, {
        activity: "RUNNING",
      }),
    ).toEqual({ [MONDAY]: 0, [TUESDAY]: 2, [WEDNESDAY]: 0 });
  });

  it("deletes and undeletes; plan link reverts to unlogged", async () => {
    const { listWeek } = await import("@/lib/services/planner");
    const { getLogDetail, listLogs } = await import(
      "@/lib/services/journal"
    );
    const { deleteWorkoutLog, undeleteWorkoutLog } = await import(
      "@/lib/services/logging"
    );
    const { ServiceError } = await import("@/lib/services/errors");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addRunPlan(userId, week.revision);
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      },
    });

    await deleteWorkoutLog(userId, log.id);
    expect((await listLogs(userId, {})).total).toBe(0);
    await expect(getLogDetail(userId, log.id)).rejects.toBeInstanceOf(
      ServiceError,
    );
    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const item = days
      .flatMap((d) => d.items)
      .find((i) => i.id === plan.item.id);
    expect(item?.log).toBeNull();

    await undeleteWorkoutLog(userId, log.id);
    expect((await listLogs(userId, {})).total).toBe(1);
  });

  it("refuses to restore when the plan was re-logged (§19.9)", async () => {
    const { listLogs } = await import("@/lib/services/journal");
    const {
      deleteWorkoutLog,
      saveWorkoutLog,
      undeleteWorkoutLog,
    } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addRunPlan(userId, week.revision);
    const first = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      },
    });
    await deleteWorkoutLog(userId, first.log.id);
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 4000,
        movingDurationSec: 1800,
      },
    });

    await expect(undeleteWorkoutLog(userId, first.log.id)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
    expect((await listLogs(userId, {})).total).toBe(1);
  });

  it("updates running totals and replaces splits; plan link kept", async () => {
    const { getLogDetail } = await import("@/lib/services/journal");
    const { saveWorkoutLog, updateWorkoutLog } = await import(
      "@/lib/services/logging"
    );
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addRunPlan(userId, week.revision);
    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
        splits: [{ distanceM: 1000 }],
      },
    });

    await updateWorkoutLog(userId, log.id, {
      performedDate: WEDNESDAY,
      runningWorkoutCode: "TEMPO",
      distanceM: 6000,
      movingDurationSec: 2400,
      outcome: "PARTIAL",
      splits: [{ distanceM: 2000 }, { distanceM: 2000 }],
    });
    const detail = await getLogDetail(userId, log.id);
    expect(detail.log.distanceM).toBe(6000);
    expect(detail.log.outcome).toBe("PARTIAL");
    expect(detail.log.runningWorkoutCode).toBe("TEMPO");
    expect(detail.log.planItemId).toBe(plan.item.id);
    expect(detail.splits.map((s) => s.distanceM)).toEqual([2000, 2000]);
  });

  it("updates strength sets by replacing children", async () => {
    const { getLogDetail } = await import("@/lib/services/journal");
    const { updateStrengthLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const { log } = await saveStrength(userId);

    await updateStrengthLog(userId, log.id, {
      performedDate: TUESDAY,
      outcome: "PARTIAL",
      exercises: [
        {
          exerciseCode: "PLANK",
          countMode: "TOTAL",
          sets: [
            {
              setNumber: 1,
              side: "BOTH",
              measurement: "TIME",
              durationSec: 30,
            },
            {
              setNumber: 2,
              side: "BOTH",
              measurement: "TIME",
              durationSec: 30,
            },
          ],
        },
      ],
    });
    const detail = await getLogDetail(userId, log.id);
    expect(detail.log.outcome).toBe("PARTIAL");
    expect(detail.strength).toHaveLength(1);
    expect(
      detail.strength[0]?.sets.map((s) => s.durationSec),
    ).toEqual([30, 30]);
  });

  it("summarizes strength rows and searches linked plan titles", async () => {
    const { listWeek } = await import("@/lib/services/planner");
    const { listLogs } = await import("@/lib/services/journal");
    const { saveStrengthLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const title = `Quadzilla ${Date.now()}`;
    const plan = await addStrengthPlan(userId, week.revision, title);
    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const planned =
      days.find((d) => d.date === WEDNESDAY)?.items[0]?.exercises ?? [];
    const plank = planned.find((e) => e.exerciseCode === "PLANK");

    await saveStrengthLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        outcome: "COMPLETED",
        exercises: [
          {
            plannedExerciseId: plank?.id,
            exerciseCode: "PLANK",
            countMode: "TOTAL",
            sets: [
              {
                setNumber: 1,
                side: "BOTH",
                measurement: "TIME",
                durationSec: 45,
              },
              { setNumber: 2, side: "BOTH", measurement: "TIME" },
            ],
          },
        ],
      },
    });

    const found = await listLogs(userId, { q: "Quadzilla" });
    expect(found.total).toBe(1);
    expect(found.entries[0]?.strengthSummary).toEqual({
      exercises: 1,
      setsWithResult: 1,
    });
    const missing = await listLogs(userId, { q: "no-such-plan-xyz" });
    expect(missing.total).toBe(0);
  });

  it("rejects foreign-log edits and future performed dates", async () => {
    const { deleteWorkoutLog, updateWorkoutLog } = await import(
      "@/lib/services/logging"
    );
    const userId = await setupUser();
    const otherId = await setupUser();
    const { log } = await saveRun(userId);

    await expect(
      updateWorkoutLog(otherId, log.id, {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteWorkoutLog(otherId, log.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(
      updateWorkoutLog(userId, log.id, {
        performedDate: "2999-01-01",
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
