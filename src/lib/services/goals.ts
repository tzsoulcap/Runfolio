import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { raceGoals, workoutLogs } from "@/lib/db/schema";
import { GOAL_DISTANCES, GoalInputSchema } from "@/lib/domain/goal";

import { ServiceError } from "./errors";

function validation(message: string): ServiceError {
  return new ServiceError("VALIDATION", message);
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockOwnedGoal(tx: DbTx, userId: string, goalId: string) {
  const [goal] = await tx
    .select()
    .from(raceGoals)
    .where(and(eq(raceGoals.id, goalId), eq(raceGoals.userId, userId)))
    .limit(1)
    .for("update");
  if (!goal) throw new ServiceError("NOT_FOUND", "goal not found");
  return goal;
}

function parseGoalInput(input: unknown) {
  const parsed = GoalInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid goal");
  }
  return parsed.data;
}

export type ResultCandidate = {
  id: string;
  performedDate: string;
  distanceM: number | null;
  movingDurationSec: number | null;
  note: string | null;
};

// T04 reads the primary goal for Home; goal CRUD arrives with T08/T11.
export async function getPrimaryGoal(userId: string) {
  const [goal] = await db
    .select()
    .from(raceGoals)
    .where(
      and(
        eq(raceGoals.userId, userId),
        eq(raceGoals.isPrimary, true),
        eq(raceGoals.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return goal ?? null;
}

export type GoalOption = {
  id: string;
  eventName: string | null;
  distanceM: number;
  eventDate: string | null;
  isPrimary: boolean;
};

// RACE_DAY plan dropdown: own active goals, primary first.
export async function listGoals(userId: string): Promise<GoalOption[]> {
  return db
    .select({
      id: raceGoals.id,
      eventName: raceGoals.eventName,
      distanceM: raceGoals.distanceM,
      eventDate: raceGoals.eventDate,
      isPrimary: raceGoals.isPrimary,
    })
    .from(raceGoals)
    .where(and(eq(raceGoals.userId, userId), eq(raceGoals.status, "ACTIVE")))
    .orderBy(desc(raceGoals.isPrimary), asc(raceGoals.eventDate));
}

// Goals page: everything, active first, undated last.
export async function listAllGoals(userId: string) {
  return db
    .select()
    .from(raceGoals)
    .where(eq(raceGoals.userId, userId))
    .orderBy(
      desc(eq(raceGoals.status, "ACTIVE")),
      desc(raceGoals.isPrimary),
      asc(raceGoals.eventDate),
      desc(raceGoals.createdAt),
    );
}

export async function createGoal(
  userId: string,
  input: unknown,
  opts: { isPrimary?: boolean } = {},
) {
  const data = parseGoalInput(input);
  return db.transaction(async (tx) => {
    if (opts.isPrimary) {
      await tx
        .update(raceGoals)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(raceGoals.userId, userId), eq(raceGoals.isPrimary, true)));
    }
    const [goal] = await tx
      .insert(raceGoals)
      .values({
        userId,
        distanceCode: data.distanceCode,
        distanceM: GOAL_DISTANCES[data.distanceCode],
        goalType: data.goalType,
        eventName: data.eventName ?? null,
        eventDate: data.eventDate ?? null,
        targetTimeSec: data.targetTimeSec ?? null,
        isPrimary: opts.isPrimary ?? false,
        status: "ACTIVE",
      })
      .returning();
    if (!goal) throw new ServiceError("CONFLICT", "goal insert failed");
    return { goal };
  });
}

export type GoalDetail = {
  goal: typeof raceGoals.$inferSelect;
  resultLog: ResultCandidate | null;
};

export async function getGoal(
  userId: string,
  goalId: string,
): Promise<GoalDetail> {
  const [goal] = await db
    .select()
    .from(raceGoals)
    .where(and(eq(raceGoals.id, goalId), eq(raceGoals.userId, userId)))
    .limit(1);
  if (!goal) throw new ServiceError("NOT_FOUND", "goal not found");
  if (!goal.resultWorkoutLogId) return { goal, resultLog: null };
  const [resultLog] = await db
    .select({
      id: workoutLogs.id,
      performedDate: workoutLogs.performedDate,
      distanceM: workoutLogs.distanceM,
      movingDurationSec: workoutLogs.movingDurationSec,
      note: workoutLogs.note,
    })
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.id, goal.resultWorkoutLogId),
        eq(workoutLogs.userId, userId),
        isNull(workoutLogs.deletedAt),
      ),
    )
    .limit(1);
  return { goal, resultLog: resultLog ?? null };
}

