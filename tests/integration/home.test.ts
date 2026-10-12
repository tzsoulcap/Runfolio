import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-02-04"); // 2026-02-02
const WEDNESDAY = "2026-02-04";

describe.skipIf(!canRunDb)("home service reads", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      dailyPlans,
      planItems,
      raceGoals,
      userProfiles,
      weeklyPlans,
      workoutLogs,
    } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (users.length > 0) {
      await db.delete(workoutLogs).where(inArray(workoutLogs.userId, users));
      await db.delete(raceGoals).where(inArray(raceGoals.userId, users));
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

  it("returns the active primary goal and ignores the rest", async () => {
    const { db } = await import("@/lib/db/client");
    const { raceGoals } = await import("@/lib/db/schema");
    const { getPrimaryGoal } = await import("@/lib/services/goals");
    const userId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    users.push(userId, otherId);
    await db.insert(raceGoals).values([
      {
        userId,
        distanceCode: "HALF",
        distanceM: 21097.5,
        goalType: "FINISH",
        eventName: "Bangsaen21",
        eventDate: "2026-12-13",
        isPrimary: true,
        status: "ACTIVE",
      },
      {
        userId,
        distanceCode: "MARATHON",
        distanceM: 42195,
        goalType: "FINISH",
        isPrimary: false,
        status: "ACTIVE",
      },
      {
        userId: otherId,
        distanceCode: "HALF",
        distanceM: 21097.5,
        goalType: "FINISH",
        isPrimary: true,
        status: "ACTIVE",
      },
    ]);

    const goal = await getPrimaryGoal(userId);
    expect(goal?.eventName).toBe("Bangsaen21");
    expect(goal?.distanceM).toBe(21097.5);

    const [archived] = await db
      .insert(raceGoals)
      .values({
        userId: crypto.randomUUID(),
        distanceCode: "HALF",
        distanceM: 21097.5,
        goalType: "FINISH",
        isPrimary: true,
        status: "ARCHIVED",
      })
      .returning({ userId: raceGoals.userId });
    users.push(archived.userId);
    expect(await getPrimaryGoal(archived.userId)).toBeNull();
  });

  it("lists week-range actuals and carries log distance into listWeek", async () => {
    const { getOrCreateWeek, addPlanItem, listWeek } = await import(
      "@/lib/services/planner"
    );
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { listLogsInRange } = await import("@/lib/services/journal");
    const userId = crypto.randomUUID();
    users.push(userId);
    const { week } = await getOrCreateWeek(userId, MONDAY);
    weeks.push(week.id);
    const { item, revision } = await addPlanItem(
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
    expect(revision).toBe(week.revision + 1);
    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      },
    });
    // Off-plan run the next day: real training in the same week.
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: "2026-02-05",
        runningWorkoutCode: "RECOVERY_RUN",
        distanceM: 3000,
        movingDurationSec: 1200,
      },
    });

    const inRange = await listLogsInRange(userId, MONDAY, "2026-02-08");
    expect(inRange).toHaveLength(2);
    expect(
      inRange.reduce((m, l) => m + (l.distanceM ?? 0), 0),
    ).toBe(8000);

    const outOfRange = await listLogsInRange(userId, "2026-02-09", "2026-02-15");
    expect(outOfRange).toHaveLength(0);

    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const logged = days.flatMap((d) => d.items).find((i) => i.id === item.id);
    expect(logged?.log?.id).toBe(log.id);
    expect(logged?.log?.distanceM).toBe(5000);
    expect(logged?.log?.movingDurationSec).toBe(2280);
  });
});
