import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CalendarDays, ChevronRight, Target } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import {
  GOAL_STATUS_TH,
  GOAL_TYPE_TH,
  formatDateTh,
  formatHMS,
  goalCountdownTh,
  goalDisplayName,
} from "@/lib/format";
import { countdownDays } from "@/lib/domain/home";
import { todayInTimeZone } from "@/lib/domain/week";
import { listAllGoals } from "@/lib/services/goals";
import { getOwnProfile } from "@/lib/services/profile";
import { GoalForm } from "@/features/goals/goal-form";

function GoalsFallback() {
  return (
    <div className="app-page">
      <h1 className="page-title">เป้าหมาย</h1>
      <p className="mt-2 text-sm text-muted">กำลังโหลดเป้าหมาย…</p>
    </div>
  );
}

type GoalRow = {
  id: string;
  distanceCode: string;
  goalType: string;
  targetTimeSec: number | null;
  eventName: string | null;
  eventDate: string | null;
  isPrimary: boolean;
  status: string;
};

function GoalListItem({ goal, today }: { goal: GoalRow; today: string }) {
  const done = goal.status !== "ACTIVE";
  const primary = goal.isPrimary && !done;
  const countdown = goal.eventDate
    ? goalCountdownTh(countdownDays(goal.eventDate, today))
    : null;

  if (primary) {
    return (
      <li>
        <Link
          href={`/goals/${goal.id}`}
          className="today-card block rounded-[20px] p-5 text-paper"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-charcoal">
              เป้าหมายหลัก
            </span>
            <Target className="size-7 text-lime" aria-hidden />
          </div>
          <h2 className="mt-4 text-[56px] leading-none font-semibold tracking-tight">
            {goal.distanceCode}
          </h2>
          <p className="mt-2 text-lg font-medium">{goalDisplayName(goal)}</p>
          <p className="mt-1 text-sm text-paper/85">
            {GOAL_TYPE_TH[goal.goalType] ?? goal.goalType}
            {goal.targetTimeSec !== null &&
              ` · ${formatHMS(goal.targetTimeSec)}`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper/25 pt-3">
            <CalendarDays className="size-4" aria-hidden />
            <span className="flex-1 text-sm">
              {goal.eventDate
                ? formatDateTh(goal.eventDate)
                : "ยังไม่กำหนดวันแข่ง"}
            </span>
            {countdown && (
              <span className="rounded-lg bg-lime px-2.5 py-1.5 text-xs font-semibold text-charcoal">
                {countdown}
              </span>
            )}
            <ChevronRight className="size-4" aria-hidden />
          </div>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/goals/${goal.id}`}
        className="flex min-h-[84px] items-center gap-3 rounded-[14px] border border-line px-3 py-3 hover:bg-ivory/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-soft">
          <Target
            className="size-6 text-forest"
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-[22px] font-semibold tracking-tight">
              {goal.distanceCode}
            </span>
            <span className="text-sm font-medium">{goalDisplayName(goal)}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            {GOAL_TYPE_TH[goal.goalType] ?? goal.goalType}
            {goal.eventDate && ` · ${formatDateTh(goal.eventDate)}`}
          </span>
          {done ? (
            <span className="mt-1 inline-block rounded-full bg-ivory px-2 py-0.5 text-xs text-muted">
              {GOAL_STATUS_TH[goal.status] ?? goal.status}
            </span>
          ) : (
            countdown && (
              <span className="mt-1 block text-xs font-medium text-forest">
                {countdown}
              </span>
            )
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

async function GoalsContent() {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent("/goals")}`);

  const [goals, profile] = await Promise.all([
    listAllGoals(userId),
    getOwnProfile(userId),
  ]);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const active = goals.filter((goal) => goal.status === "ACTIVE");
  const primary = active.find((goal) => goal.isPrimary);
  const others = active.filter((goal) => goal.id !== primary?.id);
  const done = goals.filter((goal) => goal.status !== "ACTIVE");

  return (
    <div className="app-page">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3">
        <h1 className="page-title">เป้าหมาย</h1>
        <GoalForm idSuffix="new" />
      </div>
      <p className="mt-1 text-sm text-muted">ตั้งจุดหมายให้การซ้อมของคุณ</p>

      {goals.length === 0 ? (
        <div className="mt-5 rounded-[16px] border border-dashed border-line px-5 py-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-lime-soft">
            <Target className="size-8 text-forest" aria-hidden />
          </span>
          <h2 className="section-title mt-4">ยังไม่มีเป้าหมาย</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            เพิ่มเป้าหมาย 5K, 10K, 21K หรือ 42K
            <br />
            แล้วค่อย ๆ ซ้อมไปด้วยกัน
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {primary && (
            <section aria-label="เป้าหมายหลัก">
              <ul>
                <GoalListItem goal={primary} today={today} />
              </ul>
            </section>
          )}
          {(others.length > 0 || !primary) && (
            <section aria-label="เป้าหมายที่กำลังทำ">
              <div className="flex items-center justify-between">
                <h2 className="section-title">
                  {primary ? "เป้าหมายอื่น" : "กำลังทำ"}
                </h2>
                <span className="text-sm text-muted">
                  {others.length} เป้าหมาย
                </span>
              </div>
              {others.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  ไม่มีเป้าหมายที่กำลังทำ
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {others.map((goal) => (
                    <GoalListItem key={goal.id} goal={goal} today={today} />
                  ))}
                </ul>
              )}
            </section>
          )}
          {done.length > 0 && (
            <section
              aria-label="เป้าหมายที่จบแล้ว"
              className="border-t border-line pt-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="section-title">จบแล้ว</h2>
                <span className="text-sm text-muted">
                  {done.length} เป้าหมาย
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {done.map((goal) => (
                  <GoalListItem key={goal.id} goal={goal} today={today} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<GoalsFallback />}>
      <GoalsContent />
    </Suspense>
  );
}
