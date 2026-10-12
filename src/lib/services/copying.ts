import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import {
  dailyPlans,
  plannedStrengthExercises,
  planItems,
  planTemplates,
  raceGoals,
  runningWorkoutMasters,
  strengthExerciseMasters,
  weeklyPlans,
  workoutLogs,
} from "@/lib/db/schema";
import type {
  NonRestWorkoutCode,
  RunningTarget,
  StrengthPrescription,
} from "@/lib/domain/master";
import {
  TemplatePayloadSchema,
  type TemplatePayload,
} from "@/lib/domain/template";
import {
  DateOnlySchema,
  isMonday,
  weekDates,
} from "@/lib/domain/week";

import { ServiceError } from "./errors";
import {
  bumpRevision,
  ensureWeek,
  listWeek,
  type DbTx,
} from "./planner";

const MondaySchema = DateOnlySchema.refine(isMonday, "must be a Monday");

const ModeSchema = z.enum(["append", "replace"]);
export type CopyMode = z.infer<typeof ModeSchema>;

const RestChoiceSchema = z.enum(["keep-rest", "convert"]);
export type RestChoice = z.infer<typeof RestChoiceSchema>;

export const CopyWeekInputSchema = z.object({
  sourceMonday: MondaySchema,
  targetMonday: MondaySchema,
  mode: ModeSchema,
  choices: z.record(z.string(), RestChoiceSchema).optional(),
  expectedRevision: z.number().int().min(1),
});

function validation(message: string): ServiceError {
  return new ServiceError("VALIDATION", message);
}

// ---------------------------------------------------------------------------
// Payload builder (pure; listWeek output satisfies the input shape)
// ---------------------------------------------------------------------------

export type PayloadSourceExercise = {
  exerciseCode: string;
  variant: string;
  prescription: StrengthPrescription;
  sortOrder: number;
};

export type PayloadSourceItem = {
  activityType: string;
  runningWorkoutCode: string | null;
  runningTarget: RunningTarget | null;
  intensityTarget: { kind: string; [k: string]: unknown } | null;
  raceGoalId: string | null;
  title: string;
  plannedStartTime: string | null;
  note: string | null;
  sortOrder: number;
  exercises: PayloadSourceExercise[];
};

export type PayloadSourceDay = {
  date: string;
  isRestDay: boolean;
  note: string | null;
  items: PayloadSourceItem[];
};

