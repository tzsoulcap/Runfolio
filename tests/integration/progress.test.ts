import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-02-11"); // 2026-02-09
const TUESDAY = "2026-02-10";
const WEDNESDAY = "2026-02-11";

describe.skipIf(!canRunDb)("progress aggregates", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      actualRunningSplits,
      dailyPlans,
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

  async function saveRun(
    userId: string,
    overrides: Record<string, unknown> = {},
    planItemId?: string,
  ) {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    return saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      ...(planItemId ? { planItemId } : {}),
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
        ...overrides,
      },
    });
  }

  it("aggregates plans and actuals over a range (§14)", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { getProgress } = await import("@/lib/services/progress");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const plan = await addPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "RUNNING",
        runningWorkoutCode: "EASY_RUN",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        intensityTarget: { kind: "NONE" },
      },
      week.revision,
    );
    await saveRun(userId, {}, plan.item.id);
    await saveRun(userId, {
      performedDate: TUESDAY,
      distanceM: 3000,
      movingDurationSec: 1080,
    });

    const progress = await getProgress(userId, {
      from: MONDAY,
      to: WEDNESDAY,
      today: WEDNESDAY,
    });
    expect(progress.summary.runningActualM).toBe(8000);
    expect(progress.summary.runningActualSec).toBe(2880);
    expect(progress.summary.plannedDistanceM).toBe(6000);
    expect(progress.summary.doneItems).toBe(1);
    expect(progress.summary.totalItems).toBe(1);
    expect(progress.trainingDaysCount).toBe(2);
    // Off-plan logs count as sessions but never as plan completion.
    expect(progress.runningSessions).toBe(2);
    expect(progress.paceRows).toEqual([
      {
        code: "EASY_RUN",
        distanceM: 8000,
        movingDurationSec: 2880,
        paceSecPerKm: 360,
      },
    ]);
    const weekBucket = progress.buckets.find((b) => b.monday === MONDAY);
    expect(weekBucket?.distanceM).toBe(8000);
  });

  it("excludes skipped from completion and counts past missed only", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { getProgress } = await import("@/lib/services/progress");
    const { db } = await import("@/lib/db/client");
    const { planItems } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const userId = await setupUser();
    const week = await setupWeek(userId);
    const runTarget = {
      date: TUESDAY,
      activityType: "RUNNING",
      runningWorkoutCode: "EASY_RUN",
      runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      intensityTarget: { kind: "NONE" },
    } as const;
    const skipped = await addPlanItem(userId, { ...runTarget }, week.revision);
    // Mark skipped directly (no skip service yet).
    await db
      .update(planItems)
      .set({ planState: "SKIPPED" })
      .where(eq(planItems.id, skipped.item.id));
    const second = await addPlanItem(
      userId,
      { ...runTarget },
      skipped.revision,
    );
    await addPlanItem(
      userId,
      { ...runTarget, date: "2026-02-15" },
      second.revision,
    );

    const progress = await getProgress(userId, {
      from: MONDAY,
      to: "2026-02-15",
      today: WEDNESDAY,
    });
    expect(progress.summary.totalItems).toBe(2);
    expect(progress.summary.skippedItems).toBe(1);
    expect(progress.missed).toBe(1);
  });

  it("aggregates typed totals, never split sums (§19.11)", async () => {
    const { getProgress } = await import("@/lib/services/progress");
    const userId = await setupUser();
    await saveRun(userId, {
      distanceM: 5000,
      movingDurationSec: 1800,
      splits: [
        { splitIndex: 0, distanceM: 1000, durationSec: 400 },
        { splitIndex: 1, distanceM: 600, durationSec: 300 },
      ],
    });

    const progress = await getProgress(userId, {
      from: MONDAY,
      to: WEDNESDAY,
      today: WEDNESDAY,
    });
    expect(progress.summary.runningActualM).toBe(5000);
    expect(progress.summary.runningActualSec).toBe(1800);
    expect(progress.paceRows).toEqual([
      {
        code: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
        paceSecPerKm: 360,
      },
    ]);
    const weekBucket = progress.buckets.find((b) => b.monday === MONDAY);
    expect(weekBucket?.distanceM).toBe(5000);
  });

  it("returns zeros and clamps long ranges", async () => {
    const { getProgress } = await import("@/lib/services/progress");
    const userId = await setupUser();
    const empty = await getProgress(userId, {
      from: MONDAY,
      to: WEDNESDAY,
      today: WEDNESDAY,
    });
    expect(empty.summary.runningActualM).toBe(0);
    expect(empty.summary.totalItems).toBe(0);
    expect(empty.buckets).toHaveLength(10);

    const clamped = await getProgress(userId, {
      from: "2025-01-01",
      to: WEDNESDAY,
      today: WEDNESDAY,
    });
    expect(clamped.effectiveFrom).toBe("2025-11-12");
  });
});
