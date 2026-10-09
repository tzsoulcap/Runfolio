import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/services/errors";
import { RunningLogInputSchema, assertNotFuture } from "@/lib/domain/log";

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
