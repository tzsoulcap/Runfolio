import Link from "next/link";

import type { DerivedPlanStatus } from "@/lib/domain/plan";

import { LogForm } from "@/features/journal/log-form";
import {
  formatDateTh,
  formatTargetTh,
  STATUS_TH,
  weekdayTh,
} from "@/lib/format";
import type { DayWithItems } from "@/lib/services/planner";

import { AddPlanForm, type MasterOption } from "./add-plan-form";

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

export function DaySection({
  date,
  day,
  masters,
  revision,
  today,
}: {
  date: string;
  day: DayWithItems | undefined;
  masters: MasterOption[];
  revision: number;
  today: string;
}) {
  const items = day?.items ?? [];
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
        <p className="mt-2 text-base text-muted">
          วันพัก{day.note ? ` · ${day.note}` : ""}
        </p>
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
                  <p className="mt-0.5 text-base text-muted">
                    เป้าหมาย {formatTargetTh(item.runningTarget)}
                    {item.plannedStartTime
                      ? ` · เริ่ม ${item.plannedStartTime}`
                      : ""}
                  </p>
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
          <AddPlanForm date={date} masters={masters} revision={revision} />
        </div>
      )}
    </section>
  );
}
