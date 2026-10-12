import { afterEach, describe, expect, it } from "vitest";

import { canRunDb } from "./db-gate";

describe.skipIf(!canRunDb)("race goals", () => {
  const users: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const { raceGoals, userProfiles, workoutLogs } = await import(
      "@/lib/db/schema"
    );
    const { inArray } = await import("drizzle-orm");
    if (users.length > 0) {
      await db
        .delete(raceGoals)
        .where(inArray(raceGoals.userId, users));
      await db
        .delete(workoutLogs)
        .where(inArray(workoutLogs.userId, users));
      await db.delete(userProfiles).where(inArray(userProfiles.userId, users));
      users.length = 0;
    }
  });

  async function setupUser() {
    const userId = crypto.randomUUID();
    users.push(userId);
    return userId;
  }

  async function saveRaceDay(userId: string, note = "race day") {
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    return saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: "2026-02-11",
        runningWorkoutCode: "RACE_DAY",
        distanceM: 10000,
        movingDurationSec: 3000,
        note,
      },
    });
  }

  it("creates goals with exact standard meters", async () => {
    const { createGoal } = await import("@/lib/services/goals");
    const userId = await setupUser();
    const { goal } = await createGoal(userId, {
      distanceCode: "21K",
      goalType: "TARGET_TIME",
      targetTimeSec: 7200,
    });
    expect(goal.distanceM).toBe(21097.5);
    expect(goal.status).toBe("ACTIVE");
    expect(goal.isPrimary).toBe(false);
  });

  it("keeps a single active primary in one transaction", async () => {
    const { createGoal, setPrimaryGoal, getPrimaryGoal } = await import(
      "@/lib/services/goals"
    );
    const userId = await setupUser();
    const a = await createGoal(userId, {
      distanceCode: "5K",
      goalType: "FINISH",
    });
    const b = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "FINISH",
    });
    await setPrimaryGoal(userId, a.goal.id);
    expect((await getPrimaryGoal(userId))?.id).toBe(a.goal.id);
    await setPrimaryGoal(userId, b.goal.id);
    expect((await getPrimaryGoal(userId))?.id).toBe(b.goal.id);
  });

  it("archive and achieve clear primary in the same transaction", async () => {
    const {
      achieveGoal,
      archiveGoal,
      createGoal,
      getGoal,
      getPrimaryGoal,
      setPrimaryGoal,
    } = await import("@/lib/services/goals");
    const userId = await setupUser();
    const a = await createGoal(userId, {
      distanceCode: "5K",
      goalType: "FINISH",
    });
    await setPrimaryGoal(userId, a.goal.id);
    await archiveGoal(userId, a.goal.id);
    expect((await getGoal(userId, a.goal.id)).goal.status).toBe("ARCHIVED");
    expect(await getPrimaryGoal(userId)).toBeNull();

    const b = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "FINISH",
    });
    await setPrimaryGoal(userId, b.goal.id);
    await achieveGoal(userId, b.goal.id);
    expect((await getGoal(userId, b.goal.id)).goal.status).toBe("ACHIEVED");
    expect(await getPrimaryGoal(userId)).toBeNull();
  });

  it("links a race-day result manually and unlinks it", async () => {
    const {
      createGoal,
      getGoal,
      linkResultLog,
      unlinkResultLog,
    } = await import("@/lib/services/goals");
    const userId = await setupUser();
    const { goal } = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "TARGET_TIME",
      targetTimeSec: 3000,
    });
    const { log } = await saveRaceDay(userId);

    await linkResultLog(userId, goal.id, log.id);
    const linked = await getGoal(userId, goal.id);
    expect(linked.resultLog?.id).toBe(log.id);

    await unlinkResultLog(userId, goal.id);
    const unlinked = await getGoal(userId, goal.id);
    expect(unlinked.resultLog).toBeNull();
    // Unlinking never touches the user-set status.
    expect(unlinked.goal.status).toBe("ACTIVE");
  });

  it("rejects non-race-day and foreign result links", async () => {
    const { createGoal, linkResultLog } = await import(
      "@/lib/services/goals"
    );
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const otherId = await setupUser();
    const { goal } = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "FINISH",
    });
    const { log: easy } = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: "2026-02-11",
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
      },
    });
    const { log: foreign } = await saveRaceDay(otherId);

    await expect(linkResultLog(userId, goal.id, easy.id)).rejects.toMatchObject(
      { code: "VALIDATION" },
    );
    await expect(
      linkResultLog(userId, goal.id, foreign.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      linkResultLog(otherId, goal.id, foreign.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleting a result log clears the link but keeps status", async () => {
    const { achieveGoal, createGoal, getGoal, linkResultLog } = await import(
      "@/lib/services/goals"
    );
    const { deleteWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    const { goal } = await createGoal(userId, {
      distanceCode: "10K",
      goalType: "FINISH",
    });
    const { log } = await saveRaceDay(userId);
    await linkResultLog(userId, goal.id, log.id);
    await achieveGoal(userId, goal.id);

    await deleteWorkoutLog(userId, log.id);
    const after = await getGoal(userId, goal.id);
    expect(after.resultLog).toBeNull();
    expect(after.goal.status).toBe("ACHIEVED");
  });

  it("lists race-day candidates newest-first", async () => {
    const { listResultCandidates } = await import("@/lib/services/goals");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    await saveRaceDay(userId, "first race");
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      actual: {
        performedDate: "2026-02-10",
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 1800,
      },
    });
    const rows = await listResultCandidates(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe("first race");
  });
});
