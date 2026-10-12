import { z } from "zod";

import {
  IntensityTargetSchema,
  NonRestWorkoutCodeSchema,
  RunningTargetSchema,
  StrengthPrescriptionSchema,
} from "./master";
import { PLANNED_START_TIME_PATTERN } from "./plan";

// Week template payload (§5, §10): a tree of days 0–6 with plan content.
// No IDs, no logs, no skipped state — applying always creates SCHEDULED
// items with fresh IDs.
const TemplateRunningItemSchema = z.object({
  activityType: z.literal("RUNNING"),
  runningWorkoutCode: NonRestWorkoutCodeSchema,
  runningTarget: RunningTargetSchema,
  intensityTarget: IntensityTargetSchema,
  raceGoalId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  plannedStartTime: z
    .string()
    .regex(PLANNED_START_TIME_PATTERN, "expected HH:mm")
    .optional(),
  note: z.string().max(2000).optional(),
});

const TemplateStrengthItemSchema = z.object({
  activityType: z.literal("STRENGTH"),
  title: z.string().trim().min(1).max(120).optional(),
  plannedStartTime: z
    .string()
    .regex(PLANNED_START_TIME_PATTERN, "expected HH:mm")
    .optional(),
  note: z.string().max(2000).optional(),
  exercises: z
    .array(
      z.object({
        exerciseCode: z.string().min(1),
        variant: z.string().min(1),
        prescription: StrengthPrescriptionSchema,
      }),
    )
    .min(1),
});

const TemplateDaySchema = z
  .object({
    dayIndex: z.number().int().min(0).max(6),
    isRestDay: z.boolean(),
    note: z.string().max(2000).optional(),
    items: z.array(
      z.union([TemplateRunningItemSchema, TemplateStrengthItemSchema]),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.isRestDay && v.items.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "rest days carry no items",
      });
    }
  });

export const TemplatePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    days: z.array(TemplateDaySchema).length(7),
  })
  .superRefine((v, ctx) => {
    const indexes = v.days.map((d) => d.dayIndex).sort();
    if (indexes.join(",") !== "0,1,2,3,4,5,6") {
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "days must cover indexes 0-6 exactly once",
      });
    }
  });

export type TemplatePayload = z.infer<typeof TemplatePayloadSchema>;
export type TemplateDay = z.infer<typeof TemplateDaySchema>;

// List-row counts from a stored payload (tolerant of unknown shapes).
export function summarizeTemplatePayload(payload: unknown): {
  itemCount: number;
  restCount: number;
} {
  const days = (payload as { days?: unknown })?.days;
  if (!Array.isArray(days)) return { itemCount: 0, restCount: 0 };
  let itemCount = 0;
  let restCount = 0;
  for (const day of days) {
    const d = day as { isRestDay?: unknown; items?: unknown };
    if (d?.isRestDay === true) restCount += 1;
    if (Array.isArray(d?.items)) itemCount += d.items.length;
  }
  return { itemCount, restCount };
}
