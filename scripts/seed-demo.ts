// Reseed the shared demo account (§15). Wipes the demo user's plans, logs,
// goals, and templates, then plants a small sample week. No auto-reset in
// v1 — run `npm run db:seed-demo` whenever the demo drifts. Requires
// DEMO_EMAIL (the same account /auth/demo signs into).
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

config({ path: ".env.local" });

async function main() {
  const email = process.env.DEMO_EMAIL;
  if (!email) {
    throw new Error("DEMO_EMAIL is not set");
  }
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const { data, error } = await getAdminClient().auth.admin.listUsers();
  if (error) throw error;
  const demo = data.users.find((u) => u.email === email);
  if (!demo) {
    throw new Error(
      `demo user ${email} not found; open /auth/demo once to create it`,
    );
  }
  const userId = demo.id;

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
    weeklyPlans,
    workoutLogs,
  } = await import("@/lib/db/schema");

  const logs = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId));
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
  const weekRows = await db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.userId, userId));
  const weekIds = weekRows.map((w) => w.id);
  if (weekIds.length > 0) {
    const dayRows = await db
      .select({ id: dailyPlans.id })
      .from(dailyPlans)
      .where(inArray(dailyPlans.weeklyPlanId, weekIds));
    const dayIds = dayRows.map((d) => d.id);
    if (dayIds.length > 0) {
      const itemRows = await db
        .select({ id: planItems.id })
        .from(planItems)
        .where(inArray(planItems.dailyPlanId, dayIds));
      const itemIds = itemRows.map((i) => i.id);
      if (itemIds.length > 0) {
        await db
          .delete(plannedStrengthExercises)
          .where(inArray(plannedStrengthExercises.planItemId, itemIds));
        await db.delete(planItems).where(inArray(planItems.id, itemIds));
      }
      await db.delete(dailyPlans).where(inArray(dailyPlans.id, dayIds));
    }
    await db.delete(weeklyPlans).where(inArray(weeklyPlans.id, weekIds));
  }
  await db.delete(raceGoals).where(eq(raceGoals.userId, userId));
  await db.delete(planTemplates).where(eq(planTemplates.userId, userId));

  const { mondayOf, addDays } = await import("@/lib/domain/week");
  const { getOrCreateWeek, addPlanItem } = await import(
    "@/lib/services/planner"
  );
  const { saveWorkoutLog } = await import("@/lib/services/logging");
  const { createGoal } = await import("@/lib/services/goals");
  const { saveWeekTemplate } = await import("@/lib/services/copying");
  const { getWeekRevision } = await import("@/lib/services/planner");
  const { updateOwnProfile } = await import("@/lib/services/profile");

  await updateOwnProfile(userId, {
    displayName: "นักวิ่งสาธิต",
    timezone: "Asia/Bangkok",
  });
  const today = new Date().toISOString().slice(0, 10);
  const monday = mondayOf(today);
  const { week } = await getOrCreateWeek(userId, monday);
  let revision = week.revision;
  const tuesday = addDays(monday, 1);
  const thursday = addDays(monday, 3);
  const sunday = addDays(monday, 6);

  const easy = await addPlanItem(
    userId,
    {
      date: tuesday,
      activityType: "RUNNING",
      runningWorkoutCode: "EASY_RUN",
      runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      intensityTarget: { kind: "NONE" },
    },
    revision,
  );
  revision = easy.revision;
  const tempo = await addPlanItem(
    userId,
    {
      date: thursday,
      activityType: "RUNNING",
      runningWorkoutCode: "TEMPO",
      runningTarget: { kind: "DISTANCE", distanceM: 8000 },
      intensityTarget: { kind: "ZONE", zoneMin: 3, zoneMax: 4 },
    },
    revision,
  );
  revision = tempo.revision;
  await addPlanItem(
    userId,
    {
      date: sunday,
      activityType: "RUNNING",
      runningWorkoutCode: "LONG_RUN",
      runningTarget: { kind: "DISTANCE", distanceM: 15000 },
      intensityTarget: { kind: "NONE" },
    },
    revision,
  );

  // Past sample actuals: only log days on/before today so validation holds.
  if (tuesday <= today) {
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: easy.item.id,
      actual: {
        performedDate: tuesday,
        runningWorkoutCode: "EASY_RUN",
        distanceM: 6000,
        movingDurationSec: 2100,
      },
    });
  }
  if (thursday <= today) {
    await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      planItemId: tempo.item.id,
      actual: {
        performedDate: thursday,
        runningWorkoutCode: "TEMPO",
        distanceM: 8000,
        movingDurationSec: 2400,
      },
    });
  }

  await createGoal(userId, {
    distanceCode: "10K",
    goalType: "TARGET_TIME",
    targetTimeSec: 3600,
    eventName: "งานวิ่งตัวอย่าง",
  });
  const { revision: fresh } = await getWeekRevision(userId, monday);
  await saveWeekTemplate(userId, {
    sourceMonday: monday,
    expectedRevision: fresh,
    name: "สัปดาห์ตัวอย่าง",
    description: "แม่แบบจากบัญชีสาธิต",
  });

  console.log(`demo reseeded for ${email} (week of ${monday})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