export async function updateGoal(
  userId: string,
  goalId: string,
  input: unknown,
) {
  const data = parseGoalInput(input);
  return db.transaction(async (tx) => {
    const goal = await lockOwnedGoal(tx, userId, goalId);
    const [updated] = await tx
      .update(raceGoals)
      .set({
        distanceCode: data.distanceCode,
        distanceM: GOAL_DISTANCES[data.distanceCode],
        goalType: data.goalType,
        eventName: data.eventName ?? null,
        eventDate: data.eventDate ?? null,
        targetTimeSec: data.targetTimeSec ?? null,
        updatedAt: new Date(),
      })
      .where(eq(raceGoals.id, goal.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "goal update failed");
    return { goal: updated };
  });
}

// Exactly one active primary: clear + set in one transaction (§8).
export async function setPrimaryGoal(userId: string, goalId: string) {
  return db.transaction(async (tx) => {
    const goal = await lockOwnedGoal(tx, userId, goalId);
    if (goal.status !== "ACTIVE") {
      throw validation("only active goals can be primary");
    }
    await tx
      .update(raceGoals)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(raceGoals.userId, userId), eq(raceGoals.isPrimary, true)));
    const [updated] = await tx
      .update(raceGoals)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(raceGoals.id, goal.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "goal update failed");
    return { goal: updated };
  });
}

async function setStatusInTx(
  tx: DbTx,
  userId: string,
  goalId: string,
  status: "ACHIEVED" | "ARCHIVED",
) {
  const goal = await lockOwnedGoal(tx, userId, goalId);
  const [updated] = await tx
    .update(raceGoals)
    .set({ status, isPrimary: false, updatedAt: new Date() })
    .where(eq(raceGoals.id, goal.id))
    .returning();
  if (!updated) throw new ServiceError("CONFLICT", "goal update failed");
  return { goal: updated };
}

// Archive/achieve return primary to no one in the same transaction (§8):
// the user picks a new primary themselves.
export async function archiveGoal(userId: string, goalId: string) {
  return db.transaction((tx) => setStatusInTx(tx, userId, goalId, "ARCHIVED"));
}

export async function achieveGoal(userId: string, goalId: string) {
  return db.transaction((tx) => setStatusInTx(tx, userId, goalId, "ACHIEVED"));
}

// Manual result link (§8): the log must be an owned, active RACE_DAY run.
// Tune-up races stay ordinary unlinked logs.
export async function linkResultLog(
  userId: string,
  goalId: string,
  logId: string,
) {
  return db.transaction(async (tx) => {
    const goal = await lockOwnedGoal(tx, userId, goalId);
    const [log] = await tx
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
    if (log.activityType !== "RUNNING" || log.runningWorkoutCode !== "RACE_DAY") {
      throw validation("only race-day logs can be linked as results");
    }
    const [updated] = await tx
      .update(raceGoals)
      .set({ resultWorkoutLogId: log.id, updatedAt: new Date() })
      .where(eq(raceGoals.id, goal.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "goal update failed");
    return { goal: updated };
  });
}

export async function unlinkResultLog(userId: string, goalId: string) {
  return db.transaction(async (tx) => {
    const goal = await lockOwnedGoal(tx, userId, goalId);
    const [updated] = await tx
      .update(raceGoals)
      .set({ resultWorkoutLogId: null, updatedAt: new Date() })
      .where(eq(raceGoals.id, goal.id))
      .returning();
    if (!updated) throw new ServiceError("CONFLICT", "goal update failed");
    return { goal: updated };
  });
}

// Result picker: own active RACE_DAY runs, newest first.
export async function listResultCandidates(userId: string, limit = 50) {
  return db
    .select({
      id: workoutLogs.id,
      performedDate: workoutLogs.performedDate,
      distanceM: workoutLogs.distanceM,
      movingDurationSec: workoutLogs.movingDurationSec,
      note: workoutLogs.note,
    })
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        isNull(workoutLogs.deletedAt),
        eq(workoutLogs.activityType, "RUNNING"),
        eq(workoutLogs.runningWorkoutCode, "RACE_DAY"),
      ),
    )
    .orderBy(desc(workoutLogs.performedDate), desc(workoutLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
