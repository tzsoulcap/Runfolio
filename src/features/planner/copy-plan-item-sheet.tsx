"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { copyPlanItemAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import { formatDateTh } from "@/lib/format";
import { mondayOf } from "@/lib/domain/week";
import { resolveFreshRevision } from "./fresh-revision";
import type { PlanItemDTO } from "./types";

export function CopyPlanItemSheet({ item, sourceDate, onClose }: {
  item: PlanItemDTO;
  sourceDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dateId = useId();
  const [targetDate, setTargetDate] = useState(sourceDate);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const source = await resolveFreshRevision(mondayOf(sourceDate));
      const dest = mondayOf(sourceDate) === mondayOf(targetDate)
        ? source : await resolveFreshRevision(mondayOf(targetDate));
      if (!source.ok || !dest.ok) {
        const failed = !source.ok ? source : !dest.ok ? dest : null;
        if (failed?.unauthenticated) router.push("/login?next=%2Fplan");
        setError(failed?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        return;
      }
      const result = await copyPlanItemAction({
        planItemId: item.id, targetDate, expectedRevision: source.revision,
        expectedDestRevision: dest.revision,
      });
      if (!result.ok) {
        if (result.code === "UNAUTHENTICATED") router.push("/login?next=%2Fplan");
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-line bg-paper p-0 text-charcoal backdrop:bg-charcoal/40 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-[20px]">
      <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="section-title pt-2">คัดลอกรายการซ้อม</h2>
          <button type="button" aria-label="ปิดคัดลอกรายการซ้อม" disabled={busy} onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ivory text-muted disabled:opacity-40">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="font-medium">{item.title}</p>
        {item.activityType === "STRENGTH" && <p className="mt-1 text-sm text-muted">คัดลอกครบ {item.exercises.length} ท่า พร้อมจำนวนเซ็ตและค่าที่ตั้งไว้</p>}
        {saved ? <div role="status" className="mt-4">
          <p>คัดลอกไปวันที่ {formatDateTh(targetDate)} แล้ว</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => { router.push(`/plan?week=${mondayOf(targetDate)}#day-${targetDate}`); onClose(); }}>ดูแผนที่คัดลอก</Button>
            <Button type="button" variant="secondary" onClick={onClose}>เสร็จแล้ว</Button>
          </div>
        </div> : <form onSubmit={submit} className="mt-4">
          <label htmlFor={dateId} className={labelCls}>คัดลอกไปวันที่</label>
          <input id={dateId} type="date" required value={targetDate} disabled={busy}
            className={inputCls} onChange={(event) => setTargetDate(event.target.value)} />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !targetDate}>{busy ? "กำลังคัดลอก…" : "คัดลอก"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>ยกเลิก</Button>
          </div>
        </form>}
      </div>
    </dialog>
  );
}
