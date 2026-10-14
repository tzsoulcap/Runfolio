"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/session";
import {
  deleteWorkoutLog,
  saveStrengthLog,
  saveWorkoutLog,
  undeleteWorkoutLog,
  updateStrengthLog,
  updateWorkoutLog,
} from "@/lib/services/logging";
import {
  achieveGoal,
  archiveGoal,
  createGoal,
  linkResultLog,
  setPrimaryGoal,
  unlinkResultLog,
  updateGoal,
} from "@/lib/services/goals";
import { ServiceError } from "@/lib/services/errors";
import {
  addPlanItem,
  addStrengthPlanItem,
  copyPlanItem,
  deletePlanItem,
  getWeekRevision,
  movePlanItem,
  setRestDay,
  unsetRestDay,
  undeletePlanItem,
} from "@/lib/services/planner";
import {
  applyTemplate,
  copyWeek,
  deleteTemplate,
  listTemplates,
  previewCopyWeek,
  previewTemplateApply,
  renameTemplate,
  saveWeekTemplate,
  type CopyMode,
  type RestChoice,
  type WeekPreview,
} from "@/lib/services/copying";
import { summarizeTemplatePayload } from "@/lib/domain/template";

export type ConflictKind = "STALE" | "LOCKED" | "REST" | "OTHER";

export type ActionResult =
  | {
      ok: true;
      revision?: number;
      logId?: string;
      destRevision?: number;
      dailyPlanId?: string;
      sortOrder?: number;
      itemsCopied?: number;
      templateId?: string;
      goalId?: string;
    }
  | { ok: false; code: string; message: string; conflictKind?: ConflictKind };

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; conflictKind?: ConflictKind };

function toResult(err: unknown): ActionResult {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case "VALIDATION": {
        const msg = err.message;
        const message = msg.includes("must not be in the future")
          ? "วันที่ซ้อมห้ามเป็นอนาคต"
          : msg.includes("at least one set with an actual result")
            ? "ต้องมีอย่างน้อยหนึ่งเซ็ตที่มีผลจริง"
            : msg.includes("does not match")
              ? "ข้างไม่ตรงกับวิธีนับ"
              : msg.includes("duplicate set number")
                ? "เซ็ตซ้ำกัน"
                : msg.includes("planned exercises need a plan")
                  ? "ท่าจากแผนต้องผูกกับแผนซ้อม"
                  : msg.includes("only active goals can be primary")
                    ? "ตั้งได้เฉพาะเป้าหมายที่ยัง active"
                    : msg.includes("only race-day logs can be linked")
                      ? "เชื่อมได้เฉพาะผล Race Day"
                      : msg.includes("target time is required")
                        ? "เป้าหมายแบบเวลาต้องมีเวลาเป้าหมาย"
                        : "ข้อมูลไม่ถูกต้อง";
        return { ok: false, code: err.code, message };
      }
      case "CONFLICT": {
        // One chain maps the service message to kind + Thai copy together.
        const msg = err.message;
        if (msg.includes("active log; cannot delete or restore")) {
          return { ok: false, code: err.code, conflictKind: "LOCKED", message: "แผนนี้มีผลบันทึกแล้ว ลบแผนไม่ได้" };
        }
        if (msg.includes("cannot restore a session to a rest day")) {
          return { ok: false, code: err.code, conflictKind: "REST", message: "วันนี้เปลี่ยนเป็นวันพักแล้ว เลิกทำการลบไม่ได้" };
        }
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
                      : msg.includes("plan is not a strength session")
                        ? ["OTHER", "แผนนี้ไม่ใช่ Strength"]
                        : msg.includes("plan is not a running session")
                          ? ["OTHER", "แผนนี้ไม่ใช่การวิ่ง"]
                          : msg.includes("needs a rest choice")
                            ? [
                                "OTHER",
                                "เลือกก่อนว่าจะคงวันพักหรือเปลี่ยนเป็นวันซ้อม",
                              ]
                            : msg.includes("replace blocked")
                              ? [
                                  "OTHER",
                                  "สัปดาห์นี้มีผลบันทึกแล้ว แทนที่ไม่ได้",
                                ]
                              : [
                                  "STALE",
                                  "ข้อมูลเปลี่ยนไปแล้ว ลองใหม่อีกครั้ง",
                                ];
        return { ok: false, code: err.code, conflictKind, message };
      }
      case "NOT_FOUND":
        return {
          ok: false,
          code: err.code,
          message: err.message.includes("race goal")
            ? "ไม่พบเป้าหมายที่เลือก"
            : err.message.includes("goal not found")
              ? "ไม่พบเป้าหมาย"
              : err.message.includes("exercise master")
              ? "ไม่พบท่าที่เลือก"
              : err.message.includes("source week")
                ? "ไม่พบสัปดาห์ต้นทาง"
                : err.message.includes("template")
                  ? "ไม่พบเทมเพลต"
                  : err.message.includes("planned exercise")
                    ? "ไม่พบท่าที่วางแผนไว้"
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

function toDataResult<T>(err: unknown): DataResult<T> {
  const r = toResult(err);
  if (r.ok) {
    return { ok: false, code: "UNKNOWN", message: "โหลดไม่สำเร็จ ลองใหม่" };
  }
  return r;
}

export async function copyPlanItemAction(input: {
  planItemId: string;
  targetDate: string;
  expectedRevision: number;
  expectedDestRevision?: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { revision } = await copyPlanItem(userId, input);
    revalidatePath("/plan");
    revalidatePath("/");
    revalidatePath("/progress");
    return { ok: true, revision };
  } catch (err) {
    return toResult(err);
  }
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

export async function deletePlanItemAction(input: { planItemId: string; expectedRevision: number }): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const result = await deletePlanItem(userId, input);
    revalidatePath("/plan");
    revalidatePath("/");
    revalidatePath("/progress");
    return { ok: true, revision: result.revision };
  } catch (err) { return toResult(err); }
}

export async function undeletePlanItemAction(input: { planItemId: string; expectedRevision: number }): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const result = await undeletePlanItem(userId, input);
    revalidatePath("/plan");
    revalidatePath("/");
    revalidatePath("/progress");
    return { ok: true, revision: result.revision };
  } catch (err) { return toResult(err); }
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

