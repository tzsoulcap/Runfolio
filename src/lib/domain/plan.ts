import { z } from "zod";

import {
  IntensityTargetSchema,
  NonRestWorkoutCodeSchema,
  RunningTargetSchema,
} from "./master";
import { DateOnlySchema } from "./week";

// Validated plan draft (§5, §11, §16 addPlanItem). RACE_DAY carries a goal
// link and no typed target: the service pulls distance from the goal.
export const PlanDraftSchema = z
  .object({
    date: DateOnlySchema,
    activityType: z.literal("RUNNING"),
    runningWorkoutCode: NonRestWorkoutCodeSchema,
    runningTarget: RunningTargetSchema.optional(),
    intensityTarget: IntensityTargetSchema.default({ kind: "NONE" }),
    goalId: z.string().uuid("expected goal uuid").optional(),
    plannedStartTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm")
      .optional(),
    note: z.string().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    const isRace = v.runningWorkoutCode === "RACE_DAY";
    if (isRace && !v.goalId) {
      ctx.addIssue({
        code: "custom",
        path: ["goalId"],
        message: "RACE_DAY plans need a goal link",
      });
    }
    if (isRace && v.runningTarget) {
      ctx.addIssue({
        code: "custom",
        path: ["runningTarget"],
        message: "RACE_DAY distance comes from the goal, not typed input",
      });
    }
    if (!isRace && v.goalId) {
      ctx.addIssue({
        code: "custom",
        path: ["goalId"],
        message: "goalId is RACE_DAY-only",
      });
    }
    if (!isRace && !v.runningTarget) {
      ctx.addIssue({
        code: "custom",
        path: ["runningTarget"],
        message: "non-race plans need a target",
      });
    }
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
