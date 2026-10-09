import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dailyPlans, planItems, workoutLogs } from "@/lib/db/schema";

import { ServiceError } from "./errors";

export type JournalEntry = {
  log: typeof workoutLogs.$inferSelect;
  plan: {
    date: string;
    title: string;
    runningWorkoutCode: string | null;
  } | null;
};

// T03: newest-first list. Filters, calendar, and pagination arrive in T10.
export async function listLogs(
  userId: string,
  limit = 50,
): Promise<JournalEntry[]> {
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), isNull(workoutLogs.deletedAt)))
    .orderBy(desc(workoutLogs.performedDate), desc(workoutLogs.createdAt))
    .limit(limit);
  const planIds = [...new Set(rows.map((r) => r.planItemId).filter(Boolean))];
  const plans = await loadPlans(planIds as string[]);
  return rows.map((log) => ({
    log,
    plan: log.planItemId ? (plans.get(log.planItemId) ?? null) : null,
  }));
}

export async function getLogDetail(userId: string, logId: string) {
  const [log] = await db
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.id, logId),
        eq(workoutLogs.userId, userId),
        isNull(workoutLogs.deletedAt),
      ),
    )
    .limit(1);
  if (!log) throw new ServiceError("NOT_FOUND", "log not found");
  const plans = await loadPlans(
    log.planItemId ? [log.planItemId] : [],
  );
  return {
    log,
    plan: log.planItemId ? (plans.get(log.planItemId) ?? null) : null,
  };
}

async function loadPlans(planIds: string[]) {
  const out = new Map<
    string,
    { date: string; title: string; runningWorkoutCode: string | null }
  >();
  if (planIds.length === 0) return out;
  const items = await db
    .select()
    .from(planItems)
    .where(inArray(planItems.id, planIds));
  const dayIds = [...new Set(items.map((i) => i.dailyPlanId))];
  const days =
    dayIds.length === 0
      ? []
      : await db
          .select({ id: dailyPlans.id, date: dailyPlans.date })
          .from(dailyPlans)
          .where(inArray(dailyPlans.id, dayIds));
  const dateByDay = new Map(days.map((d) => [d.id, d.date]));
  for (const item of items) {
    out.set(item.id, {
      date: dateByDay.get(item.dailyPlanId) ?? "",
      title: item.title,
      runningWorkoutCode: item.runningWorkoutCode,
    });
  }
  return out;
}
