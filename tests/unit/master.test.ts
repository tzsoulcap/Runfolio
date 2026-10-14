import { describe, expect, it } from "vitest";

import { RUNNING_MASTERS, STRENGTH_MASTERS } from "@/lib/db/seed-data";
import {
  ExerciseDoseSchema,
  IntensityTargetSchema,
  RunningRepeatSchema,
  RunningWorkoutMasterSchema,
  StepTargetSchema,
  StrengthExerciseMasterSchema,
  StrengthPrescriptionSchema,
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

describe("RunningRepeatSchema (§11)", () => {
  const work = {
    kind: "STEP",
    phase: "WORK",
    target: { kind: "DISTANCE", distanceM: 800 },
    intensity: { kind: "NONE" },
  } as const;
  const recovery = {
    kind: "STEP",
    phase: "RECOVERY",
    target: { kind: "DURATION", durationSec: 120 },
    intensity: { kind: "NONE" },
  } as const;

  it("accepts a repeat ending in recovery without final recovery", () => {
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: false,
        steps: [work, recovery],
      }).success,
    ).toBe(true);
  });

  it("rejects skipping final recovery unless the last step is RECOVERY", () => {
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: false,
        steps: [work],
      }).success,
    ).toBe(false);
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: true,
        steps: [work],
      }).success,
    ).toBe(true);
  });

  it("rejects nested repeats, empty steps, and non-positive counts", () => {
    const nested = {
      kind: "REPEAT",
      repeatCount: 2,
      includeFinalRecovery: true,
      steps: [work],
    };
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: true,
        steps: [nested],
      }).success,
    ).toBe(false);
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: true,
        steps: [],
      }).success,
    ).toBe(false);
    expect(
      RunningRepeatSchema.safeParse({
        kind: "REPEAT",
        repeatCount: 0,
        includeFinalRecovery: true,
        steps: [work],
      }).success,
    ).toBe(false);
  });
});

describe("StepTargetSchema (§11)", () => {
  it("requires positive distance/duration and non-empty OPEN instruction", () => {
    expect(
      StepTargetSchema.safeParse({ kind: "DISTANCE", distanceM: 0 }).success,
    ).toBe(false);
    expect(
      StepTargetSchema.safeParse({ kind: "DURATION", durationSec: -5 }).success,
    ).toBe(false);
    expect(
      StepTargetSchema.safeParse({ kind: "OPEN", instruction: "" }).success,
    ).toBe(false);
    expect(
      StepTargetSchema.safeParse({ kind: "OPEN", instruction: "เดินกลับ" }).success,
    ).toBe(true);
  });
});

describe("IntensityTargetSchema (§11)", () => {
  it("orders zones and paces, and requires an effort label", () => {
    expect(
      IntensityTargetSchema.safeParse({ kind: "NONE" }).success,
    ).toBe(true);
    expect(
      IntensityTargetSchema.safeParse({ kind: "HR_ZONE", zoneMin: 2, zoneMax: 4 })
        .success,
    ).toBe(true);
    expect(
      IntensityTargetSchema.safeParse({ kind: "HR_ZONE", zoneMin: 4, zoneMax: 2 })
        .success,
    ).toBe(false);
    expect(
      IntensityTargetSchema.safeParse({
        kind: "PACE",
        fastSecPerKm: 360,
        slowSecPerKm: 400,
      }).success,
    ).toBe(true);
    expect(
      IntensityTargetSchema.safeParse({
        kind: "PACE",
        fastSecPerKm: 400,
        slowSecPerKm: 360,
      }).success,
    ).toBe(false);
    expect(
      IntensityTargetSchema.safeParse({ kind: "EFFORT", label: "" }).success,
    ).toBe(false);
  });
});

