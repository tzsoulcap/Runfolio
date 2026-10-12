import { describe, expect, it } from "vitest";

import {
  GOAL_DISTANCES,
  GoalInputSchema,
  targetPaceSecPerKm,
} from "@/lib/domain/goal";

describe("GOAL_DISTANCES", () => {
  it("keeps standard meters exact (§8: 21K = 21097.5)", () => {
    expect(GOAL_DISTANCES).toEqual({
      "5K": 5000,
      "10K": 10000,
      "21K": 21097.5,
      "42K": 42195,
    });
  });
});

describe("GoalInputSchema", () => {
  it("accepts a finish goal with an optional event", () => {
    const parsed = GoalInputSchema.safeParse({
      distanceCode: "42K",
      goalType: "FINISH",
      eventName: "Bangsaen42",
      eventDate: "2026-11-15",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires target time if and only if target-time type", () => {
    expect(
      GoalInputSchema.safeParse({
        distanceCode: "10K",
        goalType: "TARGET_TIME",
      }).success,
    ).toBe(false);
    expect(
      GoalInputSchema.safeParse({
        distanceCode: "10K",
        goalType: "TARGET_TIME",
        targetTimeSec: 3000,
      }).success,
    ).toBe(true);
    expect(
      GoalInputSchema.safeParse({
        distanceCode: "10K",
        goalType: "FINISH",
        targetTimeSec: 3000,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown distances and bad dates", () => {
    expect(
      GoalInputSchema.safeParse({
        distanceCode: "15K",
        goalType: "FINISH",
      }).success,
    ).toBe(false);
    expect(
      GoalInputSchema.safeParse({
        distanceCode: "5K",
        goalType: "FINISH",
        eventDate: "15-11-2026",
      }).success,
    ).toBe(false);
  });
});

describe("targetPaceSecPerKm", () => {
  it("divides target time by exact kilometers (§8)", () => {
    // 2:00 half = 120 min / 21.0975 km ≈ 341.3 s/km.
    expect(targetPaceSecPerKm(21097.5, 7200)).toBeCloseTo(341.3, 1);
  });
});
