import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  dailyPlans,
  planItems,
  runningWorkoutMasters,
  userProfiles,
  weeklyPlans,
  workoutLogs,
} from "@/lib/db/schema";
import {
  assertNotFuture,
  RunningLogInputSchema,
} from "@/lib/domain/log";
import { todayInTimeZone } from "@/lib/domain/week";

import { ServiceError } from "./errors";

export async function saveWorkoutLog(
  userId: string,
  args: { clientMutationId: string; planItemId?: string; actual: unknown },
) {
  const parsed = RunningLogInputSchema.safeParse(args.actual);
  if (!parsed.success) {
    throw new ServiceError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "invalid log",
    );
  }
  if (!args.clientMutationId) {
    throw new ServiceError("VALIDATION", "clientMutationId is required");
  }
  const actual = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(workoutLogs)
        .where(
          and(
            eq(workoutLogs.userId, userId),
            eq(workoutLogs.clientMutationId, args.clientMutationId),
          ),
        )
        .limit(1);
      // Retry with the same id returns the original row as-is; never restores.
      if (existing) return { log: existing, deduped: true };

      const [profile] = await tx
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      assertNotFuture(
        actual.performedDate,
        todayInTimeZone(profile?.timezone ?? "Asia/Bangkok"),
      );

      const [master] = await tx
        .select()
        .from(runningWorkoutMasters)
        .where(eq(runningWorkoutMasters.code, actual.runningWorkoutCode))
        .limit(1);
      if (!master || !master.isActive) {
        throw new ServiceError("NOT_FOUND", "workout master not found");
      }

      let plannedSnapshot: Record<string, unknown> | null = null;
      if (args.planItemId) {
        // Lock the plan row and its week so a concurrent plan move/delete
        // cannot race this save (§13). Single week: no lock-order hazard.
        const [item] = await tx
          .select()
          .from(planItems)
          .where(
            and(
              eq(planItems.id, args.planItemId),
              isNull(planItems.deletedAt),
            ),
          )
          .limit(1)
          .for("update");
        if (!item) throw new ServiceError("NOT_FOUND", "plan not found");
        const [day] = await tx
          .select()
          .from(dailyPlans)
          .where(eq(dailyPlans.id, item.dailyPlanId))
          .limit(1);
        const [week] = day
          ? await tx
              .select()
              .from(weeklyPlans)
              .where(eq(weeklyPlans.id, day.weeklyPlanId))
              .limit(1)
              .for("update")
          : [];
        if (!day || !week || week.userId !== userId) {
          throw new ServiceError("NOT_FOUND", "plan not found");
        }
        if (item.activityType !== "RUNNING") {
          throw new ServiceError("CONFLICT", "plan is not a running session");
        }
        const [clash] = await tx
          .select()
          .from(workoutLogs)
          .where(
            and(
              eq(workoutLogs.planItemId, item.id),
              isNull(workoutLogs.deletedAt),
            ),
          )
          .limit(1);
        if (clash) {
          // Same mutation id, seen late (READ COMMITTED): our own retry.
          if (clash.clientMutationId === args.clientMutationId) {
            return { log: clash, deduped: true };
          }
          throw new ServiceError("CONFLICT", "plan already has an active log");
        }
        plannedSnapshot = {
          planItemId: item.id,
          date: day.date,
          title: item.title,
          runningWorkoutCode: item.runningWorkoutCode,
          runningTarget: item.runningTarget,
        };
        if (item.planState === "SKIPPED") {
          await tx
            .update(planItems)
            .set({ planState: "SCHEDULED", skipReason: null, updatedAt: new Date() })
            .where(eq(planItems.id, item.id));
        }
      }

      const [log] = await tx
        .insert(workoutLogs)
        .values({
          userId,
          clientMutationId: args.clientMutationId,
          planItemId: args.planItemId ?? null,
          activityType: "RUNNING",
          runningWorkoutCode: master.code,
          performedDate: actual.performedDate,
          outcome: actual.outcome,
          distanceM: actual.distanceM,
          movingDurationSec: actual.movingDurationSec,
          elapsedDurationSec: actual.elapsedDurationSec ?? null,
          rpe: actual.rpe ?? null,
          feeling: actual.feeling ?? null,
          note: actual.note ?? null,
          plannedSnapshot,
          masterSnapshot: {
            code: master.code,
            nameTh: master.nameTh,
            nameEn: master.nameEn,
          },
        })
        .returning();
      if (!log) throw new ServiceError("CONFLICT", "log insert failed");
      return { log, deduped: false };
    });
  } catch (err) {
    // A lost race surfaces as 23505 after our pre-checks passed: map it to
    // the shaped outcome (§16) instead of leaking a raw DB error.
    const pg = err as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
    } | null;
    if (pg && pg.code === "23505") {
      // A lost race on either unique index: same mutation id means our own
      // retry (dedupe), anything else is a genuine conflict.
      const [row] = await db
        .select()
        .from(workoutLogs)
        .where(
          and(
            eq(workoutLogs.userId, userId),
            eq(workoutLogs.clientMutationId, args.clientMutationId),
          ),
        )
        .limit(1);
      if (row) return { log: row, deduped: true };
      throw new ServiceError("CONFLICT", "already saved; refetch and retry");
    }
    throw err;
  }
}
