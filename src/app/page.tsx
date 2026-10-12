import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  deriveStripDay,
  deriveTodayState,
  summarizeWeek,
  type TodayItem,
} from "@/lib/domain/home";
import { mondayOf, todayInTimeZone, weekDates } from "@/lib/domain/week";
import { getPrimaryGoal } from "@/lib/services/goals";
import { listLogs, listLogsInRange } from "@/lib/services/journal";
import { listWeek } from "@/lib/services/planner";
import { getOwnProfile } from "@/lib/services/profile";
import { weekdayTh } from "@/lib/format";
import { TodayHero } from "@/features/home/today-hero";
import {
  GoalCard,
  LatestJournal,
  WeekStrip,
  WeekSummaryCard,
} from "@/features/home/sections";

function HomeFallback() {
  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">วันนี้</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดวันนี้…</p>
    </div>
  );
}

async function HomeContent() {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) {
    return (
      <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">วันนี้</h1>
        <div className="mt-4 rounded-card border border-line bg-paper p-6">
          <p className="text-base text-muted">
            เข้าสู่ระบบเพื่อดูแผนซ้อมวันนี้
          </p>
          <Link
            href="/login"
            className="mt-3 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }
  const profile = await getOwnProfile(userId);
  const tz = profile?.timezone ?? "Asia/Bangkok";
  const today = todayInTimeZone(tz);
  const monday = mondayOf(today);
  const dates = weekDates(monday);

  const [{ days }, rangeLogs, latest, goal] = await Promise.all([
    listWeek(userId, monday, today),
    listLogsInRange(userId, dates[0] ?? monday, dates[6] ?? monday),
    listLogs(userId, { limit: 3 }).then((r) => r.entries),
    getPrimaryGoal(userId),
  ]);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const todayDay = dayByDate.get(today);
  const items: TodayItem[] = (todayDay?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    activityType: item.activityType,
    runningTarget: item.runningTarget,
    intensityTarget: item.intensityTarget,
    plannedStartTime: item.plannedStartTime,
    note: item.note,
    planState: item.planState,
    strengthCount:
      item.activityType === "STRENGTH" ? item.exercises.length : undefined,
    log: item.log,
    status: item.status,
  }));
  const state = deriveTodayState(
    todayDay ? { isRestDay: todayDay.isRestDay, note: todayDay.note } : undefined,
    items,
  );
  const summary = summarizeWeek(days, rangeLogs);
  const strip = dates.map((d) => deriveStripDay(d, today, dayByDate.get(d)));

  const displayName = profile?.displayName?.trim() || "นักวิ่ง";
  return (
    <div className="mx-auto -mt-1 max-w-[640px]">
      <p className="px-0.5 text-[clamp(14px,3.5vw,16px)] text-muted">
        {weekdayTh(today)} {new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`))}
      </p>
      <h1 className="mt-0.5 px-0.5 text-[clamp(28px,7.3vw,32px)] leading-tight font-bold tracking-tight">
        สวัสดี {displayName}
      </h1>
      <div className="mt-2.5 space-y-3.5">
        <TodayHero state={state} today={today} />
        <div className="space-y-3 pt-1">
          <WeekStrip days={strip} />
          <WeekSummaryCard summary={summary} />
        </div>
        <GoalCard goal={goal} today={today} />
        <LatestJournal entries={latest} />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
