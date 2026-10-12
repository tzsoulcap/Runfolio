"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyTemplateAction,
  deleteTemplateAction,
  listTemplatesAction,
  previewTemplateAction,
  renameTemplateAction,
  type TemplateSummary,
} from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import type {
  CopyMode,
  RestChoice,
  WeekPreview,
} from "@/lib/services/copying";

import { ApplyPreview } from "./apply-preview";
import { resolveFreshRevision } from "./fresh-revision";
import { Sheet } from "./sheet";

export function TemplateSheet({
  monday,
  refreshKey,
  onClose,
}: {
  monday: string;
  refreshKey: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [mode, setMode] = useState<CopyMode>("append");
  const [choices, setChoices] = useState<Record<string, RestChoice>>({});
  const [preview, setPreview] = useState<WeekPreview | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplatesAction().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent("/plan")}`);
          return;
        }
        setError(res.message);
        return;
      }
      setTemplates(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, router]);

  // Resets live in the change handlers; the effect only fetches.
  function onToggleApply(id: string) {
    setApplyingId((prev) => (prev === id ? null : id));
    setChoices({});
    setPreview(null);
    setDone(null);
    setError(null);
  }

  function onApplyModeChange(next: CopyMode) {
    setMode(next);
    setChoices({});
    setPreview(null);
  }

  useEffect(() => {
    if (!applyingId) return;
    let cancelled = false;
    previewTemplateAction({
      templateId: applyingId,
      targetMonday: monday,
      mode,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setPreview(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [applyingId, mode, monday]);

  async function onConfirmApply() {
    if (!preview || !applyingId || preview.blocked) return;
    const missing = preview.days.filter(
      (d) => d.conflict === "REST_TARGET" && !choices[String(d.dayIndex)],
    );
    if (missing.length > 0) {
      setError("เลือกก่อนว่าจะคงวันพักหรือเปลี่ยนเป็นวันซ้อม");
      return;
    }
    setError(null);
    setBusy(true);
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
      const res = await applyTemplateAction({
        templateId: applyingId,
        targetMonday: monday,
        mode,
        choices,
        expectedRevision: rev.revision,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDone(`ใช้เทมเพลตแล้ว คัดลอก ${res.itemsCopied ?? 0} รายการ`);
      setApplyingId(null);
      setPreview(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id: string) {
    if (renameDraft.trim() === "") {
      setError("ตั้งชื่อเทมเพลตก่อน");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await renameTemplateAction({
        templateId: id,
        name: renameDraft.trim(),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRenamingId(null);
      setTemplates((prev) =>
        prev?.map((t) =>
          t.id === id ? { ...t, name: renameDraft.trim() } : t,
        ) ?? null,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await deleteTemplateAction({ templateId: id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDeletingId(null);
      setTemplates((prev) => prev?.filter((t) => t.id !== id) ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="เทมเพลตของฉัน" onClose={onClose}>
      {templates === null && (
        <p className="text-base text-muted">กำลังโหลดเทมเพลต…</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base text-charcoal">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-2 text-base text-charcoal">
          {done}
        </p>
      )}
      {templates !== null && templates.length === 0 && (
        <p className="text-base text-muted">
          ยังไม่มีเทมเพลต ใช้ “บันทึกเป็นเทมเพลต” จากเมนูสัปดาห์ได้เลย
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {(templates ?? []).map((t) => (
          <li
            key={t.id}
            className="rounded-button border border-line p-3"
          >
            {renamingId === t.id ? (
              <div className="flex gap-2">
                <input
                  aria-label="ชื่อเทมเพลตใหม่"
                  type="text"
                  className={`${inputCls} flex-1`}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRename(t.id)}
                >
                  บันทึกชื่อ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenamingId(null)}
                >
                  ยกเลิก
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold">{t.name}</p>
                  <p className="text-sm text-muted">
                    {t.itemCount} รายการ · พัก {t.restCount} วัน
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onToggleApply(t.id)}
                  >
                    ใช้
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRenamingId(t.id);
                      setRenameDraft(t.name);
                    }}
                  >
                    เปลี่ยนชื่อ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingId(t.id)}
                  >
                    ลบ
                  </Button>
                </div>
              </div>
            )}
            {deletingId === t.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base">ลบเทมเพลตนี้? สัปดาห์ที่ใช้ไปแล้วไม่กระทบ</p>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onDelete(t.id)}
                >
                  ยืนยันลบ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDeletingId(null)}
                >
                  ยกเลิก
                </Button>
              </div>
            )}
            {applyingId === t.id && preview && (
              <div className="mt-3 border-t border-line pt-3">
                <ApplyPreview
                  preview={preview}
                  mode={mode}
                  onModeChange={onApplyModeChange}
                  choices={choices}
                  onChoiceChange={(dayIndex, choice) =>
                    setChoices((prev) => ({ ...prev, [dayIndex]: choice }))
                  }
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    disabled={busy || preview.blocked}
                    onClick={() => void onConfirmApply()}
                  >
                    {busy ? "กำลังใช้เทมเพลต…" : "ยืนยันการใช้"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onToggleApply(t.id)}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
