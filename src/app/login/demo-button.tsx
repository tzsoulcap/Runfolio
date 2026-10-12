"use client";

import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DemoSignInButton() {
  const searchParams = useSearchParams();
  const demoFailed = searchParams.get("error") === "demo";
  return (
    <div>
      <div className="my-4 flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" aria-hidden />
        หรือ
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      <Button size="lg" variant="outline" className="w-full" asChild>
        <a href="/auth/demo">ลองใช้บัญชีสาธิต</a>
      </Button>
      <p className="mt-2 text-sm text-muted">
        เข้าชมข้อมูลตัวอย่างทันที ไม่ต้องสมัครสมาชิก
      </p>
      {demoFailed && (
        <p role="alert" className="mt-3 text-sm text-charcoal">
          บัญชีสาธิตยังไม่พร้อมใช้งาน ลองใหม่ภายหลัง
        </p>
      )}
    </div>
  );
}
