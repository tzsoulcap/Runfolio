import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-03-11"); // 2026-03-09
const WEDNESDAY = "2026-03-11";

const PLANK = {
  exerciseCode: "PLANK",
  variant: "STANDARD",
  prescription: {
    measurement: "TIME",
    sets: 3,
    durationSec: 45,
    countMode: "TOTAL",
    loadKg: 0,
  },
} as const;

const SPLIT_SQUAT = {
  exerciseCode: "BULGARIAN_SPLIT_SQUAT",
  variant: "STANDARD",
  prescription: {
    measurement: "REPS",
    sets: 3,
    reps: 10,
    countMode: "PER_SIDE",
    loadKg: 8,
    restSec: 60,
  },
} as const;

describe.skipIf(!canRunDb)("strength sessions", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      dailyPlans,
      plannedStrengthExercises,
      planItems,
      userProfiles,
      weeklyPlans,
      workoutLogs,
    } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
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

  async function setupWeek() {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const userId = crypto.randomUUID();
    users.push(userId);
    const { week } = await getOrCreateWeek(userId, MONDAY);
    weeks.push(week.id);
    return { userId, week };
  }

  it("lists all 16 active exercise masters", async () => {
    const { listStrengthMasters } = await import("@/lib/services/planner");
    await setupWeek();
    const masters = await listStrengthMasters();
    expect(masters).toHaveLength(16);
    expect(new Set(masters.map((m) => m.code)).size).toBe(16);
    expect(
      masters.find((m) => m.code === "SINGLE_ARM_DUMBBELL_ROW"),
    ).toMatchObject({ muscleGroup: "UPPER_BODY", isUnilateral: true });
  });

  it("saves one item with ordered sub-exercises, visible via listWeek", async () => {
    const { addStrengthPlanItem, listWeek } = await import(
      "@/lib/services/planner"
    );
    const { userId, week } = await setupWeek();
    const { item, revision } = await addStrengthPlanItem(
      userId,
      {
        date: WEDNESDAY,
        activityType: "STRENGTH",
        title: "Legs and core",
        exercises: [SPLIT_SQUAT, PLANK, SPLIT_SQUAT],
      },
      week.revision,
    );
    expect(item.activityType).toBe("STRENGTH");
    expect(revision).toBe(week.revision + 1);

    const { days } = await listWeek(userId, MONDAY, WEDNESDAY);
    const stored = days.flatMap((d) => d.items).find((i) => i.id === item.id);
    expect(stored?.exercises.map((e) => e.exerciseCode)).toEqual([
      "BULGARIAN_SPLIT_SQUAT",
      "PLANK",
      "BULGARIAN_SPLIT_SQUAT",
    ]);
    expect(stored?.exercises.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
    expect(stored?.exercises[0]?.masterSnapshot).toMatchObject({
      code: "BULGARIAN_SPLIT_SQUAT",
      nameTh: "บัลแกเรียนสปลิตสควอต",
    });
    expect(stored?.exercises[1]?.prescription).toMatchObject({
      measurement: "TIME",
      durationSec: 45,
    });
    expect(stored?.exercises[1]?.prescription).not.toHaveProperty("reps");
  });

  it("rejects unknown codes, empty lists, and rest days", async () => {
    const { addStrengthPlanItem, setRestDay } = await import(
      "@/lib/services/planner"
    );
    const { userId, week } = await setupWeek();
    await expect(
      addStrengthPlanItem(
        userId,
        {
          date: WEDNESDAY,
          activityType: "STRENGTH",
          exercises: [
            { ...PLANK, exerciseCode: "NOT_A_LIFT" },
          ],
        },
        week.revision,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addStrengthPlanItem(
        userId,
        { date: WEDNESDAY, activityType: "STRENGTH", exercises: [] },
        week.revision,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const rev = await setRestDay(userId, WEDNESDAY, week.revision);
    await expect(
      addStrengthPlanItem(
        userId,
        {
          date: WEDNESDAY,
          activityType: "STRENGTH",
          exercises: [PLANK],
        },
        rev,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("copies seven exercises across weeks with independent ids and unchanged prescriptions", async () => {
    const { addStrengthPlanItem, addPlanItem, copyPlanItem, getOrCreateWeek, listWeek } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const run = await addPlanItem(userId, {date: WEDNESDAY, activityType: "RUNNING", runningWorkoutCode: "EASY_RUN", runningTarget: {kind: "DISTANCE", distanceM: 6000}}, week.revision);
    const exercises = [SPLIT_SQUAT, PLANK, SPLIT_SQUAT, PLANK, SPLIT_SQUAT, PLANK, SPLIT_SQUAT];
    const source = await addStrengthPlanItem(userId, {date: WEDNESDAY, activityType: "STRENGTH", title: "Seven exercises", note: "keep note", plannedStartTime: "18:30", exercises}, run.revision);
    const dest = await getOrCreateWeek(userId, "2026-03-16");
    weeks.push(dest.week.id);
    const result = await copyPlanItem(userId, {planItemId: source.item.id, targetDate: "2026-03-17", expectedRevision: source.revision, expectedDestRevision: dest.week.revision});
    expect(result.item.id).not.toBe(source.item.id);
    expect(result.item).toMatchObject({title: "Seven exercises", note: "keep note", plannedStartTime: "18:30", planState: "SCHEDULED"});
    const original = await listWeek(userId, MONDAY, WEDNESDAY);
    expect(original.week?.revision).toBe(source.revision);
    expect(original.days.find((day) => day.date === WEDNESDAY)?.items).toHaveLength(2);
    const copied = await listWeek(userId, "2026-03-16", "2026-03-17");
    const item = copied.days.flatMap((day) => day.items).find((item) => item.id === result.item.id)!;
    expect(item.log).toBeNull();
    expect(item.exercises).toHaveLength(7);
    expect(item.exercises.map((exercise) => exercise.prescription)).toEqual(exercises.map((exercise) => exercise.prescription));
    const oldIds = new Set(original.days.flatMap((day) => day.items.flatMap((item) => item.exercises.map((exercise) => exercise.id))));
    expect(item.exercises.every((exercise) => !oldIds.has(exercise.id))).toBe(true);
  });

  it("rejects stale copies, other users and rest days without leaving a copy", async () => {
    const { addStrengthPlanItem, copyPlanItem, listWeek, setRestDay } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const source = await addStrengthPlanItem(userId, {date: WEDNESDAY, activityType: "STRENGTH", exercises: [PLANK]}, week.revision);
    const input = {planItemId: source.item.id, targetDate: "2026-03-12", expectedRevision: source.revision};
    await expect(copyPlanItem(crypto.randomUUID(), input)).rejects.toMatchObject({code: "NOT_FOUND"});
    await expect(copyPlanItem(userId, {...input, expectedRevision: week.revision})).rejects.toMatchObject({code: "CONFLICT"});
    const revision = await setRestDay(userId, input.targetDate, source.revision);
    await expect(copyPlanItem(userId, {...input, expectedRevision: revision})).rejects.toMatchObject({code: "CONFLICT"});
    const current = await listWeek(userId, MONDAY, WEDNESDAY);
    expect(current.days.flatMap((day) => day.items)).toHaveLength(1);
  });
});
