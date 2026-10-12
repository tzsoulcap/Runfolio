"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveTemplateAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import { formatDateTh } from "@/lib/format";

import { resolveFreshRevision } from "./fresh-revision";
import { Sheet } from "./sheet";

export function SaveTemplateSheet({
  monday,
  onClose,
  onSaved,
}: {
  monday: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (name.trim() === "") {
      setError("ตั้งชื่อเทมเพลตก่อน");
      return;
    }
    setError(null);
    setSaving(true);
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
      const res = await saveTemplateAction({
        sourceMonday: monday,
        name: name.trim(),
        description: description.trim() === "" ? undefined : description.trim(),
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
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="บันทึกเป็นเทมเพลต" onClose={onClose}>
      <p className="text-base text-muted">
        บันทึกสัปดาห์ {formatDateTh(monday)}{" "}
        เป็นเทมเพลตสำเนาอิสระ (ไม่คัดลอกผลจริง)
      </p>
      <div className="mt-3">
        <label className={labelCls} htmlFor="template-name">
          ชื่อเทมเพลต
        </label>
        <input
          id="template-name"
          type="text"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <label className={labelCls} htmlFor="template-desc">
          คำอธิบาย (ถ้ามี)
        </label>
        <input
          id="template-desc"
          type="text"
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-base text-charcoal">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "กำลังบันทึก…" : "บันทึกเทมเพลต"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          ยกเลิก
        </Button>
      </div>
    </Sheet>
  );
}