export async function previewCopyAction(input: {
  sourceMonday: string;
  targetMonday: string;
  mode: CopyMode;
}): Promise<DataResult<WeekPreview>> {
  try {
    const userId = await requireUserId();
    const preview = await previewCopyWeek(
      userId,
      input.sourceMonday,
      input.targetMonday,
      input.mode,
    );
    return { ok: true, data: preview };
  } catch (err) {
    return toDataResult(err);
  }
}

export async function copyWeekAction(input: {
  sourceMonday: string;
  targetMonday: string;
  mode: CopyMode;
  choices?: Record<string, RestChoice>;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const done = await copyWeek(userId, input);
    revalidatePath("/plan");
    revalidatePath("/");
    return {
      ok: true,
      revision: done.revision,
      itemsCopied: done.itemsCopied,
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function saveTemplateAction(input: {
  sourceMonday: string;
  name: string;
  description?: string;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const saved = await saveWeekTemplate(userId, input);
    revalidatePath("/plan");
    return { ok: true, templateId: saved.id };
  } catch (err) {
    return toResult(err);
  }
}

export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: number;
  itemCount: number;
  restCount: number;
  updatedAt: string;
};

export async function listTemplatesAction(): Promise<
  DataResult<TemplateSummary[]>
> {
  try {
    const userId = await requireUserId();
    const rows = await listTemplates(userId);
    return {
      ok: true,
      data: rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        schemaVersion: t.schemaVersion,
        ...summarizeTemplatePayload(t.payload),
        updatedAt:
          t.updatedAt instanceof Date
            ? t.updatedAt.toISOString()
            : String(t.updatedAt),
      })),
    };
  } catch (err) {
    return toDataResult(err);
  }
}

export async function previewTemplateAction(input: {
  templateId: string;
  targetMonday: string;
  mode: CopyMode;
}): Promise<DataResult<WeekPreview>> {
  try {
    const userId = await requireUserId();
    const preview = await previewTemplateApply(
      userId,
      input.templateId,
      input.targetMonday,
      input.mode,
    );
    return { ok: true, data: preview };
  } catch (err) {
    return toDataResult(err);
  }
}

