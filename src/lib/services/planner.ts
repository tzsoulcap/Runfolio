import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  dailyPlans,
  planItems,
  runningWorkoutMasters,
  weeklyPlans,
  workoutLogs,
} from "@/lib/db/schema";
import {
  derivePlanStatus,
  PlanDraftSchema,
  type DerivedPlanStatus,
} from "@/lib/domain/plan";
import { isMonday, mondayOf, weekDates } from "@/lib/domain/week";

import { ServiceError } from "./errors";

export type DayWithItems = typeof dailyPlans.$inferSelect & {
  items: Array<
    typeof planItems.$inferSelect & {
      log: {
        id: string;
        outcome: string;
        distanceM: number | null;
        movingDurationSec: number | null;
      } | null;
      status: DerivedPlanStatus;
    }
  >;
};

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function validation(message: string): ServiceError {
  return new ServiceError("VALIDATION", message);
}

// Active running masters for the plan form, REST excluded (never a session).
export async function listRunningMasters() {
  return db
    .select()
    .from(runningWorkoutMasters)
    .where(eq(runningWorkoutMasters.isActive, true))
    .orderBy(asc(runningWorkoutMasters.sortOrder));
}

async function ensureWeek(tx: DbTx, userId: string, monday: string) {
  const found = await tx
    .select()
    .from(weeklyPlans)
    .where(
      and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.weekStartDate, monday)),
    )
    .limit(1);
  let week = found[0];
  if (!week) {
    const inserted = await tx
      .insert(weeklyPlans)
      .values({ userId, weekStartDate: monday })
      .onConflictDoNothing({
        target: [weeklyPlans.userId, weeklyPlans.weekStartDate],
      })
      .returning();
    if (inserted[0]) {
      week = inserted[0];
      await tx
        .insert(dailyPlans)
        .values(weekDates(monday).map((date) => ({ weeklyPlanId: week.id, date })));
    } else {
      const [row] = await tx
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.userId, userId),
            eq(weeklyPlans.weekStartDate, monday),
          ),
        )
        .limit(1);
      week = row;
    }
  }
  if (!week) {
    throw new ServiceError("CONFLICT", "week creation raced; retry");
  }
  let days = await tx
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.weeklyPlanId, week.id))
    .orderBy(asc(dailyPlans.date));
  if (days.length < 7) {
    await tx
      .insert(dailyPlans)
      .values(weekDates(monday).map((date) => ({ weeklyPlanId: week.id, date })))
      .onConflictDoNothing({
        target: [dailyPlans.weeklyPlanId, dailyPlans.date],
      });
    days = await tx
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.weeklyPlanId, week.id))
      .orderBy(asc(dailyPlans.date));
  }
  return { week, days };
}

export async function getOrCreateWeek(userId: string, monday: string) {
  if (!isMonday(monday)) {
    throw validation("weekStartDate must be a Monday");
  }
  return db.transaction((tx) => ensureWeek(tx, userId, monday));
}

export async function addPlanItem(
  userId: string,
  rawDraft: unknown,
  expectedRevision: number,
) {
  const parsed = PlanDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid draft");
  }
  const draft = parsed.data;
  return db.transaction(async (tx) => {
    const monday = mondayOf(draft.date);
    const { week } = await ensureWeek(tx, userId, monday);
    const [day] = await tx
      .select()
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.weeklyPlanId, week.id),
          eq(dailyPlans.date, draft.date),
        ),
      )
      .limit(1);
    if (!day) throw new ServiceError("NOT_FOUND", "day not found");
    if (day.isRestDay) {
      throw new ServiceError("CONFLICT", "cannot add a session to a rest day");
    }
    const [master] = await tx
      .select()
      .from(runningWorkoutMasters)
      .where(eq(runningWorkoutMasters.code, draft.runningWorkoutCode))
      .limit(1);
    if (!master || !master.isActive) {
      throw new ServiceError("NOT_FOUND", "workout master not found");
    }
    const siblings = await tx
      .select({ sortOrder: planItems.sortOrder })
      .from(planItems)
      .where(
        and(
          eq(planItems.dailyPlanId, day.id),
          isNull(planItems.deletedAt),
        ),
      );
    const sortOrder =
      siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
    const [item] = await tx
      .insert(planItems)
      .values({
        dailyPlanId: day.id,
        activityType: "RUNNING",
        runningWorkoutCode: master.code,
        title: master.nameEn,
        plannedStartTime: draft.plannedStartTime,
        runningTarget: draft.runningTarget,
        intensityTarget: draft.intensityTarget,
        note: draft.note,
        sortOrder,
        planState: "SCHEDULED",
        masterSnapshot: {
          code: master.code,
          nameTh: master.nameTh,
          nameEn: master.nameEn,
        },
      })
      .returning();
    const bumped = await tx
      .update(weeklyPlans)
      .set({
        revision: sql`${weeklyPlans.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(weeklyPlans.id, week.id),
          eq(weeklyPlans.revision, expectedRevision),
        ),
      )
      .returning({ revision: weeklyPlans.revision });
    if (bumped.length === 0 || !item) {
      throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    }
    return { item, revision: bumped[0].revision };
  });
}

export async function listWeek(userId: string, monday: string, today: string) {
  if (!isMonday(monday)) {
    throw validation("weekStartDate must be a Monday");
  }
  const [week] = await db
    .select()
    .from(weeklyPlans)
    .where(
      and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.weekStartDate, monday)),
    )
    .limit(1);
  if (!week) return { week: null, days: [] as DayWithItems[] };
  const days = await db
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.weeklyPlanId, week.id))
    .orderBy(asc(dailyPlans.date));
  const dayIds = days.map((d) => d.id);
  if (dayIds.length === 0) {
    return { week, days: [] as DayWithItems[] };
  }
  const items = await db
    .select()
    .from(planItems)
    .where(
      and(inArray(planItems.dailyPlanId, dayIds), isNull(planItems.deletedAt)),
    )
    .orderBy(asc(planItems.sortOrder));
  const itemIds = items.map((i) => i.id);
  const logs =
    itemIds.length === 0
      ? []
      : await db
          .select({
            id: workoutLogs.id,
            planItemId: workoutLogs.planItemId,
            outcome: workoutLogs.outcome,
            distanceM: workoutLogs.distanceM,
            movingDurationSec: workoutLogs.movingDurationSec,
          })
          .from(workoutLogs)
          .where(
            and(
              inArray(workoutLogs.planItemId, itemIds),
              isNull(workoutLogs.deletedAt),
            ),
          );
  const logByPlan = new Map(logs.map((l) => [l.planItemId, l]));
  const itemsByDay = new Map<string, DayWithItems["items"]>();
  for (const item of items) {
    const log = logByPlan.get(item.id) ?? null;
    const day = days.find((d) => d.id === item.dailyPlanId);
    const entry = {
      ...item,
      log: log
        ? {
            id: log.id,
            outcome: log.outcome,
            distanceM: log.distanceM,
            movingDurationSec: log.movingDurationSec,
          }
        : null,
      status: derivePlanStatus(
        item,
        log ? { outcome: log.outcome } : null,
        day?.date ?? "",
        today,
      ),
    };
    const list = itemsByDay.get(item.dailyPlanId) ?? [];
    list.push(entry);
    itemsByDay.set(item.dailyPlanId, list);
  }
  return {
    week,
    days: days.map((d) => ({ ...d, items: itemsByDay.get(d.id) ?? [] })),
  };
}
