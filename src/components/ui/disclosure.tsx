import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export function Disclosure({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group rounded-[14px] border border-line" open={open}>
      <summary
        role="button"
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-muted [&::-webkit-details-marker]:hidden"
      >
        <SlidersHorizontal className="size-4 text-forest" aria-hidden />
        <span className="flex-1">{title}</span>
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}