export async function applyTemplateAction(input: {
  templateId: string;
  targetMonday: string;
  mode: CopyMode;
  choices?: Record<string, RestChoice>;
  expectedRevision: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const done = await applyTemplate(userId, input);
    revalidatePath("/plan");
    revalidatePath("/");
    return {
      ok: true,
      revision: done.revision,
      itemsCopied: done.itemsCopied,
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function renameTemplateAction(input: {
  templateId: string;
  name: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await renameTemplate(userId, input.templateId, input.name);
    revalidatePath("/plan");
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function deleteTemplateAction(input: {
  templateId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteTemplate(userId, input.templateId);
    revalidatePath("/plan");
    return { ok: true };
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

export type RunActualInput = {
  performedDate: string;
  runningWorkoutCode: string;
  distanceKm: number;
  hours: number;
  minutes: number;
  seconds: number;
  elapsedSec?: number;
  avgHeartRate?: number;
  startTime?: string;
  splits?: Array<{ distanceM?: number; durationSec?: number }>;
  outcome: "COMPLETED" | "PARTIAL";
  rpe?: number;
  feeling?: string;
  note?: string;
};

function nonEmpty(value?: string): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
// NOTE: keep the ternary — `value && ...` alone would return "" as-is,
// and "" fails the HH:mm / non-empty validations downstream.

function toRunningActual(input: RunActualInput) {
  return {
    performedDate: input.performedDate,
    runningWorkoutCode: input.runningWorkoutCode,
    distanceM: Math.round(input.distanceKm * 1000),
    movingDurationSec:
      input.hours * 3600 + input.minutes * 60 + input.seconds,
    elapsedDurationSec: input.elapsedSec,
    avgHeartRate: input.avgHeartRate,
    startTime: nonEmpty(input.startTime),
    splits:
      input.splits && input.splits.length > 0 ? input.splits : undefined,
    outcome: input.outcome,
    rpe: input.rpe,
    feeling: nonEmpty(input.feeling),
    note: nonEmpty(input.note),
  };
}

function revalidateLogs() {
  revalidatePath("/goals");
  revalidatePath("/goals/[id]", "page");
  revalidatePath("/progress");
  revalidatePath("/plan");
  revalidatePath("/journal");
  revalidatePath("/");
}

export async function saveLogAction(
  input: { clientMutationId: string; planItemId?: string } & RunActualInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await saveWorkoutLog(userId, {
      clientMutationId: input.clientMutationId,
      planItemId: input.planItemId,
      actual: toRunningActual(input),
    });
    revalidateLogs();
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateLogAction(
  input: { logId: string } & RunActualInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await updateWorkoutLog(
      userId,
      input.logId,
      toRunningActual(input),
    );
    revalidateLogs();
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}

export type StrengthActualInput = {
  performedDate: string;
  sessionMinutes?: number;
  startTime?: string;
  outcome: "COMPLETED" | "PARTIAL";
  rpe?: number;
  feeling?: string;
  note?: string;
  exercises: Array<{
    plannedExerciseId?: string;
    exerciseCode: string;
    variant?: string;
    countMode: string;
    sets: Array<{
      setNumber: number;
      side: string;
      measurement: string;
      reps?: number;
      durationSec?: number;
      loadKg?: number | null;
      note?: string;
    }>;
  }>;
};

// Server re-validates everything (§11): StrengthLogInputSchema owns it.
function toStrengthActual(input: StrengthActualInput) {
  return {
    performedDate: input.performedDate,
    sessionDurationSec:
      input.sessionMinutes !== undefined
        ? Math.round(input.sessionMinutes * 60)
        : undefined,
    startTime: nonEmpty(input.startTime),
    outcome: input.outcome,
    rpe: input.rpe,
    feeling: nonEmpty(input.feeling),
    note: nonEmpty(input.note),
    exercises: input.exercises,
  };
}

export async function saveStrengthLogAction(
  input: { clientMutationId: string; planItemId?: string } & StrengthActualInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await saveStrengthLog(userId, {
      clientMutationId: input.clientMutationId,
      planItemId: input.planItemId,
      actual: toStrengthActual(input),
    });
    revalidateLogs();
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateStrengthLogAction(
  input: { logId: string } & StrengthActualInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await updateStrengthLog(
      userId,
      input.logId,
      toStrengthActual(input),
    );
    revalidateLogs();
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}

export async function deleteLogAction(input: {
  logId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteWorkoutLog(userId, input.logId);
    revalidateLogs();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function undeleteLogAction(input: {
  logId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { log } = await undeleteWorkoutLog(userId, input.logId);
    revalidateLogs();
    return { ok: true, logId: log.id };
  } catch (err) {
    return toResult(err);
  }
}

export type GoalFormInput = {
  distanceCode: string;
  goalType: "FINISH" | "TARGET_TIME";
  eventName?: string;
  eventDate?: string;
  targetHours?: number;
  targetMinutes?: number;
  targetSeconds?: number;
  isPrimary?: boolean;
};

function toGoalInput(input: GoalFormInput) {
  const hasTarget =
    input.targetHours !== undefined ||
    input.targetMinutes !== undefined ||
    input.targetSeconds !== undefined;
  return {
    distanceCode: input.distanceCode,
    goalType: input.goalType,
    eventName: nonEmpty(input.eventName),
    eventDate: nonEmpty(input.eventDate),
    targetTimeSec:
      input.goalType === "TARGET_TIME" && hasTarget
        ? (input.targetHours ?? 0) * 3600 +
          (input.targetMinutes ?? 0) * 60 +
          (input.targetSeconds ?? 0)
        : undefined,
  };
}

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/plan");
  revalidatePath("/");
}

export async function createGoalAction(
  input: GoalFormInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { goal } = await createGoal(userId, toGoalInput(input), {
      isPrimary: input.isPrimary,
    });
    revalidateGoals();
    return { ok: true, goalId: goal.id };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateGoalAction(
  input: { goalId: string } & GoalFormInput,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { goal } = await updateGoal(userId, input.goalId, toGoalInput(input));
    revalidateGoals();
    return { ok: true, goalId: goal.id };
  } catch (err) {
    return toResult(err);
  }
}

export async function setPrimaryGoalAction(input: {
  goalId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await setPrimaryGoal(userId, input.goalId);
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveGoalAction(input: {
  goalId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await archiveGoal(userId, input.goalId);
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function achieveGoalAction(input: {
  goalId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await achieveGoal(userId, input.goalId);
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function linkResultAction(input: {
  goalId: string;
  logId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await linkResultLog(userId, input.goalId, input.logId);
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function unlinkResultAction(input: {
  goalId: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await unlinkResultLog(userId, input.goalId);
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
