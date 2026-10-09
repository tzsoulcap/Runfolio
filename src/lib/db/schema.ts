import { desc, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  IntensityTarget,
  RunningTarget,
  StrengthPrescription,
} from "@/lib/domain/master";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

const deletedAt = timestamp("deleted_at", {
  withTimezone: true,
  mode: "date",
});

// Decimal meters / kilos; values like 21097.5 are exactly representable.
const decimal2 = (name: string) =>
  numeric(name, { precision: 10, scale: 2, mode: "number" });

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name"),
  timezone: text("timezone").default("Asia/Bangkok").notNull(),
  locale: text("locale").default("th-TH").notNull(),
  ...timestamps,
});
export type UserProfile = typeof userProfiles.$inferSelect;

export const runningWorkoutMasters = pgTable("running_workout_masters", {
  code: text("code").primaryKey(),
  nameTh: text("name_th").notNull(),
  nameEn: text("name_en").notNull(),
  activityType: text("activity_type").notNull(),
  purpose: text("purpose").notNull(),
  zoneMin: integer("zone_min"),
  zoneMax: integer("zone_max"),
  guidance: text("guidance").notNull(),
  defaultTarget: jsonb("default_target").$type<RunningTarget | null>(),
  hint: text("hint"),
  seedVersion: integer("seed_version").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
},
  (t) => [
    check(
      "running_masters_activity",
      sql`${t.activityType} IN ('RUNNING', 'REST')`,
    ),
    check(
      "running_masters_purpose",
      sql`${t.purpose} IN ('RECOVERY', 'AEROBIC_BASE', 'ENDURANCE', 'QUALITY_SPEED', 'POWER_FORM', 'NEUROMUSCULAR', 'COMPETITION')`,
    ),
  ],
);

export const strengthExerciseMasters = pgTable("strength_exercise_masters", {
  code: text("code").primaryKey(),
  nameTh: text("name_th").notNull(),
  nameEn: text("name_en").notNull(),
  muscleGroup: text("muscle_group").notNull(),
  isUnilateral: boolean("is_unilateral").notNull(),
  defaultVariant: text("default_variant").notNull(),
  defaultPrescription:
    jsonb("default_prescription").$type<StrengthPrescription>().notNull(),
  repLabel: text("rep_label").notNull(),
  guidance: text("guidance").notNull(),
  hint: text("hint"),
  seedVersion: integer("seed_version").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
},
  (t) => [
    check(
      "strength_masters_muscle",
      sql`${t.muscleGroup} IN ('SINGLE_LEG', 'GLUTES_HIPS', 'CALVES_ANKLES', 'CORE')`,
    ),
    check("strength_masters_rep_label", sql`${t.repLabel} IN ('REPS', 'STEPS')`),
  ],
);

export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
    title: text("title"),
    note: text("note"),
    revision: integer("revision").default(1).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("weekly_plans_user_week").on(t.userId, t.weekStartDate),
    check(
      "weekly_plans_monday",
      sql`EXTRACT(ISODOW FROM ${t.weekStartDate}) = 1`,
    ),
  ],
);

export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weeklyPlanId: uuid("weekly_plan_id")
      .references(() => weeklyPlans.id, { onDelete: "restrict" })
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    isRestDay: boolean("is_rest_day").default(false).notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [unique("daily_plans_week_date").on(t.weeklyPlanId, t.date)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dailyPlanId: uuid("daily_plan_id")
      .references(() => dailyPlans.id, { onDelete: "restrict" })
      .notNull(),
    activityType: text("activity_type").notNull(),
    runningWorkoutCode: text("running_workout_code").references(
      () => runningWorkoutMasters.code,
      { onDelete: "restrict" },
    ),
    title: text("title").notNull(),
    plannedStartTime: text("planned_start_time"),
    runningTarget: jsonb("running_target").$type<RunningTarget>(),
    intensityTarget: jsonb("intensity_target").$type<IntensityTarget>(),
    note: text("note"),
    sortOrder: integer("sort_order").default(0).notNull(),
    planState: text("plan_state").default("SCHEDULED").notNull(),
    skipReason: text("skip_reason"),
    masterSnapshot: jsonb("master_snapshot").$type<Record<string, unknown>>(),
    deletedAt,
    ...timestamps,
  },
  (t) => [
    index("plan_items_day_order").on(t.dailyPlanId, t.sortOrder),
    check(
      "plan_items_state",
      sql`${t.planState} IN ('SCHEDULED', 'SKIPPED')`,
    ),
    check(
      "plan_items_activity",
      sql`${t.activityType} IN ('RUNNING', 'STRENGTH')`,
    ),
  ],
);

