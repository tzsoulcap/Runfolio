"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/session";
import { saveWorkoutLog } from "@/lib/services/logging";
import { ServiceError } from "@/lib/services/errors";
import { addPlanItem } from "@/lib/services/planner";

export type ActionResult =
  | { ok: true; revision?: number; logId?: string }
  | { ok: false; code: string; message: string };

function toResult(err: unknown): ActionResult {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case "VALIDATION":
        return { ok: false, code: err.code, message: "ข้อมูลไม่ถูกต้อง" };
      case "CONFLICT":
        return {
          ok: false,
          code: err.code,
          message: err.message.includes("rest day")
            ? "วันพักเพิ่มเซสชันไม่ได้"
            : err.message.includes("already has an active log")
              ? "แผนนี้บันทึกผลไปแล้ว"
              : "ข้อมูลเปลี่ยนไปแล้ว ลองใหม่อีกครั้ง",
        };
      case "NOT_FOUND":
        return { ok: false, code: err.code, message: "ไม่พบข้อมูล" };
      case "UNAUTHENTICATED":
        return {
          ok: false,
          code: err.code,
          message: "กรุณาเข้าสู่ระบบก่อน",
        };
      default:
        return { ok: false, code: err.code, message: "บันทึกไม่สำเร็จ" };
    }
  }
  return { ok: false, code: "UNKNOWN", message: "บันทึกไม่สำเร็จ ลองใหม่" };
}

export async function addPlanAction(input: {
  date: string;
  runningWorkoutCode: string;
  targetKind: "DISTANCE" | "DURATION";
  distanceKm?: number;
  durationMin?: number;
  plannedStartTime?: string;
  note?: string;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const draft = {
      date: input.date,
      activityType: "RUNNING" as const,
      runningWorkoutCode: input.runningWorkoutCode,
      runningTarget:
        input.targetKind === "DISTANCE"
          ? {
              kind: "DISTANCE" as const,
              distanceM: Math.round((input.distanceKm ?? 0) * 1000),
            }
          : {
              kind: "DURATION" as const,
              durationSec: Math.round((input.durationMin ?? 0) * 60),
            },
      intensityTarget: { kind: "NONE" as const },
      plannedStartTime:
        input.plannedStartTime && input.plannedStartTime.length > 0
          ? input.plannedStartTime
          : undefined,
      note: input.note && input.note.length > 0 ? input.note : undefined,
    };
    const { revision } = await addPlanItem(
      userId,
      draft,
      input.expectedRevision,
    );
    revalidatePath("/plan");
    revalidatePath("/");
    return { ok: true, revision };
  } catch (err) {
    return toResult(err);
  }
}

export async function saveLogAction(input: {
  clientMutationId: string;
  planItemId?: string;
  performedDate: string;
  runningWorkoutCode: string;
  distanceKm: number;
  hours: number;
  minutes: number;
  seconds: number;
  outcome: "COMPLETED" | "PARTIAL";
  rpe?: number;
  note?: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: input.clientMutationId,
      planItemId: input.planItemId,
      actual: {
        performedDate: input.performedDate,
        runningWorkoutCode: input.runningWorkoutCode,
        distanceM: Math.round(input.distanceKm * 1000),
        movingDurationSec:
          input.hours * 3600 + input.minutes * 60 + input.seconds,
        outcome: input.outcome,
        rpe: input.rpe,
        note: input.note && input.note.length > 0 ? input.note : undefined,
      },
    });
    revalidatePath("/plan");
    revalidatePath("/journal");
    revalidatePath("/");
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}
