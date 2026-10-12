"use client";

import Link from "next/link";
import { Check, Dumbbell, Route } from "lucide-react";

import type { DerivedPlanStatus } from "@/lib/domain/plan";
import { LogForm } from "@/features/journal/log-form";
import { StrengthLogForm } from "@/features/journal/strength-log-form";
import {
  formatPrescriptionTh,
  formatStructuredDetail,
  formatStructuredMain,
  formatTargetTh,
  STATUS_TH,
} from "@/lib/format";

import { MoveMenu } from "./move-menu";
import type { DayDTO, PlanItemDTO } from "./types";

// Exhaustive by construction: adding a status without a badge is a type error.
const badgeCls: Record<DerivedPlanStatus, string> = {
  PLANNED: "border border-line text-charcoal",
  COMPLETED: "bg-lime text-charcoal",
  PARTIAL: "bg-clay text-charcoal",
  SKIPPED: "bg-slate-soft text-charcoal",
  MISSED: "border border-line text-muted",
};

function TargetLine({ item }: { item: PlanItemDTO }) {
  const main =
    formatStructuredMain(item.runningTarget) ??
    formatTargetTh(item.runningTarget);
  const detail = formatStructuredDetail(item.runningTarget);
  return (
    <p className="mt-0.5 text-base text-muted">
      เป้าหมาย {main}
      {detail ? ` · ${detail}` : ""}
      {item.plannedStartTime ? ` · เริ่ม ${item.plannedStartTime}` : ""}
    </p>
  );
}

function StrengthLines({ item }: { item: PlanItemDTO }) {
  return (
    <div className="mt-0.5">
      <ol className="list-decimal space-y-0.5 pl-5 text-base text-muted">
        {item.exercises.map((e) => (
          <li key={e.id}>
            {e.masterSnapshot?.nameTh ?? e.exerciseCode}{" "}
            {formatPrescriptionTh(
              e.prescription,
              e.masterSnapshot?.repLabel === "STEPS" ? "STEPS" : "REPS",
            )}
          </li>
        ))}
      </ol>
      {item.plannedStartTime && (
        <p className="mt-0.5 text-base text-muted">
          เริ่ม {item.plannedStartTime}
        </p>
      )}
    </div>
  );
}

export function PlanItemCard({
  item,
  day,
  index,
  dayLength,
  today,
  strengthMasters,
  handle,
  overlay,
  onMove,
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
  const locked = item.log !== null;
  const isStrength = item.activityType === "STRENGTH";
  const tabCls =
    item.status === "COMPLETED"
      ? "bg-lime-deep"
      : isStrength
        ? "bg-steel"
        : item.status === "PLANNED"
          ? "bg-forest"
          : item.status === "PARTIAL"
            ? "bg-clay-deep"
            : "bg-line-strong";
  const Icon = isStrength ? Dumbbell : Route;
  return (
    <article
      className={`relative rounded-card border border-line bg-paper p-4 pl-6 ${overlay ? "shadow-lg" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-4 bottom-4 left-2.5 w-1.5 rounded-full ${tabCls}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1">
          {handle}
          <Icon
            className={`mt-1 size-5 shrink-0 ${isStrength ? "text-steel" : "text-charcoal"}`}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            {isStrength ? (
              <StrengthLines item={item} />
            ) : (
              <TargetLine item={item} />
            )}
            {item.note && (
              <p className="mt-1 text-base text-charcoal">{item.note}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${badgeCls[item.status]}`}
          >
            {item.status === "COMPLETED" && (
              <Check className="size-4" aria-hidden strokeWidth={3} />
            )}
            {STATUS_TH[item.status]}
          </span>
          {!overlay && (
            <MoveMenu
              title={item.title}
              dayDate={day.date}
              index={index}
              dayLength={dayLength}
              locked={locked}
              onMove={onMove}
            />
          )}
        </div>
      </div>
      {!overlay && (
        <div className="mt-3">
          {item.log ? (
            <Link
              href={`/journal/${item.log.id}`}
              className="text-base font-medium text-forest underline underline-offset-4"
            >
              ดูผลที่บันทึก
            </Link>
          ) : item.activityType === "STRENGTH" ? (
            <StrengthLogForm
              planItemId={item.id}
              planDate={day.date}
              planned={item.exercises}
              masters={strengthMasters ?? []}
              today={today}
            />
          ) : (
            <LogForm
              planItemId={item.id}
              planDate={day.date}
              runningWorkoutCode={item.runningWorkoutCode ?? "EASY_RUN"}
              runningTarget={item.runningTarget}
              today={today}
            />
          )}
        </div>
      )}
    </article>
  );
}
