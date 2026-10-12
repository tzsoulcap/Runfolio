import Link from "next/link";
import { Dumbbell, Route, Target } from "lucide-react";

import type { StripDay, WeekSummary } from "@/lib/domain/home";
import { countdownDays } from "@/lib/domain/home";
import { paceLabelFor } from "@/lib/domain/metrics";
import type { JournalEntry } from "@/lib/services/journal";
import type { raceGoals } from "@/lib/db/schema";
import {
  formatDateTh,
  formatDayMonthTh,
  formatDayRange,
  formatDistanceM,
  formatHMS,
  formatKm,
  goalCountdownTh,
  logDisplayName,
  weekdayTh,
} from "@/lib/format";

const WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function StripDot({ day }: { day: StripDay }) {
  if (day.isRestDay)
    return (
      <span className="text-xs leading-none text-muted" aria-hidden="true">
        พัก
      </span>
    );
  if (day.allDone)
    return (
      <span
        aria-hidden="true"
        className="flex size-4 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-ivory"
      >
        ✓
      </span>
    );
  if (day.hasLogged || day.hasPlanned)
    return (
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${day.hasLogged ? "bg-forest" : "bg-lime-deep"}`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className="size-2 rounded-full border border-line-strong"
    />
  );
}

export function WeekStrip({ days }: { days: StripDay[] }) {
  const from = days[0]?.date;
  const to = days[days.length - 1]?.date;
  return (
    <section aria-label="แถบสัปดาห์">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">สัปดาห์นี้</h2>
        {from && to && (
          <p className="text-sm text-muted">{formatDayRange(from, to)}</p>
        )}
      </div>
      <nav
        aria-label="ไปวันที่ในแผนซ้อม"
        className="mt-2 grid grid-cols-7 gap-1"
      >
        {days.map((d, i) => (
          <Link
            key={d.date}
            href={`/plan#day-${d.date}`}
            aria-label={`ไปวัน${weekdayTh(d.date)}ที่ ${formatDateTh(d.date)}`}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-base ${
              d.isToday ? "bg-lime font-semibold" : ""
            }`}
          >
            <span className="text-sm text-muted">{WEEKDAY_SHORT[i]}</span>
            <span className="font-medium tabular-nums">
              {Number(d.date.slice(8, 10))}
            </span>
            <StripDot day={d} />
          </Link>
        ))}
      </nav>
    </section>
  );
}

export function WeekSummaryCard({ summary }: { summary: WeekSummary }) {
  const definite =
    summary.plannedDistanceM > 0 &&
    summary.timeBasedItems === 0 &&
    summary.estimatedStructuredM === 0;
  const extras: string[] = [];
  if (summary.timeBasedItems > 0)
    extras.push(`${summary.timeBasedItems} เซสชันแบบเวลา`);
  if (summary.estimatedStructuredM > 0)
    extras.push(`ประมาณ ${formatDistanceM(summary.estimatedStructuredM)}`);
  const sessions =
    summary.totalItems > 0
      ? `${summary.doneItems} / ${summary.totalItems}`
      : summary.skippedItems > 0
        ? "ข้ามทั้งหมด"
        : "–";
  const pct =
    definite && summary.plannedDistanceM > 0
      ? Math.min(100, (summary.runningActualM / summary.plannedDistanceM) * 100)
      : null;
  return (
    <section aria-label="ภาพรวมสัปดาห์">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="truncate text-xl font-bold tabular-nums sm:text-2xl">
            {formatKm(summary.runningActualM)} /{" "}
            {summary.plannedDistanceM > 0
              ? `${formatKm(summary.plannedDistanceM)} km`
              : "– km"}
          </p>
          <p className="mt-0.5 text-sm text-muted">ระยะวิ่ง</p>
          {pct !== null && (
            <div
              role="progressbar"
              aria-label="ระยะวิ่งเทียบแผน"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-2 overflow-hidden rounded-full bg-forest/15"
            >
              <div
                className="h-full rounded-full bg-forest"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <div>
          <p
            className={`truncate tabular-nums ${sessions.length > 7 ? "text-base font-semibold" : "text-xl font-bold sm:text-2xl"}`}
          >
            {sessions}
          </p>
          <p className="mt-0.5 text-sm text-muted">ทำสำเร็จ</p>
          {summary.partialItems > 0 && (
            <p className="mt-0.5 text-sm text-muted">
              ทำบางส่วน {summary.partialItems}
            </p>
          )}
        </div>
        <div>
          <p className="text-xl font-bold tabular-nums sm:text-2xl">
            {summary.strengthActual}
          </p>
          <p className="mt-0.5 text-sm text-muted">Strength</p>
          {summary.strengthPlanned > 0 && (
            <p className="mt-0.5 text-sm text-muted">
              แผน {summary.strengthPlanned} ครั้ง
            </p>
          )}
        </div>
      </div>
      {extras.length > 0 && (
        <p className="mt-2 text-sm text-muted">+ {extras.join(" + ")}</p>
      )}
      <p className="mt-1 text-sm text-muted">
        ผลจริงนับตามวันที่ซ้อม ความสำเร็จอ้างตามสัปดาห์ของแผน
      </p>
    </section>
  );
}

type GoalRow = typeof raceGoals.$inferSelect;

export function GoalCard({ goal, today }: { goal: GoalRow | null; today: string }) {
  return (
    <section aria-label="เป้าหมายหลัก">
      <h2 className="text-xl font-semibold">เป้าหมายหลัก</h2>
      {goal === null ? (
        <div className="mt-2 rounded-card border border-line bg-paper p-4">
          <p className="text-base text-muted">ยังไม่มีเป้าหมายหลัก</p>
          <Link
            href="/goals"
            className="mt-3 inline-flex h-11 items-center rounded-button border border-line bg-paper px-5 text-base"
          >
            ตั้งเป้าหมาย
          </Link>
        </div>
      ) : (
        <Link
          href="/goals"
          className="mt-2 flex items-center gap-3 rounded-card border border-line bg-paper p-4"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest/10">
            <Target className="size-5 text-forest" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-2xl font-bold tracking-tight">
              {goal.distanceCode}
              {goal.eventName && (
                <span className="ml-2 align-middle text-base font-medium text-charcoal">
                  {goal.eventName}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {goal.eventDate ? formatDateTh(goal.eventDate) : "ยังไม่กำหนดวันแข่ง"}
              {goal.goalType === "TARGET_TIME" &&
                goal.targetTimeSec !== null &&
                ` · เป้าเวลา ${formatHMS(goal.targetTimeSec)}`}
            </span>
          </span>
          {goal.eventDate && (
            <span className="shrink-0 rounded-full bg-lime px-3 py-1 text-sm font-semibold text-charcoal">
              {goalCountdownTh(countdownDays(goal.eventDate, today))}
            </span>
          )}
        </Link>
      )}
    </section>
  );
}

export function LatestJournal({ entries }: { entries: JournalEntry[] }) {
  return (
    <section aria-label="บันทึกล่าสุด">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">บันทึกล่าสุด</h2>
        <Link
          href="/journal"
          className="inline-flex min-h-11 items-center gap-1 text-base font-medium text-charcoal"
        >
          ดูทั้งหมด <span aria-hidden="true">›</span>
        </Link>
      </div>
      {entries.length === 0 ? (
        <div className="mt-2 rounded-card border border-line bg-paper p-4">
          <p className="text-base text-muted">ยังไม่มีบันทึก</p>
          <Link
            href="/plan"
            className="mt-3 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
          >
            ไปวางแผน
          </Link>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-paper">
          {entries.map(({ log, plan }) => {
            const pace = paceLabelFor(log.distanceM, log.movingDurationSec);
            const Icon =
              log.activityType === "STRENGTH" ? Dumbbell : Route;
            return (
              <li key={log.id}>
                <Link
                  href={`/journal/${log.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3"
                >
                  <Icon
                    className="size-5 shrink-0 text-forest"
                    aria-hidden
                  />
                  <span className="w-14 shrink-0 text-sm text-muted tabular-nums">
                    {formatDayMonthTh(log.performedDate)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {logDisplayName(log)}
                      {!plan && (
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 align-middle text-xs font-normal text-muted">
                          นอกแผน
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-muted">
                      {formatDistanceM(log.distanceM)}
                      {log.movingDurationSec !== null &&
                        ` · ${formatHMS(log.movingDurationSec)}`}
                      {pace !== null && ` · ${pace}/km`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-muted">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
