import { z } from "zod";

import { DateOnlySchema } from "./week";

// Standard product distances (§8). Labels may say 21K/42K, but pace math
// always uses these exact meters.
export const GOAL_DISTANCES = {
  "5K": 5000,
  "10K": 10000,
  "21K": 21097.5,
  "42K": 42195,
} as const;
export type GoalDistanceCode = keyof typeof GOAL_DISTANCES;

export const GoalTypeSchema = z.enum(["FINISH", "TARGET_TIME"]);
export type GoalType = z.infer<typeof GoalTypeSchema>;

export const GoalStatusSchema = z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]);

export const GoalInputSchema = z
  .object({
    distanceCode: z.enum(["5K", "10K", "21K", "42K"]),
    goalType: GoalTypeSchema,
    eventName: z.string().trim().min(1).max(200).optional(),
    eventDate: DateOnlySchema.optional(),
    targetTimeSec: z.number().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.goalType === "TARGET_TIME" && v.targetTimeSec === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetTimeSec"],
        message: "target time is required for target-time goals",
      });
    }
    if (v.goalType === "FINISH" && v.targetTimeSec !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetTimeSec"],
        message: "finish goals must not carry a target time",
      });
    }
  });
export type GoalInput = z.infer<typeof GoalInputSchema>;

// Target pace from the user's own goal (§8). A plain number: no claim the
// runner is ready, no readiness percentage derived from mileage.
export function targetPaceSecPerKm(
  distanceM: number,
  targetTimeSec: number,
): number {
  return targetTimeSec / (distanceM / 1000);
}
