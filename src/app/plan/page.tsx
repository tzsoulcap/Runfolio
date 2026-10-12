import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import { formatDateTh, weekdayTh } from "@/lib/format";
import {
  addDays,
  DateOnlySchema,
  mondayOf,
  todayInTimeZone,
  weekDates,
} from "@/lib/domain/week";
import { getOwnProfile } from "@/lib/services/profile";
import { listGoals } from "@/lib/services/goals";
import {
  listRunningMasters,
  listStrengthMasters,
  listWeek,
} from "@/lib/services/planner";
import { DaySection } from "@/features/planner/day-section";
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

  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">แผนซ้อม</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/plan?week=${addDays(monday, -7)}`}
          className="inline-flex h-11 items-center rounded-button border border-line bg-paper px-4 text-base"
          aria-label="สัปดาห์ก่อน"
        >
          ‹
        </Link>
        <Link
          href="/plan"
          className="inline-flex h-11 items-center rounded-button border border-line bg-paper px-4 text-base"
        >
          สัปดาห์นี้
        </Link>
        <Link
          href={`/plan?week=${addDays(monday, 7)}`}
          className="inline-flex h-11 items-center rounded-button border border-line bg-paper px-4 text-base"
          aria-label="สัปดาห์ถัดไป"
        >
          ›
        </Link>
        <p className="ml-1 text-base text-muted">
          {formatDateTh(dates[0] ?? monday)} –{" "}
          {formatDateTh(dates[6] ?? monday)}
        </p>
      </div>

      <nav
        aria-label="แถบสัปดาห์"
        className="mt-4 grid grid-cols-7 gap-1 rounded-card border border-line bg-paper p-2"
      >
        {dates.map((d, i) => (
          <a
            key={d}
            href={`#day-${d}`}
            aria-label={`ไปวัน${weekdayTh(d)}ที่ ${formatDateTh(d)}`}
            className={`flex min-h-11 flex-col items-center justify-center rounded-button text-base ${
              d === today ? "bg-forest font-semibold text-ivory" : ""
            }`}
          >
            <span className="text-sm">{WEEKDAY_SHORT[i]}</span>
            <span>{Number(d.slice(8, 10))}</span>
            {(dayByDate.get(d)?.items.length ?? 0) > 0 && (
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${d === today ? "bg-ivory" : "bg-forest"}`}
              />
            )}
          </a>
        ))}
      </nav>

      {!hasItems && (
        <p className="mt-4 rounded-card border border-line bg-paper p-4 text-base text-muted">
          สัปดาห์นี้ยังไม่มีแผน กด “เพิ่มการซ้อม” ในวันที่ต้องการได้เลย
        </p>
      )}

      <div className="mt-4">
        {dates.map((d) => (
          <DaySection
            key={d}
            date={d}
            day={dayByDate.get(d)}
            masters={formMasters}
            strengthMasters={strengthOptions}
            goals={goals}
            revision={weekRow?.revision ?? 1}
            today={today}
          />
        ))}
      </div>
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
