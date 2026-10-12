import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeft, Target } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import {
  GOAL_STATUS_TH,
  GOAL_TYPE_TH,
  formatDateTh,
  formatDistanceM,
  formatHMS,
  goalCountdownTh,
  goalDisplayName,
  weekdayTh,
} from "@/lib/format";
import { countdownDays } from "@/lib/domain/home";
import { targetPaceSecPerKm } from "@/lib/domain/goal";
import { formatPace } from "@/lib/domain/metrics";
import { todayInTimeZone } from "@/lib/domain/week";
import { ServiceError } from "@/lib/services/errors";
import { getGoal, listResultCandidates } from "@/lib/services/goals";
import { getOwnProfile } from "@/lib/services/profile";
import { PagePlaceholder } from "@/components/page-placeholder";
import { GoalForm, type GoalFormInitial } from "@/features/goals/goal-form";
import {
  AchieveGoalButton,
  ArchiveGoalButton,
  LinkResultForm,
  SetPrimaryButton,
  UnlinkResultButton,
} from "@/features/goals/goal-actions";

function splitHMS(totalSec: number) {
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

async function GoalDetail({ id }: { id: string }) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/goals/${id}`)}`);
  }
  let detail;
  try {
    detail = await getGoal(userId, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }
  const profile = await getOwnProfile(userId);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const { goal, resultLog } = detail;
  const name = goalDisplayName(goal);
  const targetPace =
    goal.goalType === "TARGET_TIME" && goal.targetTimeSec !== null
      ? formatPace(targetPaceSecPerKm(goal.distanceM, goal.targetTimeSec))
      : null;
  // No status limit (§8): achieve-first-then-link is a valid flow.
  const candidates = resultLog ? [] : await listResultCandidates(userId);
  const target =
    goal.targetTimeSec !== null ? splitHMS(goal.targetTimeSec) : null;
  const initial: GoalFormInitial = {
    distanceCode: goal.distanceCode,
    goalType: goal.goalType === "TARGET_TIME" ? "TARGET_TIME" : "FINISH",
    eventName: goal.eventName ?? "",
    eventDate: goal.eventDate ?? "",
    targetHours: target !== null ? String(target.hours) : "",
    targetMinutes: target !== null ? String(target.minutes) : "",
    targetSeconds: target !== null ? String(target.seconds) : "",
  };

  return (
    <div className="app-page">
      <Link
        href="/goals"
        className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted"
      >
        <ChevronLeft className="size-5" aria-hidden />
        เป้าหมายทั้งหมด
      </Link>
      <h1 className="page-title mt-1">
        {name} {goal.distanceCode}
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        {GOAL_TYPE_TH[goal.goalType] ?? goal.goalType}
        <span className="rounded-full bg-ivory px-2 py-0.5 text-xs">
          {GOAL_STATUS_TH[goal.status] ?? goal.status}
        </span>
        {goal.isPrimary && goal.status === "ACTIVE" && (
          <span className="rounded-full bg-lime-soft px-2 py-0.5 text-xs text-forest">
            หลัก
          </span>
        )}
      </p>

      <dl className="today-card mt-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-[20px] p-5 text-paper">
        <div className="col-span-full">
          <dt className="flex items-center justify-between text-sm text-paper/85">
            ระยะทาง
            <Target className="size-6 text-lime" aria-hidden />
          </dt>
          <dd className="mt-1 text-[44px] leading-tight font-semibold tracking-tight">
            {formatDistanceM(goal.distanceM)}
          </dd>
        </div>
        <div className="border-t border-paper/25 pt-3">
          <dt className="text-xs text-paper/85">วันแข่ง</dt>
          <dd className="mt-1 text-sm font-medium">
            {goal.eventDate ? formatDateTh(goal.eventDate) : "–"}
          </dd>
        </div>
        <div className="border-t border-paper/25 pt-3">
          <dt className="text-xs text-paper/85">นับถอยหลัง</dt>
          <dd className="mt-1 text-sm font-medium text-lime">
            {goal.eventDate
              ? goalCountdownTh(countdownDays(goal.eventDate, today))
              : "–"}
          </dd>
        </div>
      </dl>

      {goal.goalType === "TARGET_TIME" && (
        <section aria-label="เวลาเป้าหมาย" className="surface mt-4">
          <h2 className="section-title">เวลาเป้าหมาย</h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-2 text-lg font-medium">
            {goal.targetTimeSec !== null ? formatHMS(goal.targetTimeSec) : "–"}
            {targetPace !== null && ` · เพซ ${targetPace}/km`}
          </p>
          <p className="mt-1 text-sm text-muted">
            เพซคำนวณจากระยะทางและเวลาเป้าหมายที่คุณตั้งไว้
          </p>
        </section>
      )}

      <section aria-label="ผลการแข่งขัน" className="surface mt-4">
        <h2 className="section-title">ผลการแข่งขัน</h2>
        {resultLog ? (
          <div className="mt-2">
            <Link
              href={`/journal/${resultLog.id}`}
              className="text-base font-medium text-forest underline underline-offset-4"
            >
              วัน{weekdayTh(resultLog.performedDate)}ที่{" "}
              {formatDateTh(resultLog.performedDate)} ·{" "}
              {formatDistanceM(resultLog.distanceM)}
              {resultLog.movingDurationSec !== null &&
                ` · ${formatHMS(resultLog.movingDurationSec)}`}
            </Link>
            {resultLog.note && (
              <p className="mt-1 text-base text-charcoal">{resultLog.note}</p>
            )}
            <div className="mt-2">
              <UnlinkResultButton goalId={goal.id} />
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              ยังไม่เชื่อมผล เลือกผล Race Day ได้เอง งานซ้อมไม่ต้องผูก
            </p>
            <LinkResultForm goalId={goal.id} candidates={candidates} />
          </>
        )}
      </section>

      {goal.status === "ACTIVE" && (
        <section aria-label="จัดการเป้าหมาย" className="surface mt-4">
          <h2 className="section-title">จัดการเป้าหมาย</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {!goal.isPrimary && <SetPrimaryButton goalId={goal.id} />}
            <AchieveGoalButton goalId={goal.id} />
            <ArchiveGoalButton goalId={goal.id} />
          </div>
          <div className="mt-2">
            <GoalForm
              goalId={goal.id}
              initial={initial}
              idSuffix={`edit-${goal.id}`}
            />
          </div>
        </section>
      )}
    </div>
  );
}

export default function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <PagePlaceholder
          title="รายละเอียดเป้าหมาย"
          description="กำลังโหลดรายละเอียด…"
        />
      }
    >
      <GoalDetailLoader params={params} />
    </Suspense>
  );
}

async function GoalDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <GoalDetail id={id} />;
}
