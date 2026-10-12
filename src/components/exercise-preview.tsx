"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, Maximize2, Minimize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getExercisePreview } from "@/lib/exercise-previews";

export function ExercisePreview({
  exerciseCode,
  nameTh,
  compact = false,
}: {
  exerciseCode: string;
  nameTh: string;
  compact?: boolean;
}) {
  const preview = getExercisePreview(exerciseCode);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!preview) return null;

  function showPreview() {
    setZoomed(false);
    dialog.current?.showModal();
    setOpen(true);
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-forest"
          aria-label={`ดูภาพท่า ${nameTh}`}
          onClick={showPreview}
        >
          <ImageIcon className="size-4" aria-hidden />
          ดูภาพท่า
        </button>
      ) : (
        <button
          type="button"
          className="mt-3 block w-full overflow-hidden rounded-[14px] border border-line bg-ivory text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          aria-label={`ดูภาพท่า ${nameTh}`}
          onClick={showPreview}
        >
          <Image
            src={preview.src}
            alt={preview.alt}
            width={1200}
            height={800}
            unoptimized
            className="h-auto w-full"
          />
          <span className="flex items-center justify-between gap-3 border-t border-line bg-paper px-3 py-2.5 text-xs">
            <span className="min-w-0 break-words font-medium">{preview.nameEn}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-forest">
              <Maximize2 className="size-3.5" aria-hidden />
              ดูภาพใหญ่
            </span>
          </span>
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-hint`}
        className="fixed inset-0 m-auto h-fit max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[720px] overflow-y-auto rounded-[20px] border border-line bg-paper p-4 text-charcoal shadow-xl backdrop:bg-charcoal/50 sm:p-5"
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="section-title break-words">
              {nameTh}
            </h2>
            <p className="mt-1 text-sm text-muted">{preview.nameEn}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full bg-ivory"
            aria-label="ปิดภาพท่า"
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden />
          </Button>
        </div>
        <div
          className="mt-4 max-h-[60dvh] overflow-auto rounded-[14px] bg-ivory outline-none focus-visible:outline-2 focus-visible:outline-forest"
          tabIndex={zoomed ? 0 : undefined}
          role={zoomed ? "region" : undefined}
          aria-label={zoomed ? "ภาพขยาย เลื่อนเพื่อดูรายละเอียด" : undefined}
        >
          {open && (
            <div style={{ width: zoomed ? "200%" : "100%" }}>
              <Image
                src={preview.src}
                alt={preview.alt}
                width={1200}
                height={800}
                unoptimized
                loading="eager"
                className="h-auto w-full max-w-none"
              />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p id={`${titleId}-hint`} className="text-xs text-muted">
            {zoomed ? "เลื่อนภาพเพื่อดูรายละเอียด" : "ภาพประกอบท่า"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setZoomed(!zoomed)}
            aria-pressed={zoomed}
          >
            {zoomed ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            {zoomed ? "พอดีจอ" : "ขยายภาพ"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
