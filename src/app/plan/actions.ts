"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/session";
import { saveWorkoutLog } from "@/lib/services/logging";
import { ServiceError } from "@/lib/services/errors";
import {
  addPlanItem,
  addStrengthPlanItem,
  getWeekRevision,
  movePlanItem,
  setRestDay,
  unsetRestDay,
} from "@/lib/services/planner";

export type ConflictKind = "STALE" | "LOCKED" | "REST" | "OTHER";

export type ActionResult =
  | {
      ok: true;
      revision?: number;
      logId?: string;
      destRevision?: number;
      dailyPlanId?: string;
      sortOrder?: number;
    }
  | { ok: false; code: string; message: string; conflictKind?: ConflictKind };

function toResult(err: unknown): ActionResult {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case "VALIDATION":
        return { ok: false, code: err.code, message: "ข้อมูลไม่ถูกต้อง" };
      case "CONFLICT": {
        // One chain maps the service message to kind + Thai copy together.
        const msg = err.message;
        const [conflictKind, message]: [ConflictKind, string] =
          msg.includes("has logs")
            ? ["OTHER", "วันนี้มีผลบันทึกแล้ว เปลี่ยนเป็นวันพักไม่ได้"]
            : msg.includes("remove them first")
              ? ["OTHER", "วันนี้ยังมีแผนที่ยังไม่บันทึก เลือกนำออกก่อน"]
              : msg.includes("cannot move a session to a rest day")
                ? ["REST", "ย้ายไปวันพักไม่ได้"]
                : msg.includes("rest day")
                  ? ["OTHER", "วันพักเพิ่มเซสชันไม่ได้"]
                  : msg.includes("already has an active log")
                    ? ["OTHER", "แผนนี้บันทึกผลไปแล้ว"]
                    : msg.includes("active log; cannot move")
                      ? ["LOCKED", "แผนนี้มีผลบันทึกแล้ว ย้ายไม่ได้"]
                      : ["STALE", "ข้อมูลเปลี่ยนไปแล้ว ลองใหม่อีกครั้ง"];
        return { ok: false, code: err.code, conflictKind, message };
      }
      case "NOT_FOUND":
        return {
          ok: false,
          code: err.code,
          message: err.message.includes("race goal")
            ? "ไม่พบเป้าหมายที่เลือก"
            : err.message.includes("exercise master")
              ? "ไม่พบท่าที่เลือก"
              : "ไม่พบข้อมูล",
        };
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
  runningTarget?: unknown;
  intensityTarget?: unknown;
  goalId?: string;
  plannedStartTime?: string;
  note?: string;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    // Server re-validates everything (§11): PlanDraftSchema owns the contract.
    const draft = {
      date: input.date,
      activityType: "RUNNING" as const,
      runningWorkoutCode: input.runningWorkoutCode,
      ...(input.runningTarget !== undefined
        ? { runningTarget: input.runningTarget }
        : {}),
      ...(input.intensityTarget !== undefined
        ? { intensityTarget: input.intensityTarget }
        : {}),
      ...(input.goalId ? { goalId: input.goalId } : {}),
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

export async function addStrengthPlanAction(input: {
  date: string;
  title?: string;
  exercises: Array<{
    exerciseCode: string;
    variant: string;
    prescription: unknown;
  }>;
  plannedStartTime?: string;
  note?: string;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    // Server re-validates everything (§11): StrengthPlanDraftSchema owns it.
    const draft = {
      date: input.date,
      activityType: "STRENGTH" as const,
      ...(input.title && input.title.trim().length > 0
        ? { title: input.title.trim() }
        : {}),
      exercises: input.exercises,
      plannedStartTime:
        input.plannedStartTime && input.plannedStartTime.length > 0
          ? input.plannedStartTime
          : undefined,
      note: input.note && input.note.length > 0 ? input.note : undefined,
    };
    const { revision } = await addStrengthPlanItem(
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

export async function movePlanAction(input: {
  planItemId: string;
  targetDate: string;
  targetIndex: number;
  expectedRevision: number;
  expectedDestRevision?: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const moved = await movePlanItem(userId, {
      planItemId: input.planItemId,
      targetDate: input.targetDate,
      targetIndex: input.targetIndex,
      expectedRevision: input.expectedRevision,
      ...(input.expectedDestRevision !== undefined
        ? { expectedDestRevision: input.expectedDestRevision }
        : {}),
    });
    revalidatePath("/plan");
    revalidatePath("/");
    return {
      ok: true,
      revision: moved.revision,
      destRevision: moved.destRevision,
      dailyPlanId: moved.dailyPlanId,
      sortOrder: moved.sortOrder,
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function getWeekRevisionAction(input: {
  monday: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { revision } = await getWeekRevision(userId, input.monday);
    return { ok: true, revision };
  } catch (err) {
    return toResult(err);
  }
}

export async function setRestDayAction(input: {
  date: string;
  note?: string;
  removeUnlogged?: boolean;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const revision = await setRestDay(userId, input.date, input.expectedRevision, {
      note: input.note && input.note.length > 0 ? input.note : undefined,
      removeUnlogged: input.removeUnlogged,
    });
    revalidatePath("/plan");
    revalidatePath("/");
    return { ok: true, revision };
  } catch (err) {
    return toResult(err);
  }
}

export async function unsetRestDayAction(input: {
  date: string;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const revision = await unsetRestDay(userId, input.date, input.expectedRevision);
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
