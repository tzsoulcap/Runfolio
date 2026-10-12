"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

// Bottom sheet on mobile, centered dialog from sm up.
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50"
    >
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-charcoal/40"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-[24px] border-t border-line bg-paper p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:max-w-lg sm:rounded-[20px] sm:border sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="section-title pt-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`ปิด${title}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ivory text-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
