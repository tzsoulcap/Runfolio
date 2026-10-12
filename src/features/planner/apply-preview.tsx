"use client";

import type { CopyMode, RestChoice, WeekPreview } from "@/lib/services/copying";
import { formatDateTh, weekdayTh } from "@/lib/format";

// Shared preview: per-day source/target summary, conflict choices (§5).
export function ApplyPreview({
  preview,
  mode,
  onModeChange,
  choices,
  onChoiceChange,
}: {
  preview: WeekPreview;
  mode: CopyMode;
  onModeChange: (mode: CopyMode) => void;
  choices: Record<string, RestChoice>;
  onChoiceChange: (dayIndex: number, choice: RestChoice) => void;
}) {
  return (
    <div>
      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-charcoal">
          วิธีนำเข้า
        </legend>
        <div className="flex gap-4">
          <label className="inline-flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name="copy-mode"
              value="append"
              checked={mode === "append"}
              onChange={() => onModeChange("append")}
            />
            เพิ่มต่อจากแผนเดิม
          </label>
          <label className="inline-flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name="copy-mode"
              value="replace"
              checked={mode === "replace"}
              onChange={() => onModeChange("replace")}
            />
            แทนที่แผนที่ยังไม่บันทึก
          </label>
        </div>
      </fieldset>

      {preview.blocked && (
        <p role="alert" className="mt-3 text-base text-charcoal">
          สัปดาห์นี้มีผลบันทึกแล้ว แทนที่ไม่ได้ทั้งสัปดาห์
          เลือกเพิ่มต่อจากแผนเดิมแทนได้
        </p>
      )}

      <ol className="mt-3 space-y-2">
        {preview.days.map((day) => (
          <li
            key={day.dayIndex}
            className="rounded-button border border-line p-3"
          >
            <p className="text-base font-semibold">
              วัน{weekdayTh(day.date)}{" "}
              <span className="font-normal text-muted">
                {formatDateTh(day.date)}
              </span>
            </p>
            <p className="mt-1 text-base text-muted">
              {day.source.isRestDay
                ? "ต้นทาง: วันพัก"
                : day.source.titles.length > 0
                  ? `ต้นทาง: ${day.source.titles.join(" · ")}`
                  : "ต้นทาง: วันว่าง"}
            </p>
            <p className="text-base text-muted">
              {day.target.isRestDay
                ? "ปลายทาง: วันพัก"
                : day.target.titles.length > 0
                  ? `ปลายทาง: ${day.target.titles.join(" · ")}`
                  : "ปลายทาง: วันว่าง"}
              {day.target.loggedCount > 0
                ? ` (มีผลบันทึก ${day.target.loggedCount})`
                : ""}
            </p>
            <p className="mt-1 text-base text-charcoal">{day.action}</p>
            {day.conflict === "REST_TARGET" && (
              <fieldset className="mt-2">
                <legend className="mb-1 block text-sm font-medium text-charcoal">
                  วัน{weekdayTh(day.date)}ชนวันพัก
                </legend>
                <div className="flex gap-4">
                  <label className="inline-flex min-h-11 items-center gap-2 text-base">
                    <input
                      type="radio"
                      name={`rest-${day.dayIndex}`}
                      checked={choices[String(day.dayIndex)] === "keep-rest"}
                      onChange={() => onChoiceChange(day.dayIndex, "keep-rest")}
                    />
                    คงวันพัก
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-base">
                    <input
                      type="radio"
                      name={`rest-${day.dayIndex}`}
                      checked={choices[String(day.dayIndex)] === "convert"}
                      onChange={() => onChoiceChange(day.dayIndex, "convert")}
                    />
                    เปลี่ยนเป็นวันซ้อม
                  </label>
                </div>
              </fieldset>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
