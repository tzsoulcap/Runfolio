import Link from "next/link";

import type { StripDay, WeekSummary } from "@/lib/domain/home";
import { countdownDays } from "@/lib/domain/home";
import { paceLabelFor } from "@/lib/domain/metrics";
import type { JournalEntry } from "@/lib/services/journal";
import type { raceGoals } from "@/lib/db/schema";
import {
  formatDateTh,
  formatDistanceM,
  formatHMS,
  goalCountdownTh,
  logDisplayName,
  weekdayTh,
} from "@/lib/format";

const WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function stripStateTh(day: StripDay): string | null {
  if (day.isRestDay) return "พัก";
  if (day.allDone) return "✓";
  if (day.hasLogged) return "●";
  if (day.hasPlanned) return "○";
  return null;
}

export function WeekStrip({ days }: { days: StripDay[] }) {
  return (
    <section aria-label="แถบสัปดาห์">
      <h2 className="text-xl font-semibold">สัปดาห์นี้</h2>
      <nav
        aria-label="ไปวันที่ในแผนซ้อม"
        className="mt-2 grid grid-cols-7 gap-1 rounded-card border border-line bg-paper p-2"
      >
        {days.map((d, i) => {
          const marker = stripStateTh(d);
          return (
            <Link
              key={d.date}
              href={`/plan#day-${d.date}`}
              aria-label={`ไปวัน${weekdayTh(d.date)}ที่ ${formatDateTh(d.date)}`}
              className={`flex min-h-11 flex-col items-center justify-center rounded-button text-base ${
                d.isToday ? "bg-forest font-semibold text-ivory" : ""
              }`}
            >
              <span className="text-sm">{WEEKDAY_SHORT[i]}</span>
              <span>{Number(d.date.slice(8, 10))}</span>
              <span
                aria-hidden="true"
                className={`text-xs leading-none ${d.isToday ? "text-ivory" : "text-forest"}`}
              >
                {marker ?? " "}
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

export function WeekSummaryCard({ summary }: { summary: WeekSummary }) {
  const planned =
    summary.plannedDistanceM > 0
      ? formatDistanceM(summary.plannedDistanceM)
      : "–";
  const qualifier =
    summary.timeBasedItems > 0
      ? "แผนระยะทางที่ระบุ"
      : "วางแผน";
  const extras: string[] = [];
  if (summary.timeBasedItems > 0)
    extras.push(`${summary.timeBasedItems} เซสชันแบบเวลา`);
  if (summary.estimatedStructuredM > 0)
    extras.push(`ประมาณ ${formatDistanceM(summary.estimatedStructuredM)}`);
  const runLine = `วิ่งแล้ว ${formatDistanceM(summary.runningActualM)} / ${qualifier} ${planned}${extras.length > 0 ? ` + ${extras.join(" + ")}` : ""}`;
  // ADR-0001: skipped items leave the denominator, partials show separately,
  // an all-skipped week reads ข้ามทั้งหมด instead of 0/0.
  const sessionsLine =
    summary.totalItems > 0
      ? `สำเร็จ ${summary.doneItems} / ${summary.totalItems} เซสชัน${summary.partialItems > 0 ? ` · ทำบางส่วน ${summary.partialItems}` : ""}`
      : summary.skippedItems > 0
        ? "ข้ามทั้งหมด"
        : "ยังไม่มีแผนในสัปดาห์นี้";
  return (
    <section aria-label="ภาพรวมสัปดาห์">
      <h2 className="text-xl font-semibold">ภาพรวมสัปดาห์</h2>
      <ul className="mt-2 space-y-1 rounded-card border border-line bg-paper p-4 text-base">
        <li>{runLine}</li>
        <li>{sessionsLine}</li>
        <li>
          Strength {summary.strengthActual} ครั้ง
          {summary.strengthPlanned > 0 &&
            ` / แผน ${summary.strengthPlanned} ครั้ง`}
        </li>
      </ul>
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
          className="mt-2 block rounded-card border border-line bg-paper p-4"
        >
          <p className="text-3xl font-semibold sm:text-4xl">
            {formatDistanceM(goal.distanceM)}
          </p>
          <p className="mt-1 text-base font-medium">
            {goal.eventName ??
              (goal.goalType === "FINISH" ? "ตั้งเป้าจบ" : "เป้าหมายเวลา")}
          </p>
          {goal.goalType === "TARGET_TIME" && goal.targetTimeSec !== null && (
            <p className="mt-0.5 text-base text-muted">
              เป้าเวลา {formatHMS(goal.targetTimeSec)}
            </p>
          )}
          <p className="mt-0.5 text-base text-muted">
            {goal.eventDate
              ? `${formatDateTh(goal.eventDate)} · ${goalCountdownTh(countdownDays(goal.eventDate, today))}`
              : "ยังไม่กำหนดวันแข่ง"}
          </p>
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
          className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
        >
          ดูทั้งหมด
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
            return (
              <li key={log.id}>
                <Link
                  href={`/journal/${log.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                >
                  <span>
                    <span className="text-base font-semibold">
                      {logDisplayName(log)}
                    </span>
                    {!plan && (
                      <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-sm text-muted">
                        นอกแผน
                      </span>
                    )}
                    <span className="block text-base text-muted">
                      {formatDistanceM(log.distanceM)}
                      {log.movingDurationSec !== null &&
                        ` · ${formatHMS(log.movingDurationSec)}`}
                      {pace !== null && ` · ${pace}/km`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">
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
