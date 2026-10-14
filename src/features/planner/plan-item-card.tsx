"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Dumbbell } from "lucide-react";

import { RunningIcon } from "@/components/running-icon";
import { ExercisePreview } from "@/components/exercise-preview";
import type { DerivedPlanStatus } from "@/lib/domain/plan";
import { paceLabelFor } from "@/lib/domain/metrics";
import { LogForm } from "@/features/journal/log-form";
import { StrengthLogForm } from "@/features/journal/strength-log-form";
import {
  formatIntensityTh,
  formatDistanceM,
  formatPrescriptionTh,
  formatStructuredDetail,
  formatStructuredMain,
  formatTargetTh,
  STATUS_TH,
} from "@/lib/format";

import { MoveMenu } from "./move-menu";
import { CopyPlanItemSheet } from "./copy-plan-item-sheet";
import type { DayDTO, PlanItemDTO } from "./types";

const statusCls: Record<DerivedPlanStatus, string> = {
  PLANNED: "text-muted",
  COMPLETED: "text-[#477b2e]",
  PARTIAL: "text-[#895537]",
  SKIPPED: "text-muted",
  MISSED: "text-muted",
};

export function PlanItemCard({
  item, day, index, dayLength, today, strengthMasters, handle, overlay, onMove,
}: {
  item: PlanItemDTO;
  day: DayDTO;
  index: number;
  dayLength: number;
  today: string;
  strengthMasters?: import("./add-strength-form").ExerciseOption[];
  handle: React.ReactNode;
  overlay?: boolean;
  onMove: (targetDate: string, targetIndex?: number) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const locked = item.log !== null;
  const isStrength = item.activityType === "STRENGTH";
  const completed = item.status === "COMPLETED";
  const tabCls = isStrength ? "bg-steel" : item.status === "PARTIAL" ? "bg-clay-deep" : item.status === "SKIPPED" || item.status === "MISSED" ? "bg-line-strong" : day.date === today && !completed ? "bg-forest" : "bg-lime-deep";
  const Icon = isStrength ? Dumbbell : RunningIcon;
  const target = isStrength ? `${item.exercises.length} ท่า` : item.log?.distanceM != null ? formatDistanceM(item.log.distanceM) : formatStructuredMain(item.runningTarget) ?? formatTargetTh(item.runningTarget);
  const actualPace = item.log ? paceLabelFor(item.log.distanceM ?? null, item.log.movingDurationSec ?? null) : null;
  const detail = [
    target,
    isStrength ? null : actualPace ? `Pace ${actualPace}` : formatIntensityTh(item.intensityTarget),
    isStrength ? null : formatStructuredDetail(item.runningTarget),
    item.note,
    item.plannedStartTime ? `เริ่ม ${item.plannedStartTime}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className={`relative rounded-[11px] ${overlay ? "shadow-lg" : ""} ${isStrength ? "bg-[#eef1f3]" : completed ? "border border-[#e9eddf] bg-[#f6f8f0]" : "bg-[#f6f4ef]"}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 rounded-l-[11px] ${tabCls}`} />
      <div className="relative grid min-h-[clamp(52px,12vw,56px)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-1 pr-1.5 pl-3">
        {handle ? <div className="relative z-10">{handle}</div> : <span aria-hidden />}
        <div className="pointer-events-none flex min-w-0 items-center gap-3 py-1">
          <Icon className={`size-[25px] shrink-0 ${isStrength ? "rotate-45 text-muted" : "text-forest"}`} strokeWidth={1.7} aria-hidden />
          <div className="min-w-0">
            <h3 className="text-[clamp(15px,3.9vw,18px)] leading-snug font-semibold">{item.title}</h3>
            <p className="line-clamp-2 text-[clamp(13px,3.3vw,15px)] leading-snug text-muted">{detail}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.status !== "PLANNED" && (
            <span className={`pointer-events-none inline-flex items-center gap-1 text-[11px] font-medium ${statusCls[item.status]}`}>
              {completed && <span className="flex size-4 items-center justify-center rounded-full bg-[#477b2e] text-paper"><Check className="size-3" strokeWidth={2.5} aria-hidden /></span>}
              <span className="max-[360px]:sr-only">{STATUS_TH[item.status]}</span>
            </span>
          )}
          {!overlay && <MoveMenu title={item.title} dayDate={day.date} index={index} dayLength={dayLength} locked={locked} onMove={onMove} onViewDetails={() => setDetailsOpen((current) => !current)} onCopy={() => setCopyOpen(true)} />}
        </div>
        {detailsOpen && <div className="relative z-10 col-span-full mt-2 border-t border-line px-2 py-3 text-sm text-muted">
          {isStrength && (
            <ol className="list-decimal space-y-2 pl-4">
              {item.exercises.map((exercise) => (
                <li key={exercise.id}>
                  {exercise.masterSnapshot?.nameTh ?? exercise.exerciseCode}{" "}
                  {formatPrescriptionTh(
                    exercise.prescription,
                    exercise.masterSnapshot?.repLabel === "STEPS" ? "STEPS" : "REPS",
                  )}
                  <div>
                    <ExercisePreview
                      compact
                      exerciseCode={exercise.exerciseCode}
                      nameTh={exercise.masterSnapshot?.nameTh ?? exercise.exerciseCode}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {item.note && <p className={isStrength ? "mt-2" : ""}>{item.note}</p>}
          {!isStrength && <p>{formatTargetTh(item.runningTarget)}{formatIntensityTh(item.intensityTarget) ? ` · ${formatIntensityTh(item.intensityTarget)}` : ""}</p>}
          <button type="button" onClick={() => setDetailsOpen(false)} className="mt-2 min-h-11 font-medium text-forest">ปิดรายละเอียด</button>
        </div>}
        {!overlay && (item.log ? (
          <Link href={`/journal/${item.log.id}`} className="absolute inset-0 rounded-button transition-colors hover:bg-forest/[0.03]">
            <span className="sr-only">ดูผลที่บันทึก</span>
          </Link>
        ) : isStrength ? (
          <StrengthLogForm compactTrigger planItemId={item.id} planDate={day.date} planned={item.exercises} masters={strengthMasters ?? []} today={today} />
        ) : (
          <LogForm compactTrigger planItemId={item.id} planDate={day.date} runningWorkoutCode={item.runningWorkoutCode ?? "EASY_RUN"} runningTarget={item.runningTarget} today={today} />
        ))}
      </div>
      {copyOpen && <CopyPlanItemSheet item={item} sourceDate={day.date} onClose={() => setCopyOpen(false)} />}
    </article>
  );
}
