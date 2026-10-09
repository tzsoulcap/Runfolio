import { afterEach, describe, expect, it } from "vitest";

import type { PlanDraft } from "@/lib/domain/plan";
import { mondayOf, todayInTimeZone } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const MONDAY = mondayOf("2026-01-07"); // 2026-01-05
const TUESDAY = "2026-01-06";

function easyDraft(): PlanDraft {
  return {
    date: TUESDAY,
    activityType: "RUNNING",
    runningWorkoutCode: "EASY_RUN",
    runningTarget: { kind: "DISTANCE", distanceM: 6000 },
    intensityTarget: { kind: "NONE" },
  };
}

function easyActual() {
  return {
    performedDate: TUESDAY,
    runningWorkoutCode: "EASY_RUN" as const,
    distanceM: 5000,
    movingDurationSec: 2280,
  };
}

describe.skipIf(!canRunDb)("plan-log-journal loop", () => {
  const users: string[] = [];
  const weeks: string[] = [];
  const logs: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const { dailyPlans, planItems, userProfiles, weeklyPlans, workoutLogs } =
      await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    // Delete by user, not tracked ids: orphans from a failed test cannot
    // break this or later cleanups via FK violations.
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

  async function setupWeek() {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const userId = crypto.randomUUID();
    users.push(userId);
    const { week, days } = await getOrCreateWeek(userId, MONDAY);
    weeks.push(week.id);
    return { userId, week, days };
  }

  it("creates a week with 7 days exactly once", async () => {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const { userId, week, days } = await setupWeek();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      "2026-01-11",
    ]);
    const again = await getOrCreateWeek(userId, MONDAY);
    expect(again.week.id).toBe(week.id);
    expect(again.days.map((d) => d.id).sort()).toEqual(
      days.map((d) => d.id).sort(),
    );
  });

  it("adds a plan, logs from it, and leaves the plan untouched", async () => {
    const { addPlanItem, listWeek } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { listLogs } = await import("@/lib/services/journal");
    const today = todayInTimeZone("Asia/Bangkok");

    const { userId, week } = await setupWeek();
    const { item, revision } = await addPlanItem(
      userId,
      easyDraft(),
      week.revision,
    );
    expect(revision).toBe(week.revision + 1);

    const before = await listWeek(userId, MONDAY, today);
    const planned = before.days
      .flatMap((d) => d.items)
      .find((i) => i.id === item.id);
    expect(planned?.status).toBe("MISSED"); // Jan 2026 is past, no log yet

    const { log, deduped } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: easyActual(),
    });
    logs.push(log.id);
    expect(deduped).toBe(false);
    expect(log.planItemId).toBe(item.id);
    expect(log.distanceM).toBe(5000);

    const after = await listWeek(userId, MONDAY, today);
    const logged = after.days
      .flatMap((d) => d.items)
      .find((i) => i.id === item.id);
    expect(logged?.status).toBe("COMPLETED");
    // Plan targets are NOT rewritten from actuals (§6).
    expect(logged?.runningTarget).toEqual({
      kind: "DISTANCE",
      distanceM: 6000,
    });

    const entries = await listLogs(userId);
    expect(entries.map((e) => e.log.id)).toContain(log.id);
  });

  it("returns the same log when the client retries a mutation id", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");

    const { userId, week } = await setupWeek();
    const { item } = await addPlanItem(userId, easyDraft(), week.revision);
    const clientMutationId = crypto.randomUUID();
    const first = await saveWorkoutLog(userId, {
      clientMutationId,
      planItemId: item.id,
      actual: easyActual(),
    });
    logs.push(first.log.id);
    const second = await saveWorkoutLog(userId, {
      clientMutationId,
      planItemId: item.id,
      actual: easyActual(),
    });
    expect(second.log.id).toBe(first.log.id);
    expect(second.deduped).toBe(true);
  });

  it("dedupes concurrent saves with the same mutation id", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");

    const { userId, week } = await setupWeek();
    const { item } = await addPlanItem(userId, easyDraft(), week.revision);
    const clientMutationId = crypto.randomUUID();
    const [a, b] = await Promise.all([
      saveWorkoutLog(userId, {
        clientMutationId,
        planItemId: item.id,
        actual: easyActual(),
      }),
      saveWorkoutLog(userId, {
        clientMutationId,
        planItemId: item.id,
        actual: easyActual(),
      }),
    ]);
    logs.push(a.log.id);
    expect(b.log.id).toBe(a.log.id);
    expect(a.deduped || b.deduped).toBe(true);
  });

  it("rejects a future performedDate and a second active log per plan", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");

    const { userId, week } = await setupWeek();
    const { item } = await addPlanItem(userId, easyDraft(), week.revision);

    const future = saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: { ...easyActual(), performedDate: "2999-01-01" },
    });
    await expect(future).rejects.toMatchObject({ code: "VALIDATION" });

    const first = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: easyActual(),
    });
    logs.push(first.log.id);
    const clash = saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: easyActual(),
    });
    await expect(clash).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("restores a skipped plan to scheduled when logging from it", async () => {
    const { db } = await import("@/lib/db/client");
    const { planItems } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { addPlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");

    const { userId, week } = await setupWeek();
    const { item } = await addPlanItem(userId, easyDraft(), week.revision);
    await db
      .update(planItems)
      .set({ planState: "SKIPPED" })
      .where(eq(planItems.id, item.id));

    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: easyActual(),
    });
    logs.push(log.id);
    const [row] = await db
      .select({ planState: planItems.planState })
      .from(planItems)
      .where(eq(planItems.id, item.id));
    expect(row?.planState).toBe("SCHEDULED");
  });

  it("keeps users from reading or logging on each other's plans", async () => {
    const { addPlanItem, listWeek } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { getLogDetail, listLogs } = await import("@/lib/services/journal");
    const today = todayInTimeZone("Asia/Bangkok");

    const { userId: a, week } = await setupWeek();
    const b = crypto.randomUUID();
    users.push(b);
    const { item } = await addPlanItem(a, easyDraft(), week.revision);
    const { log } = await saveWorkoutLog(a, {
      clientMutationId: crypto.randomUUID(),
      planItemId: item.id,
      actual: easyActual(),
    });
    logs.push(log.id);

    expect((await listWeek(b, MONDAY, today)).week).toBeNull();
    expect(await listLogs(b)).toEqual([]);
    await expect(getLogDetail(b, log.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      saveWorkoutLog(b, {
        clientMutationId: crypto.randomUUID(),
        planItemId: item.id,
        actual: easyActual(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
