import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { addDays } from "@/lib/domain/week";

import { db } from "@/lib/db/client";
import {
  actualRunningSplits,
  actualStrengthExercises,
  actualStrengthSets,
  dailyPlans,
  planItems,
  workoutLogs,
} from "@/lib/db/schema";

import { ServiceError } from "./errors";

export type JournalEntry = {
  log: typeof workoutLogs.$inferSelect;
  plan: {
    date: string;
    title: string;
    runningWorkoutCode: string | null;
  } | null;
  strengthSummary: StrengthSummary | null;
};

export type LogFilters = {
  from?: string;
  to?: string;
  activity?: "RUNNING" | "STRENGTH";
  workoutCode?: string;
  outcome?: "COMPLETED" | "PARTIAL";
  q?: string;
  limit?: number;
  offset?: number;
};

export type StrengthSummary = {
  exercises: number;
  setsWithResult: number;
};

function escapeLike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Search covers the note plus the log's display name sources: workout code,
// master snapshot names, and the linked plan title (a from-plan strength
// row displays the plan title, so it must be searchable).
function searchCondition(q: string) {
  const pattern = `%${escapeLike(q.trim())}%`;
  return or(
    ilike(workoutLogs.note, pattern),
    ilike(workoutLogs.runningWorkoutCode, pattern),
    ilike(sql`(${workoutLogs.masterSnapshot} ->> 'nameTh')`, pattern),
    ilike(sql`(${workoutLogs.masterSnapshot} ->> 'nameEn')`, pattern),
    sql`EXISTS (SELECT 1 FROM ${planItems} WHERE ${planItems}.id = ${workoutLogs.planItemId} AND ${planItems}.title ILIKE ${pattern})`,
  );
}

function filterConditions(userId: string, filters: LogFilters) {
  const conditions = [
    eq(workoutLogs.userId, userId),
    isNull(workoutLogs.deletedAt),
  ];
  if (filters.from) {
    conditions.push(gte(workoutLogs.performedDate, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(workoutLogs.performedDate, filters.to));
  }
  if (filters.activity) {
    conditions.push(eq(workoutLogs.activityType, filters.activity));
  }
  if (filters.workoutCode) {
    conditions.push(eq(workoutLogs.runningWorkoutCode, filters.workoutCode));
  }
  if (filters.outcome) {
    conditions.push(eq(workoutLogs.outcome, filters.outcome));
  }
  if (filters.q && filters.q.trim() !== "") {
    const found = searchCondition(filters.q);
    if (found) conditions.push(found);
  }
  return and(...conditions);
}

// Newest-first timeline (§7). Server-side filters + pagination: the client
// never loads the full history.
export async function listLogs(
  userId: string,
  filters: LogFilters = {},
): Promise<{ entries: JournalEntry[]; total: number }> {
  const where = filterConditions(userId, filters);
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(workoutLogs)
      .where(where)
      .orderBy(desc(workoutLogs.performedDate), desc(workoutLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workoutLogs)
      .where(where),
  ]);
  const planIds = [...new Set(rows.map((r) => r.planItemId).filter(Boolean))];
  const strengthIds = rows
    .filter((r) => r.activityType === "STRENGTH")
    .map((r) => r.id);
  const [plans, summaries] = await Promise.all([
    loadPlans(planIds as string[]),
    loadStrengthSummaries(strengthIds),
  ]);
  return {
    entries: rows.map((log) => ({
      log,
      plan: log.planItemId ? (plans.get(log.planItemId) ?? null) : null,
      strengthSummary:
        log.activityType === "STRENGTH"
          ? (summaries.get(log.id) ?? { exercises: 0, setsWithResult: 0 })
          : null,
    })),
    total: counted[0]?.count ?? 0,
  };
}

