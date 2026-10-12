import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-03-04"); // 2026-03-02
const WEDNESDAY = "2026-03-04";

describe.skipIf(!canRunDb)("rest days and race-day plans", () => {
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
    // Order matters: plan items reference race goals (restrict).
    if (users.length > 0) {
      await db.delete(workoutLogs).where(inArray(workoutLogs.userId, users));
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
      await db.delete(raceGoals).where(inArray(raceGoals.userId, users));
      await db.delete(userProfiles).where(inArray(userProfiles.userId, users));
      users.length = 0;
    }
  });

  async function setupWeek() {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const userId = crypto.randomUUID();
    users.push(userId);
    const { week } = await getOrCreateWeek(userId, MONDAY);
    weeks.push(week.id);
    return { userId, week };
  }

  async function addEasy(userId: string, revision: number, date = WEDNESDAY) {
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

  async function addGoal(userId: string, overrides = {}) {
    const { db } = await import("@/lib/db/client");
    const { raceGoals } = await import("@/lib/db/schema");
    const [goal] = await db
      .insert(raceGoals)
      .values({
        userId,
        distanceCode: "HALF",
        distanceM: 21097.5,
        goalType: "FINISH",
        eventName: "Bangsaen21",
        eventDate: "2026-12-13",
        isPrimary: false,
        status: "ACTIVE",
        ...overrides,
      })
      .returning();
    if (!goal) throw new Error("goal insert failed");
    return goal;
  }

  it("sets and unsets a rest day on an empty day", async () => {
    const { getOrCreateWeek, setRestDay, unsetRestDay } = await import(
      "@/lib/services/planner"
    );
    const { userId, week } = await setupWeek();
    const rev = await setRestDay(userId, WEDNESDAY, week.revision, {
      note: "พักขา",
    });
    expect(rev).toBe(week.revision + 1);
    const { days } = await getOrCreateWeek(userId, MONDAY);
    const day = days.find((d) => d.date === WEDNESDAY);
    expect(day?.isRestDay).toBe(true);
    expect(day?.note).toBe("พักขา");

    const rev2 = await unsetRestDay(userId, WEDNESDAY, rev);
    expect(rev2).toBe(rev + 1);
    const again = await getOrCreateWeek(userId, MONDAY);
    const undone = again.days.find((d) => d.date === WEDNESDAY);
    expect(undone?.isRestDay).toBe(false);
  });

  it("refuses rest over a logged day, removes unlogged ones on choice", async () => {
    const { setRestDay } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { userId, week } = await setupWeek();
    const first = await addEasy(userId, week.revision);
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: first.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      },
    });
    await expect(
      setRestDay(userId, WEDNESDAY, first.revision, { removeUnlogged: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const second = await addEasy(userId, first.revision, "2026-03-05");
    await expect(
      setRestDay(userId, "2026-03-05", second.revision),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const rev = await setRestDay(userId, "2026-03-05", second.revision, {
      removeUnlogged: true,
    });
    expect(rev).toBe(second.revision + 1);
  });

  it("links RACE_DAY distance from the goal, never typed", async () => {
    const { addPlanItem, listWeek } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const goal = await addGoal(userId);
    const { item } = await addPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "RUNNING",
        runningWorkoutCode: "RACE_DAY",
        intensityTarget: { kind: "NONE" },
        goalId: goal.id,
      },
      week.revision,
    );
    expect(item.raceGoalId).toBe(goal.id);
    expect(item.runningTarget).toEqual({
      kind: "DISTANCE",
      distanceM: 21097.5,
    });
    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const stored = days.flatMap((d) => d.items).find((i) => i.id === item.id);
    expect(stored?.raceGoalId).toBe(goal.id);
  });

  it("rejects race-day links to other users or inactive goals", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const stranger = crypto.randomUUID();
    users.push(stranger);
    const foreign = await addGoal(stranger);
    await expect(
      addPlanItem(
        userId,
        {
          date: WEDNESDAY,
          activityType: "RUNNING",
          runningWorkoutCode: "RACE_DAY",
          intensityTarget: { kind: "NONE" },
          goalId: foreign.id,
        },
        week.revision,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const archived = await addGoal(userId, { status: "ARCHIVED" });
    await expect(
      addPlanItem(
        userId,
        {
          date: WEDNESDAY,
          activityType: "RUNNING",
          runningWorkoutCode: "RACE_DAY",
          intensityTarget: { kind: "NONE" },
          goalId: archived.id,
        },
        week.revision,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists own active goals primary-first", async () => {
    const { listGoals } = await import("@/lib/services/goals");
    const { userId } = await setupWeek();
    const stranger = crypto.randomUUID();
    users.push(stranger);
    await addGoal(stranger, { eventName: "Foreign" });
    await addGoal(userId, { eventName: "Later", eventDate: "2027-01-10" });
    await addGoal(userId, {
      eventName: "Primary",
      isPrimary: true,
      eventDate: "2027-02-10",
    });
    await addGoal(userId, { eventName: "Old", status: "ARCHIVED" });
    const goals = await listGoals(userId);
    expect(goals.map((g) => g.eventName)).toEqual(["Primary", "Later"]);
  });
});