export const plannedStrengthExercises = pgTable(
  "planned_strength_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planItemId: uuid("plan_item_id")
      .references(() => planItems.id, { onDelete: "restrict" })
      .notNull(),
    exerciseCode: text("exercise_code")
      .references(() => strengthExerciseMasters.code, { onDelete: "restrict" })
      .notNull(),
    variant: text("variant").notNull(),
    prescription: jsonb("prescription").$type<StrengthPrescription>().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    masterSnapshot: jsonb("master_snapshot").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("planned_exercises_item_order").on(t.planItemId, t.sortOrder)],
);

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    clientMutationId: text("client_mutation_id").notNull(),
    planItemId: uuid("plan_item_id").references(() => planItems.id, {
      onDelete: "restrict",
    }),
    activityType: text("activity_type").notNull(),
    runningWorkoutCode: text("running_workout_code").references(
      () => runningWorkoutMasters.code,
      { onDelete: "restrict" },
    ),
    performedDate: date("performed_date", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    outcome: text("outcome").default("COMPLETED").notNull(),
    distanceM: decimal2("distance_m"),
    movingDurationSec: integer("moving_duration_sec"),
    elapsedDurationSec: integer("elapsed_duration_sec"),
    sessionDurationSec: integer("session_duration_sec"),
    avgHeartRate: integer("avg_heart_rate"),
    rpe: integer("rpe"),
    feeling: text("feeling"),
    note: text("note"),
    plannedSnapshot: jsonb("planned_snapshot").$type<Record<string, unknown>>(),
    masterSnapshot: jsonb("master_snapshot").$type<Record<string, unknown>>(),
    deletedAt,
    ...timestamps,
  },
  (t) => [
    unique("workout_logs_user_mutation").on(t.userId, t.clientMutationId),
    uniqueIndex("workout_logs_one_active_per_plan")
      .on(t.planItemId)
      .where(sql`${t.planItemId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index("workout_logs_user_date").on(t.userId, desc(t.performedDate)),
    index("workout_logs_user_activity_date").on(
      t.userId,
      t.activityType,
      t.performedDate,
    ),
    check(
      "workout_logs_outcome",
      sql`${t.outcome} IN ('COMPLETED', 'PARTIAL')`,
    ),
    check(
      "workout_logs_activity",
      sql`${t.activityType} IN ('RUNNING', 'STRENGTH')`,
    ),
  ],
);

export const raceGoals = pgTable(
  "race_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    distanceCode: text("distance_code").notNull(),
    distanceM: decimal2("distance_m").notNull(),
    goalType: text("goal_type").notNull(),
    eventName: text("event_name"),
    eventDate: date("event_date", { mode: "string" }),
    targetTimeSec: integer("target_time_sec"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    status: text("status").default("ACTIVE").notNull(),
    resultWorkoutLogId: uuid("result_workout_log_id").references(
      () => workoutLogs.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (t) => [
    index("race_goals_user").on(t.userId),
    uniqueIndex("race_goals_one_active_primary")
      .on(t.userId)
      .where(sql`${t.status} = 'ACTIVE' AND ${t.isPrimary} = true`),
    check(
      "race_goals_target_time",
      sql`${t.targetTimeSec} IS NULL OR ${t.targetTimeSec} > 0`,
    ),
    check(
      "race_goals_status",
      sql`${t.status} IN ('ACTIVE', 'ACHIEVED', 'ARCHIVED')`,
    ),
    check("race_goals_type", sql`${t.goalType} IN ('FINISH', 'TARGET_TIME')`),
  ],
);

export const actualStrengthExercises = pgTable("actual_strength_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutLogId: uuid("workout_log_id")
    .references(() => workoutLogs.id, { onDelete: "restrict" })
    .notNull(),
  plannedExerciseId: uuid("planned_exercise_id").references(
    () => plannedStrengthExercises.id,
    { onDelete: "restrict" },
  ),
  exerciseCode: text("exercise_code")
    .references(() => strengthExerciseMasters.code, { onDelete: "restrict" })
    .notNull(),
  variant: text("variant"),
  countMode: text("count_mode").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  masterSnapshot: jsonb("master_snapshot").$type<Record<string, unknown>>(),
  ...timestamps,
},
  (t) => [
    check(
      "actual_exercises_count_mode",
      sql`${t.countMode} IN ('TOTAL', 'PER_SIDE', 'TOTAL_ALTERNATING', 'PER_DIRECTION')`,
    ),
  ],
);

export const actualStrengthSets = pgTable(
  "actual_strength_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actualExerciseId: uuid("actual_exercise_id")
      .references(() => actualStrengthExercises.id, { onDelete: "restrict" })
      .notNull(),
    setIndex: integer("set_index").notNull(),
    side: text("side").notNull(),
    measurement: text("measurement").notNull(),
    reps: integer("reps"),
    durationSec: integer("duration_sec"),
    loadKg: decimal2("load_kg"),
    note: text("note"),
  },
  (t) => [
    unique("actual_sets_exercise_index_side").on(
      t.actualExerciseId,
      t.setIndex,
      t.side,
    ),
    check(
      "actual_sets_side",
      sql`${t.side} IN ('BOTH', 'LEFT', 'RIGHT', 'ALTERNATING', 'OUTBOUND', 'RETURN')`,
    ),
    check("actual_sets_measurement", sql`${t.measurement} IN ('REPS', 'TIME')`),
  ],
);

export const actualRunningSplits = pgTable(
  "actual_running_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutLogId: uuid("workout_log_id")
      .references(() => workoutLogs.id, { onDelete: "restrict" })
      .notNull(),
    splitIndex: integer("split_index").notNull(),
    distanceM: decimal2("distance_m"),
    durationSec: integer("duration_sec"),
  },
  (t) => [
    unique("actual_splits_log_index").on(t.workoutLogId, t.splitIndex),
    check(
      "actual_splits_value",
      sql`${t.distanceM} IS NOT NULL OR ${t.durationSec} IS NOT NULL`,
    ),
  ],
);

export const planTemplates = pgTable(
  "plan_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    schemaVersion: integer("schema_version").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (t) => [index("plan_templates_user").on(t.userId)],
);
