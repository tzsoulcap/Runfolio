import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  dailyPlans,
  plannedStrengthExercises,
  planItems,
  raceGoals,
  runningWorkoutMasters,
  strengthExerciseMasters,
  weeklyPlans,
  workoutLogs,
} from "@/lib/db/schema";
import {
  derivePlanStatus,
  CopyPlanItemSchema,
  MovePlanItemSchema,
  PlanDraftSchema,
  PlanItemRevisionSchema,
  StrengthPlanDraftSchema,
  type DerivedPlanStatus,
} from "@/lib/domain/plan";
import {
  DateOnlySchema,
  isMonday,
  mondayOf,
  weekDates,
} from "@/lib/domain/week";

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
      exercises: Array<typeof plannedStrengthExercises.$inferSelect>;
    }
  >;
};

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

// Active strength masters for the plan form, grouped by muscle in the UI.
export async function listStrengthMasters() {
  return db
    .select()
    .from(strengthExerciseMasters)
    .where(eq(strengthExerciseMasters.isActive, true))
    .orderBy(asc(strengthExerciseMasters.sortOrder));
}

export async function ensureWeek(tx: DbTx, userId: string, monday: string) {
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

export async function bumpRevision(
  tx: DbTx,
  weekId: string,
  expectedRevision: number,
): Promise<number> {
  const bumped = await tx
    .update(weeklyPlans)
    .set({
      revision: sql`${weeklyPlans.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(weeklyPlans.id, weekId), eq(weeklyPlans.revision, expectedRevision)),
    )
    .returning({ revision: weeklyPlans.revision });
  if (bumped.length === 0 || bumped[0].revision === undefined) {
    throw new ServiceError("CONFLICT", "week changed; refetch and retry");
  }
  return bumped[0].revision;
}

// Shared insert preamble: week/day lookup, rest-day guard, next sortOrder.
async function prepareDayInsert(tx: DbTx, userId: string, date: string) {
  const monday = mondayOf(date);
  const { week } = await ensureWeek(tx, userId, monday);
  const [day] = await tx
    .select()
    .from(dailyPlans)
    .where(
      and(eq(dailyPlans.weeklyPlanId, week.id), eq(dailyPlans.date, date)),
    )
    .limit(1);
  if (!day) throw new ServiceError("NOT_FOUND", "day not found");
  if (day.isRestDay) {
    throw new ServiceError("CONFLICT", "cannot add a session to a rest day");
  }
  const siblings = await tx
    .select({ sortOrder: planItems.sortOrder })
    .from(planItems)
    .where(
      and(eq(planItems.dailyPlanId, day.id), isNull(planItems.deletedAt)),
    );
  const sortOrder =
    siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
  return { week, day, sortOrder };
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
    const { week, day, sortOrder } = await prepareDayInsert(
      tx,
      userId,
      draft.date,
    );
    const [master] = await tx
      .select()
      .from(runningWorkoutMasters)
      .where(eq(runningWorkoutMasters.code, draft.runningWorkoutCode))
      .limit(1);
    if (!master || !master.isActive) {
      throw new ServiceError("NOT_FOUND", "workout master not found");
    }
    // RACE_DAY distance comes from the linked goal, never typed input (§5).
    let runningTarget = draft.runningTarget;
    let raceGoalId: string | null = null;
    if (draft.runningWorkoutCode === "RACE_DAY") {
      if (!draft.goalId) {
        throw validation("RACE_DAY plans need a goal link");
      }
      const [goal] = await tx
        .select()
        .from(raceGoals)
        .where(
          and(
            eq(raceGoals.id, draft.goalId),
            eq(raceGoals.userId, userId),
            eq(raceGoals.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!goal) {
        throw new ServiceError("NOT_FOUND", "race goal not found");
      }
      runningTarget = { kind: "DISTANCE", distanceM: goal.distanceM };
      raceGoalId = goal.id;
    }
    if (!runningTarget) {
      throw validation("non-race plans need a target");
    }
    const [item] = await tx
      .insert(planItems)
      .values({
        dailyPlanId: day.id,
        activityType: "RUNNING",
        runningWorkoutCode: master.code,
        title: master.nameEn,
        plannedStartTime: draft.plannedStartTime,
        runningTarget,
        intensityTarget: draft.intensityTarget,
        raceGoalId,
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
    if (!item) {
      throw new ServiceError("CONFLICT", "plan insert failed; retry");
    }
    const revision = await bumpRevision(tx, week.id, expectedRevision);
    return { item, revision };
  });
}

export async function addStrengthPlanItem(
  userId: string,
  rawDraft: unknown,
  expectedRevision: number,
) {
  const parsed = StrengthPlanDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid draft");
  }
  const draft = parsed.data;
  return db.transaction(async (tx) => {
    const { week, day, sortOrder } = await prepareDayInsert(
      tx,
      userId,
      draft.date,
    );
    const codes = [...new Set(draft.exercises.map((e) => e.exerciseCode))];
    const masters = await tx
      .select()
      .from(strengthExerciseMasters)
      .where(inArray(strengthExerciseMasters.code, codes));
    const byCode = new Map(masters.map((m) => [m.code, m]));
    for (const code of codes) {
      const master = byCode.get(code);
      if (!master || !master.isActive) {
        throw new ServiceError("NOT_FOUND", "exercise master not found");
      }
    }
    const [item] = await tx
      .insert(planItems)
      .values({
        dailyPlanId: day.id,
        activityType: "STRENGTH",
        title: draft.title ?? "Strength",
        plannedStartTime: draft.plannedStartTime,
        note: draft.note,
        sortOrder,
        planState: "SCHEDULED",
      })
      .returning();
    if (!item) {
      throw new ServiceError("CONFLICT", "plan insert failed; retry");
    }
    await tx.insert(plannedStrengthExercises).values(
      draft.exercises.map((e, index) => {
        const master = byCode.get(e.exerciseCode);
        return {
          planItemId: item.id,
          exerciseCode: e.exerciseCode,
          variant: e.variant,
          prescription: e.prescription,
          sortOrder: index,
          masterSnapshot: master
            ? {
                code: master.code,
                nameTh: master.nameTh,
                nameEn: master.nameEn,
                muscleGroup: master.muscleGroup,
                repLabel: master.repLabel,
                guidance: master.guidance,
              }
            : null,
        };
      }),
    );
    const revision = await bumpRevision(tx, week.id, expectedRevision);
    return { item, revision };
  });
}

// Copy a single plan, including its ordered exercise prescriptions. Logs and
// completion state belong to the original; the copy is always scheduled.
export async function copyPlanItem(userId: string, rawInput: unknown) {
  const parsed = CopyPlanItemSchema.safeParse(rawInput);
  if (!parsed.success) throw validation("invalid copy input");
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [source] = await tx.select({ weekId: weeklyPlans.id, dayId: dailyPlans.id })
      .from(planItems)
      .innerJoin(dailyPlans, eq(planItems.dailyPlanId, dailyPlans.id))
      .innerJoin(weeklyPlans, eq(dailyPlans.weeklyPlanId, weeklyPlans.id))
      .where(and(eq(planItems.id, input.planItemId), isNull(planItems.deletedAt), eq(weeklyPlans.userId, userId)))
      .limit(1);
    if (!source) throw new ServiceError("NOT_FOUND", "plan item not found");
    const { week: destWeek } = await ensureWeek(tx, userId, mondayOf(input.targetDate));
    const revisions = new Map<string, number>();
    for (const id of [...new Set([source.weekId, destWeek.id])].sort()) {
      const [week] = await tx.select({ revision: weeklyPlans.revision }).from(weeklyPlans)
        .where(eq(weeklyPlans.id, id)).for("update").limit(1);
      if (week) revisions.set(id, week.revision);
    }
    if (revisions.get(source.weekId) !== input.expectedRevision) {
      throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    }
    const crossWeek = source.weekId !== destWeek.id;
    if (crossWeek && input.expectedDestRevision === undefined) {
      throw validation("cross-week copies need the destination revision");
    }
    const destRevision = crossWeek ? input.expectedDestRevision! : input.expectedRevision;
    if (revisions.get(destWeek.id) !== destRevision) {
      throw new ServiceError("CONFLICT", "destination week changed; refetch and retry");
    }
    const [original] = await tx.select().from(planItems)
      .where(and(eq(planItems.id, input.planItemId), eq(planItems.dailyPlanId, source.dayId), isNull(planItems.deletedAt)))
      .for("update").limit(1);
    if (!original) throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    const { day, sortOrder } = await prepareDayInsert(tx, userId, input.targetDate);
    const [item] = await tx.insert(planItems).values({
      dailyPlanId: day.id,
      activityType: original.activityType,
      runningWorkoutCode: original.runningWorkoutCode,
      title: original.title,
      plannedStartTime: original.plannedStartTime,
      runningTarget: original.runningTarget,
      intensityTarget: original.intensityTarget,
      raceGoalId: original.raceGoalId,
      note: original.note,
      masterSnapshot: original.masterSnapshot,
      sortOrder,
      planState: "SCHEDULED",
    }).returning();
    if (!item) throw new ServiceError("CONFLICT", "plan insert failed; retry");
    if (original.activityType === "STRENGTH") {
      const exercises = await tx.select().from(plannedStrengthExercises)
        .where(eq(plannedStrengthExercises.planItemId, original.id))
        .orderBy(asc(plannedStrengthExercises.sortOrder));
      if (exercises.length > 0) await tx.insert(plannedStrengthExercises).values(
        exercises.map((exercise) => ({
          planItemId: item.id,
          exerciseCode: exercise.exerciseCode,
          variant: exercise.variant,
          prescription: exercise.prescription,
          masterSnapshot: exercise.masterSnapshot,
          sortOrder: exercise.sortOrder,
        })),
      );
    }
    const revision = await bumpRevision(tx, destWeek.id, destRevision);
    return { item, revision };
  });
}

export async function movePlanItem(userId: string, raw: unknown) {
  const parsed = MovePlanItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid move");
  }
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({
        weekId: weeklyPlans.id,
      })
      .from(planItems)
      .innerJoin(dailyPlans, eq(planItems.dailyPlanId, dailyPlans.id))
      .innerJoin(weeklyPlans, eq(dailyPlans.weeklyPlanId, weeklyPlans.id))
      .where(
        and(
          eq(planItems.id, input.planItemId),
          isNull(planItems.deletedAt),
          eq(weeklyPlans.userId, userId),
        ),
      )
      .limit(1);
    if (!found) {
      throw new ServiceError("NOT_FOUND", "plan item not found");
    }
    // Ensure the destination week, then lock weeks in ID order (§13).
    const { week: destWeek } = await ensureWeek(
      tx,
      userId,
      mondayOf(input.targetDate),
    );
    const locked = new Map<string, number>();
    for (const id of [...new Set([found.weekId, destWeek.id])].sort()) {
      const [w] = await tx
        .select({ id: weeklyPlans.id, revision: weeklyPlans.revision })
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, id))
        .for("update")
        .limit(1);
      if (w) locked.set(w.id, w.revision);
    }
    const sourceRevision = locked.get(found.weekId);
    const destRevision = locked.get(destWeek.id);
    if (sourceRevision === undefined || destRevision === undefined) {
      throw new ServiceError("NOT_FOUND", "week not found");
    }
    if (sourceRevision !== input.expectedRevision) {
      throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    }
    const crossWeek = found.weekId !== destWeek.id;
    if (crossWeek) {
      if (input.expectedDestRevision === undefined) {
        throw validation("cross-week moves need the destination revision");
      }
      if (destRevision !== input.expectedDestRevision) {
        throw new ServiceError(
          "CONFLICT",
          "destination week changed; refetch and retry",
        );
      }
    }
    // Lock the item, then enforce the log lock under the lock.
    const [item] = await tx
      .select()
      .from(planItems)
      .where(eq(planItems.id, input.planItemId))
      .for("update")
      .limit(1);
    if (!item || item.deletedAt) {
      throw new ServiceError("NOT_FOUND", "plan item not found");
    }
    const [activeLog] = await tx
      .select({ id: workoutLogs.id })
      .from(workoutLogs)
      .where(
        and(
          eq(workoutLogs.planItemId, item.id),
          isNull(workoutLogs.deletedAt),
        ),
      )
      .limit(1);
    if (activeLog) {
      throw new ServiceError("CONFLICT", "plan has an active log; cannot move");
    }
    const [destDay] = await tx
      .select()
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.weeklyPlanId, destWeek.id),
          eq(dailyPlans.date, input.targetDate),
        ),
      )
      .limit(1);
    if (!destDay) throw new ServiceError("NOT_FOUND", "day not found");
    if (destDay.isRestDay) {
      throw new ServiceError("CONFLICT", "cannot move a session to a rest day");
    }
    const sameDay = item.dailyPlanId === destDay.id;
    const siblings = async (dayId: string) =>
      tx
        .select({ id: planItems.id })
        .from(planItems)
        .where(
          and(eq(planItems.dailyPlanId, dayId), isNull(planItems.deletedAt)),
        )
        .orderBy(asc(planItems.sortOrder));
    const sourceAll = await siblings(item.dailyPlanId);
    const sourceIds = sourceAll
      .map((r) => r.id)
      .filter((id) => id !== item.id);
    const destIds = sameDay
      ? sourceIds
      : (await siblings(destDay.id)).map((r) => r.id);
    // targetIndex is the desired index in the final day order.
    const targetIndex = Math.min(input.targetIndex, destIds.length);
    const noOp =
      sameDay &&
      sourceAll.findIndex((r) => r.id === item.id) === targetIndex;
    if (noOp) {
      return {
        dailyPlanId: item.dailyPlanId,
        sortOrder: item.sortOrder,
        revision: sourceRevision,
        destRevision,
      };
    }
    if (!sameDay) {
      for (const [i, id] of sourceIds.entries()) {
        await tx
          .update(planItems)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(eq(planItems.id, id));
      }
    }
    const next = [...destIds];
    next.splice(targetIndex, 0, item.id);
    for (const [i, id] of next.entries()) {
      await tx
        .update(planItems)
        .set(
          id === item.id
            ? { dailyPlanId: destDay.id, sortOrder: i, updatedAt: new Date() }
            : { sortOrder: i, updatedAt: new Date() },
        )
        .where(eq(planItems.id, id));
    }
    const revision = await bumpRevision(tx, found.weekId, input.expectedRevision);
    const newDestRevision = crossWeek
      ? await bumpRevision(
          tx,
          destWeek.id,
          input.expectedDestRevision as number,
        )
      : revision;
    return {
      dailyPlanId: destDay.id,
      sortOrder: targetIndex,
      revision,
      destRevision: newDestRevision,
    };
  });
}

// Keep the plan and its prescriptions for Undo; actual logs are never deleted.
async function setPlanItemDeleted(userId: string, raw: unknown, restore: boolean) {
  const parsed = PlanItemRevisionSchema.safeParse(raw);
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "invalid plan item");
  const input = parsed.data;
  return db.transaction(async tx => {
    const [found] = await tx.select({ weekId: weeklyPlans.id, dayId: dailyPlans.id }).from(planItems)
      .innerJoin(dailyPlans, eq(planItems.dailyPlanId, dailyPlans.id))
      .innerJoin(weeklyPlans, eq(dailyPlans.weeklyPlanId, weeklyPlans.id))
      .where(and(eq(planItems.id, input.planItemId), eq(weeklyPlans.userId, userId))).limit(1);
    if (!found) throw new ServiceError("NOT_FOUND", "plan item not found");
    const [week] = await tx.select().from(weeklyPlans).where(eq(weeklyPlans.id, found.weekId)).for("update").limit(1);
    if (!week || week.revision !== input.expectedRevision) throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    const [item] = await tx.select().from(planItems).where(eq(planItems.id, input.planItemId)).for("update").limit(1);
    if (!item || item.dailyPlanId !== found.dayId) throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    if (restore ? !item.deletedAt : !!item.deletedAt) return { revision: week.revision };
    const [log] = await tx.select({ id: workoutLogs.id }).from(workoutLogs)
      .where(and(eq(workoutLogs.planItemId, item.id), isNull(workoutLogs.deletedAt))).limit(1);
    if (log) throw new ServiceError("CONFLICT", "plan has an active log; cannot delete or restore");
    const siblings = await tx.select({ id: planItems.id }).from(planItems)
      .where(and(eq(planItems.dailyPlanId, found.dayId), isNull(planItems.deletedAt))).orderBy(asc(planItems.sortOrder));
    const originalIndex = siblings.findIndex(row => row.id === item.id);
    const ids = siblings.filter(row => row.id !== item.id).map(row => row.id);
    const itemIndex = restore ? Math.min(item.sortOrder, ids.length) : originalIndex;
    if (restore) {
      const [day] = await tx.select({ isRestDay: dailyPlans.isRestDay }).from(dailyPlans).where(eq(dailyPlans.id, found.dayId)).limit(1);
      if (!day || day.isRestDay) throw new ServiceError("CONFLICT", "cannot restore a session to a rest day");
      ids.splice(itemIndex, 0, item.id);
    }
    for (const [sortOrder, id] of ids.entries()) {
      await tx.update(planItems).set({ sortOrder, updatedAt: new Date() }).where(eq(planItems.id, id));
    }
    await tx.update(planItems).set({ deletedAt: restore ? null : new Date(), sortOrder: itemIndex, updatedAt: new Date() }).where(eq(planItems.id, item.id));
    return { revision: await bumpRevision(tx, week.id, input.expectedRevision) };
  });
}

export function deletePlanItem(userId: string, raw: unknown) { return setPlanItemDeleted(userId, raw, false); }
export function undeletePlanItem(userId: string, raw: unknown) { return setPlanItemDeleted(userId, raw, true); }

export async function getWeekRevision(userId: string, monday: string) {
  if (!isMonday(monday)) {
    throw validation("weekStartDate must be a Monday");
  }
  const [week] = await db
    .select({ revision: weeklyPlans.revision })
    .from(weeklyPlans)
    .where(
      and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.weekStartDate, monday)),
    )
    .limit(1);
  // Missing weeks start at revision 1; the move guard re-checks (§13).
  return { revision: week?.revision ?? 1 };
}

export async function setRestDay(
  userId: string,
  date: string,
  expectedRevision: number,
  opts: { note?: string | null; removeUnlogged?: boolean } = {},
): Promise<number> {
  if (!DateOnlySchema.safeParse(date).success) {
    throw validation("expected YYYY-MM-DD");
  }
  return db.transaction(async (tx) => {
    const { week } = await ensureWeek(tx, userId, mondayOf(date));
    const [day] = await tx
      .select()
      .from(dailyPlans)
      .where(
        and(eq(dailyPlans.weeklyPlanId, week.id), eq(dailyPlans.date, date)),
      )
      .limit(1);
    if (!day) throw new ServiceError("NOT_FOUND", "day not found");
    if (day.isRestDay) return week.revision;
    const items = await tx
      .select({ id: planItems.id })
      .from(planItems)
      .where(
        and(eq(planItems.dailyPlanId, day.id), isNull(planItems.deletedAt)),
      );
    if (items.length > 0) {
      const logs = await tx
        .select({ id: workoutLogs.id })
        .from(workoutLogs)
        .where(
          and(
            inArray(
              workoutLogs.planItemId,
              items.map((i) => i.id),
            ),
            isNull(workoutLogs.deletedAt),
          ),
        )
        .limit(1);
      if (logs.length > 0) {
        throw new ServiceError(
          "CONFLICT",
          "day has logs; cannot replace with rest day",
        );
      }
      if (!opts.removeUnlogged) {
        throw new ServiceError(
          "CONFLICT",
          "day has unlogged plans; remove them first",
        );
      }
      await tx
        .update(planItems)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(planItems.dailyPlanId, day.id),
            isNull(planItems.deletedAt),
          ),
        );
    }
    await tx
      .update(dailyPlans)
      .set({
        isRestDay: true,
        note: opts.note !== undefined ? opts.note : day.note,
        updatedAt: new Date(),
      })
      .where(eq(dailyPlans.id, day.id));
    return bumpRevision(tx, week.id, expectedRevision);
  });
}

export async function unsetRestDay(
  userId: string,
  date: string,
  expectedRevision: number,
): Promise<number> {
  if (!DateOnlySchema.safeParse(date).success) {
    throw validation("expected YYYY-MM-DD");
  }
  return db.transaction(async (tx) => {
    const { week } = await ensureWeek(tx, userId, mondayOf(date));
    const [day] = await tx
      .select()
      .from(dailyPlans)
      .where(
        and(eq(dailyPlans.weeklyPlanId, week.id), eq(dailyPlans.date, date)),
      )
      .limit(1);
    if (!day) throw new ServiceError("NOT_FOUND", "day not found");
    if (!day.isRestDay) return week.revision;
    await tx
      .update(dailyPlans)
      .set({ isRestDay: false, note: null, updatedAt: new Date() })
      .where(eq(dailyPlans.id, day.id));
    return bumpRevision(tx, week.id, expectedRevision);
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
  const strengthIds = items
    .filter((i) => i.activityType === "STRENGTH")
    .map((i) => i.id);
  const planned =
    strengthIds.length === 0
      ? []
      : await db
          .select()
          .from(plannedStrengthExercises)
          .where(inArray(plannedStrengthExercises.planItemId, strengthIds))
          .orderBy(asc(plannedStrengthExercises.sortOrder));
  const exercisesByItem = new Map<string, typeof planned>();
  for (const row of planned) {
    const list = exercisesByItem.get(row.planItemId) ?? [];
    list.push(row);
    exercisesByItem.set(row.planItemId, list);
  }
  const itemsByDay = new Map<string, DayWithItems["items"]>();
  for (const item of items) {
    const log = logByPlan.get(item.id) ?? null;
    const day = days.find((d) => d.id === item.dailyPlanId);
    const entry = {
      ...item,
      exercises: exercisesByItem.get(item.id) ?? [],
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
