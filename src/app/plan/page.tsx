import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Plus } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import { formatDateTh, formatDayRange, formatDistanceM, weekdayTh } from "@/lib/format";
import {
  addDays,
  DateOnlySchema,
  mondayOf,
  todayInTimeZone,
  weekDates,
} from "@/lib/domain/week";
import { summarizeWeek } from "@/lib/domain/home";
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
    <div>
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
    <div>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">แผนซ้อม</h1>
        <PlanWeekMenu monday={monday} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/plan?week=${addDays(monday, -7)}`}
          className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper text-xl"
          aria-label="สัปดาห์ก่อน"
        >
          ‹
        </Link>
        <p className="mx-1 text-base font-semibold tabular-nums">
          {formatDayRange(dates[0] ?? monday, dates[6] ?? monday)}
        </p>
        <Link
          href={`/plan?week=${addDays(monday, 7)}`}
          className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper text-xl"
          aria-label="สัปดาห์ถัดไป"
        >
          ›
        </Link>
        <Link
          href="/plan"
          className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-5 text-base font-medium"
        >
          สัปดาห์นี้
        </Link>
      </div>

      <nav aria-label="แถบสัปดาห์" className="mt-4 grid grid-cols-7 gap-1">
        {dates.map((d, i) => {
          const day = dayByDate.get(d);
          const count = day?.items.length ?? 0;
          return (
            <a
              key={d}
              href={`#day-${d}`}
              aria-label={`ไปวัน${weekdayTh(d)}ที่ ${formatDateTh(d)}`}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-base ${
                d === today ? "bg-lime font-semibold" : ""
              }`}
            >
              <span className="text-sm text-muted">{WEEKDAY_SHORT[i]}</span>
              <span className="font-medium tabular-nums">
                {Number(d.slice(8, 10))}
              </span>
              {day?.isRestDay ? (
                <span className="text-xs leading-none text-muted" aria-hidden="true">
                  พัก
                </span>
              ) : count > 0 ? (
                <span aria-hidden="true" className="size-2 rounded-full bg-lime-deep" />
              ) : (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full border border-line-strong"
                />
              )}
            </a>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold tabular-nums">
          {planned.plannedDistanceM > 0
            ? formatDistanceM(planned.plannedDistanceM)
            : "–"}{" "}
          · วิ่ง {runPlans} · Strength {planned.strengthPlanned}
        </p>
        <Link
          href={`#day-${addTarget}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-button bg-forest px-5 text-base font-medium text-ivory"
        >
          <Plus className="size-5" aria-hidden /> เพิ่มการซ้อม
        </Link>
      </div>

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
