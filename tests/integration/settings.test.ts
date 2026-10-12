import { afterEach, describe, expect, it } from "vitest";

import { canRunDb } from "./db-gate";

const MONDAY = "2026-02-09";
const WEDNESDAY = "2026-02-11";

describe.skipIf(!canRunDb)("settings + export", () => {
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
      planTemplates,
      raceGoals,
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
        const exerciseIds = exercises.map((e) => e.id);
        if (exerciseIds.length > 0) {
          await db
            .delete(actualStrengthSets)
            .where(inArray(actualStrengthSets.actualExerciseId, exerciseIds));
          await db
            .delete(actualStrengthExercises)
            .where(inArray(actualStrengthExercises.id, exerciseIds));
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
          await db.delete(planItems).where(inArray(planItems.id, itemIds));
        }
        await db.delete(dailyPlans).where(inArray(dailyPlans.id, dayIds));
      }
      await db.delete(weeklyPlans).where(inArray(weeklyPlans.id, weeks));
      weeks.length = 0;
    }
    if (users.length > 0) {
      await db.delete(raceGoals).where(inArray(raceGoals.userId, users));
      await db.delete(workoutLogs).where(inArray(workoutLogs.userId, users));
      await db
        .delete(planTemplates)
        .where(inArray(planTemplates.userId, users));
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

  it("updates the profile with a trimmed display name", async () => {
    const { updateOwnProfile } = await import("@/lib/services/profile");
    const userId = await setupUser();
    const profile = await updateOwnProfile(userId, {
      displayName: "  นักวิ่ง  ",
      timezone: "Asia/Bangkok",
    });
    expect(profile.displayName).toBe("นักวิ่ง");
    expect(profile.timezone).toBe("Asia/Bangkok");
  });

  it("rejects an unknown timezone", async () => {
    const { updateOwnProfile } = await import("@/lib/services/profile");
    const { ServiceError } = await import("@/lib/services/errors");
    const userId = await setupUser();
    await expect(
      updateOwnProfile(userId, {
        displayName: "นักวิ่ง",
        timezone: "Mars/Olympus",
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("keeps plan and log dates fixed when the timezone changes", async () => {
    const { addPlanItem, listWeek } = await import(
      "@/lib/services/planner"
    );
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { listProgressLogs } = await import("@/lib/services/journal");
    const { updateOwnProfile } = await import("@/lib/services/profile");
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
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
      },
    });

    await updateOwnProfile(userId, {
      displayName: "นักวิ่ง",
      timezone: "America/New_York",
    });

    const reread = await listWeek(userId, MONDAY, WEDNESDAY);
    const wednesday = reread.days.find((d) => d.date === WEDNESDAY);
    expect(wednesday?.items.map((i) => i.id)).toContain(plan.item.id);
    const logs = await listProgressLogs(userId, WEDNESDAY, WEDNESDAY);
    expect(logs.map((l) => l.performedDate)).toEqual([WEDNESDAY]);
  });

  it("exports plans, logs, goals, and templates without deleted rows", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { deleteWorkoutLog, saveWorkoutLog } = await import(
      "@/lib/services/logging"
    );
    const { archiveGoal, createGoal } = await import("@/lib/services/goals");
    const { saveWeekTemplate } = await import("@/lib/services/copying");
    const { updateOwnProfile } = await import("@/lib/services/profile");
    const { exportUserData } = await import("@/lib/services/export");
    const userId = await setupUser();
    await updateOwnProfile(userId, {
      displayName: "นักวิ่ง",
      timezone: "Asia/Bangkok",
    });
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
    const kept = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
        splits: [{ splitIndex: 0, distanceM: 5000, durationSec: 1800 }],
      },
    });
    const dropped = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 1000,
        movingDurationSec: 400,
      },
    });
    await deleteWorkoutLog(userId, dropped.log.id);
    const { goal } = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "FINISH",
    });
    await archiveGoal(userId, goal.id);
    // Revision moved: addPlanItem bumped it, so refetch before templating.
    const { getWeekRevision } = await import("@/lib/services/planner");
    const { revision } = await getWeekRevision(userId, MONDAY);
    await saveWeekTemplate(userId, {
      sourceMonday: MONDAY,
      expectedRevision: revision,
      name: "แม่แบบสัปดาห์",
    });

    const data = await exportUserData(userId);

    expect(data.schemaVersion).toBe(1);
    expect(new Date(data.exportedAt).getTime()).not.toBeNaN();
    expect(data.profile).toEqual({
      displayName: "นักวิ่ง",
      timezone: "Asia/Bangkok",
      locale: "th-TH",
    });
    expect(data.weeklyPlans).toHaveLength(1);
    const exportedDay = data.weeklyPlans[0]?.days.find(
      (d) => d.date === WEDNESDAY,
    );
    expect(exportedDay?.items.map((i) => i.title)).toContain(
      plan.item.title,
    );
    expect(exportedDay?.items[0]?.masterSnapshot).toBeTruthy();
    expect(exportedDay?.items[0]?.runningWorkoutCode).toBe("EASY_RUN");
    expect(data.workoutLogs.map((l) => l.id)).toEqual([kept.log.id]);
    expect(data.workoutLogs[0]?.splits).toHaveLength(1);
    expect(data.goals.map((g) => g.id)).toEqual([goal.id]);
    expect(data.goals[0]?.status).toBe("ARCHIVED");
    expect(data.templates.map((t) => t.name)).toEqual(["แม่แบบสัปดาห์"]);
    expect(JSON.stringify(data)).not.toMatch(/password|secret|token/i);
  });

  it("exports only the caller's own rows (§19.10)", async () => {
    const { addPlanItem } = await import("@/lib/services/planner");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const { createGoal } = await import("@/lib/services/goals");
    const { updateOwnProfile } = await import("@/lib/services/profile");
    const { exportUserData } = await import("@/lib/services/export");
    const userA = await setupUser();
    const userB = await setupUser();
    await updateOwnProfile(userA, {
      displayName: "บัญชี A",
      timezone: "Asia/Bangkok",
    });
    await updateOwnProfile(userB, {
      displayName: "บัญชี B",
      timezone: "Asia/Bangkok",
    });
    const week = await setupWeek(userA);
    const plan = await addPlanItem(
      userA,
      {
        date: WEDNESDAY,
        activityType: "RUNNING",
        runningWorkoutCode: "EASY_RUN",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        intensityTarget: { kind: "NONE" },
      },
      week.revision,
    );
    const { log } = await saveWorkoutLog(userA, {
      clientMutationId: crypto.randomUUID(),
      planItemId: plan.item.id,
      actual: {
        performedDate: WEDNESDAY,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
      },
    });
    const { goal } = await createGoal(userA, {
      distanceCode: "10K",
      goalType: "FINISH",
    });

    const data = await exportUserData(userB);

    expect(data.profile?.displayName).toBe("บัญชี B");
    expect(data.weeklyPlans).toEqual([]);
    expect(data.workoutLogs).toEqual([]);
    expect(data.goals).toEqual([]);
    expect(data.templates).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(log.id);
    expect(JSON.stringify(data)).not.toContain(goal.id);
    expect(JSON.stringify(data)).not.toContain(plan.item.id);
  });

  it("exports an empty but valid payload for a fresh profile", async () => {
    const { updateOwnProfile } = await import("@/lib/services/profile");
    const { exportUserData } = await import("@/lib/services/export");
    const userId = await setupUser();
    await updateOwnProfile(userId, {
      displayName: null,
      timezone: "Asia/Bangkok",
    });

    const data = await exportUserData(userId);

    expect(data.schemaVersion).toBe(1);
    expect(data.profile?.displayName).toBeNull();
    expect(data.weeklyPlans).toEqual([]);
    expect(data.workoutLogs).toEqual([]);
    expect(data.goals).toEqual([]);
    expect(data.templates).toEqual([]);
  });
});
