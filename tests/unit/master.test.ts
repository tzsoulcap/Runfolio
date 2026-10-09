import { describe, expect, it } from "vitest";

import { RUNNING_MASTERS, STRENGTH_MASTERS } from "@/lib/db/seed-data";
import {
  RunningWorkoutMasterSchema,
  StrengthExerciseMasterSchema,
} from "@/lib/domain/master";

describe("running workout masters", () => {
  it("has all 10 codes including REST", () => {
    const codes = RUNNING_MASTERS.map((m) => m.code).sort();
    expect(codes).toEqual(
      [
        "EASY_RUN",
        "FARTLEK",
        "HILL_REPEAT",
        "INTERVAL",
        "LONG_RUN",
        "RACE_DAY",
        "RECOVERY_RUN",
        "REST",
        "STRIDES",
        "TEMPO",
      ].sort(),
    );
  });

  it("every master validates against the schema", () => {
    for (const m of RUNNING_MASTERS) {
      const result = RunningWorkoutMasterSchema.safeParse(m);
      expect(result.success, JSON.stringify(result.error)).toBe(true);
    }
  });

  it("INTERVAL default is 5x800m with 120s jog recovery and no final recovery", () => {
    const interval = RUNNING_MASTERS.find((m) => m.code === "INTERVAL");
    expect(interval?.defaultTarget).toEqual({
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
              intensity: { kind: "EFFORT", label: "Jog recovery" },
            },
          ],
        },
      ],
    });
  });

  it("FARTLEK default totals 30 minutes including final recovery", () => {
    const fartlek = RUNNING_MASTERS.find((m) => m.code === "FARTLEK");
    const target = fartlek?.defaultTarget;
    if (target?.kind !== "STRUCTURED") throw new Error("not structured");
    const repeat = target.steps[0];
    if (repeat?.kind !== "REPEAT") throw new Error("not a repeat");
    expect(repeat.includeFinalRecovery).toBe(true);
    const work = repeat.steps[0];
    const recovery = repeat.steps[1];
    if (
      work?.kind !== "STEP" ||
      work.target.kind !== "DURATION" ||
      recovery?.kind !== "STEP" ||
      recovery.target.kind !== "DURATION"
    ) {
      throw new Error("unexpected step shapes");
    }
    const total =
      repeat.repeatCount * (work.target.durationSec + recovery.target.durationSec);
    expect(total).toBe(1800);
  });

  it("RACE_DAY and REST have null defaults (no hardcoded distance)", () => {
    expect(
      RUNNING_MASTERS.find((m) => m.code === "RACE_DAY")?.defaultTarget,
    ).toBeNull();
    expect(RUNNING_MASTERS.find((m) => m.code === "REST")?.defaultTarget).toBeNull();
  });

  it("TEMPO keeps zone guidance as text, not a zone range", () => {
    const tempo = RUNNING_MASTERS.find((m) => m.code === "TEMPO");
    expect(tempo?.zoneMin).toBeUndefined();
    expect(tempo?.zoneMax).toBeUndefined();
    expect(tempo?.guidance).toMatch(/Z3/);
  });
});

describe("strength exercise masters", () => {
  it("has all 14 codes", () => {
    expect(STRENGTH_MASTERS).toHaveLength(14);
    const codes = new Set(STRENGTH_MASTERS.map((m) => m.code));
    expect(codes.size).toBe(14);
  });

  it("every master validates against the schema", () => {
    for (const m of STRENGTH_MASTERS) {
      const result = StrengthExerciseMasterSchema.safeParse(m);
      expect(result.success, JSON.stringify(result.error)).toBe(true);
    }
  });

  it("WALKING_LUNGES counts alternating total, not per side", () => {
    const lunges = STRENGTH_MASTERS.find((m) => m.code === "WALKING_LUNGES");
    expect(lunges?.defaultPrescription).toMatchObject({
      measurement: "REPS",
      sets: 3,
      reps: 20,
      countMode: "TOTAL_ALTERNATING",
    });
    expect(lunges?.repLabel).toBe("STEPS");
  });

  it("planks are TIME-based with no reps", () => {
    const plank = STRENGTH_MASTERS.find((m) => m.code === "PLANK");
    expect(plank?.defaultPrescription).toMatchObject({
      measurement: "TIME",
      durationSec: 45,
      countMode: "TOTAL",
    });
    expect(plank?.defaultPrescription).not.toHaveProperty("reps");
    const sidePlank = STRENGTH_MASTERS.find((m) => m.code === "SIDE_PLANK");
    expect(sidePlank?.defaultPrescription).toMatchObject({
      measurement: "TIME",
      durationSec: 30,
      countMode: "PER_SIDE",
    });
  });

  it("LATERAL_BAND_WALK counts per direction in steps", () => {
    const walk = STRENGTH_MASTERS.find((m) => m.code === "LATERAL_BAND_WALK");
    expect(walk?.defaultPrescription).toMatchObject({
      measurement: "REPS",
      sets: 3,
      reps: 15,
      countMode: "PER_DIRECTION",
    });
    expect(walk?.repLabel).toBe("STEPS");
  });
});
