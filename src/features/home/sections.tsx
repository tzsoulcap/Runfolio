import Link from "next/link";
import { Check, ChevronRight, Dumbbell, Target } from "lucide-react";

import { RunningIcon } from "@/components/running-icon";
import type { StripDay, WeekSummary } from "@/lib/domain/home";
import { paceLabelFor } from "@/lib/domain/metrics";
import type { JournalEntry } from "@/lib/services/journal";
import type { GoalWithProgress } from "@/lib/services/goals";
import { GoalSummaryCard } from "@/features/goals/goal-summary-card";
import {
  formatDateTh,
  formatDayMonthTh,
  formatDayRange,
  formatDistanceM,
  formatHMS,
  formatKm,
  logDisplayName,
  weekdayTh,
} from "@/lib/format";

const WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function StripDot({ day }: { day: StripDay }) {
  if (day.allDone)
    return (
      <span aria-hidden className="flex size-[18px] items-center justify-center rounded-full bg-[#477b2e] text-paper">
        <Check className="size-3" strokeWidth={2.5} />
      </span>
    );
  if (day.isToday)
    return <span aria-hidden className="size-[9px] rounded-full bg-forest" />;
  if (day.hasLogged || day.hasPlanned)
    return <span aria-hidden className={`size-[9px] rounded-full ${day.hasLogged ? "bg-forest" : "bg-lime-deep"}`} />;
  return <span aria-hidden className="size-[9px] rounded-full border-[1.5px] border-line-strong" />;
}

