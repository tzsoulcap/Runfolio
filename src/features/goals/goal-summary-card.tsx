import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";

import { comparisonForGoal, type RunningBest } from "@/lib/domain/running-best";
import { targetPaceSecPerKm } from "@/lib/domain/goal";
import { formatPace } from "@/lib/domain/metrics";
import { countdownDays } from "@/lib/domain/home";
import { formatDateTh, formatDistanceM, formatHMS, goalCountdownTh, GOAL_STATUS_TH } from "@/lib/format";
import type { GoalWithProgress } from "@/lib/services/goals";

type ComparisonGoal = Pick<GoalWithProgress, "distanceCode" | "distanceM" | "goalType" | "targetTimeSec">;

export function GoalComparison({ goal, best, featured = false, compact = false }: {
  goal: ComparisonGoal;
  best: RunningBest | null;
  featured?: boolean;
  compact?: boolean;
}) {
  const progress = comparisonForGoal(goal, best);
  const hasTarget = goal.goalType === "TARGET_TIME" && goal.targetTimeSec !== null;
  const targetPace = hasTarget ? formatPace(targetPaceSecPerKm(goal.distanceM, goal.targetTimeSec!)) : null;
  const muted = featured ? "text-paper/85" : "text-muted";
  const resultLabel = progress?.isEquivalent ? `ดีที่สุดเทียบ ${goal.distanceCode}` : `ดีที่สุด ${goal.distanceCode}`;
  const message = !progress ? null : !hasTarget ? "เคยวิ่งถึงระยะนี้แล้ว"
    : progress.remainingSec! > 0 ? `ลดอีก ${formatHMS(progress.remainingSec!)} ถึงเป้า`
    : progress.aheadSec! > 0 ? `เร็วกว่าเป้า ${formatHMS(progress.aheadSec!)}` : "ทำเวลาได้ตามเป้าแล้ว";

  return (
    <div className="mt-3">
      {featured && !compact && hasTarget ? (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className={`text-xs ${muted}`}>เวลาเป้าหมาย</dt>
            <dd className="mt-1 text-[clamp(26px,7.8vw,34px)] leading-tight font-semibold tracking-tight">{formatHMS(goal.targetTimeSec!)}</dd>
            <dd className="mt-1 text-sm">Pace {targetPace}/km</dd>
          </div>
          <div className="min-w-0 border-l border-paper/25 pl-3">
            <dt className={`text-xs ${muted}`}>{resultLabel}</dt>
            <dd className="mt-1 text-[clamp(26px,7.8vw,34px)] leading-tight font-semibold tracking-tight">{progress ? formatHMS(progress.displaySec) : "–"}</dd>
            {progress && <dd className="mt-1 text-sm">Pace {formatPace(progress.paceSecPerKm)}/km</dd>}
          </div>
        </dl>
      ) : (
        <div className="space-y-1">
          {hasTarget ? <p className="text-sm font-semibold">เป้า {formatHMS(goal.targetTimeSec!)} · Pace {targetPace}/km</p>
            : <p className={`text-sm ${muted}`}>จบระยะ {formatDistanceM(goal.distanceM)}</p>}
          {progress && <p className={`text-sm ${muted}`}>{resultLabel} {formatHMS(progress.displaySec)} · Pace {formatPace(progress.paceSecPerKm)}/km</p>}
        </div>
      )}
      {progress ? (
        <>
          <p className={`mt-3 rounded-[10px] font-semibold ${featured ? "bg-lime-soft px-3 py-2.5 text-forest" : "text-forest"} ${compact ? "text-sm" : "text-base"}`}>{message}</p>
          <p className={`mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs ${muted}`}>
            <span>อิง {formatDistanceM(progress.sourceDistanceM)} ใน {formatHMS(progress.sourceDurationSec)}</span>
            <span aria-hidden>·</span><span>{formatDateTh(progress.performedDate)}</span>
            <span className={`rounded-md px-1.5 py-0.5 ${progress.timeBasis === "MOVING" ? "bg-clay text-charcoal" : featured ? "bg-paper/10 text-paper" : "bg-ivory text-muted"}`}>
              {progress.timeBasis === "ELAPSED" ? "อิงเวลารวม" : "อิงเวลาเคลื่อนที่"}
            </span>
          </p>
          {progress.isEquivalent && !compact && <p className={`mt-1.5 text-xs leading-relaxed ${muted}`}>เวลาเทียบจากเพซเฉลี่ยทั้งครั้ง</p>}
        </>
      ) : <p className={`mt-3 text-sm leading-relaxed ${muted}`}>ยังไม่มีผลวิ่งต่อเนื่องถึง {goal.distanceCode} สำหรับเทียบ</p>}
    </div>
  );
}

export function GoalSummaryCard({ goal, today, compact = false }: {
  goal: GoalWithProgress;
  today: string;
  compact?: boolean;
}) {
  const active = goal.status === "ACTIVE";
  const featured = goal.isPrimary && active;
  return (
    <Link href={`/goals/${goal.id}`} data-goal-id={goal.id}
      className={`block min-w-0 ${featured ? "today-card rounded-[20px] p-4 text-paper sm:p-5" : "rounded-[14px] border border-line p-3.5 hover:bg-ivory/50"}`}>
      <div className="flex items-center justify-between gap-2">
        {featured ? <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-charcoal">เป้าหมายหลัก</span>
          : <span className="text-xs text-muted">{active ? "กำลังทำ" : GOAL_STATUS_TH[goal.status] ?? goal.status}</span>}
        <Target className={`size-5 shrink-0 ${featured ? "text-lime" : "text-forest"}`} aria-hidden />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={`${featured && !compact ? "text-[34px]" : "text-[26px]"} leading-tight font-semibold tracking-tight`}>{goal.distanceCode}</h2>
        {goal.eventName && <p className={`min-w-0 break-words text-sm ${featured ? "text-paper/85" : "text-muted"}`}>{goal.eventName}</p>}
      </div>
      <GoalComparison goal={goal} best={goal.best} featured={featured} compact={compact} />
      <div className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5 text-xs ${featured ? "border-paper/25 text-paper/85" : "border-line text-muted"}`}>
        <span className="min-w-0 flex-1">{goal.eventDate ? formatDateTh(goal.eventDate) : "ยังไม่กำหนดวันแข่ง"}</span>
        {active && goal.eventDate && <span className={featured ? "text-lime" : "text-forest"}>{goalCountdownTh(countdownDays(goal.eventDate, today))}</span>}
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </div>
    </Link>
  );
}
