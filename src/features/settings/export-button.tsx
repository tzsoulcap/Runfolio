"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function ExportButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/export");
      if (res.status === 401) {
        router.push("/login?next=%2Fsettings");
        return;
      }
      if (!res.ok) {
        setError("ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `runfolio-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={download}
        className="w-full px-3 text-sm"
      >
        <Download aria-hidden />
        {busy ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลดข้อมูล (JSON)"}
      </Button>
      {error && (
        <div className="mt-2">
          <FieldError message={error} />
        </div>
      )}
    </div>
  );
}
