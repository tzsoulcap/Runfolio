import { addDays, mondayOf } from "./week";
import {
  summarizeWeek,
  type WeekSummary,
  type WeekSummaryDay,
  type WeekSummaryLog,
} from "./home";
import { paceSecPerKm } from "./metrics";

export type ProgressDay = WeekSummaryDay & { date: string };

// Core aggregates reuse the home week math verbatim (§14): one definition of
// actuals, planned distance, and completion across every surface.
export function summarizeRange(
  days: ProgressDay[],
  logs: WeekSummaryLog[],
): WeekSummary {
  return summarizeWeek(days, logs);
}

export type CompletionCounts = Pick<
  WeekSummary,
  "doneItems" | "partialItems" | "totalItems" | "skippedItems"
>;

// ADR-0001: partials show separately with no 0.5 score; empty denominators
// name their state instead of showing 0% or 100%.
export function completionText(counts: CompletionCounts): string {
  if (counts.totalItems > 0) {
    const base = `สำเร็จ ${counts.doneItems} / ${counts.totalItems} เซสชัน`;
    return counts.partialItems > 0
      ? `${base} · ทำบางส่วน ${counts.partialItems}`
      : base;
  }
  return counts.skippedItems > 0 ? "ข้ามทั้งหมด" : "ยังไม่มีแผน";
}

// Missed: past plan items that went quiet — neither logged nor skipped.
// Future items are pending, never missed.
export function countMissed(days: ProgressDay[], today: string): number {
  let missed = 0;
  for (const day of days) {
    if (day.date >= today) continue;
    for (const item of day.items) {
      if (item.activityType !== "RUNNING" && item.activityType !== "STRENGTH") {
        continue;
      }
      if (item.planState === "SKIPPED") continue;
      if (!item.log) missed += 1;
    }
  }
  return missed;
}

export function trainingDays(performedDates: string[]): number {
  return new Set(performedDates).size;
}

export type PaceByTypeRow = {
  code: string;
  distanceM: number;
  movingDurationSec: number;
  paceSecPerKm: number | null;
};

// Pace per workout type from summed moving time (§8): never compare Easy
// against Interval without that context, and never average per-session paces.
export function paceByType(
  logs: Array<{
    code: string;
    distanceM: number | null;
    movingDurationSec: number | null;
  }>,
): PaceByTypeRow[] {
  const byCode = new Map<string, { distanceM: number; sec: number }>();
  for (const log of logs) {
    const acc = byCode.get(log.code) ?? { distanceM: 0, sec: 0 };
    acc.distanceM += log.distanceM ?? 0;
    acc.sec += log.movingDurationSec ?? 0;
    byCode.set(log.code, acc);
  }
  return [...byCode].map(([code, acc]) => ({
    code,
    distanceM: acc.distanceM,
    movingDurationSec: acc.sec,
    paceSecPerKm:
      acc.distanceM > 0 ? paceSecPerKm(acc.distanceM, acc.sec) : null,
  }));
}

export type WeekBucket = { monday: string; distanceM: number };

// Distance buckets for the weekly chart: `weekCount` weeks ending at
// `endMonday`, zero-filled so quiet weeks still render.
export function bucketByWeek(
  logs: Array<{ performedDate: string; distanceM: number | null }>,
  endMonday: string,
  weekCount: number,
): WeekBucket[] {
  const buckets = new Map<string, number>();
  const start = addDays(endMonday, -(weekCount - 1) * 7);
  for (let m = start; m <= endMonday; m = addDays(m, 7)) {
    buckets.set(m, 0);
  }
  for (const log of logs) {
    const monday = mondayOf(log.performedDate);
    if (buckets.has(monday)) {
      buckets.set(monday, (buckets.get(monday) ?? 0) + (log.distanceM ?? 0));
    }
  }
  return [...buckets].map(([monday, distanceM]) => ({ monday, distanceM }));
}
