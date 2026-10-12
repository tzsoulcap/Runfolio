"use client";

import { useEffect } from "react";

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
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card border-t border-line bg-paper p-4 pb-8 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:max-w-lg sm:rounded-card sm:border sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`ปิด${title}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-button border border-line bg-paper text-xl text-charcoal"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
