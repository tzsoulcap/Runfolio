// Home aggregations (§4). Pure: callers pass week rows + range logs, the
// domain derives today state, week-strip flags, and week totals.
import type { IntensityTarget, RunningTarget } from "./master";
import type { DerivedPlanStatus } from "./plan";
import { parseDateOnly } from "./week";

export type TodayItem = {
  id: string;
  title: string;
  activityType: string;
  runningTarget: RunningTarget | null;
  intensityTarget?: IntensityTarget | null;
  plannedStartTime: string | null;
  note: string | null;
  planState: string;
  strengthCount?: number;
  log: {
    id: string;
    outcome: string;
    distanceM: number | null;
    movingDurationSec: number | null;
  } | null;
  status: DerivedPlanStatus;
};

export type TodayState =
  | { kind: "EMPTY" }
  | { kind: "REST"; note: string | null }
  | { kind: "SINGLE"; item: TodayItem }
  | {
      kind: "MULTI";
      hero: TodayItem;
      others: TodayItem[];
      total: number;
    }
  | {
      kind: "DONE_ALL";
      items: TodayItem[];
      loggedCount: number;
      runningM: number;
      runningSec: number;
      strengthCount: number;
    };

export function deriveTodayState(
  day: { isRestDay: boolean; note: string | null } | undefined,
  items: TodayItem[],
): TodayState {
  if (!day || (!day.isRestDay && items.length === 0)) return { kind: "EMPTY" };
  if (day.isRestDay) return { kind: "REST", note: day.note };
  const pending = items.filter(
    (i) => i.log === null && i.planState !== "SKIPPED",
  );
  if (pending.length === 0) {
    const logged = items.filter((i) => i.log !== null);
    const running = logged.filter((i) => i.activityType === "RUNNING");
    return {
      kind: "DONE_ALL",
      items,
      loggedCount: logged.length,
      runningM: running.reduce((m, i) => m + (i.log?.distanceM ?? 0), 0),
      runningSec: running.reduce(
        (s, i) => s + (i.log?.movingDurationSec ?? 0),
        0,
      ),
      strengthCount: logged.filter((i) => i.activityType === "STRENGTH").length,
    };
  }
  if (items.length === 1) return { kind: "SINGLE", item: pending[0] };
  const hero = pending[0];
  return {
    kind: "MULTI",
    hero,
    others: items.filter((i) => i.id !== hero.id),
    total: items.length,
  };
}

export type WeekSummaryDay = {
  items: Array<{
    activityType: string;
    runningTarget: RunningTarget | null;
    planState: string;
    log: { outcome: string } | null;
  }>;
};

export type WeekSummaryLog = {
  activityType: string;
  distanceM: number | null;
  movingDurationSec: number | null;
};

export type WeekSummary = {
  runningActualM: number;
  runningActualSec: number;
  plannedDistanceM: number;
  estimatedStructuredM: number;
  unmeasuredStructuredItems: number;
  timeBasedItems: number;
  doneItems: number;
  partialItems: number;
  totalItems: number;
  skippedItems: number;
  strengthActual: number;
  strengthPlanned: number;
};

const PLAN_ITEM_TYPES = new Set(["RUNNING", "STRENGTH"]);

// ADR-0001: skipped items leave the completion denominator, partials count
// separately (no 0.5 score). STRUCTURED estimates stay out of the definite
// planned total. Explicit distances inside structured steps are specified,
// including repetitions; recovery without a distance remains unmeasured.
export function summarizeWeek(
  days: WeekSummaryDay[],
  logs: WeekSummaryLog[],
): WeekSummary {
  const out: WeekSummary = {
    runningActualM: 0,
    runningActualSec: 0,
    plannedDistanceM: 0,
    estimatedStructuredM: 0,
    unmeasuredStructuredItems: 0,
    timeBasedItems: 0,
    doneItems: 0,
    partialItems: 0,
    totalItems: 0,
    skippedItems: 0,
    strengthActual: 0,
    strengthPlanned: 0,
  };
  for (const day of days) {
    for (const item of day.items) {
      if (!PLAN_ITEM_TYPES.has(item.activityType)) continue;
      if (item.planState === "SKIPPED") {
        out.skippedItems += 1;
        continue;
      }
      out.totalItems += 1;
      if (item.log?.outcome === "COMPLETED") out.doneItems += 1;
      else if (item.log?.outcome === "PARTIAL") out.partialItems += 1;
      if (item.activityType === "STRENGTH") {
        out.strengthPlanned += 1;
        continue;
      }
      const t = item.runningTarget;
      if (t?.kind === "DISTANCE") out.plannedDistanceM += t.distanceM;
      else if (t?.kind === "DURATION") out.timeBasedItems += 1;
      else if (t?.kind === "STRUCTURED") {
        let specifiedM = 0;
        let unmeasured = false;
        for (const block of t.steps) {
          const steps = block.kind === "REPEAT" ? block.steps : [block];
          for (const [index, step] of steps.entries()) {
            const repetitions = block.kind === "REPEAT"
              ? block.repeatCount - (!block.includeFinalRecovery && index === steps.length - 1 ? 1 : 0)
              : 1;
            if (repetitions === 0) continue;
            if (step.target.kind === "DISTANCE") specifiedM += repetitions * step.target.distanceM;
            else unmeasured = true;
          }
        }
        out.plannedDistanceM += specifiedM;
        if (unmeasured) out.unmeasuredStructuredItems += 1;
        // The estimate describes the whole item: count only its remainder.
        if (unmeasured && t.estimatedTotalDistanceM !== undefined) {
          out.estimatedStructuredM += Math.max(0, t.estimatedTotalDistanceM - specifiedM);
        }
      }
    }
  }
  // Actuals include off-plan logs: they are real training in this week.
  for (const log of logs) {
    if (log.activityType === "STRENGTH") {
      out.strengthActual += 1;
      continue;
    }
    if (log.activityType !== "RUNNING") continue;
    out.runningActualM += log.distanceM ?? 0;
    out.runningActualSec += log.movingDurationSec ?? 0;
  }
  return out;
}

const DAY_MS = 86_400_000;

export function countdownDays(eventDate: string, today: string): number {
  return Math.round(
    (parseDateOnly(eventDate).getTime() - parseDateOnly(today).getTime()) /
      DAY_MS,
  );
}

export type StripDay = {
  date: string;
  isToday: boolean;
  isRestDay: boolean;
  hasPlanned: boolean;
  hasLogged: boolean;
  allDone: boolean;
};

export function deriveStripDay(
  date: string,
  today: string,
  day: { isRestDay: boolean; items: Array<{ log: unknown }> } | undefined,
): StripDay {
  const items = day?.items ?? [];
  return {
    date,
    isToday: date === today,
    isRestDay: day?.isRestDay ?? false,
    hasPlanned: items.length > 0,
    hasLogged: items.some((i) => i.log !== null),
    allDone: items.length > 0 && items.every((i) => i.log !== null),
  };
}
