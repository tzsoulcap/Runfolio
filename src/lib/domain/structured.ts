import type {
  RunningStep,
  RunningTarget,
} from "@/lib/domain/master";

// Known totals of a structured workout (§14): distance and duration are
// summed independently — a DISTANCE step never invents duration, a DURATION
// step never invents distance, and OPEN recovery contributes neither. Each
// total carries a completeness flag: false whenever any performed step
// leaves that dimension unknown.
export type StructuredTotals = {
  knownDistanceM: number;
  knownDurationSec: number;
  distanceComplete: boolean;
  durationComplete: boolean;
};

type Accumulator = {
  distanceM: number;
  durationSec: number;
  distanceComplete: boolean;
  durationComplete: boolean;
};

function emptyAccumulator(): Accumulator {
  return {
    distanceM: 0,
    durationSec: 0,
    distanceComplete: true,
    durationComplete: true,
  };
}

function addStep(acc: Accumulator, step: RunningStep): void {
  const target = step.target;
  if (target.kind === "DISTANCE") {
    acc.distanceM += target.distanceM;
    acc.durationComplete = false;
  } else if (target.kind === "DURATION") {
    acc.durationSec += target.durationSec;
    acc.distanceComplete = false;
  } else {
    acc.distanceComplete = false;
    acc.durationComplete = false;
  }
}

export type StructuredRunningTarget = Extract<
  RunningTarget,
  { kind: "STRUCTURED" }
>;

export function summarizeStructured(
  target: StructuredRunningTarget,
): StructuredTotals {
  const acc = emptyAccumulator();
  for (const entry of target.steps) {
    if (entry.kind === "STEP") {
      addStep(acc, entry);
      continue;
    }
    for (let round = 1; round <= entry.repeatCount; round += 1) {
      const lastRoundSkipsRecovery =
        round === entry.repeatCount && !entry.includeFinalRecovery;
      const rounds =
        lastRoundSkipsRecovery ? entry.steps.slice(0, -1) : entry.steps;
      for (const step of rounds) {
        addStep(acc, step);
      }
    }
  }
  return {
    knownDistanceM: acc.distanceM,
    knownDurationSec: acc.durationSec,
    distanceComplete: acc.distanceComplete,
    durationComplete: acc.durationComplete,
  };
}
