import { afterEach, describe, expect, it } from "vitest";

import { mondayOf } from "@/lib/domain/week";

import { canRunDb } from "./db-gate";

const SOURCE_MONDAY = mondayOf("2026-03-25"); // 2026-03-23
const SOURCE_WED = "2026-03-25";
const SOURCE_THU = "2026-03-26";
const SOURCE_SAT = "2026-03-28";
const TARGET_MONDAY = mondayOf("2026-04-08"); // 2026-04-06 (cross-month)
const TARGET_WED = "2026-04-08";

describe.skipIf(!canRunDb)("copy week and templates", () => {
  const users: string[] = [];
  const weeks: string[] = [];
  const templates: string[] = [];

  afterEach(async () => {
    const { db } = await import("@/lib/db/client");
    const {
      dailyPlans,
      plannedStrengthExercises,
      planItems,
      planTemplates,
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
    if (templates.length > 0) {
      await db
        .delete(planTemplates)
        .where(inArray(planTemplates.id, templates));
      templates.length = 0;
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

  async function trackWeek(userId: string, monday: string) {
    const { getOrCreateWeek } = await import("@/lib/services/planner");
    const { week } = await getOrCreateWeek(userId, monday);
    if (!weeks.includes(week.id)) weeks.push(week.id);
    return week;
  }

  async function addRun(
    userId: string,
    revision: number,
    date: string,
    note = "จำลอง",
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
        note,
      },
      revision,
    );
  }

  async function addStrength(userId: string, revision: number, date: string) {
    const { addStrengthPlanItem } = await import("@/lib/services/planner");
    return addStrengthPlanItem(
      userId,
      {
        date,
        activityType: "STRENGTH",
        title: "Legs and core",
        exercises: [
          {
            exerciseCode: "BULGARIAN_SPLIT_SQUAT",
            variant: "STANDARD",
            prescription: {
              measurement: "REPS",
              sets: 3,
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
              sets: 3,
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

  // Source week: Wed run, Thu strength, Sat rest. Returns the week revision.
  async function seedSource(userId: string) {
    const { setRestDay } = await import("@/lib/services/planner");
    const week = await trackWeek(userId, SOURCE_MONDAY);
    const first = await addRun(userId, week.revision, SOURCE_WED);
    const second = await addStrength(userId, first.revision, SOURCE_THU);
    const rev = await setRestDay(userId, SOURCE_SAT, second.revision, {
      note: "พัก",
    });
    return rev;
  }

  async function targetItems(userId: string, monday: string, date: string) {
    const { listWeek } = await import("@/lib/services/planner");
    const { week, days } = await listWeek(userId, monday, date);
    if (week && !weeks.includes(week.id)) weeks.push(week.id);
    return { week, day: days.find((d) => d.date === date) };
  }

  it("appends a week cross-month with fresh IDs and no logs", async () => {
    const { copyWeek } = await import("@/lib/services/copying");
    const userId = await setupUser();
    await seedSource(userId);
    const target = await trackWeek(userId, TARGET_MONDAY);

    const done = await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "append",
      expectedRevision: target.revision,
    });
    expect(done.revision).toBe(target.revision + 1);
    expect(done.itemsCopied).toBe(2);

    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.items).toHaveLength(1);
    expect(day?.items[0]?.note).toBe("จำลอง");
    expect(day?.items[0]?.log).toBeNull();
    expect(day?.items[0]?.planState).toBe("SCHEDULED");
    const thu = await targetItems(userId, TARGET_MONDAY, "2026-04-09");
    expect(thu.day?.items[0]?.exercises).toHaveLength(2);
    const sat = await targetItems(userId, TARGET_MONDAY, "2026-04-11");
    expect(sat.day?.isRestDay).toBe(true);
    expect(sat.day?.note).toBe("พัก");
  });

  it("resolves rest conflicts per choice, failing safe without one", async () => {
    const { copyWeek, previewCopyWeek } = await import(
      "@/lib/services/copying"
    );
    const { setRestDay } = await import("@/lib/services/planner");
    const userId = await setupUser();
    await seedSource(userId);
    const target = await trackWeek(userId, TARGET_MONDAY);
    const rev = await setRestDay(userId, TARGET_WED, target.revision, {
      note: "พักเดิม",
    });

    const preview = await previewCopyWeek(
      userId,
      SOURCE_MONDAY,
      TARGET_MONDAY,
      "append",
    );
    const wed = preview.days.find((d) => d.date === TARGET_WED);
    expect(wed?.conflict).toBe("REST_TARGET");

    await expect(
      copyWeek(userId, {
        sourceMonday: SOURCE_MONDAY,
        targetMonday: TARGET_MONDAY,
        mode: "append",
        expectedRevision: rev,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const kept = await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "append",
      choices: { 2: "keep-rest" },
      expectedRevision: rev,
    });
    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.isRestDay).toBe(true);
    expect(day?.items).toHaveLength(0);

    const converted = await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "append",
      choices: { 2: "convert" },
      expectedRevision: kept.revision,
    });
    expect(converted.revision).toBe(kept.revision + 1);
    const { day: after } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(after?.isRestDay).toBe(false);
    expect(after?.items).toHaveLength(1);
  });

  it("replace mirrors the source but aborts atomically on logged items", async () => {
    const { copyWeek } = await import("@/lib/services/copying");
    const { saveWorkoutLog } = await import("@/lib/services/logging");
    const userId = await setupUser();
    await seedSource(userId);
    const target = await trackWeek(userId, TARGET_MONDAY);
    const existing = await addRun(userId, target.revision, TARGET_WED, "เดิม");

    const replaced = await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "replace",
      expectedRevision: existing.revision,
    });
    expect(replaced.revision).toBe(existing.revision + 1);
    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.items).toHaveLength(1);
    expect(day?.items[0]?.note).toBe("จำลอง");
    expect(day?.items[0]?.id).not.toBe(existing.item.id);

    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: day?.items[0]?.id as string,
      actual: {
        performedDate: TARGET_WED,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 5000,
        movingDurationSec: 2280,
      },
    });
    await expect(
      copyWeek(userId, {
        sourceMonday: SOURCE_MONDAY,
        targetMonday: TARGET_MONDAY,
        mode: "replace",
        expectedRevision: replaced.revision,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Atomic: nothing changed, revision untouched.
    const { week, day: after } = await targetItems(
      userId,
      TARGET_MONDAY,
      TARGET_WED,
    );
    expect(week?.revision).toBe(replaced.revision);
    expect(after?.items).toHaveLength(1);
    expect(after?.items[0]?.note).toBe("จำลอง");
  });

  it("copies cross-year with fresh IDs", async () => {
    const { copyWeek } = await import("@/lib/services/copying");
    const userId = await setupUser();
    const decMonday = "2026-12-28";
    const janMonday = "2027-01-04";
    const decWeek = await trackWeek(userId, decMonday);
    await addRun(userId, decWeek.revision, "2026-12-30", "ข้ามปี");
    const janWeek = await trackWeek(userId, janMonday);

    const done = await copyWeek(userId, {
      sourceMonday: decMonday,
      targetMonday: janMonday,
      mode: "append",
      expectedRevision: janWeek.revision,
    });
    expect(done.itemsCopied).toBe(1);
    const { day } = await targetItems(userId, janMonday, "2027-01-06");
    expect(day?.items).toHaveLength(1);
    expect(day?.items[0]?.note).toBe("ข้ามปี");
    expect(day?.items[0]?.log).toBeNull();
  });

  it("treats a missing source week as empty", async () => {
    const { copyWeek, previewCopyWeek } = await import(
      "@/lib/services/copying"
    );
    const userId = await setupUser();
    const target = await trackWeek(userId, TARGET_MONDAY);

    const preview = await previewCopyWeek(
      userId,
      "2026-05-04",
      TARGET_MONDAY,
      "append",
    );
    expect(preview.days.every((d) => d.conflict === null)).toBe(true);
    const done = await copyWeek(userId, {
      sourceMonday: "2026-05-04",
      targetMonday: TARGET_MONDAY,
      mode: "append",
      expectedRevision: target.revision,
    });
    expect(done.itemsCopied).toBe(0);
    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.items ?? []).toHaveLength(0);
  });

  it("replace asks before unsetting target rest days", async () => {
    const { copyWeek, previewCopyWeek } = await import(
      "@/lib/services/copying"
    );
    const { setRestDay } = await import("@/lib/services/planner");
    const userId = await setupUser();
    await seedSource(userId);
    const target = await trackWeek(userId, TARGET_MONDAY);
    const withWedRest = await setRestDay(userId, TARGET_WED, target.revision);
    // Target Fri rest meets an empty source Friday (dayIndex 4).
    const rev = await setRestDay(userId, "2026-04-10", withWedRest);

    const preview = await previewCopyWeek(
      userId,
      SOURCE_MONDAY,
      TARGET_MONDAY,
      "replace",
    );
    expect(
      preview.days.find((d) => d.date === TARGET_WED)?.conflict,
    ).toBe("REST_TARGET");
    expect(
      preview.days.find((d) => d.date === "2026-04-10")?.conflict,
    ).toBe("REST_TARGET");
    expect(preview.blocked).toBe(false);

    await expect(
      copyWeek(userId, {
        sourceMonday: SOURCE_MONDAY,
        targetMonday: TARGET_MONDAY,
        mode: "replace",
        expectedRevision: rev,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "replace",
      choices: { 2: "convert", 4: "keep-rest" },
      expectedRevision: rev,
    });
    const { day: wed } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(wed?.isRestDay).toBe(false);
    expect(wed?.items).toHaveLength(1);
    const { day: fri } = await targetItems(userId, TARGET_MONDAY, "2026-04-10");
    expect(fri?.isRestDay).toBe(true);
    expect(fri?.items ?? []).toHaveLength(0);
  });

  it("copies skipped source items as scheduled", async () => {
    const { copyWeek } = await import("@/lib/services/copying");
    const { db } = await import("@/lib/db/client");
    const { planItems } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const userId = await setupUser();
    await seedSource(userId);
    const target = await trackWeek(userId, TARGET_MONDAY);
    // Mark the source run skipped directly (no skip service yet).
    const { listWeek } = await import("@/lib/services/planner");
    const { days } = await listWeek(userId, SOURCE_MONDAY, SOURCE_WED);
    const srcId = days.find((d) => d.date === SOURCE_WED)?.items[0]?.id;
    await db
      .update(planItems)
      .set({ planState: "SKIPPED" })
      .where(eq(planItems.id, srcId as string));

    await copyWeek(userId, {
      sourceMonday: SOURCE_MONDAY,
      targetMonday: TARGET_MONDAY,
      mode: "append",
      expectedRevision: target.revision,
    });
    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.items).toHaveLength(1);
    expect(day?.items[0]?.planState).toBe("SCHEDULED");
  });

  it("templates save, apply, rename, and delete independently", async () => {
    const {
      applyTemplate,
      deleteTemplate,
      listTemplates,
      renameTemplate,
      saveWeekTemplate,
    } = await import("@/lib/services/copying");
    const userId = await setupUser();
    const rev = await seedSource(userId);

    const saved = await saveWeekTemplate(userId, {
      sourceMonday: SOURCE_MONDAY,
      name: "สัปดาห์ฐาน",
      expectedRevision: rev,
    });
    templates.push(saved.id);
    expect(saved.schemaVersion).toBe(1);

    const applied = await applyTemplate(userId, {
      templateId: saved.id,
      targetMonday: TARGET_MONDAY,
      mode: "append",
      expectedRevision: 1,
    });
    expect(applied.itemsCopied).toBe(2);
    const { day } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(day?.items[0]?.note).toBe("จำลอง");

    // Editing the source week afterwards does not touch the template.
    const { setRestDay } = await import("@/lib/services/planner");
    await setRestDay(userId, SOURCE_WED, rev, { removeUnlogged: true });
    const again = await listTemplates(userId);
    const payload = again.find((t) => t.id === saved.id)
      ?.payload as unknown as {
      days: Array<{ dayIndex: number; items: unknown[] }>;
    };
    expect(payload.days.find((d) => d.dayIndex === 2)?.items).toHaveLength(1);

    const renamed = await renameTemplate(userId, saved.id, "ฐานใหม่");
    expect(renamed.name).toBe("ฐานใหม่");
    await deleteTemplate(userId, saved.id);
    templates.length = 0;
    expect(await listTemplates(userId)).toHaveLength(0);
    // Deleting the template leaves applied weeks intact.
    const { day: kept } = await targetItems(userId, TARGET_MONDAY, TARGET_WED);
    expect(kept?.items).toHaveLength(1);
  });
});
