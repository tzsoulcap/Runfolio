import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
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
} from "@/lib/db/schema";

// Full-fidelity personal data export (§13 Privacy): every query is scoped to
// the caller's userId, archived goals are included, soft-deleted rows and
// auth tables are excluded. Master codes plus the stored snapshots travel
// along so an import can read history without the current masters.
export const EXPORT_SCHEMA_VERSION = 1;

export type UserExport = {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  profile: {
    displayName: string | null;
    timezone: string;
    locale: string;
  } | null;
  goals: (typeof raceGoals.$inferSelect)[];
  weeklyPlans: (typeof weeklyPlans.$inferSelect & {
    days: (typeof dailyPlans.$inferSelect & {
      items: (typeof planItems.$inferSelect & {
        strengthExercises: (typeof plannedStrengthExercises.$inferSelect)[];
      })[];
    })[];
  })[];
  workoutLogs: (typeof workoutLogs.$inferSelect & {
    splits: (typeof actualRunningSplits.$inferSelect)[];
    strengthExercises: (typeof actualStrengthExercises.$inferSelect & {
      sets: (typeof actualStrengthSets.$inferSelect)[];
    })[];
  })[];
  templates: (typeof planTemplates.$inferSelect)[];
};

export async function exportUserData(userId: string): Promise<UserExport> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const goals = await db
    .select()
    .from(raceGoals)
    .where(eq(raceGoals.userId, userId))
    .orderBy(asc(raceGoals.createdAt));

  const weeks = await db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.userId, userId))
    .orderBy(asc(weeklyPlans.weekStartDate));
  const weekIds = weeks.map((w) => w.id);
  const days =
    weekIds.length === 0
      ? []
      : await db
          .select()
          .from(dailyPlans)
          .where(inArray(dailyPlans.weeklyPlanId, weekIds))
          .orderBy(asc(dailyPlans.date));
  const dayIds = days.map((d) => d.id);
  const items =
    dayIds.length === 0
      ? []
      : await db
          .select()
          .from(planItems)
          .where(
            and(
              inArray(planItems.dailyPlanId, dayIds),
              isNull(planItems.deletedAt),
            ),
          )
          .orderBy(asc(planItems.sortOrder));
  const itemIds = items.map((i) => i.id);
  const plannedExercises =
    itemIds.length === 0
      ? []
      : await db
          .select()
          .from(plannedStrengthExercises)
          .where(inArray(plannedStrengthExercises.planItemId, itemIds))
          .orderBy(asc(plannedStrengthExercises.sortOrder));

  const logs = await db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), isNull(workoutLogs.deletedAt)))
    .orderBy(asc(workoutLogs.performedDate));
  const logIds = logs.map((l) => l.id);
  const splits =
    logIds.length === 0
      ? []
      : await db
          .select()
          .from(actualRunningSplits)
          .where(inArray(actualRunningSplits.workoutLogId, logIds))
          .orderBy(asc(actualRunningSplits.splitIndex));
  const actualExercises =
    logIds.length === 0
      ? []
      : await db
          .select()
          .from(actualStrengthExercises)
          .where(inArray(actualStrengthExercises.workoutLogId, logIds))
          .orderBy(asc(actualStrengthExercises.sortOrder));
  const actualExerciseIds = actualExercises.map((e) => e.id);
  const sets =
    actualExerciseIds.length === 0
      ? []
      : await db
          .select()
          .from(actualStrengthSets)
          .where(inArray(actualStrengthSets.actualExerciseId, actualExerciseIds))
          .orderBy(asc(actualStrengthSets.setIndex));

  const templates = await db
    .select()
    .from(planTemplates)
    .where(eq(planTemplates.userId, userId))
    .orderBy(asc(planTemplates.createdAt));

  const plannedByItem = new Map<string, typeof plannedExercises>();
  for (const row of plannedExercises) {
    const list = plannedByItem.get(row.planItemId) ?? [];
    list.push(row);
    plannedByItem.set(row.planItemId, list);
  }
  const itemsByDay = new Map<string, UserExport["weeklyPlans"][number]["days"][number]["items"]>();
  for (const item of items) {
    const list = itemsByDay.get(item.dailyPlanId) ?? [];
    list.push({
      ...item,
      strengthExercises: plannedByItem.get(item.id) ?? [],
    });
    itemsByDay.set(item.dailyPlanId, list);
  }
  const daysByWeek = new Map<string, UserExport["weeklyPlans"][number]["days"]>();
  for (const day of days) {
    const list = daysByWeek.get(day.weeklyPlanId) ?? [];
    list.push({ ...day, items: itemsByDay.get(day.id) ?? [] });
    daysByWeek.set(day.weeklyPlanId, list);
  }

  const splitsByLog = new Map<string, typeof splits>();
  for (const row of splits) {
    const list = splitsByLog.get(row.workoutLogId) ?? [];
    list.push(row);
    splitsByLog.set(row.workoutLogId, list);
  }
  const setsByExercise = new Map<string, typeof sets>();
  for (const row of sets) {
    const list = setsByExercise.get(row.actualExerciseId) ?? [];
    list.push(row);
    setsByExercise.set(row.actualExerciseId, list);
  }
  const exercisesByLog = new Map<
    string,
    UserExport["workoutLogs"][number]["strengthExercises"]
  >();
  for (const row of actualExercises) {
    const list = exercisesByLog.get(row.workoutLogId) ?? [];
    list.push({ ...row, sets: setsByExercise.get(row.id) ?? [] });
    exercisesByLog.set(row.workoutLogId, list);
  }

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          displayName: profile.displayName,
          timezone: profile.timezone,
          locale: profile.locale,
        }
      : null,
    goals,
    weeklyPlans: weeks.map((week) => ({
      ...week,
      days: daysByWeek.get(week.id) ?? [],
    })),
    workoutLogs: logs.map((log) => ({
      ...log,
      splits: splitsByLog.get(log.id) ?? [],
      strengthExercises: exercisesByLog.get(log.id) ?? [],
    })),
    templates,
  };
}