export function WeekStrip({ days }: { days: StripDay[] }) {
  const from = days[0]?.date;
  const to = days[days.length - 1]?.date;
  return (
    <section aria-label="แถบสัปดาห์">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">สัปดาห์นี้</h2>
        {from && to && <p className="text-sm text-muted">{formatDayRange(from, to)}</p>}
      </div>
      <nav aria-label="ไปวันที่ในแผนซ้อม" className="week-calendar mt-1.5">
        {days.map((day, i) => (
          <Link
            key={day.date}
            href={`/plan#day-${day.date}`}
            aria-label={`ไปวัน${weekdayTh(day.date)}ที่ ${formatDateTh(day.date)}${day.isRestDay ? " วันพัก" : ""}`}
            aria-current={day.isToday ? "date" : undefined}
            className="week-calendar-day rounded-button transition-colors hover:bg-ivory"
          >
            <span>{WEEKDAY_SHORT[i]}</span>
            <span className={`week-calendar-date ${day.isToday ? "bg-lime-soft font-medium" : ""}`}>
              <span>{Number(day.date.slice(8, 10))}</span>
              <span className="flex h-[18px] items-center"><StripDot day={day} /></span>
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

export function WeekSummaryCard({ summary }: { summary: WeekSummary }) {
  const definite = summary.plannedDistanceM > 0 && summary.timeBasedItems === 0 && summary.unmeasuredStructuredItems === 0;
  const pct = definite ? Math.min(100, (summary.runningActualM / summary.plannedDistanceM) * 100) : null;
  const extras: string[] = [];
  if (summary.timeBasedItems > 0) extras.push(`${summary.timeBasedItems} เซสชันแบบเวลา`);
  if (summary.estimatedStructuredM > 0) extras.push(`ประมาณ ${formatDistanceM(summary.estimatedStructuredM)}`);
  if (summary.unmeasuredStructuredItems > 0) extras.push("รวมระยะทุกช่วงที่ระบุแล้ว ไม่รวมช่วงที่ไม่ระบุระยะ");

  return (
    <section aria-label="ภาพรวมสัปดาห์" className="border-t border-line pt-3">
      <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="pr-3">
          <p className="flex flex-wrap items-baseline gap-x-1 leading-none">
            <span className="text-[clamp(32px,8vw,38px)] font-semibold tracking-tight">{(summary.runningActualM / 1000).toFixed(1)}</span>{" "}
            <span className="text-[clamp(18px,4.6vw,22px)]">/ {summary.plannedDistanceM > 0 ? formatKm(summary.plannedDistanceM) : "–"} km</span>
          </p>
          <p className="mt-1 text-xs text-muted sm:text-sm">ระยะวิ่ง</p>
          {pct !== null && (
            <div role="progressbar" aria-label="ระยะวิ่งเทียบแผน" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-[#eeece7]">
              <div className="h-full rounded-full bg-gradient-to-r from-forest to-[#517446]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="border-l border-line px-3 pt-1">
          <p className="flex flex-wrap items-baseline gap-x-1 leading-none">
            {summary.totalItems > 0 ? <><span className="text-2xl font-semibold">{summary.doneItems}</span>{" "}<span className="text-base">/ {summary.totalItems}</span></> : <span className="text-lg font-semibold">{summary.skippedItems > 0 ? "ข้ามทั้งหมด" : "–"}</span>}
          </p>
          <p className="mt-1.5 text-xs text-muted sm:text-sm">ทำสำเร็จ</p>
          {summary.partialItems > 0 && <p className="mt-1 text-xs text-muted">บางส่วน {summary.partialItems}</p>}
        </div>
        <div className="border-l border-line pl-3 pt-1">
          <p className="text-2xl leading-none font-semibold">{summary.strengthActual}</p>
          <p className="mt-1.5 text-xs text-muted sm:text-sm">Strength</p>
        </div>
      </div>
      {extras.length > 0 && <p className="mt-2 text-xs text-muted">{extras.join(" · ")}</p>}
    </section>
  );
}

export function GoalCard({ goals, today }: { goals: GoalWithProgress[]; today: string }) {
  const primary = goals.find(goal => goal.isPrimary);
  const others = goals.filter(goal => goal.id !== primary?.id);
  return (
    <div className="space-y-3">
      <section aria-label="เป้าหมายหลัก">
        {primary ? <GoalSummaryCard goal={primary} today={today} compact /> : (
          <Link href="/goals" className="flex min-h-20 items-center gap-3 rounded-[14px] border border-line px-3 py-2.5">
            <Target className="size-7 shrink-0 text-forest" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted">เป้าหมายหลัก</span><span className="block text-sm">ยังไม่มีเป้าหมายหลัก</span></span>
            <span className="text-xs font-medium text-forest">ตั้งเป้าหมาย</span><ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        )}
      </section>
      {others.length > 0 && <section aria-label="เป้าหมายอื่น">
        <h2 className="mb-2 text-base font-semibold">เป้าหมายอื่น</h2>
        <ul className="space-y-2">{others.map(goal => <li key={goal.id}><GoalSummaryCard goal={goal} today={today} compact /></li>)}</ul>
      </section>}
    </div>
  );
}

export function LatestJournal({ entries }: { entries: JournalEntry[] }) {
  return (
    <section aria-label="บันทึกล่าสุด">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[clamp(18px,4.4vw,20px)] font-semibold">บันทึกล่าสุด</h2>
        <Link href="/journal" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">ดูทั้งหมด<ChevronRight className="size-4" aria-hidden /></Link>
      </div>
      {entries.length === 0 ? (
        <div className="border-t border-line py-3">
          <p className="text-sm text-muted">ยังไม่มีบันทึก</p>
          <Link href="/plan" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-forest">ไปวางแผน<ChevronRight className="ml-1 size-4" aria-hidden /></Link>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {entries.map(({ log, plan }) => {
            const pace = paceLabelFor(log.distanceM, log.movingDurationSec);
            const isStrength = log.activityType === "STRENGTH";
            const Icon = isStrength ? Dumbbell : RunningIcon;
            return (
              <li key={log.id}>
                <Link href={`/journal/${log.id}`} className="flex min-h-[56px] items-center gap-3 py-2">
                  <Icon className={`size-6 shrink-0 text-forest ${isStrength ? "rotate-45" : ""}`} strokeWidth={1.7} aria-hidden />
                  <span className="w-[58px] shrink-0 text-[clamp(12px,3.1vw,14px)] text-muted">{formatDayMonthTh(log.performedDate)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[clamp(14px,3.5vw,16px)] font-medium">{logDisplayName(log)}</span>
                    <span className="block text-[clamp(12px,3.1vw,14px)] text-muted">
                      {isStrength ? "Strength" : formatDistanceM(log.distanceM)}
                      {pace !== null ? ` · ${pace}/km` : log.movingDurationSec !== null ? ` · ${formatHMS(log.movingDurationSec)}` : ""}
                      {!plan && " · นอกแผน"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
