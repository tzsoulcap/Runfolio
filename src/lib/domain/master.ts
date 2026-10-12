import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives (§11)
// ---------------------------------------------------------------------------

export const HeartRateZoneSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type HeartRateZone = z.infer<typeof HeartRateZoneSchema>;

export const IntensityTargetSchema = z.union([
  z.object({ kind: z.literal("NONE") }),
  z
    .object({
      kind: z.literal("HR_ZONE"),
      zoneMin: HeartRateZoneSchema,
      zoneMax: HeartRateZoneSchema,
    })
    .refine((v) => v.zoneMin <= v.zoneMax, "zoneMin must not exceed zoneMax"),
  z
    .object({
      kind: z.literal("PACE"),
      fastSecPerKm: z.number().positive(),
      slowSecPerKm: z.number().positive(),
    })
    .refine(
      (v) => v.fastSecPerKm <= v.slowSecPerKm,
      "fastSecPerKm must not exceed slowSecPerKm",
    ),
  z.object({ kind: z.literal("EFFORT"), label: z.string().min(1) }),
]);
export type IntensityTarget = z.infer<typeof IntensityTargetSchema>;

// ---------------------------------------------------------------------------
// Structured running targets (§11)
// ---------------------------------------------------------------------------

export const StepTargetSchema = z.union([
  z.object({ kind: z.literal("DISTANCE"), distanceM: z.number().positive() }),
  z.object({ kind: z.literal("DURATION"), durationSec: z.number().positive() }),
  z.object({ kind: z.literal("OPEN"), instruction: z.string().min(1) }),
]);
export type StepTarget = z.infer<typeof StepTargetSchema>;

const RunningPhaseSchema = z.enum([
  "WARMUP",
  "WORK",
  "RECOVERY",
  "COOLDOWN",
  "STRIDES",
]);

export const RunningStepSchema = z.object({
  kind: z.literal("STEP"),
  phase: RunningPhaseSchema,
  target: StepTargetSchema,
  intensity: IntensityTargetSchema,
  note: z.string().optional(),
});
export type RunningStep = z.infer<typeof RunningStepSchema>;

// No nested repeats in v1: repeat steps are STEP-only by construction.
export const RunningRepeatSchema = z
  .object({
    kind: z.literal("REPEAT"),
    repeatCount: z.number().int().positive(),
    steps: z.array(RunningStepSchema).min(1),
    includeFinalRecovery: z.boolean(),
  })
  .refine(
    (v) =>
      v.includeFinalRecovery ||
      v.steps[v.steps.length - 1]?.phase === "RECOVERY",
    "includeFinalRecovery=false only when the last step is RECOVERY",
  );
export type RunningRepeat = z.infer<typeof RunningRepeatSchema>;

export const RunningTargetSchema = z.union([
  z.object({ kind: z.literal("DISTANCE"), distanceM: z.number().positive() }),
  z.object({ kind: z.literal("DURATION"), durationSec: z.number().positive() }),
  z.object({
    kind: z.literal("STRUCTURED"),
    steps: z.array(z.union([RunningStepSchema, RunningRepeatSchema])).min(1),
    estimatedTotalDistanceM: z.number().positive().optional(),
  }),
]);
export type RunningTarget = z.infer<typeof RunningTargetSchema>;

// ---------------------------------------------------------------------------
// Running workout master (§9, §11)
// ---------------------------------------------------------------------------

export const RunningWorkoutCodeSchema = z.enum([
  "REST",
  "RECOVERY_RUN",
  "EASY_RUN",
  "LONG_RUN",
  "TEMPO",
  "INTERVAL",
  "FARTLEK",
  "HILL_REPEAT",
  "STRIDES",
  "RACE_DAY",
]);
export type RunningWorkoutCode = z.infer<typeof RunningWorkoutCodeSchema>;

// Workout codes allowed as a session: everything except REST (§11).
// (Named for the type, not the bout — see CONTEXT.md "Session".)
export const NonRestWorkoutCodeSchema = z.enum([
  "RECOVERY_RUN",
  "EASY_RUN",
  "LONG_RUN",
  "TEMPO",
  "INTERVAL",
  "FARTLEK",
  "HILL_REPEAT",
  "STRIDES",
  "RACE_DAY",
]);
export type NonRestWorkoutCode = z.infer<typeof NonRestWorkoutCodeSchema>;

