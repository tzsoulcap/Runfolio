"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { undeleteLogAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";

// Undo toast after a delete (§7). Lives on ?deleted=<id>: restore returns to
// the revived detail page; dismiss drops the param.
export function UndoToast({ logId }: { logId: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 15000);
    return () => clearTimeout(timer);
  }, []);

  async function onUndo() {
    setError(null);
    setRestoring(true);
    try {
      const res = await undeleteLogAction({ logId });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent("/journal")}`);
          return;
        }
        setError(res.message);
        return;
      }
      router.push(`/journal/${logId}`);
    } finally {
      setRestoring(false);
    }
  }

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="ลบบันทึกแล้ว"
      className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-paper p-4"
    >
      <p className="text-base">ลบบันทึกแล้ว</p>
      <Button type="button" size="sm" onClick={onUndo} disabled={restoring}>
        {restoring ? "กำลังกู้…" : "เลิกทำ"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setVisible(false);
          router.replace("/journal");
        }}
        disabled={restoring}
      >
        ปิด
      </Button>
      {error && (
        <p role="alert" className="basis-full text-base text-charcoal">
          {error}
        </p>
      )}
    </div>
  );
}
