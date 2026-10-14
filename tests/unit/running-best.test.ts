import { describe, expect, it } from "vitest";
import { comparisonForGoal, runningBestCandidate, type BestSourceLog, type RunningBest } from "@/lib/domain/running-best";

const log: BestSourceLog = {
  id: "source", activityType: "RUNNING", runningWorkoutCode: "EASY_RUN", distanceM: 6000,
  movingDurationSec: 2100, elapsedDurationSec: 2160, performedDate: "2026-10-12", plannedSnapshot: null, deletedAt: null,
};
const goal = { distanceCode: "5K", distanceM: 5000, goalType: "TARGET_TIME", targetTimeSec: 1795 };
const best: RunningBest = { distanceCode: "5K", ...runningBestCandidate(log)! };

describe("running best eligibility", () => {
  it("prefers elapsed time and falls back only when it is missing", () => {
    expect(runningBestCandidate(log)).toMatchObject({ sourceDurationSec: 2160, timeBasis: "ELAPSED" });
    expect(runningBestCandidate({ ...log, elapsedDurationSec: null })).toMatchObject({ sourceDurationSec: 2100, timeBasis: "MOVING" });
  });

  it.each(["INTERVAL", "FARTLEK", "HILL_REPEAT", "STRIDES", "REST"])("excludes %s", code => {
    expect(runningBestCandidate({ ...log, runningWorkoutCode: code })).toBeNull();
  });

  it("excludes a custom repeat plan while allowing a continuous structured plan", () => {
    const plannedSnapshot = { runningWorkoutCode: "EASY_RUN", runningTarget: { kind: "STRUCTURED", steps: [{kind: "REPEAT"}] } };
    expect(runningBestCandidate({...log, plannedSnapshot})).toBeNull();
    expect(runningBestCandidate({...log, plannedSnapshot: {runningTarget: {kind: "STRUCTURED", steps: [{kind: "STEP"}]}}})).not.toBeNull();
    expect(runningBestCandidate({...log, runningWorkoutCode: "RACE_DAY", plannedSnapshot})).not.toBeNull();
  });

  it("ignores deleted, non-running and incomplete measurement data", () => {
    expect(runningBestCandidate({...log, deletedAt: new Date()})).toBeNull();
    expect(runningBestCandidate({...log, activityType: "STRENGTH"})).toBeNull();
    expect(runningBestCandidate({...log, distanceM: null})).toBeNull();
    expect(runningBestCandidate({...log, elapsedDurationSec: null, movingDurationSec: null})).toBeNull();
  });
});

describe("goal comparison", () => {
  it("compares 6K in 36:00 to 5K as 30:00, leaving 5 seconds to 29:55", () => {
    expect(comparisonForGoal(goal, best)).toMatchObject({ comparisonSec: 1800, displaySec: 1800, isEquivalent: true, remainingSec: 5, meetsTarget: false });
  });

  it("does not use a shorter run or claim a subsecond slower result met the goal", () => {
    expect(comparisonForGoal({...goal, distanceCode: "10K", distanceM: 10000}, best)).toBeNull();
    expect(comparisonForGoal(goal, {...best, sourceDistanceM: 5001, sourceDurationSec: 1796})).toMatchObject({ displaySec: 1796, remainingSec: 1, meetsTarget: false });
  });

  it("handles exact distances, target met and finish goals without automatically changing goal status", () => {
    expect(comparisonForGoal(goal, {...best, sourceDistanceM: 5000, sourceDurationSec: 1780})).toMatchObject({ isEquivalent: false, aheadSec: 15, meetsTarget: true });
    expect(comparisonForGoal({...goal, goalType: "FINISH", targetTimeSec: null}, best)).toMatchObject({ remainingSec: null, aheadSec: null, meetsTarget: false });
    expect(comparisonForGoal(goal, null)).toBeNull();
  });

  it("uses the exact half marathon distance and floors pace at display only", () => {
    const actual = comparisonForGoal({ ...goal, distanceM: 21097.5 }, { ...best, sourceDistanceM: 42195, sourceDurationSec: 14400 });
    expect(actual?.comparisonSec).toBe(7200);
  });
});
