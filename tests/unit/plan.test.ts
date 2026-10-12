import { describe, expect, it } from "vitest";

import {
  derivePlanStatus,
  PlanDraftSchema,
  StrengthPlanDraftSchema,
} from "@/lib/domain/plan";

describe("derivePlanStatus", () => {
  it("maps log outcome, skip, missed, and planned per §5", () => {
    const item = { planState: "SCHEDULED" };
    expect(
      derivePlanStatus(item, { outcome: "COMPLETED" }, "2026-10-09", "2026-10-09"),
    ).toBe("COMPLETED");
    expect(
      derivePlanStatus(item, { outcome: "PARTIAL" }, "2026-10-09", "2026-10-09"),
    ).toBe("PARTIAL");
    expect(
      derivePlanStatus(
        { planState: "SKIPPED" },
        null,
        "2026-10-09",
        "2026-10-09",
      ),
    ).toBe("SKIPPED");
    expect(derivePlanStatus(item, null, "2026-10-08", "2026-10-09")).toBe(
      "MISSED",
    );
    expect(derivePlanStatus(item, null, "2026-10-09", "2026-10-09")).toBe(
      "PLANNED",
    );
  });
});

const BASE = {
  date: "2026-10-13",
  activityType: "RUNNING",
  runningWorkoutCode: "EASY_RUN",
  intensityTarget: { kind: "NONE" },
} as const;

describe("PlanDraftSchema", () => {
  it("accepts an Easy Run distance draft", () => {
    const parsed = PlanDraftSchema.safeParse({
      ...BASE,
      runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      note: "เช้า",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a duration draft", () => {
    const parsed = PlanDraftSchema.safeParse({
      ...BASE,
      runningTarget: { kind: "DURATION", durationSec: 1800 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects REST as a workout type with a target", () => {
    const parsed = PlanDraftSchema.safeParse({
      ...BASE,
      runningWorkoutCode: "REST",
      runningTarget: { kind: "DISTANCE", distanceM: 6000 },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts RACE_DAY with a goal link and no typed target", () => {
    const parsed = PlanDraftSchema.safeParse({
      ...BASE,
      runningWorkoutCode: "RACE_DAY",
      goalId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects RACE_DAY without a goal or with a typed target", () => {
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningWorkoutCode: "RACE_DAY",
        runningTarget: { kind: "DISTANCE", distanceM: 21097.5 },
      }).success,
    ).toBe(false);
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningWorkoutCode: "RACE_DAY",
      }).success,
    ).toBe(false);
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningWorkoutCode: "RACE_DAY",
        goalId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects goalId on non-race plans and missing target", () => {
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        goalId: "11111111-1111-4111-8111-111111111111",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      }).success,
    ).toBe(false);
    expect(
      PlanDraftSchema.safeParse({ ...BASE }).success,
    ).toBe(false);
  });

  it("accepts a structured interval draft", () => {
    const parsed = PlanDraftSchema.safeParse({
      ...BASE,
      runningWorkoutCode: "INTERVAL",
      runningTarget: {
        kind: "STRUCTURED",
        steps: [
          {
            kind: "REPEAT",
            repeatCount: 5,
            includeFinalRecovery: false,
            steps: [
              {
                kind: "STEP",
                phase: "WORK",
                target: { kind: "DISTANCE", distanceM: 800 },
                intensity: { kind: "NONE" },
              },
              {
                kind: "STEP",
                phase: "RECOVERY",
                target: { kind: "DURATION", durationSec: 120 },
                intensity: { kind: "NONE" },
              },
            ],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive distance and malformed dates", () => {
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningTarget: { kind: "DISTANCE", distanceM: 0 },
      }).success,
    ).toBe(false);
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        date: "2026-1-1",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      }).success,
    ).toBe(false);
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        date: "not-a-date",
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
      }).success,
    ).toBe(false);
  });

  it("accepts HH:mm start time and rejects invalid time", () => {
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        plannedStartTime: "06:30",
      }).success,
    ).toBe(true);
    expect(
      PlanDraftSchema.safeParse({
        ...BASE,
        runningTarget: { kind: "DISTANCE", distanceM: 6000 },
        plannedStartTime: "25:00",
      }).success,
    ).toBe(false);
  });
});

const STRENGTH_BASE = {
  date: "2026-10-13",
  activityType: "STRENGTH",
  exercises: [
    {
      exerciseCode: "BULGARIAN_SPLIT_SQUAT",
      variant: "STANDARD",
      prescription: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
        loadKg: 0,
      },
    },
    {
      exerciseCode: "PLANK",
      variant: "STANDARD",
      prescription: {
        measurement: "TIME",
        sets: 3,
        durationSec: 45,
        countMode: "TOTAL",
        loadKg: 0,
      },
    },
  ],
} as const;

describe("StrengthPlanDraftSchema", () => {
  it("accepts a §12-style session with reps + time exercises", () => {
    const parsed = StrengthPlanDraftSchema.safeParse({
      ...STRENGTH_BASE,
      title: "Legs and core",
      plannedStartTime: "18:00",
      note: "เย็น",
    });
    expect(parsed.success).toBe(true);
  });

  it("allows the same exercise twice for circuits", () => {
    const parsed = StrengthPlanDraftSchema.safeParse({
      ...STRENGTH_BASE,
      exercises: [STRENGTH_BASE.exercises[0], STRENGTH_BASE.exercises[0]],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty exercise list", () => {
    expect(
      StrengthPlanDraftSchema.safeParse({ ...STRENGTH_BASE, exercises: [] })
        .success,
    ).toBe(false);
  });

  it("rejects a TIME dose carrying reps and a dose with no sets", () => {
    expect(
      StrengthPlanDraftSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            exerciseCode: "PLANK",
            variant: "STANDARD",
            prescription: {
              measurement: "TIME",
              sets: 3,
              durationSec: 45,
              reps: 10,
              countMode: "TOTAL",
              loadKg: 0,
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      StrengthPlanDraftSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            ...STRENGTH_BASE.exercises[0],
            prescription: {
              ...STRENGTH_BASE.exercises[0].prescription,
              sets: 0,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid start time and blank title", () => {
    expect(
      StrengthPlanDraftSchema.safeParse({
        ...STRENGTH_BASE,
        plannedStartTime: "6:30",
      }).success,
    ).toBe(false);
    expect(
      StrengthPlanDraftSchema.safeParse({
        ...STRENGTH_BASE,
        title: "",
      }).success,
    ).toBe(false);
  });
});