function dayIndexOf(date: string, monday: string): number {
  const ms =
    Date.parse(`${date}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// A week that was never created copies/previews as an empty week.
export function emptyPayload(): TemplatePayload {
  return TemplatePayloadSchema.parse({
    schemaVersion: 1,
    days: [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => ({
      dayIndex,
      isRestDay: false,
      items: [],
    })),
  });
}

// Copies plan content only: no IDs, no logs, and skipped items come back as
// scheduled retries (their skipped status is not copied, §5).
export function buildTemplatePayload(
  days: PayloadSourceDay[],
  monday: string,
): TemplatePayload {
  const byIndex = new Map<number, TemplatePayload["days"][number]>();
  for (const day of days) {
    const dayIndex = dayIndexOf(day.date, monday);
    if (dayIndex < 0 || dayIndex > 6) continue;
    const items: TemplatePayload["days"][number]["items"] = [];
    if (!day.isRestDay) {
      const ordered = [...day.items].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const item of ordered) {
        if (item.activityType === "RUNNING") {
          if (!item.runningWorkoutCode || !item.runningTarget) continue;
          items.push({
            activityType: "RUNNING",
            // Validated by TemplatePayloadSchema.parse below.
            runningWorkoutCode:
              item.runningWorkoutCode as NonRestWorkoutCode,
            runningTarget: item.runningTarget,
            intensityTarget:
              (item.intensityTarget as TemplatePayload["days"][number]["items"][number] extends {
                activityType: "RUNNING";
                intensityTarget: infer T;
              }
                ? T
                : never) ?? { kind: "NONE" },
            ...(item.raceGoalId ? { raceGoalId: item.raceGoalId } : {}),
            title: item.title,
            ...(item.plannedStartTime
              ? { plannedStartTime: item.plannedStartTime }
              : {}),
            ...(item.note ? { note: item.note } : {}),
          });
        } else if (item.activityType === "STRENGTH") {
          const exercises = [...item.exercises]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((e) => ({
              exerciseCode: e.exerciseCode,
              variant: e.variant,
              prescription: e.prescription,
            }));
          if (exercises.length === 0) continue;
          items.push({
            activityType: "STRENGTH",
            title: item.title,
            ...(item.plannedStartTime
              ? { plannedStartTime: item.plannedStartTime }
              : {}),
            ...(item.note ? { note: item.note } : {}),
            exercises,
          });
        }
      }
    }
    byIndex.set(dayIndex, {
      dayIndex,
      isRestDay: day.isRestDay,
      ...(day.note ? { note: day.note } : {}),
      items,
    });
  }
  const full = [];
  for (let i = 0; i < 7; i++) {
    full.push(byIndex.get(i) ?? { dayIndex: i, isRestDay: false, items: [] });
  }
  return TemplatePayloadSchema.parse({ schemaVersion: 1, days: full });
}

// ---------------------------------------------------------------------------
// Preview (read-only)
// ---------------------------------------------------------------------------

export type DayPreview = {
  dayIndex: number;
  date: string;
  source: { isRestDay: boolean; titles: string[] };
  target: {
    isRestDay: boolean;
    titles: string[];
    loggedCount: number;
    unloggedCount: number;
  };
  conflict: null | "REST_TARGET" | "LOGGED_ITEMS";
  action: string;
};

export type WeekPreview = {
  sourceMonday: string | null;
  templateName: string | null;
  targetMonday: string;
  mode: CopyMode;
  days: DayPreview[];
  blocked: boolean;
};

function itemTitle(
  item: TemplatePayload["days"][number]["items"][number],
): string {
  if (item.activityType === "RUNNING") {
    return item.title ?? item.runningWorkoutCode;
  }
  return item.title ?? "Strength";
}

export async function previewPayload(
  userId: string,
  payload: TemplatePayload,
  targetMonday: string,
  mode: CopyMode,
  source: { sourceMonday: string | null; templateName: string | null },
): Promise<WeekPreview> {
  const [week] = await db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.userId, userId),
        eq(weeklyPlans.weekStartDate, targetMonday),
      ),
    )
    .limit(1);
  const dates = weekDates(targetMonday);
  const targetByDate = new Map<
    string,
    { isRestDay: boolean; titles: string[]; logged: number; unlogged: number }
  >();
  for (const date of dates) {
    targetByDate.set(date, {
      isRestDay: false,
      titles: [],
      logged: 0,
      unlogged: 0,
    });
  }
  if (week) {
    const { days } = await listWeek(userId, targetMonday, targetMonday);
    for (const day of days) {
      const entry = targetByDate.get(day.date);
      if (!entry) continue;
      entry.isRestDay = day.isRestDay;
      for (const item of day.items) {
        entry.titles.push(item.title);
        if (item.log) entry.logged += 1;
        else entry.unlogged += 1;
      }
    }
  }
  const ordered = [...payload.days].sort((a, b) => a.dayIndex - b.dayIndex);
  let blocked = false;
  const days: DayPreview[] = ordered.map((pday) => {
    const date = dates[pday.dayIndex] ?? targetMonday;
    const target = targetByDate.get(date) ?? {
      isRestDay: false,
      titles: [],
      logged: 0,
      unlogged: 0,
    };
    const source = {
      isRestDay: pday.isRestDay,
      titles: pday.items.map(itemTitle),
    };
    let conflict: DayPreview["conflict"] = null;
    let action: string;
    // Any operation that would unset a target rest day asks first (§5):
    // append only converts rest for incoming items, replace mirrors.
    const wouldUnsetRest =
      target.isRestDay &&
      (pday.items.length > 0 || (mode === "replace" && !pday.isRestDay));
    if (mode === "replace" && target.logged > 0) {
      conflict = "LOGGED_ITEMS";
      blocked = true;
      action = `ติดผลบันทึก ${target.logged} รายการ — แทนที่ไม่ได้ทั้งสัปดาห์`;
    } else if (wouldUnsetRest) {
      conflict = "REST_TARGET";
      action = "ชนวันพัก — เลือกคงวันพักหรือเปลี่ยนเป็นวันซ้อม";
    } else if (mode === "replace") {
      action =
        pday.items.length > 0
          ? `แทนที่เป็น ${pday.items.length} รายการ`
          : pday.isRestDay
            ? "แทนที่เป็นวันพัก"
            : "แทนที่เป็นวันว่าง";
    } else if (pday.items.length > 0) {
      action = `ต่อท้าย ${pday.items.length} รายการ`;
    } else if (pday.isRestDay) {
      action = target.isRestDay
        ? "คงวันพัก"
        : target.titles.length > 0
          ? "คงแผนเดิม"
          : "ตั้งวันพัก";
    } else {
      action = "ไม่มีอะไรเพิ่ม";
    }
    return {
      dayIndex: pday.dayIndex,
      date,
      source,
      target: {
        isRestDay: target.isRestDay,
        titles: target.titles,
        loggedCount: target.logged,
        unloggedCount: target.unlogged,
      },
      conflict,
      action,
    };
  });
  return {
    sourceMonday: source.sourceMonday,
    templateName: source.templateName,
    targetMonday,
    mode,
    days,
    blocked,
  };
}

export async function previewCopyWeek(
  userId: string,
  sourceMonday: string,
  targetMonday: string,
  mode: CopyMode,
): Promise<WeekPreview> {
  if (!MondaySchema.safeParse(sourceMonday).success) {
    throw validation("source must be a Monday");
  }
  if (!MondaySchema.safeParse(targetMonday).success) {
    throw validation("target must be a Monday");
  }
  const { week, days } = await listWeek(userId, sourceMonday, sourceMonday);
  const payload = week ? buildTemplatePayload(days, sourceMonday) : emptyPayload();
  return previewPayload(userId, payload, targetMonday, mode, {
    sourceMonday,
    templateName: null,
  });
}

export async function previewTemplateApply(
  userId: string,
  templateId: string,
  targetMonday: string,
  mode: CopyMode,
): Promise<WeekPreview> {
  if (!MondaySchema.safeParse(targetMonday).success) {
    throw validation("target must be a Monday");
  }
  const [template] = await db
    .select()
    .from(planTemplates)
    .where(
      and(eq(planTemplates.id, templateId), eq(planTemplates.userId, userId)),
    )
    .limit(1);
  if (!template) throw new ServiceError("NOT_FOUND", "template not found");
  const parsed = TemplatePayloadSchema.safeParse(template.payload);
  if (!parsed.success) {
    throw validation("template payload is invalid");
  }
  return previewPayload(userId, parsed.data, targetMonday, mode, {
    sourceMonday: null,
    templateName: template.name,
  });
}

// ---------------------------------------------------------------------------
// Apply (one transaction: all or nothing, §5)
// ---------------------------------------------------------------------------

export type ApplyResult = {
  revision: number;
  itemsCopied: number;
  daysChanged: number;
};

async function applyWeekPayload(
  tx: DbTx,
  userId: string,
  payload: TemplatePayload,
  targetMonday: string,
  mode: CopyMode,
  choices: Record<string, RestChoice>,
  expectedRevision: number,
): Promise<ApplyResult> {
  const { week } = await ensureWeek(tx, userId, targetMonday);
  const [locked] = await tx
    .select({ id: weeklyPlans.id, revision: weeklyPlans.revision })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.id, week.id))
    .for("update")
    .limit(1);
  if (!locked) throw new ServiceError("NOT_FOUND", "week not found");
  if (locked.revision !== expectedRevision) {
    throw new ServiceError("CONFLICT", "week changed; refetch and retry");
  }
  const days = await tx
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.weeklyPlanId, week.id))
    .orderBy(asc(dailyPlans.date));
  const dayIds = days.map((d) => d.id);
  const items =
    dayIds.length === 0
      ? []
      : await tx
          .select()
          .from(planItems)
          .where(
            and(
              inArray(planItems.dailyPlanId, dayIds),
              isNull(planItems.deletedAt),
            ),
          )
          .orderBy(asc(planItems.sortOrder));
  const itemIds = items.map((i) => i.id);
  const logs =
    itemIds.length === 0
      ? []
      : await tx
          .select({ planItemId: workoutLogs.planItemId })
          .from(workoutLogs)
          .where(
            and(
              inArray(workoutLogs.planItemId, itemIds),
              isNull(workoutLogs.deletedAt),
            ),
          );
  const loggedIds = new Set(logs.map((l) => l.planItemId));
  if (mode === "replace" && loggedIds.size > 0) {
    throw new ServiceError(
      "CONFLICT",
      `target week has ${loggedIds.size} logged sessions; replace blocked`,
    );
  }
  // Validate every master before writing anything (atomic, §5).
  const runningCodes = new Set<string>();
  const strengthCodes = new Set<string>();
  for (const day of payload.days) {
    for (const item of day.items) {
      if (item.activityType === "RUNNING") {
        runningCodes.add(item.runningWorkoutCode);
      } else {
        for (const e of item.exercises) strengthCodes.add(e.exerciseCode);
      }
    }
  }
  const runningMasters =
    runningCodes.size === 0
      ? []
      : await tx
          .select()
          .from(runningWorkoutMasters)
          .where(inArray(runningWorkoutMasters.code, [...runningCodes]));
  const strengthMasters =
    strengthCodes.size === 0
      ? []
      : await tx
          .select()
          .from(strengthExerciseMasters)
          .where(inArray(strengthExerciseMasters.code, [...strengthCodes]));
  const runningByCode = new Map(runningMasters.map((m) => [m.code, m]));
  const strengthByCode = new Map(strengthMasters.map((m) => [m.code, m]));
  for (const code of runningCodes) {
    const master = runningByCode.get(code);
    if (!master || !master.isActive) {
      throw new ServiceError("NOT_FOUND", "workout master not found");
    }
  }
  for (const code of strengthCodes) {
    const master = strengthByCode.get(code);
    if (!master || !master.isActive) {
      throw new ServiceError("NOT_FOUND", "exercise master not found");
    }
  }
  // Goal links survive only when the goal still belongs to the user.
  const goalIds = new Set<string>();
  for (const day of payload.days) {
    for (const item of day.items) {
      if (item.activityType === "RUNNING" && item.raceGoalId) {
        goalIds.add(item.raceGoalId);
      }
    }
  }
  const ownGoals =
    goalIds.size === 0
      ? []
      : await tx
          .select({ id: raceGoals.id })
          .from(raceGoals)
          .where(
            and(
              inArray(raceGoals.id, [...goalIds]),
              eq(raceGoals.userId, userId),
            ),
          );
  const ownGoalIds = new Set(ownGoals.map((g) => g.id));

  const dates = weekDates(targetMonday);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const itemsByDay = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByDay.get(item.dailyPlanId) ?? [];
    list.push(item);
    itemsByDay.set(item.dailyPlanId, list);
  }
  const ordered = [...payload.days].sort((a, b) => a.dayIndex - b.dayIndex);
  let itemsCopied = 0;
  let daysChanged = 0;

  async function insertPayloadItems(
    dayId: string,
    dayItems: TemplatePayload["days"][number]["items"],
    startOrder: number,
  ) {
    let order = startOrder;
    for (const item of dayItems) {
      if (item.activityType === "RUNNING") {
        const master = runningByCode.get(item.runningWorkoutCode);
        if (!master) continue;
        const [inserted] = await tx
          .insert(planItems)
          .values({
            dailyPlanId: dayId,
            activityType: "RUNNING",
            runningWorkoutCode: master.code,
            title: item.title ?? master.nameEn,
            plannedStartTime: item.plannedStartTime,
            runningTarget: item.runningTarget,
            intensityTarget: item.intensityTarget,
            raceGoalId:
              item.raceGoalId && ownGoalIds.has(item.raceGoalId)
                ? item.raceGoalId
                : null,
            note: item.note,
            sortOrder: order,
            planState: "SCHEDULED",
            masterSnapshot: {
              code: master.code,
              nameTh: master.nameTh,
              nameEn: master.nameEn,
            },
          })
          .returning({ id: planItems.id });
        if (!inserted) {
          throw new ServiceError("CONFLICT", "copy insert failed; retry");
        }
      } else {
        const [inserted] = await tx
          .insert(planItems)
          .values({
            dailyPlanId: dayId,
            activityType: "STRENGTH",
            title: item.title ?? "Strength",
            plannedStartTime: item.plannedStartTime,
            note: item.note,
            sortOrder: order,
            planState: "SCHEDULED",
          })
          .returning({ id: planItems.id });
        if (!inserted) {
          throw new ServiceError("CONFLICT", "copy insert failed; retry");
        }
        await tx.insert(plannedStrengthExercises).values(
          item.exercises.map((e, index) => {
            const master = strengthByCode.get(e.exerciseCode);
            return {
              planItemId: inserted.id,
              exerciseCode: e.exerciseCode,
              variant: e.variant,
              prescription: e.prescription,
              sortOrder: index,
              masterSnapshot: master
                ? {
                    code: master.code,
                    nameTh: master.nameTh,
                    nameEn: master.nameEn,
                    muscleGroup: master.muscleGroup,
                    repLabel: master.repLabel,
                    guidance: master.guidance,
                  }
                : null,
            };
          }),
        );
      }
      order += 1;
      itemsCopied += 1;
    }
  }

  for (const pday of ordered) {
    const date = dates[pday.dayIndex] ?? targetMonday;
    const day = dayByDate.get(date);
    if (!day) throw new ServiceError("NOT_FOUND", "day not found");
    const existing = itemsByDay.get(day.id) ?? [];
    if (mode === "replace") {
      if (day.isRestDay && !pday.isRestDay) {
        const choice = choices[String(pday.dayIndex)];
        if (!choice) {
          throw new ServiceError(
            "CONFLICT",
            `day ${date} needs a rest choice`,
          );
        }
        if (choice === "keep-rest") continue;
      }
      if (existing.length > 0) {
        await tx
          .update(planItems)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(planItems.dailyPlanId, day.id),
              isNull(planItems.deletedAt),
            ),
          );
        daysChanged += 1;
      }
      if (pday.items.length > 0) {
        if (day.isRestDay) {
          await tx
            .update(dailyPlans)
            .set({ isRestDay: false, note: null, updatedAt: new Date() })
            .where(eq(dailyPlans.id, day.id));
        }
        await insertPayloadItems(day.id, pday.items, 0);
        daysChanged += 1;
      } else if (pday.isRestDay) {
        await tx
          .update(dailyPlans)
          .set({
            isRestDay: true,
            note: pday.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(dailyPlans.id, day.id));
        daysChanged += 1;
      } else if (day.isRestDay || day.note) {
        await tx
          .update(dailyPlans)
          .set({ isRestDay: false, note: null, updatedAt: new Date() })
          .where(eq(dailyPlans.id, day.id));
        daysChanged += 1;
      }
      continue;
    }
    // Append mode.
    if (pday.items.length > 0) {
      if (day.isRestDay) {
        const choice = choices[String(pday.dayIndex)];
        if (!choice) {
          throw new ServiceError(
            "CONFLICT",
            `day ${date} needs a rest choice`,
          );
        }
        if (choice === "keep-rest") continue;
        await tx
          .update(dailyPlans)
          .set({ isRestDay: false, note: null, updatedAt: new Date() })
          .where(eq(dailyPlans.id, day.id));
      }
      const startOrder =
        existing.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
      await insertPayloadItems(day.id, pday.items, startOrder);
      daysChanged += 1;
    } else if (pday.isRestDay) {
      if (day.isRestDay) {
        if (pday.note !== undefined && pday.note !== (day.note ?? undefined)) {
          await tx
            .update(dailyPlans)
            .set({ note: pday.note, updatedAt: new Date() })
            .where(eq(dailyPlans.id, day.id));
          daysChanged += 1;
        }
      } else if (existing.length === 0) {
        await tx
          .update(dailyPlans)
          .set({
            isRestDay: true,
            note: pday.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(dailyPlans.id, day.id));
        daysChanged += 1;
      }
      // Payload rest over target plans: keep training (append never destroys).
    }
  }
  const revision = await bumpRevision(tx, week.id, expectedRevision);
  return { revision, itemsCopied, daysChanged };
}

// ---------------------------------------------------------------------------
// Copy week
// ---------------------------------------------------------------------------

export async function copyWeek(userId: string, raw: unknown) {
  const parsed = CopyWeekInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid copy");
  }
  const input = parsed.data;
  const { week, days } = await listWeek(
    userId,
    input.sourceMonday,
    input.sourceMonday,
  );
  const payload = week
    ? buildTemplatePayload(days, input.sourceMonday)
    : emptyPayload();
  const applied = await db.transaction((tx) =>
    applyWeekPayload(
      tx,
      userId,
      payload,
      input.targetMonday,
      input.mode,
      input.choices ?? {},
      input.expectedRevision,
    ),
  );
  return { ...applied, sourceMonday: input.sourceMonday };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const SaveTemplateInputSchema = z.object({
  sourceMonday: MondaySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  expectedRevision: z.number().int().min(1),
});

export async function saveWeekTemplate(userId: string, raw: unknown) {
  const parsed = SaveTemplateInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid template");
  }
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [week] = await tx
      .select({ id: weeklyPlans.id, revision: weeklyPlans.revision })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.userId, userId),
          eq(weeklyPlans.weekStartDate, input.sourceMonday),
        ),
      )
      .for("update")
      .limit(1);
    if (!week) throw new ServiceError("NOT_FOUND", "source week not found");
    if (week.revision !== input.expectedRevision) {
      throw new ServiceError("CONFLICT", "week changed; refetch and retry");
    }
    const days = await tx
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.weeklyPlanId, week.id))
      .orderBy(asc(dailyPlans.date));
    const dayIds = days.map((d) => d.id);
    const items =
      dayIds.length === 0
        ? []
        : await tx
            .select()
            .from(planItems)
            .where(
              and(
                inArray(planItems.dailyPlanId, dayIds),
                isNull(planItems.deletedAt),
              ),
            )
            .orderBy(asc(planItems.sortOrder));
    const itemIds = items.map((i) => i.id);
    const exercises =
      itemIds.length === 0
        ? []
        : await tx
            .select()
            .from(plannedStrengthExercises)
            .where(inArray(plannedStrengthExercises.planItemId, itemIds))
            .orderBy(asc(plannedStrengthExercises.sortOrder));
    const exercisesByItem = new Map<string, typeof exercises>();
    for (const row of exercises) {
      const list = exercisesByItem.get(row.planItemId) ?? [];
      list.push(row);
      exercisesByItem.set(row.planItemId, list);
    }
    const payload = buildTemplatePayload(
      days.map((d) => ({
        ...d,
        items: items
          .filter((i) => i.dailyPlanId === d.id)
          .map((i) => ({
            ...i,
            exercises: exercisesByItem.get(i.id) ?? [],
          })),
      })),
      input.sourceMonday,
    );
    const [inserted] = await tx
      .insert(planTemplates)
      .values({
        userId,
        name: input.name,
        description: input.description,
        schemaVersion: 1,
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning();
    if (!inserted) {
      throw new ServiceError("CONFLICT", "template insert failed; retry");
    }
    return inserted;
  });
}

export const ApplyTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  targetMonday: MondaySchema,
  mode: ModeSchema,
  choices: z.record(z.string(), RestChoiceSchema).optional(),
  expectedRevision: z.number().int().min(1),
});

export async function applyTemplate(userId: string, raw: unknown) {
  const parsed = ApplyTemplateInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? "invalid apply");
  }
  const input = parsed.data;
  const [template] = await db
    .select()
    .from(planTemplates)
    .where(
      and(
        eq(planTemplates.id, input.templateId),
        eq(planTemplates.userId, userId),
      ),
    )
    .limit(1);
  if (!template) throw new ServiceError("NOT_FOUND", "template not found");
  const payload = TemplatePayloadSchema.safeParse(template.payload);
  if (!payload.success) {
    throw validation("template payload is invalid");
  }
  const applied = await db.transaction((tx) =>
    applyWeekPayload(
      tx,
      userId,
      payload.data,
      input.targetMonday,
      input.mode,
      input.choices ?? {},
      input.expectedRevision,
    ),
  );
  return { ...applied, templateName: template.name };
}

export async function listTemplates(userId: string) {
  return db
    .select()
    .from(planTemplates)
    .where(eq(planTemplates.userId, userId))
    .orderBy(desc(planTemplates.updatedAt));
}

export async function renameTemplate(
  userId: string,
  templateId: string,
  rawName: unknown,
) {
  const parsed = z.string().trim().min(1).max(120).safeParse(rawName);
  if (!parsed.success) {
    throw validation("template name must be 1-120 characters");
  }
  const [renamed] = await db
    .update(planTemplates)
    .set({ name: parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(planTemplates.id, templateId),
        eq(planTemplates.userId, userId),
      ),
    )
    .returning();
  if (!renamed) throw new ServiceError("NOT_FOUND", "template not found");
  return renamed;
}

export async function deleteTemplate(userId: string, templateId: string) {
  const [deleted] = await db
    .delete(planTemplates)
    .where(
      and(
        eq(planTemplates.id, templateId),
        eq(planTemplates.userId, userId),
      ),
    )
    .returning({ id: planTemplates.id });
  if (!deleted) throw new ServiceError("NOT_FOUND", "template not found");
}
