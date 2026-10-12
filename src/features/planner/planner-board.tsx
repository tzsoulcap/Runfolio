"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { getWeekRevisionAction, movePlanAction } from "@/app/plan/actions";
import { mondayOf } from "@/lib/domain/week";
import { weekdayTh } from "@/lib/format";
import type { GoalOption } from "@/lib/services/goals";

import type { MasterOption } from "./add-plan-form";
import type { ExerciseOption } from "./add-strength-form";
import { DayColumn } from "./day-column";
import { PlanItemCard } from "./plan-item-card";
import type { DayDTO } from "./types";

type PendingMove = {
  itemId: string;
  targetDate: string;
  targetIndex: number;
  expectedDestRevision?: number;
};

function signature(days: DayDTO[]): string {
  return JSON.stringify(
    days.map((d) => [
      d.date,
      d.isRestDay ? 1 : 0,
      d.note ?? "",
      ...d.items.map((i) => `${i.id}${i.log ? "L" : ""}${i.status}`),
    ]),
  );
}

function locate(days: DayDTO[], itemId: string) {
  for (const day of days) {
    const index = day.items.findIndex((i) => i.id === itemId);
    if (index >= 0) return { day, index };
  }
  return null;
}

function targetDayOf(days: DayDTO[], over: Over | null): DayDTO | undefined {
  if (!over) return undefined;
  const data = over.data.current as
    | { type?: string; dayDate?: string }
    | undefined;
  return data?.type === "day"
    ? days.find((d) => d.date === data.dayDate)
    : days.find((d) => d.items.some((i) => i.id === String(over.id)));
}

// Pure optimistic placement; targetIndex is the final index in the day.
function applyMove(
  days: DayDTO[],
  itemId: string,
  targetDate: string,
  targetIndex: number,
): DayDTO[] {
  const found = locate(days, itemId);
  const targetDay = days.find((d) => d.date === targetDate);
  if (!found || !targetDay) return days;
  const moving = found.day.items[found.index];
  if (!moving) return days;
  const without = days.map((d) =>
    d.date === found.day.date
      ? { ...d, items: d.items.filter((i) => i.id !== itemId) }
      : d,
  );
  const destLen =
    without.find((d) => d.date === targetDate)?.items.length ?? 0;
  const at = Math.min(targetIndex, destLen);
  return without.map((d) => {
    if (d.date !== targetDate) return d;
    const items = [...d.items];
    items.splice(at, 0, moving);
    return { ...d, items };
  });
}