export const ActivityTypeSchema = z.enum([
  "RUNNING",
  "STRENGTH",
  "REST",
  "CROSS_TRAINING",
]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const WorkoutPurposeSchema = z.enum([
  "RECOVERY",
  "AEROBIC_BASE",
  "ENDURANCE",
  "QUALITY_SPEED",
  "POWER_FORM",
  "NEUROMUSCULAR",
  "COMPETITION",
]);
export type WorkoutPurpose = z.infer<typeof WorkoutPurposeSchema>;

export const RunningWorkoutMasterSchema = z
  .object({
    code: RunningWorkoutCodeSchema,
    nameTh: z.string().min(1),
    nameEn: z.string().min(1),
    activityType: z.enum(["RUNNING", "REST"]),
    purpose: WorkoutPurposeSchema,
    zoneMin: HeartRateZoneSchema.optional(),
    zoneMax: HeartRateZoneSchema.optional(),
    guidance: z.string().min(1),
    defaultTarget: RunningTargetSchema.nullable(),
    hint: z.string().optional(),
    seedVersion: z.number().int().positive(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .refine(
    (v) =>
      v.zoneMin === undefined ||
      v.zoneMax === undefined ||
      v.zoneMin <= v.zoneMax,
    "zoneMin must not exceed zoneMax",
  )
  .refine(
    (v) => (v.code === "REST") === (v.activityType === "REST"),
    "only REST has activityType REST",
  );
export type RunningWorkoutMaster = z.infer<typeof RunningWorkoutMasterSchema>;

// ---------------------------------------------------------------------------
// Strength exercise master (§9, §11)
// ---------------------------------------------------------------------------

export const MuscleGroupSchema = z.enum([
  "SINGLE_LEG",
  "GLUTES_HIPS",
  "CALVES_ANKLES",
  "CORE",
]);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

export const CountModeSchema = z.enum([
  "TOTAL",
  "PER_SIDE",
  "TOTAL_ALTERNATING",
  "PER_DIRECTION",
]);
export type CountMode = z.infer<typeof CountModeSchema>;

// Strict members: REPS must not carry durationSec, TIME must not carry reps.
export const ExerciseDoseSchema = z.union([
  z
    .object({
      measurement: z.literal("REPS"),
      reps: z.number().int().positive(),
      countMode: CountModeSchema,
    })
    .strict(),
  z
    .object({
      measurement: z.literal("TIME"),
      durationSec: z.number().positive(),
      countMode: z.enum(["TOTAL", "PER_SIDE"]),
    })
    .strict(),
]);
export type ExerciseDose = z.infer<typeof ExerciseDoseSchema>;

// Built as an explicit union, not ExerciseDoseSchema.and(...): intersection
// drops the members' strictness, and §11 forbids reps on TIME (and
// durationSec on REPS) in prescriptions too.
const prescriptionBase = {
  sets: z.number().int().positive(),
  loadKg: z.number().min(0).nullable(),
  restSec: z.number().positive().optional(),
};
export const StrengthPrescriptionSchema = z.discriminatedUnion("measurement", [
  z.strictObject({
    measurement: z.literal("REPS"),
    reps: z.number().int().positive(),
    countMode: CountModeSchema,
    ...prescriptionBase,
  }),
  z.strictObject({
    measurement: z.literal("TIME"),
    durationSec: z.number().positive(),
    countMode: z.enum(["TOTAL", "PER_SIDE"]),
    ...prescriptionBase,
  }),
]);
export type StrengthPrescription = z.infer<typeof StrengthPrescriptionSchema>;

export const StrengthExerciseMasterSchema = z.object({
  code: z.string().min(1),
  nameTh: z.string().min(1),
  nameEn: z.string().min(1),
  muscleGroup: MuscleGroupSchema,
  isUnilateral: z.boolean(),
  repLabel: z.enum(["REPS", "STEPS"]),
  defaultVariant: z.string().min(1),
  defaultPrescription: StrengthPrescriptionSchema,
  guidance: z.string().min(1),
  hint: z.string().optional(),
  seedVersion: z.number().int().positive(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type StrengthExerciseMaster = z.infer<typeof StrengthExerciseMasterSchema>;
