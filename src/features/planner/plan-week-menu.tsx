"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { CopyWeekSheet } from "./copy-week-sheet";
import { SaveTemplateSheet } from "./save-template-sheet";
import { TemplateSheet } from "./template-sheet";

// Header ⋯ menu (§5): copy week, save template, my templates.
export function PlanWeekMenu({ monday }: { monday: string }) {
  const [open, setOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<"copy" | "save" | "list" | null>(
    null,
  );
  const [listKey, setListKey] = useState(0);

  function pick(next: "copy" | "save" | "list") {
    setOpenSheet(next);
    setOpen(false);
  }

  return (
    <div className="fixed top-2 right-4 z-40 lg:relative lg:top-auto lg:right-auto lg:z-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-label="เมนูสัปดาห์"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-button text-xl text-charcoal hover:bg-forest/5"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="เมนูสัปดาห์"
          className="absolute right-0 z-20 mt-1 w-56 rounded-card border border-line bg-paper p-2"
        >
          {(
            [
              ["copy", "คัดลอกสัปดาห์"],
              ["save", "บันทึกเป็นเทมเพลต"],
              ["list", "เทมเพลตของฉัน"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => pick(key)}
              className="flex min-h-11 w-full items-center rounded-button px-3 text-left text-base hover:bg-slate-soft/50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {openSheet === "copy" && (
        <CopyWeekSheet monday={monday} onClose={() => setOpenSheet(null)} />
      )}
      {openSheet === "save" && (
        <SaveTemplateSheet
          monday={monday}
          onClose={() => setOpenSheet(null)}
          onSaved={() => setListKey((k) => k + 1)}
        />
      )}
      {openSheet === "list" && (
        <TemplateSheet
          monday={monday}
          refreshKey={listKey}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </div>
  );
}
