import Link from "next/link";

import type { DerivedPlanStatus } from "@/lib/domain/plan";

import { LogForm } from "@/features/journal/log-form";
import {
  formatDateTh,
  formatPrescriptionTh,
  formatStructuredDetail,
  formatStructuredMain,
  formatTargetTh,
  STATUS_TH,
  weekdayTh,
} from "@/lib/format";
import type { GoalOption } from "@/lib/services/goals";
import type { DayWithItems } from "@/lib/services/planner";

import { AddPlanForm, type MasterOption } from "./add-plan-form";
import { AddStrengthForm, type ExerciseOption } from "./add-strength-form";
import { UnsetRestButton } from "./unset-rest-button";

// Exhaustive by construction: adding a status without a badge is a type error.
const badgeCls: Record<DerivedPlanStatus, string> = {
  PLANNED: "border border-line text-charcoal",
  COMPLETED: "bg-lime text-charcoal",
  PARTIAL: "bg-clay text-charcoal",
  SKIPPED: "bg-slate-soft text-charcoal",
  MISSED: "border border-line text-muted",
};

function targetKm(target: DayWithItems["items"][number]["runningTarget"]) {
  return target?.kind === "DISTANCE" ? target.distanceM / 1000 : undefined;
}

function TargetLine({ item }: { item: DayWithItems["items"][number] }) {
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

function StrengthLines({ item }: { item: DayWithItems["items"][number] }) {
  return (
    <div className="mt-0.5">
      <ol className="list-decimal space-y-0.5 pl-5 text-base text-muted">
        {item.exercises.map((e) => {
          const snapshot = e.masterSnapshot as {
            nameTh?: string;
            repLabel?: string;
          } | null;
          return (
            <li key={e.id}>
              {snapshot?.nameTh ?? e.exerciseCode}{" "}
              {formatPrescriptionTh(
                e.prescription,
                snapshot?.repLabel === "STEPS" ? "STEPS" : "REPS",
              )}
            </li>
          );
        })}
      </ol>
      {item.plannedStartTime && (
        <p className="mt-0.5 text-base text-muted">
          เริ่ม {item.plannedStartTime}
        </p>
      )}
    </div>
  );
}

export function DaySection({
  date,
  day,
  masters,
  strengthMasters,
  goals,
  revision,
  today,
}: {
  date: string;
  day: DayWithItems | undefined;
  masters: MasterOption[];
  strengthMasters: ExerciseOption[];
  goals: GoalOption[];
  revision: number;
  today: string;
}) {
  const items = day?.items ?? [];
  const blockers = {
    unloggedCount: items.filter((i) => i.log === null).length,
    loggedCount: items.filter((i) => i.log !== null).length,
  };
  return (
    <section
      id={`day-${date}`}
      aria-label={`วัน${weekdayTh(date)}ที่ ${formatDateTh(date)}`}
      className="scroll-mt-24 border-t border-line py-4 first:border-t-0 first:pt-0"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">
          วัน{weekdayTh(date)}
          <span className="ml-2 text-base font-normal text-muted">
            {formatDateTh(date)}
          </span>
        </h2>
        {date === today && (
          <span className="shrink-0 rounded-full bg-forest px-3 py-1 text-sm text-ivory">
            วันนี้
          </span>
        )}
      </div>

      {day?.isRestDay ? (
        <div className="mt-2">
          <p className="text-base text-muted">
            วันพัก{day.note ? ` · ${day.note}` : ""}
          </p>
          <UnsetRestButton date={date} revision={revision} />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-card border border-line bg-paper p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
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
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${badgeCls[item.status]}`}
                >
                  {STATUS_TH[item.status]}
                </span>
              </div>
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
                    planDate={date}
                    runningWorkoutCode={item.runningWorkoutCode ?? "EASY_RUN"}
                    defaultDistanceKm={targetKm(item.runningTarget)}
                    today={today}
                  />
                )}
              </div>
            </article>
          ))}
          <div className="flex flex-wrap gap-2">
            <AddPlanForm
              date={date}
              masters={masters}
              goals={goals}
              blockers={blockers}
              revision={revision}
            />
            <AddStrengthForm
              date={date}
              exercises={strengthMasters}
              revision={revision}
            />
          </div>
        </div>
      )}
    </section>
  );
}
