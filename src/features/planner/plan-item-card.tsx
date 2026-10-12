"use client";

import Link from "next/link";

import type { DerivedPlanStatus } from "@/lib/domain/plan";
import { LogForm } from "@/features/journal/log-form";
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

function targetKm(target: PlanItemDTO["runningTarget"]) {
  return target?.kind === "DISTANCE" ? target.distanceM / 1000 : undefined;
}

export function PlanItemCard({
  item,
  day,
  index,
  dayLength,
  today,
  handle,
  overlay,
  onMove,
}: {
  item: PlanItemDTO;
  day: DayDTO;
  index: number;
  dayLength: number;
  today: string;
  handle: React.ReactNode;
  overlay?: boolean;
  onMove: (targetDate: string, targetIndex?: number) => void;
}) {
  const locked = item.log !== null;
  return (
    <article
      className={`rounded-card border border-line bg-paper p-4 ${overlay ? "shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1">
          {handle}
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            {item.activityType === "STRENGTH" ? (
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
            className={`rounded-full px-3 py-1 text-sm font-medium ${badgeCls[item.status]}`}
          >
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
            <p className="text-base text-muted">
              การบันทึกผล Strength จะมาในรอบถัดไป
            </p>
          ) : (
            <LogForm
              planItemId={item.id}
              planDate={day.date}
              runningWorkoutCode={item.runningWorkoutCode ?? "EASY_RUN"}
              defaultDistanceKm={targetKm(item.runningTarget)}
              today={today}
            />
          )}
        </div>
      )}
    </article>
  );
}