export function PlannerBoard({
  initialDays,
  masters,
  strengthMasters,
  goals,
  initialRevision,
  today,
}: {
  initialDays: DayDTO[];
  masters: MasterOption[];
  strengthMasters: ExerciseOption[];
  goals: GoalOption[];
  initialRevision: number;
  today: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [revision, setRevision] = useState(initialRevision);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [retryIntent, setRetryIntent] = useState<PendingMove | null>(null);

  const snapshotRef = useRef<DayDTO[] | null>(null);
  const dragStartRef = useRef<{ dayDate: string; index: number } | null>(null);
  const pendingRef = useRef(false);
  const sigRef = useRef(signature(initialDays));

  // Adopt server data after refresh (add/log/rest/move changes), but never
  // while a move save is in flight — the optimistic order wins until then.
  const serverSig = signature(initialDays);
  useEffect(() => {
    if (serverSig !== sigRef.current && !pendingRef.current) {
      sigRef.current = serverSig;
      setDays(initialDays);
      setRevision(initialRevision);
      setRefetching(false);
    }
  }, [serverSig, initialDays, initialRevision]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const titleOf = (itemId: string) =>
    locate(days, itemId)?.day.items.find((i) => i.id === itemId)?.title ??
    "เซสชัน";

  async function commitMove(
    move: PendingMove,
    preApplied: boolean,
    revOverride?: { source: number; dest?: number },
  ) {
    if (pendingRef.current) {
      if (snapshotRef.current) setDays(snapshotRef.current);
      return;
    }
    const movedTitle = titleOf(move.itemId);
    if (!preApplied) {
      snapshotRef.current = days;
      // Cross-week targets are not on this board: drop the item from view
      // optimistically; the destination week shows it after refresh.
      setDays((prev) =>
        prev.some((d) => d.date === move.targetDate)
          ? applyMove(prev, move.itemId, move.targetDate, move.targetIndex)
          : prev.map((d) => ({
              ...d,
              items: d.items.filter((i) => i.id !== move.itemId),
            })),
      );
    }
    pendingRef.current = true;
    setSaving(true);
    setSavedNote(null);
    setError(null);
    setConflict(null);
    setRetryIntent(null);
    try {
      const res = await movePlanAction({
        planItemId: move.itemId,
        targetDate: move.targetDate,
        targetIndex: move.targetIndex,
        expectedRevision: revOverride?.source ?? revision,
        ...(revOverride?.dest ?? move.expectedDestRevision !== undefined
          ? { expectedDestRevision: revOverride?.dest ?? move.expectedDestRevision }
          : {}),
      });
      if (res.ok) {
        setRevision(res.revision ?? revision);
        // Explicit saved status (§13): nothing claims success before this.
        setSavedNote(`ย้าย${movedTitle}ไปวัน${weekdayTh(move.targetDate)}แล้ว`);
        snapshotRef.current = null;
        router.refresh();
        return;
      }
      if (res.code === "UNAUTHENTICATED") {
        router.push(`/login?next=${encodeURIComponent("/plan")}`);
        return;
      }
      if (snapshotRef.current) setDays(snapshotRef.current);
      if (res.conflictKind === "STALE") {
        // Another tab changed the week: refetch, never overwrite (§13).
        setConflict("ข้อมูลเปลี่ยนไปแล้ว โหลดข้อมูลใหม่แล้ว ลองย้ายอีกครั้ง");
        setRetryIntent(move);
        setRefetching(true);
        router.refresh();
      } else {
        setError(res.message);
        setRetryIntent(move);
      }
    } catch {
      if (snapshotRef.current) setDays(snapshotRef.current);
      setError("เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง");
      setRetryIntent(move);
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  // Retry re-reads both revisions fresh, after the refetch lands (§13).
  async function onRetry() {
    const intent = retryIntent;
    if (!intent || refetching) return;
    const loc = locate(days, intent.itemId);
    if (!loc) {
      setRetryIntent(null);
      setConflict(null);
      setError("แผนไม่อยู่ในสัปดาห์นี้แล้ว");
      router.refresh();
      return;
    }
    const srcMonday = mondayOf(loc.day.date);
    const dstMonday = mondayOf(intent.targetDate);
    const src = await getWeekRevisionAction({ monday: srcMonday });
    if (!src.ok || src.revision === undefined) {
      setError(src.ok ? "โหลดข้อมูลไม่สำเร็จ" : src.message);
      return;
    }
    let dest: number | undefined;
    if (dstMonday !== srcMonday) {
      const d = await getWeekRevisionAction({ monday: dstMonday });
      if (!d.ok || d.revision === undefined) {
        setError(d.ok ? "โหลดข้อมูลไม่สำเร็จ" : d.message);
        return;
      }
      dest = d.revision;
    }
    setRetryIntent(null);
    setConflict(null);
    setError(null);
    setRevision(src.revision);
    void commitMove(intent, false, { source: src.revision, dest });
  }

  function onMenuMove(
    itemId: string,
    targetDate: string,
    targetIndex?: number,
  ) {
    const found = locate(days, itemId);
    if (!found) return;
    // Omitted index appends to the end of the target day.
    const destLen =
      targetDate === found.day.date
        ? found.day.items.length - 1
        : (days.find((d) => d.date === targetDate)?.items.length ?? 0);
    const at = Math.min(targetIndex ?? destLen, Math.max(destLen, 0));
    if (targetDate === found.day.date && at === found.index) return;
    void (async () => {
      // Cross-week moves carry both revisions (§13).
      let destRev: number | undefined;
      if (mondayOf(targetDate) !== mondayOf(found.day.date)) {
        const d = await getWeekRevisionAction({
          monday: mondayOf(targetDate),
        });
        if (!d.ok || d.revision === undefined) {
          setError(d.ok ? "โหลดข้อมูลไม่สำเร็จ" : d.message);
          return;
        }
        destRev = d.revision;
      }
      void commitMove(
        { itemId, targetDate, targetIndex: at, expectedDestRevision: destRev },
        false,
      );
    })();
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const found = locate(days, id);
    snapshotRef.current = days;
    dragStartRef.current = found
      ? { dayDate: found.day.date, index: found.index }
      : null;
    setActiveId(id);
    setSavedNote(null);
    setError(null);
    setConflict(null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdValue = String(active.id);
    const overId = String(over.id);
    if (activeIdValue === overId) return;
    setDays((prev) => {
      const activeLoc = locate(prev, activeIdValue);
      const overDay = targetDayOf(prev, over);
      if (!activeLoc || !overDay) return prev;
      if (overDay.date === activeLoc.day.date) {
        // Same day: live reorder only when hovering an item.
        const overIndex = overDay.items.findIndex((i) => i.id === overId);
        if (overIndex < 0 || overIndex === activeLoc.index) return prev;
        return prev.map((d) =>
          d.date === overDay.date
            ? {
                ...d,
                items: arrayMove(d.items, activeLoc.index, overIndex),
              }
            : d,
        );
      }
      // Cross day: insert at the hovered item, or append on empty day.
      const overIndex = overDay.items.findIndex((i) => i.id === overId);
      const at = overIndex < 0 ? overDay.items.length : overIndex;
      return applyMove(prev, activeIdValue, overDay.date, at);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    setActiveId(null);
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) {
      snapshotRef.current = null;
      return;
    }
    const now = locate(days, id);
    if (
      !now ||
      (now.day.date === start.dayDate && now.index === start.index)
    ) {
      // Dropped back home: nothing to save.
      if (snapshotRef.current) setDays(snapshotRef.current);
      snapshotRef.current = null;
      return;
    }
    void commitMove(
      { itemId: id, targetDate: now.day.date, targetIndex: now.index },
      true,
    );
  }

  function onDragCancel() {
    setActiveId(null);
    dragStartRef.current = null;
    if (snapshotRef.current) setDays(snapshotRef.current);
    snapshotRef.current = null;
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      return `หยิบ${titleOf(String(active.id))}แล้ว ลากไปวางในวันที่ต้องการ`;
    },
    onDragOver({ active, over }) {
      const targetDay = targetDayOf(days, over);
      if (!targetDay) return undefined;
      const data = over?.data.current as
        | { type?: string }
        | undefined;
      const position =
        data?.type === "day"
          ? targetDay.items.length + 1
          : targetDay.items.findIndex((i) => i.id === String(over?.id)) + 1;
      return `ย้าย${titleOf(String(active.id))}ไปวัน${weekdayTh(targetDay.date)} ตำแหน่งที่ ${position}`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `ยกเลิกการย้าย${titleOf(String(active.id))}`;
      return `วาง${titleOf(String(active.id))}แล้ว กำลังบันทึก`;
    },
    onDragCancel({ active }) {
      return `ยกเลิกการย้าย${titleOf(String(active.id))}`;
    },
  };

  const activeLoc = activeId ? locate(days, activeId) : null;
  const activeItem = activeLoc?.day.items.find((i) => i.id === activeId) ?? null;

  const retryButton = retryIntent && (
    <button
      type="button"
      disabled={refetching}
      className="mt-2 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory disabled:opacity-40"
      onClick={() => void onRetry()}
    >
      {refetching ? "กำลังโหลดข้อมูลใหม่…" : "ลองอีกครั้ง"}
    </button>
  );

  return (
    <div>
      <div aria-live="polite" role="status" className="sr-only">
        {saving ? "กำลังบันทึกตำแหน่ง…" : ""}
      </div>
      {saving && (
        <p className="mt-4 rounded-card border border-line bg-paper p-4 text-base text-muted">
          กำลังบันทึก…
        </p>
      )}
      {!saving && savedNote && (
        <p
          role="status"
          className="mt-4 rounded-card border border-line bg-paper p-4 text-base text-charcoal"
        >
          บันทึกแล้ว: {savedNote}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-card border border-line bg-paper p-4"
        >
          <p className="text-base text-charcoal">{error}</p>
          {retryButton}
        </div>
      )}
      {conflict && (
        <div
          role="alert"
          className="mt-4 rounded-card border border-line bg-paper p-4"
        >
          <p className="text-base text-charcoal">{conflict}</p>
          {retryButton}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="mt-1">
          {days.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              masters={masters}
              strengthMasters={strengthMasters}
              goals={goals}
              revision={revision}
              today={today}
              onMove={onMenuMove}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem && activeLoc ? (
            <PlanItemCard
              item={activeItem}
              day={activeLoc.day}
              index={activeLoc.index}
              dayLength={activeLoc.day.items.length}
              today={today}
              handle={null}
              overlay
              onMove={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
