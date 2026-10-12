"use client";

import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Moon, Plus } from "lucide-react";

import { formatDateTh, weekdayTh } from "@/lib/format";
import type { GoalOption } from "@/lib/services/goals";

import { AddPlanForm, type MasterOption } from "./add-plan-form";
import {
  AddStrengthForm,
  type ExerciseOption,
} from "./add-strength-form";
import { PlanItemCard } from "./plan-item-card";
import type { DayDTO, PlanItemDTO } from "./types";
import { UnsetRestButton } from "./unset-rest-button";

function DragHandle({ title }: { title: string }) {
  return (
    <span className="inline-flex size-11 shrink-0 items-center justify-center text-lg text-muted select-none">
      ⠿<span className="sr-only">ลาก{title}</span>
    </span>
  );
}

function SortableItem({
  item,
  day,
  index,
  dayLength,
  today,
  strengthMasters,
  onMove,
}: {
  item: PlanItemDTO;
  day: DayDTO;
  index: number;
  dayLength: number;
  today: string;
  strengthMasters: ExerciseOption[];
  onMove: (itemId: string, targetDate: string, targetIndex?: number) => void;
}) {
  const locked = item.log !== null;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: locked,
    data: { type: "item", dayDate: day.date, index, title: item.title },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style}>
      <PlanItemCard
        item={item}
        day={day}
        index={index}
        dayLength={dayLength}
        today={today}
        strengthMasters={strengthMasters}
        handle={
          locked ? (
            <span
              aria-hidden="true"
              className="inline-flex size-11 shrink-0 items-center justify-center text-lg text-muted/40 select-none"
            >
              ⠿
            </span>
          ) : (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`ลาก${item.title}`}
              className="inline-flex size-11 shrink-0 touch-none items-center justify-center rounded-button text-lg text-muted select-none focus-visible:outline-2 focus-visible:outline-forest"
            >
              <DragHandle title={item.title} />
            </button>
          )
        }
        onMove={(targetDate, targetIndex) =>
          onMove(item.id, targetDate, targetIndex)
        }
      />
    </li>
  );
}

export function DayColumn({
  day,
  masters,
  strengthMasters,
  goals,
  revision,
  today,
  onMove,
}: {
  day: DayDTO;
  masters: MasterOption[];
  strengthMasters: ExerciseOption[];
  goals: GoalOption[];
  revision: number;
  today: string;
  onMove: (itemId: string, targetDate: string, targetIndex?: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${day.date}`,
    data: { type: "day", dayDate: day.date },
  });
  const blockers = {
    unloggedCount: day.items.filter((i) => i.log === null).length,
    loggedCount: day.items.filter((i) => i.log !== null).length,
  };
  return (
    <section
      id={`day-${day.date}`}
      aria-label={`วัน${weekdayTh(day.date)}ที่ ${formatDateTh(day.date)}`}
      className="scroll-mt-24 border-t border-line py-4 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          วัน{weekdayTh(day.date)}
          <span className="ml-2 text-base font-normal text-muted">
            {formatDateTh(day.date)}
          </span>
          {day.date === today && (
            <span className="ml-2 rounded-full bg-lime px-3 py-1 align-middle text-sm font-semibold text-charcoal">
              วันนี้
            </span>
          )}
        </h2>
        {!day.isRestDay && (
          <Link
            href={`#day-${day.date}-add`}
            aria-label={`เพิ่มแผนวันที่ ${formatDateTh(day.date)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-charcoal transition-colors duration-200 hover:bg-forest/10"
          >
            <Plus className="size-5" aria-hidden />
          </Link>
        )}
      </div>

      {day.isRestDay ? (
        <div className="mt-2 flex items-center gap-3 rounded-card border border-line bg-paper p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest/10">
            <Moon className="size-5 text-forest" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-base text-charcoal">
            วันพัก{day.note ? ` · ${day.note}` : ""}
          </p>
          <UnsetRestButton date={day.date} revision={revision} />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <SortableContext
            items={day.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              ref={setNodeRef}
              aria-label={`รายการวันที่ ${formatDateTh(day.date)}`}
              className={`space-y-3 rounded-card p-1 ${isOver ? "bg-slate-soft/50 outline-2 outline-dashed outline-forest" : ""}`}
            >
              {day.items.length === 0 && (
                <li className="rounded-button border border-dashed border-line p-4 text-center text-base text-muted">
                  ยังไม่มีแผน ลากเซสชันมาวางที่นี่ได้
                </li>
              )}
              {day.items.map((item, index) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  day={day}
                  index={index}
                  dayLength={day.items.length}
                  today={today}
                  strengthMasters={strengthMasters}
                  onMove={onMove}
                />
              ))}
            </ol>
          </SortableContext>
          <div id={`day-${day.date}-add`} className="flex scroll-mt-24 flex-wrap gap-2">
            <AddPlanForm
              date={day.date}
              masters={masters}
              goals={goals}
              blockers={blockers}
              revision={revision}
            />
            <AddStrengthForm
              date={day.date}
              exercises={strengthMasters}
              revision={revision}
            />
          </div>
        </div>
      )}
    </section>
  );
}
