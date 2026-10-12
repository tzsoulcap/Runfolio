"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { unsetRestDayAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";

export function UnsetRestButton({
  date,
  revision,
}: {
  date: string;
  revision: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const res = await unsetRestDayAction({ date, expectedRevision: revision });
    if (!res.ok) {
      setPending(false);
      if (res.code === "UNAUTHENTICATED") {
        router.push(`/login?next=${encodeURIComponent("/plan")}`);
        return;
      }
      setError(res.message);
      return;
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="ยกเลิกวันพัก"
        disabled={pending}
        onClick={onClick}
      >
        {pending ? <span className="text-xs">…</span> : <MoreHorizontal aria-hidden />}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-base text-charcoal">
          {error}
        </p>
      )}
    </div>
  );
}
