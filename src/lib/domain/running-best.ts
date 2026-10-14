import { GOAL_DISTANCES, type GoalDistanceCode } from "./goal";

export const CONTINUOUS_RUN_CODES = [
  "RECOVERY_RUN", "EASY_RUN", "LONG_RUN", "TEMPO", "RACE_DAY",
] as const;

export type TimeBasis = "ELAPSED" | "MOVING";

export type RunningBest = {
  distanceCode: GoalDistanceCode;
  sourceLogId: string;
  sourceDistanceM: number;
  sourceDurationSec: number;
  timeBasis: TimeBasis;
  performedDate: string;
};

export type BestSourceLog = {
  id: string;
  activityType: string;
  runningWorkoutCode: string | null;
  distanceM: number | null;
  movingDurationSec: number | null;
  elapsedDurationSec: number | null;
  performedDate: string;
  plannedSnapshot: Record<string, unknown> | null;
  deletedAt: Date | null;
};

export function runningBestCandidate(log: BestSourceLog): Omit<RunningBest, "distanceCode"> | null {
  if (log.deletedAt || log.activityType !== "RUNNING" ||
    !CONTINUOUS_RUN_CODES.includes(log.runningWorkoutCode as typeof CONTINUOUS_RUN_CODES[number]) ||
    log.distanceM === null || !Number.isFinite(log.distanceM) || log.distanceM <= 0) return null;

  // Splits are freeform measurements, not evidence of repeated work/recovery.
  // A changed actual workout type supersedes the original plan's format.
  const snapshot = log.plannedSnapshot;
  const target = snapshot?.runningTarget as { kind?: string; steps?: Array<{ kind?: string }> } | undefined;
  const sameType = snapshot?.runningWorkoutCode === undefined || snapshot.runningWorkoutCode === log.runningWorkoutCode;
  if (sameType && target?.kind === "STRUCTURED" && Array.isArray(target.steps) && target.steps.some(step => step?.kind === "REPEAT")) return null;

  const seconds = log.elapsedDurationSec ?? log.movingDurationSec;
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return {
    sourceLogId: log.id,
    sourceDistanceM: log.distanceM,
    sourceDurationSec: seconds,
    timeBasis: log.elapsedDurationSec !== null ? "ELAPSED" : "MOVING",
    performedDate: log.performedDate,
  };
}

export function comparisonForGoal(goal: {
  distanceCode: string;
  distanceM: number;
  goalType: string;
  targetTimeSec: number | null;
}, best: RunningBest | null | undefined) {
  if (!best || best.sourceDistanceM < goal.distanceM) return null;
  // Stored distances have two decimals. Integer centimetres avoid floating
  // point loss at an exact second, including the half/full marathon distances.
  const sourceCm = Math.round(best.sourceDistanceM * 100);
  const targetCm = Math.round(goal.distanceM * 100);
  const seconds = best.sourceDurationSec * targetCm / sourceCm;
  const displaySec = Math.ceil(seconds);
  const targetSec = goal.goalType === "TARGET_TIME" ? goal.targetTimeSec : null;
  return {
    ...best,
    comparisonSec: seconds,
    displaySec,
    paceSecPerKm: best.sourceDurationSec * 100000 / sourceCm,
    isEquivalent: sourceCm !== targetCm,
    remainingSec: targetSec === null ? null : Math.max(0, displaySec - targetSec),
    aheadSec: targetSec === null ? null : Math.max(0, targetSec - displaySec),
    meetsTarget: targetSec !== null && seconds <= targetSec,
  };
}

export const BEST_DISTANCES = Object.entries(GOAL_DISTANCES) as Array<[GoalDistanceCode, number]>;
