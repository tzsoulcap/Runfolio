"use client";

import { useState } from "react";

// ⋯ menu, always available alongside drag (§5): move-to-date with a date
// picker plus move up/down. The only way to move without dragging on mobile.
export function MoveMenu({
  title,
  dayDate,
  index,
  dayLength,
  locked,
  onMove,
  onViewDetails,
}: {
  title: string;
  dayDate: string;
  index: number;
  dayLength: number;
  locked: boolean;
  onMove: (targetDate: string, targetIndex?: number) => void;
  onViewDetails?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(dayDate);

  if (locked) {
    return (
      <span className="sr-only">
        มีผลบันทึกแล้ว ย้ายไม่ได้
      </span>
    );
  }

  return (
    <div className="relative z-10 shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`ตัวเลือก${title}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-button text-xl text-muted hover:bg-forest/5"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`ย้าย${title}`}
          className="absolute right-0 z-20 mt-1 w-64 rounded-card border border-line bg-paper p-3 shadow-lg"
        >
          {onViewDetails && <button type="button" role="menuitem" onClick={() => { onViewDetails(); setOpen(false); }} className="mb-2 flex min-h-11 w-full items-center rounded-button px-1 text-left text-sm font-medium text-forest">ดูรายละเอียดแผน</button>}
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`mvdate-${dayDate}-${index}`}
          >
            ย้ายไปวันอื่น
          </label>
          <div className="flex gap-2">
            <input
              id={`mvdate-${dayDate}-${index}`}
              type="date"
              className="h-11 min-w-0 flex-1 rounded-button border border-line bg-paper px-2 text-base"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
            />
            <button
              type="button"
              role="menuitem"
              disabled={pickedDate === dayDate || pickedDate === ""}
              className="inline-flex h-11 shrink-0 items-center rounded-button bg-forest px-4 text-base font-medium text-ivory disabled:opacity-40"
              onClick={() => {
                // Append to the end of the target day; DnD covers mid-day.
                onMove(pickedDate);
                setOpen(false);
              }}
            >
              ย้าย
            </button>
          </div>
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              role="menuitem"
              disabled={index === 0}
              className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              onClick={() => {
                onMove(dayDate, index - 1);
                setOpen(false);
              }}
            >
              เลื่อนขึ้น
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={index >= dayLength - 1}
              className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              onClick={() => {
                onMove(dayDate, index + 1);
                setOpen(false);
              }}
            >
              เลื่อนลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
