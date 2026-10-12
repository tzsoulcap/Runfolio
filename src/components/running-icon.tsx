import type { ComponentProps } from "react";

export function RunningIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="17" cy="4" r="2" />
      <path d="m7 11 3-3 4 1 3 3 4-1" />
      <path d="m14 9-3 5" />
      <path d="m11 14 5 3-3 5" />
      <path d="m11 14-4 4H3" />
    </svg>
  );
}
