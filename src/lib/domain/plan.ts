import { z } from "zod";

import {
  IntensityTargetSchema,
  NonRestWorkoutCodeSchema,
  RunningTargetSchema,
} from "./master";
import { DateOnlySchema } from "./week";

// Validated plan draft (§5, §11, §16 addPlanItem). T03 sends RUNNING with
// DISTANCE/DURATION targets; STRUCTURED arrives with the T05 form.
export const PlanDraftSchema = z.object({
  date: DateOnlySchema,
  activityType: z.literal("RUNNING"),
  runningWorkoutCode: NonRestWorkoutCodeSchema.refine(
    (c) => c !== "RACE_DAY",
    "RACE_DAY plans need a goal link (T11)",
  ),
  runningTarget: RunningTargetSchema,
  intensityTarget: IntensityTargetSchema.default({ kind: "NONE" }),
  plannedStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm")
    .optional(),
  note: z.string().max(2000).optional(),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

// Display status of a plan item, derived on read (§5). Completed/Partial come
// from the linked active log; Missed is computed, never stored.
export type DerivedPlanStatus =
  | "PLANNED"
  | "COMPLETED"
  | "PARTIAL"
  | "SKIPPED"
  | "MISSED";

export function derivePlanStatus(
  item: { planState: string },
  log: { outcome: string } | null,
  date: string,
  today: string,
): DerivedPlanStatus {
  if (log?.outcome === "COMPLETED") return "COMPLETED";
  if (log?.outcome === "PARTIAL") return "PARTIAL";
  if (item.planState === "SKIPPED") return "SKIPPED";
  if (date < today) return "MISSED";
  return "PLANNED";
}
