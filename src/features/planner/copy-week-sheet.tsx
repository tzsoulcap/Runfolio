"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { copyWeekAction, previewCopyAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import { addDays, DateOnlySchema, mondayOf } from "@/lib/domain/week";
import { formatDateTh, weekdayTh } from "@/lib/format";
import type {
  CopyMode,
  RestChoice,
  WeekPreview,
} from "@/lib/services/copying";

import { ApplyPreview } from "./apply-preview";
import { resolveFreshRevision } from "./fresh-revision";
import { Sheet } from "./sheet";

export function CopyWeekSheet({
  monday,
  onClose,
}: {
  monday: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sourceDate, setSourceDate] = useState(addDays(monday, -7));
  const [mode, setMode] = useState<CopyMode>("append");
  const [choices, setChoices] = useState<Record<string, RestChoice>>({});
  const [preview, setPreview] = useState<WeekPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const sourceMonday = DateOnlySchema.safeParse(sourceDate).success
    ? mondayOf(sourceDate)
    : null;
  const loading = !!sourceMonday && !preview && !error && !done;

  // Resets live in the change handlers; the effect only fetches.
  function onSourceChange(value: string) {
    setSourceDate(value);
    setChoices({});
    setPreview(null);
    setError(null);
    setDone(null);
  }

  function onModeChange(next: CopyMode) {
    setMode(next);
    setChoices({});
    setPreview(null);
    setError(null);
  }

  useEffect(() => {
    if (!sourceMonday) return;
    let cancelled = false;
    previewCopyAction({ sourceMonday, targetMonday: monday, mode }).then(
      (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setPreview(null);
          if (res.code === "UNAUTHENTICATED") {
            router.push(`/login?next=${encodeURIComponent("/plan")}`);
            return;
          }
          setError(res.message);
          return;
        }
        setPreview(res.data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sourceMonday, mode, monday, router]);

  async function onConfirm() {
    if (!preview || !sourceMonday || preview.blocked) return;
    const missing = preview.days.filter(
      (d) => d.conflict === "REST_TARGET" && !choices[String(d.dayIndex)],
    );
    if (missing.length > 0) {
      setError("เลือกก่อนว่าจะคงวันพักหรือเปลี่ยนเป็นวันซ้อม");
      return;
    }
    setError(null);
    setApplying(true);
    try {
      const rev = await resolveFreshRevision(monday);
      if (!rev.ok) {
        if (rev.unauthenticated) {
          router.push(`/login?next=${encodeURIComponent("/plan")}`);
          return;
        }
        setError(rev.message);
        return;
      }
      const res = await copyWeekAction({
        sourceMonday,
        targetMonday: monday,
        mode,
        choices,
        expectedRevision: rev.revision,
      });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent("/plan")}`);
          return;
        }
        setError(res.message);
        return;
      }
      setDone(`คัดลอก ${res.itemsCopied ?? 0} รายการแล้ว`);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Sheet title="คัดลอกสัปดาห์" onClose={onClose}>
      <p className="text-base text-muted">
        ปลายทาง: สัปดาห์ {formatDateTh(monday)}
      </p>
      <div className="mt-3">
        <label className={labelCls} htmlFor="copy-source">
          สัปดาห์ต้นทาง (เลือกวันใดก็ได้ในสัปดาห์)
        </label>
        <input
          id="copy-source"
          type="date"
          className={inputCls}
          value={sourceDate}
          onChange={(e) => onSourceChange(e.target.value)}
        />
        {sourceMonday && (
          <p className="mt-1 text-sm text-muted">
            ต้นทาง: สัปดาห์ {formatDateTh(sourceMonday)}
          </p>
        )}
      </div>

      {loading && <p className="mt-3 text-base text-muted">กำลังโหลดตัวอย่าง…</p>}
      {error && (
        <p role="alert" className="mt-3 text-base text-charcoal">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-base text-charcoal">
          {done}
        </p>
      )}

      {preview && !done && (
        <div className="mt-3">
          <ApplyPreview
            preview={preview}
            mode={mode}
            onModeChange={onModeChange}
            choices={choices}
            onChoiceChange={(dayIndex, choice) =>
              setChoices((prev) => ({ ...prev, [dayIndex]: choice }))
            }
          />
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              disabled={applying || preview.blocked}
              onClick={() => void onConfirm()}
            >
              {applying ? "กำลังคัดลอก…" : "ยืนยันการคัดลอก"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">
            วัน{weekdayTh(monday)} {formatDateTh(monday)} ถึงวัน
            {weekdayTh(addDays(monday, 6))} {formatDateTh(addDays(monday, 6))}
          </p>
        </div>
      )}
    </Sheet>
  );
}
