import { z } from "zod";

import { ServiceError } from "@/lib/services/errors";

import { CountModeSchema, NonRestWorkoutCodeSchema } from "./master";
import { DateOnlySchema } from "./week";

// Actual running data (§6, §16 saveWorkoutLog). Totals come from these fields,
// never derived from splits. T03 covers from-plan and off-plan RUNNING logs.
const SplitInputSchema = z
  .object({
    distanceM: z.number().positive().optional(),
    durationSec: z.number().int().positive().optional(),
  })
  .refine(
    (v) => v.distanceM !== undefined || v.durationSec !== undefined,
    "a split needs distance or time",
  );

export const RunningLogInputSchema = z
  .object({
    performedDate: DateOnlySchema,
    runningWorkoutCode: NonRestWorkoutCodeSchema,
    distanceM: z.number().positive(),
    movingDurationSec: z.number().int().positive(),
    elapsedDurationSec: z.number().int().positive().optional(),
    outcome: z.enum(["COMPLETED", "PARTIAL"]).default("COMPLETED"),
    avgHeartRate: z.number().int().positive().optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm")
      .optional(),
    splits: z.array(SplitInputSchema).optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    feeling: z.string().max(100).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.elapsedDurationSec === undefined ||
      v.elapsedDurationSec >= v.movingDurationSec,
    "elapsed time must not be less than moving time",
  );
export type RunningLogInput = z.infer<typeof RunningLogInputSchema>;

export const SIDES_BY_COUNT_MODE = {
  TOTAL: ["BOTH"],
  PER_SIDE: ["LEFT", "RIGHT"],
  TOTAL_ALTERNATING: ["ALTERNATING"],
  PER_DIRECTION: ["OUTBOUND", "RETURN"],
} as const;

// One actual set (§6, §11): measurement is the set's shape (always known),
// reps/durationSec is its result. A skipped set keeps its shape with no
// result; the log needs ≥1 set with a result.
const ActualSetInputSchema = z
  .object({
    setNumber: z.number().int().min(1),
    side: z.enum(["BOTH", "LEFT", "RIGHT", "ALTERNATING", "OUTBOUND", "RETURN"]),
    measurement: z.enum(["REPS", "TIME"]),
    reps: z.number().int().positive().optional(),
    durationSec: z.number().int().positive().optional(),
    loadKg: z.number().min(0).nullable().optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.measurement === "REPS" && v.durationSec !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["durationSec"],
        message: "REPS sets must not carry seconds",
      });
    }
    if (v.measurement === "TIME" && v.reps !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reps"],
        message: "TIME sets must not carry reps",
      });
    }
  });

const ActualExerciseInputSchema = z
  .object({
    plannedExerciseId: z.string().uuid().optional(),
    exerciseCode: z.string().min(1),
    variant: z.string().min(1).optional(),
    countMode: CountModeSchema,
    sets: z.array(ActualSetInputSchema).min(1),
  })
  .superRefine((v, ctx) => {
    const allowed = SIDES_BY_COUNT_MODE[v.countMode] as readonly string[];
    for (const [i, set] of v.sets.entries()) {
      if (!allowed.includes(set.side)) {
        ctx.addIssue({
          code: "custom",
          path: ["sets", i, "side"],
          message: `${set.side} does not match ${v.countMode}`,
        });
      }
    }
    const seen = new Set(v.sets.map((s) => `${s.setNumber}:${s.side}`));
    if (seen.size !== v.sets.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sets"],
        message: "duplicate set number and side",
      });
    }
  });

// Actual strength data (§6, §16): ≥1 exercise and ≥1 set with a real result.
export const StrengthLogInputSchema = z
  .object({
    performedDate: DateOnlySchema,
    sessionDurationSec: z.number().int().positive().optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm")
      .optional(),
    outcome: z.enum(["COMPLETED", "PARTIAL"]).default("COMPLETED"),
    rpe: z.number().int().min(1).max(10).optional(),
    feeling: z.string().max(100).optional(),
    note: z.string().max(2000).optional(),
    exercises: z.array(ActualExerciseInputSchema).min(1),
  })
  .superRefine((v, ctx) => {
    const hasResult = v.exercises.some((e) =>
      e.sets.some((s) => s.reps !== undefined || s.durationSec !== undefined),
    );
    if (!hasResult) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises"],
        message: "need at least one set with an actual result",
      });
    }
  });
export type StrengthLogInput = z.infer<typeof StrengthLogInputSchema>;

// Backdate unlimited, future forbidden (§6). `today` is YYYY-MM-DD in the
// user's timezone, resolved server-side from their profile.
export function assertNotFuture(performedDate: string, today: string): void {
  if (performedDate > today) {
    throw new ServiceError(
      "VALIDATION",
      "performedDate must not be in the future",
    );
  }
}
