"use client";

import { inputCls } from "@/components/ui/field";

// Native selectors use the mobile OS picker and always emit m:ss.
export function PacePicker({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [minutes = "", seconds = "00"] = value.split(":");
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-charcoal">{label}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
        <label className="min-w-0">
          <span className="sr-only">{label} นาที</span>
          <select aria-label={`${label} นาที`} className={`${inputCls} px-2 tabular-nums`} value={minutes}
            onChange={(event) => onChange(event.target.value === "" ? "" : `${event.target.value}:${seconds}`)}>
            <option value="">–</option>
            {Array.from({ length: 60 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span aria-hidden className="mt-1 block text-center text-xs text-muted">min</span>
        </label>
        <span aria-hidden className="pb-5 font-medium">:</span>
        <label className="min-w-0">
          <span className="sr-only">{label} วินาที</span>
          <select aria-label={`${label} วินาที`} className={`${inputCls} px-2 tabular-nums`} value={seconds}
            onChange={(event) => onChange(`${minutes || "0"}:${event.target.value}`)}>
            {Array.from({ length: 60 }, (_, n) => {
              const text = String(n).padStart(2, "0");
              return <option key={n} value={text}>{text}</option>;
            })}
          </select>
          <span aria-hidden className="mt-1 block text-center text-xs text-muted">sec</span>
        </label>
      </div>
    </fieldset>
  );
}
