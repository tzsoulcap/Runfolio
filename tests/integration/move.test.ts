import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-03-18"); // 2026-03-16
const TUESDAY = "2026-03-17";
const WEDNESDAY = "2026-03-18";
const NEXT_MONDAY = "2026-03-23";

describe.skipIf(!canRunDb)("move and reorder plan items", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      dailyPlans,
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

  async function setupWeek(monday = MONDAY) {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const userId = users[0] ?? crypto.randomUUID();
    if (users.length === 0) users.push(userId);
    const { week } = await getOrCreateWeek(userId, monday);
    weeks.push(week.id);
    return { userId, week };
  }

  async function addRun(
    userId: string,
    revision: number,
    date: string,
    code = "EASY_RUN",
  ) {
    const { addPlanItem } = await import("@/lib/services/planner");
    return addPlanItem(
      userId,
      {
        date,
        activityType: "RUNNING",
        runningWorkoutCode: code,
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        intensityTarget: { kind: "NONE" },
      },
      revision,
    );
  }

  async function dayItems(userId: string, monday: string, date: string) {
    const { listWeek } = await import("@/lib/services/planner");
    const { days } = await listWeek(userId, monday, date);
    return days.find((d) => d.date === date)?.items ?? [];
  }

  it("reorders within a day and persists", async () => {
    const { movePlanItem } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
    const second = await addRun(userId, first.revision, WEDNESDAY, "TEMPO");

    const moved = await movePlanItem(userId, {
      planItemId: second.item.id,
      targetDate: WEDNESDAY,
      targetIndex: 0,
      expectedRevision: second.revision,
    });
    expect(moved.sortOrder).toBe(0);
    expect(moved.revision).toBe(second.revision + 1);

    const items = await dayItems(userId, MONDAY, WEDNESDAY);
    expect(items.map((i) => i.id)).toEqual([second.item.id, first.item.id]);
  });

  it("moves across days and clamps the index", async () => {
    const { movePlanItem } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);

    const moved = await movePlanItem(userId, {
      planItemId: first.item.id,
      targetDate: TUESDAY,
      targetIndex: 99,
      expectedRevision: first.revision,
    });
    expect(moved.sortOrder).toBe(0);
    expect(await dayItems(userId, MONDAY, WEDNESDAY)).toHaveLength(0);
    const tuesday = await dayItems(userId, MONDAY, TUESDAY);
    expect(tuesday.map((i) => i.id)).toEqual([first.item.id]);
  });

  it("moves across weeks guarded by both revisions", async () => {
    const { getOrCreateWeek, movePlanItem } = await import(
      "@/lib/services/planner"
    );
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
    const dest = await getOrCreateWeek(userId, NEXT_MONDAY);
    weeks.push(dest.week.id);

    const moved = await movePlanItem(userId, {
      planItemId: first.item.id,
      targetDate: NEXT_MONDAY,
      targetIndex: 0,
      expectedRevision: first.revision,
      expectedDestRevision: dest.week.revision,
    });
    expect(moved.revision).toBe(first.revision + 1);
    expect(moved.destRevision).toBe(dest.week.revision + 1);
    const next = await dayItems(userId, NEXT_MONDAY, NEXT_MONDAY);
    expect(next.map((i) => i.id)).toEqual([first.item.id]);
  });

  it("locks items with an active log and blocks rest-day targets", async () => {
    const { movePlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { setRestDay } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
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
      movePlanItem(userId, {
        planItemId: first.item.id,
        targetDate: TUESDAY,
        targetIndex: 0,
        expectedRevision: first.revision,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const second = await addRun(userId, first.revision, WEDNESDAY, "TEMPO");
    const rev = await setRestDay(userId, TUESDAY, second.revision);
    await expect(
      movePlanItem(userId, {
        planItemId: second.item.id,
        targetDate: TUESDAY,
        targetIndex: 0,
        expectedRevision: rev,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects stale revisions, missing dest revision, and foreign items", async () => {
    const { movePlanItem } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
    await expect(
      movePlanItem(userId, {
        planItemId: first.item.id,
        targetDate: TUESDAY,
        targetIndex: 0,
        expectedRevision: week.revision,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      movePlanItem(userId, {
        planItemId: first.item.id,
        targetDate: NEXT_MONDAY,
        targetIndex: 0,
        expectedRevision: first.revision,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const stranger = crypto.randomUUID();
    users.push(stranger);
    await expect(
      movePlanItem(stranger, {
        planItemId: first.item.id,
        targetDate: TUESDAY,
        targetIndex: 0,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reads week revisions, defaulting missing weeks to 1", async () => {
    const { getWeekRevision } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
    const current = await getWeekRevision(userId, MONDAY);
    expect(current.revision).toBe(first.revision);
    const missing = await getWeekRevision(userId, "2026-04-06");
    expect(missing.revision).toBe(1);
  });

  it("leaves the revision alone on a no-op move", async () => {
    const { movePlanItem } = await import("@/lib/services/planner");
    const { userId, week } = await setupWeek();
    const first = await addRun(userId, week.revision, WEDNESDAY);
    const moved = await movePlanItem(userId, {
      planItemId: first.item.id,
      targetDate: WEDNESDAY,
      targetIndex: 0,
      expectedRevision: first.revision,
    });
    expect(moved.revision).toBe(first.revision);
    expect(moved.sortOrder).toBe(0);
  });
});
