import { addDays, mondayOf } from "@/lib/domain/week";
import {
  bucketByWeek,
  countMissed,
  paceByType,
  summarizeRange,
  trainingDays,
  type ProgressDay,
} from "@/lib/domain/progress";
import type { WeekSummary } from "@/lib/domain/home";

import { listProgressLogs } from "./journal";
import { listWeek } from "./planner";

// Inclusive day span cap: 91 days back + `to` itself = 92 days wiring at
// most 14 weekly reads.
export const PROGRESS_RANGE_DAYS = 91;
export const PROGRESS_CHART_WEEKS = 10;

export type ProgressData = {
  effectiveFrom: string;
  to: string;
  summary: WeekSummary;
  missed: number;
  trainingDaysCount: number;
  runningSessions: number;
  strengthSessions: number;
  paceRows: ReturnType<typeof paceByType>;
  buckets: ReturnType<typeof bucketByWeek>;
};

// §14 aggregates over [from, to], plus a trailing 10-week distance chart.
// Plans come from listWeek (same derivation as planner/home); logs are
// active-only in performed-date range. Ranges clamp to 92 days.
export async function getProgress(
  userId: string,
  args: { from: string; to: string; today: string },
): Promise<ProgressData> {
  const to = args.to;
  const minFrom = addDays(to, -PROGRESS_RANGE_DAYS);
  const from = args.from < minFrom ? minFrom : args.from;

  const days: ProgressDay[] = [];
  for (
    let monday = mondayOf(from);
    monday <= mondayOf(to);
    monday = addDays(monday, 7)
  ) {
    const { days: weekDays } = await listWeek(userId, monday, args.today);
    for (const day of weekDays) {
      if (day.date < from || day.date > to) continue;
      days.push({
        date: day.date,
        items: day.items.map((item) => ({
          activityType: item.activityType,
          runningTarget: item.runningTarget,
          planState: item.planState,
          log: item.log ? { outcome: item.log.outcome } : null,
        })),
      });
    }
  }

  const [rangeLogs, chartLogs] = await Promise.all([
    listProgressLogs(userId, from, to),
    listProgressLogs(
      userId,
      addDays(mondayOf(to), -(PROGRESS_CHART_WEEKS - 1) * 7),
      to,
    ),
  ]);
  const summary = summarizeRange(days, rangeLogs);
  const running: typeof rangeLogs = [];
  let strengthSessions = 0;
  for (const log of rangeLogs) {
    if (log.activityType === "RUNNING") running.push(log);
    else if (log.activityType === "STRENGTH") strengthSessions += 1;
  }
  const chartRunning = chartLogs.filter((l) => l.activityType === "RUNNING");
  return {
    effectiveFrom: from,
    to,
    summary,
    missed: countMissed(days, args.today),
    trainingDaysCount: trainingDays(rangeLogs.map((l) => l.performedDate)),
    runningSessions: running.length,
    strengthSessions,
    paceRows: paceByType(
      running.map((l) => ({
        code: l.runningWorkoutCode ?? "UNKNOWN",
        distanceM: l.distanceM,
        movingDurationSec: l.movingDurationSec,
      })),
    ),
    buckets: bucketByWeek(
      chartRunning.map((l) => ({
        performedDate: l.performedDate,
        distanceM: l.distanceM,
      })),
      mondayOf(to),
      PROGRESS_CHART_WEEKS,
    ),
  };
}
