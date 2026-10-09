import { z } from "zod";

import { ServiceError } from "@/lib/services/errors";

import { NonRestWorkoutCodeSchema } from "./master";
import { DateOnlySchema } from "./week";

// Actual running data (§6, §16 saveWorkoutLog). Totals come from these fields,
// never derived from splits. T03 covers from-plan and off-plan RUNNING logs.
export const RunningLogInputSchema = z
  .object({
    performedDate: DateOnlySchema,
    runningWorkoutCode: NonRestWorkoutCodeSchema,
    distanceM: z.number().positive(),
    movingDurationSec: z.number().int().positive(),
    elapsedDurationSec: z.number().int().positive().optional(),
    outcome: z.enum(["COMPLETED", "PARTIAL"]).default("COMPLETED"),
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
