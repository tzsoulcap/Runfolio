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
import { formatDateTh, greetingTh, weekdayTh } from "@/lib/format";
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

function hourInTimeZone(tz: string, now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
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
    listLogs(userId, 3),
    getPrimaryGoal(userId),
  ]);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const todayDay = dayByDate.get(today);
  const items: TodayItem[] = (todayDay?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    activityType: item.activityType,
    runningTarget: item.runningTarget,
    plannedStartTime: item.plannedStartTime,
    note: item.note,
    planState: item.planState,
    log: item.log,
    status: item.status,
  }));
  const state = deriveTodayState(
    todayDay ? { isRestDay: todayDay.isRestDay, note: todayDay.note } : undefined,
    items,
  );
  const summary = summarizeWeek(days, rangeLogs);
  const strip = dates.map((d) => deriveStripDay(d, today, dayByDate.get(d)));

  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">วันนี้</h1>
      <p className="mt-1 text-base text-muted">
        วัน{weekdayTh(today)}ที่ {formatDateTh(today)} · {greetingTh(hourInTimeZone(tz))}
      </p>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:row-start-1">
          <TodayHero state={state} today={today} />
        </div>
        <div className="lg:col-span-2 lg:row-start-2">
          <WeekStrip days={strip} />
        </div>
        <div className="lg:col-span-3 lg:row-start-3">
          <WeekSummaryCard summary={summary} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1">
          <GoalCard goal={goal} today={today} />
        </div>
        <div className="lg:col-start-3 lg:row-start-2">
          <LatestJournal entries={latest} />
        </div>
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