// One grouped query for the listed strength logs: exercise count plus sets
// carrying a real result (skipped sets excluded).
async function loadStrengthSummaries(
  logIds: string[],
): Promise<Map<string, StrengthSummary>> {
  const out = new Map<string, StrengthSummary>();
  if (logIds.length === 0) return out;
  const grouped = await db
    .select({
      logId: actualStrengthExercises.workoutLogId,
      exercises: sql<number>`count(DISTINCT ${actualStrengthExercises.id})::int`,
      setsWithResult: sql<number>`count(${actualStrengthSets.id}) FILTER (WHERE ${actualStrengthSets.reps} IS NOT NULL OR ${actualStrengthSets.durationSec} IS NOT NULL)::int`,
    })
    .from(actualStrengthExercises)
    .leftJoin(
      actualStrengthSets,
      eq(
        actualStrengthSets.actualExerciseId,
        actualStrengthExercises.id,
      ),
    )
    .where(inArray(actualStrengthExercises.workoutLogId, logIds))
    .groupBy(actualStrengthExercises.workoutLogId);
  for (const row of grouped) {
    out.set(row.logId, {
      exercises: row.exercises,
      setsWithResult: row.setsWithResult,
    });
  }
  return out;
}

// Per-day active-log counts for the calendar view (§7). Non-date filters
// apply; every day in range appears (zero when empty).
export async function countLogsByDay(
  userId: string,
  from: string,
  to: string,
  filters: Omit<LogFilters, "from" | "to" | "limit" | "offset">,
): Promise<Record<string, number>> {
  const where = filterConditions(userId, { ...filters, from, to });
  const grouped = await db
    .select({
      date: workoutLogs.performedDate,
      count: sql<number>`count(*)::int`,
    })
    .from(workoutLogs)
    .where(where)
    .groupBy(workoutLogs.performedDate);
  const out: Record<string, number> = {};
  for (let day = from; day <= to; day = addDays(day, 1)) {
    out[day] = 0;
  }
  for (const row of grouped) {
    out[row.date] = row.count;
  }
  return out;
}

export type WeekActual = {
  activityType: string;
  distanceM: number | null;
  movingDurationSec: number | null;
};

// Lean week-range actuals for the Home summary (§4). Includes off-plan logs:
// they are real training done in this week.
export async function listLogsInRange(
  userId: string,
  from: string,
  to: string,
): Promise<WeekActual[]> {
  return db
    .select({
      activityType: workoutLogs.activityType,
      distanceM: workoutLogs.distanceM,
      movingDurationSec: workoutLogs.movingDurationSec,
    })
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        isNull(workoutLogs.deletedAt),
        gte(workoutLogs.performedDate, from),
        lte(workoutLogs.performedDate, to),
      ),
    );
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
  const splits =
    log.activityType === "RUNNING"
      ? await db
          .select()
          .from(actualRunningSplits)
          .where(eq(actualRunningSplits.workoutLogId, log.id))
          .orderBy(asc(actualRunningSplits.splitIndex))
      : [];
  const strength =
    log.activityType === "STRENGTH"
      ? await loadStrengthActuals(log.id)
      : [];
  return {
    log,
    plan: log.planItemId ? (plans.get(log.planItemId) ?? null) : null,
    splits,
    strength,
  };
}

async function loadStrengthActuals(logId: string) {
  const exercises = await db
    .select()
    .from(actualStrengthExercises)
    .where(eq(actualStrengthExercises.workoutLogId, logId))
    .orderBy(asc(actualStrengthExercises.sortOrder));
  const exIds = exercises.map((e) => e.id);
  const sets =
    exIds.length === 0
      ? []
      : await db
          .select()
          .from(actualStrengthSets)
          .where(inArray(actualStrengthSets.actualExerciseId, exIds))
          .orderBy(
            asc(actualStrengthSets.setIndex),
            asc(actualStrengthSets.side),
          );
  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets) {
    const list = setsByExercise.get(set.actualExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.actualExerciseId, list);
  }
  return exercises.map((exercise) => ({
    exercise,
    sets: setsByExercise.get(exercise.id) ?? [],
  }));
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
