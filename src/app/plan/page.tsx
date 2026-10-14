import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import { formatDateTh, formatDayRange, formatDistanceM, weekdayTh } from "@/lib/format";
import {
  addDays,
  DateOnlySchema,
  mondayOf,
  todayInTimeZone,
  weekDates,
} from "@/lib/domain/week";
import { deriveStripDay, summarizeWeek } from "@/lib/domain/home";
import { StripDot } from "@/features/home/sections";
import { getOwnProfile } from "@/lib/services/profile";
import { listGoals } from "@/lib/services/goals";
import {
  listRunningMasters,
  listStrengthMasters,
  listWeek,
} from "@/lib/services/planner";
import { PlannerBoard } from "@/features/planner/planner-board";
import { PlanWeekMenu } from "@/features/planner/plan-week-menu";
import { toDayDTO } from "@/features/planner/types";
import type {
  MuscleGroup,
  StrengthPrescription,
} from "@/lib/domain/master";

const WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function PlanFallback() {
  return (
    <div className="planner-page mx-auto max-w-[640px]">
      <h1 className="text-3xl font-semibold sm:text-4xl">แผนซ้อม</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดแผนซ้อม…</p>
    </div>
  );
}

async function PlanContent({ week }: { week: string | undefined }) {
  const next = week ? `/plan?week=${week}` : "/plan";
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const profile = await getOwnProfile(userId);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const monday = DateOnlySchema.safeParse(week).success
    ? mondayOf(week as string)
    : mondayOf(today);
  const dates = weekDates(monday);

  const [{ week: weekRow, days }, masters, strength, goals] =
    await Promise.all([
      listWeek(userId, monday, today),
      listRunningMasters(),
      listStrengthMasters(),
      listGoals(userId),
    ]);
  const formMasters = masters.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    defaultTarget: m.defaultTarget,
    zoneMin: m.zoneMin,
    zoneMax: m.zoneMax,
  }));
  const strengthOptions = strength.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    muscleGroup: m.muscleGroup as MuscleGroup,
    repLabel: m.repLabel as "REPS" | "STEPS",
    defaultVariant: m.defaultVariant,
    defaultPrescription: m.defaultPrescription as StrengthPrescription,
    guidance: m.guidance,
    hint: m.hint,
  }));
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const hasItems = days.some((d) => d.items.length > 0);
  // Planned-only totals for the summary bar (actuals stay on Home/Progress).
  const planned = summarizeWeek(days, []);
  const runPlans = planned.totalItems - planned.strengthPlanned;
  const addTarget = dates.includes(today) ? today : (dates[0] ?? monday);

  return (
    <div className="planner-page mx-auto max-w-[640px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[clamp(28px,7.3vw,32px)] leading-tight font-bold tracking-tight">แผนซ้อม</h1>
        <PlanWeekMenu monday={monday} />
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Link
          href={`/plan?week=${addDays(monday, -7)}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-button hover:bg-ivory"
          aria-label="สัปดาห์ก่อน"
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
        </Link>
        <p className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums sm:text-base">
          {formatDayRange(dates[0] ?? monday, dates[6] ?? monday)}
          {" "}{monday.slice(0, 4)}
        </p>
        <Link
          href={`/plan?week=${addDays(monday, 7)}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-button hover:bg-ivory"
          aria-label="สัปดาห์ถัดไป"
        >
          <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
        </Link>
        <Link
          href="/plan"
          className="ml-2 inline-flex min-h-11 shrink-0 items-center rounded-button border border-line px-3 text-xs font-medium sm:text-sm"
        >
          สัปดาห์นี้
        </Link>
      </div>

      <nav aria-label="แถบสัปดาห์" className="week-calendar mt-1">
        {dates.map((d, i) => {
          const day = dayByDate.get(d);
          const stripDay = deriveStripDay(d, today, day);
          return (
            <a
              key={d}
              href={`#day-${d}`}
              aria-label={`ไปวัน${weekdayTh(d)}ที่ ${formatDateTh(d)}`}
              aria-current={d === today ? "date" : undefined}
              className="week-calendar-day rounded-button transition-colors hover:bg-ivory"
            >
              <span>{WEEKDAY_SHORT[i]}</span>
              <span className={`week-calendar-date ${d === today ? "bg-lime-soft font-medium" : ""}`}>
                <span>{Number(d.slice(8, 10))}</span>
                <span className="flex h-[18px] items-center"><StripDot day={stripDay} /></span>
              </span>
            </a>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-line py-2">
        <p className="text-[13px] tabular-nums sm:text-base">
          <span className="font-semibold">
          {planned.plannedDistanceM > 0
            ? formatDistanceM(planned.plannedDistanceM)
            : "–"}</span>{" "}
          · วิ่ง {runPlans} · Strength {planned.strengthPlanned}
        </p>
        <a
          href={`#day-${addTarget}-add`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-button bg-forest px-3 text-sm font-medium text-paper"
        >
          <Plus className="size-5" aria-hidden /> เพิ่มการซ้อม
        </a>
      </div>

      {planned.unmeasuredStructuredItems > 0 && (
        <p className="mt-2 text-xs text-muted">รวมระยะทุกช่วงที่ระบุแล้ว ไม่รวมช่วงที่ไม่ระบุระยะ</p>
      )}

      {!hasItems && (
        <p className="mt-4 rounded-card border border-line bg-paper p-4 text-base text-muted">
          สัปดาห์นี้ยังไม่มีแผน กด “เพิ่มการซ้อม” ในวันที่ต้องการได้เลย
        </p>
      )}

      <PlannerBoard
        initialDays={dates.map((d) => {
          const found = dayByDate.get(d);
          return found
            ? toDayDTO(found)
            : { id: d, date: d, isRestDay: false, note: null, items: [] };
        })}
        masters={formMasters}
        strengthMasters={strengthOptions}
        goals={goals}
        initialRevision={weekRow?.revision ?? 1}
        today={today}
      />
    </div>
  );
}

export default function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  return (
    <Suspense fallback={<PlanFallback />}>
      <PlanLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanLoader({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  // Personal data rendered per request: never prerender (also silences the
  // Date.now()-during-prerender error from todayInTimeZone()).
  await connection();
  const { week } = await searchParams;
  return <PlanContent week={week} />;
}