describe("strength exercise masters", () => {
  it("has all 16 codes", () => {
    expect(STRENGTH_MASTERS).toHaveLength(16);
    const codes = new Set(STRENGTH_MASTERS.map((m) => m.code));
    expect(codes.size).toBe(16);
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

  // §9 default table pin: measurement / count mode / dose per code.
  it("all 16 defaults match the §9 table", () => {
    const expected: Record<string, Record<string, number | string | null>> = {
      BULGARIAN_SPLIT_SQUAT: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
      },
      SL_RDL: { measurement: "REPS", sets: 3, reps: 12, countMode: "PER_SIDE" },
      WALKING_LUNGES: {
        measurement: "REPS",
        sets: 3,
        reps: 20,
        countMode: "TOTAL_ALTERNATING",
      },
      STEP_UPS: {
        measurement: "REPS",
        sets: 3,
        reps: 12,
        countMode: "PER_SIDE",
      },
      GLUTE_BRIDGE: {
        measurement: "REPS",
        sets: 3,
        reps: 15,
        countMode: "TOTAL",
      },
      CLAMSHELL: {
        measurement: "REPS",
        sets: 3,
        reps: 20,
        countMode: "PER_SIDE",
      },
      LATERAL_BAND_WALK: {
        measurement: "REPS",
        sets: 3,
        reps: 15,
        countMode: "PER_DIRECTION",
      },
      STANDING_CALF_RAISE: {
        measurement: "REPS",
        sets: 3,
        reps: 20,
        countMode: "TOTAL",
      },
      SEATED_CALF_RAISE: {
        measurement: "REPS",
        sets: 3,
        reps: 15,
        countMode: "TOTAL",
      },
      TIBIALIS_RAISE: {
        measurement: "REPS",
        sets: 3,
        reps: 20,
        countMode: "TOTAL",
      },
      PLANK: { measurement: "TIME", sets: 3, durationSec: 45, countMode: "TOTAL" },
      SIDE_PLANK: {
        measurement: "TIME",
        sets: 3,
        durationSec: 30,
        countMode: "PER_SIDE",
      },
      DEAD_BUG: {
        measurement: "REPS",
        sets: 3,
        reps: 12,
        countMode: "TOTAL_ALTERNATING",
      },
      BIRD_DOG: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
      },
      REVERSE_LUNGE_TO_KNEE_DRIVE: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
        loadKg: 0,
      },
      SINGLE_ARM_DUMBBELL_ROW: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
        loadKg: null,
      },
    };
    expect(Object.keys(expected)).toHaveLength(16);
    for (const m of STRENGTH_MASTERS) {
      expect(
        m.defaultPrescription,
        `${m.code} default differs from §9`,
      ).toMatchObject(expected[m.code] ?? {});
    }
  });
});

describe("ExerciseDoseSchema (§11)", () => {
  it("REPS must not carry durationSec; TIME must not carry reps", () => {
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "REPS",
        reps: 10,
        durationSec: 30,
        countMode: "TOTAL",
      }).success,
    ).toBe(false);
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "TIME",
        durationSec: 45,
        reps: 10,
        countMode: "TOTAL",
      }).success,
    ).toBe(false);
  });

  it("TIME allows only TOTAL and PER_SIDE count modes", () => {
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "TIME",
        durationSec: 45,
        countMode: "TOTAL_ALTERNATING",
      }).success,
    ).toBe(false);
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "TIME",
        durationSec: 45,
        countMode: "PER_DIRECTION",
      }).success,
    ).toBe(false);
    for (const countMode of ["TOTAL", "PER_SIDE"] as const) {
      expect(
        ExerciseDoseSchema.safeParse({
          measurement: "TIME",
          durationSec: 45,
          countMode,
        }).success,
      ).toBe(true);
    }
  });

  it("requires positive integer reps and positive duration", () => {
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "REPS",
        reps: 0,
        countMode: "TOTAL",
      }).success,
    ).toBe(false);
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "REPS",
        reps: 10.5,
        countMode: "TOTAL",
      }).success,
    ).toBe(false);
    expect(
      ExerciseDoseSchema.safeParse({
        measurement: "TIME",
        durationSec: -5,
        countMode: "TOTAL",
      }).success,
    ).toBe(false);
  });
});

describe("StrengthPrescriptionSchema (§11)", () => {
  it("loadKg 0 means bodyweight, null means unrecorded, negative rejected", () => {
    const base = {
      measurement: "REPS",
      reps: 10,
      countMode: "TOTAL",
      sets: 3,
    } as const;
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, loadKg: 0 }).success,
    ).toBe(true);
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, loadKg: null }).success,
    ).toBe(true);
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, loadKg: -2 }).success,
    ).toBe(false);
  });

  it("requires a positive integer set count and positive rest", () => {
    const base = {
      measurement: "REPS",
      reps: 10,
      countMode: "TOTAL",
      loadKg: 0,
    } as const;
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, sets: 0 }).success,
    ).toBe(false);
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, sets: 3, restSec: 0 })
        .success,
    ).toBe(false);
    expect(
      StrengthPrescriptionSchema.safeParse({ ...base, sets: 3, restSec: 60 })
        .success,
    ).toBe(true);
  });
});
