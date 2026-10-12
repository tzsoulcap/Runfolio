import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/services/errors";
import {
  RunningLogInputSchema,
  StrengthLogInputSchema,
  assertNotFuture,
} from "@/lib/domain/log";

const BASE = {
  performedDate: "2026-10-09",
  runningWorkoutCode: "EASY_RUN",
  distanceM: 5000,
  movingDurationSec: 2280,
};

describe("RunningLogInputSchema", () => {
  it("accepts a complete log and defaults outcome to COMPLETED", () => {
    const parsed = RunningLogInputSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.outcome).toBe("COMPLETED");
    }
  });

  it("requires elapsed >= moving when elapsed is given", () => {
    expect(
      RunningLogInputSchema.safeParse({
        ...BASE,
        elapsedDurationSec: 2280,
      }).success,
    ).toBe(true);
    expect(
      RunningLogInputSchema.safeParse({
        ...BASE,
        elapsedDurationSec: 2279,
      }).success,
    ).toBe(false);
  });

  it("bounds RPE to 1-10 and rejects zero distance", () => {
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, rpe: 10 }).success,
    ).toBe(true);
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, rpe: 11 }).success,
    ).toBe(false);
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, rpe: 0 }).success,
    ).toBe(false);
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, distanceM: 0 }).success,
    ).toBe(false);
  });

  it("accepts optional HR, start time, and splits (§6)", () => {
    const parsed = RunningLogInputSchema.safeParse({
      ...BASE,
      avgHeartRate: 142,
      startTime: "06:30",
      splits: [
        { distanceM: 800, durationSec: 240 },
        { distanceM: 800 },
        { durationSec: 95 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty splits, bad start time, and non-positive HR", () => {
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, splits: [{}] }).success,
    ).toBe(false);
    expect(
      RunningLogInputSchema.safeParse({
        ...BASE,
        splits: [{ distanceM: 0, durationSec: 60 }],
      }).success,
    ).toBe(false);
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, startTime: "6:30" }).success,
    ).toBe(false);
    expect(
      RunningLogInputSchema.safeParse({ ...BASE, avgHeartRate: 0 }).success,
    ).toBe(false);
  });
});

const SET = {
  setNumber: 1,
  side: "BOTH",
  measurement: "REPS",
  reps: 10,
  loadKg: 8,
} as const;

const STRENGTH_BASE = {
  performedDate: "2026-10-09",
  exercises: [
    {
      exerciseCode: "BULGARIAN_SPLIT_SQUAT",
      variant: "STANDARD",
      countMode: "PER_SIDE",
      sets: [
        { ...SET, side: "LEFT", loadKg: 8 },
        { ...SET, side: "RIGHT", reps: 8, loadKg: 8 },
        { ...SET, setNumber: 2, side: "LEFT", loadKg: 8 },
        { ...SET, setNumber: 2, side: "RIGHT", loadKg: 8 },
      ],
    },
    {
      exerciseCode: "PLANK",
      variant: "STANDARD",
      countMode: "TOTAL",
      sets: [{ setNumber: 1, side: "BOTH", measurement: "TIME", durationSec: 45, loadKg: 0 }],
    },
  ],
} as const;

describe("StrengthLogInputSchema", () => {
  it("accepts per-side sets, plank seconds, and session optionals", () => {
    const parsed = StrengthLogInputSchema.safeParse({
      ...STRENGTH_BASE,
      sessionDurationSec: 2700,
      outcome: "COMPLETED",
      rpe: 7,
      feeling: "ดี",
      note: "เย็น",
    });
    expect(parsed.success).toBe(true);
  });

  it("maps sides to count modes per §11", () => {
    const ex = STRENGTH_BASE.exercises[0];
    // PER_SIDE rejects BOTH.
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [{ ...ex, sets: [SET] }],
      }).success,
    ).toBe(false);
    // TOTAL rejects LEFT.
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            exerciseCode: "GLUTE_BRIDGE",
            variant: "STANDARD",
            countMode: "TOTAL",
            sets: [{ ...SET, side: "LEFT" }],
          },
        ],
      }).success,
    ).toBe(false);
    // ALTERNATING and directional sides pass under their modes.
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            exerciseCode: "WALKING_LUNGES",
            variant: "STANDARD",
            countMode: "TOTAL_ALTERNATING",
            sets: [{ ...SET, side: "ALTERNATING", reps: 20 }],
          },
          {
            exerciseCode: "LATERAL_BAND_WALK",
            variant: "STANDARD",
            countMode: "PER_DIRECTION",
            sets: [
              { ...SET, side: "OUTBOUND", reps: 15 },
              { ...SET, side: "RETURN", reps: 15 },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("keeps loadKg 0/null meanings and forbids negatives", () => {
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            ...STRENGTH_BASE.exercises[1],
            sets: [
              {
                setNumber: 1,
                side: "BOTH",
                measurement: "TIME",
                durationSec: 45,
                loadKg: null,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            ...STRENGTH_BASE.exercises[1],
            sets: [
              {
                setNumber: 1,
                side: "BOTH",
                measurement: "TIME",
                durationSec: 45,
                loadKg: -1,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate sets, TIME-with-reps, and all-empty logs", () => {
    const plank = STRENGTH_BASE.exercises[1];
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [{ ...plank, sets: [plank.sets[0], plank.sets[0]] }],
      }).success,
    ).toBe(false);
    expect(
      StrengthLogInputSchema.safeParse({
        ...STRENGTH_BASE,
        exercises: [
          {
            ...plank,
            sets: [{ ...plank.sets[0], reps: 10 }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      StrengthLogInputSchema.safeParse({
        performedDate: "2026-10-09",
        exercises: [
          { ...plank, sets: [{ setNumber: 1, side: "BOTH" }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      StrengthLogInputSchema.safeParse({
        performedDate: "2026-10-09",
        exercises: [],
      }).success,
    ).toBe(false);
  });
});

describe("assertNotFuture", () => {
  it("passes for today and past dates", () => {
    expect(() =>
      assertNotFuture("2026-10-09", "2026-10-09"),
    ).not.toThrow();
    expect(() =>
      assertNotFuture("2020-01-01", "2026-10-09"),
    ).not.toThrow();
  });

  it("throws VALIDATION for a future date", () => {
    try {
      assertNotFuture("2026-10-10", "2026-10-09");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).code).toBe("VALIDATION");
    }
  });
});
