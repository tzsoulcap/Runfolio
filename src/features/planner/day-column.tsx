"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Moon, Plus } from "lucide-react";

import { formatDateTh, formatDayMonthTh, weekdayTh } from "@/lib/format";
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
    <span className="inline-flex h-11 w-5 shrink-0 items-center justify-center text-muted select-none">
      <GripVertical className="size-[18px]" aria-hidden /><span className="sr-only">ลาก{title}</span>
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
          locked ? null : (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`ลาก${item.title}`}
              className="relative inline-flex h-11 w-5 shrink-0 touch-none items-center justify-center rounded-button text-muted select-none before:absolute before:inset-y-0 before:-inset-x-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-forest"
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
  const [adding, setAdding] = useState<"RUNNING" | "STRENGTH" | null>(null);
  useEffect(() => {
    function openFromHash() {
      if (window.location.hash === `#day-${day.date}-add`) setAdding("RUNNING");
    }
    function openFromLink(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest(`a[href="#day-${day.date}-add"]`)) setAdding("RUNNING");
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", openFromLink);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", openFromLink);
    };
  }, [day.date]);
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
      className="scroll-mt-20 border-t border-line py-1.5 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[clamp(17px,4.3vw,20px)] font-semibold">
          {weekdayTh(day.date)}
          <span className="ml-2 text-sm font-normal text-muted">
            {formatDayMonthTh(day.date)}
          </span>
          {day.date === today && (
            <span className="ml-2 rounded-full bg-lime px-3 py-0.5 align-middle text-xs font-medium text-charcoal">
              วันนี้
            </span>
          )}
        </h2>
        {!day.isRestDay && (
          <button
            type="button"
            onClick={() => setAdding((current) => current ? null : "RUNNING")}
            aria-expanded={adding !== null}
            aria-controls={`day-${day.date}-add`}
            aria-label={`เพิ่มการซ้อมวันที่ ${day.date}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-charcoal transition-colors duration-200 hover:bg-forest/10"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {day.isRestDay ? (
        <div className="flex min-h-11 items-center gap-4 rounded-[10px] bg-[#f3f2ef] px-4">
          <span className="flex size-6 shrink-0 items-center justify-center">
            <Moon className="size-6 text-muted" strokeWidth={1.6} aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">
            วันพัก{day.note ? ` · ${day.note}` : ""}
          </p>
          <UnsetRestButton date={day.date} revision={revision} />
        </div>
      ) : (
        <div className="space-y-2">
          <SortableContext
            items={day.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              ref={setNodeRef}
              aria-label={`รายการวันที่ ${formatDateTh(day.date)}`}
              className={`space-y-2 rounded-button ${isOver ? "bg-slate-soft/50 outline-2 outline-dashed outline-forest" : ""}`}
            >
              {day.items.length === 0 && (
                <li className="rounded-button border border-dashed border-line px-3 py-2 text-sm text-muted">
                  ยังไม่มีแผน
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
          <div id={`day-${day.date}-add`} className="scroll-mt-20">
            {adding && <>
              <div className="mb-2 flex gap-2" role="group" aria-label="ประเภทการซ้อม">
                <button type="button" aria-pressed={adding === "RUNNING"} onClick={() => setAdding("RUNNING")} className={`min-h-11 rounded-button px-4 text-sm font-medium ${adding === "RUNNING" ? "bg-forest text-paper" : "bg-ivory text-muted"}`}>เพิ่มการซ้อม</button>
                <button type="button" aria-pressed={adding === "STRENGTH"} onClick={() => setAdding("STRENGTH")} className={`min-h-11 rounded-button px-4 text-sm font-medium ${adding === "STRENGTH" ? "bg-forest text-paper" : "bg-ivory text-muted"}`}>เพิ่ม Strength</button>
              </div>
              {adding === "RUNNING" ? <AddPlanForm
              initiallyOpen
              onClose={() => setAdding(null)}
              date={day.date}
              masters={masters}
              goals={goals}
              blockers={blockers}
              revision={revision}
            /> : <AddStrengthForm
              initiallyOpen
              onClose={() => setAdding(null)}
              date={day.date}
              exercises={strengthMasters}
              revision={revision}
            />}
            </>}
          </div>
        </div>
      )}
    </section>
  );
}
