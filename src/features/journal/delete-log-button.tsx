"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteLogAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";

// §7: delete asks first — it rewrites history and stats. On success the
// journal list shows the undo toast via ?deleted=<id>.
export function DeleteLogButton({ logId }: { logId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await deleteLogAction({ logId });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent(`/journal/${logId}`)}`);
          return;
        }
        setError(res.message);
        setConfirming(false);
        return;
      }
      router.push(`/journal?deleted=${logId}`);
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          ลบบันทึก
        </Button>
        {error && (
          <p role="alert" className="mt-1 text-base text-charcoal">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label="ยืนยันการลบ"
      className="form-panel col-span-full w-full"
    >
      <p className="text-sm leading-relaxed">
        ลบบันทึกนี้จริงหรือไม่ การลบมีผลต่อประวัติและสถิติ
        แผนที่ผูกไว้จะกลับเป็นยังไม่บันทึก
      </p>
      <div className="mt-3 flex gap-3">
        <Button type="button" onClick={onDelete} disabled={deleting}>
          {deleting ? "กำลังลบ…" : "ลบเลย"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
