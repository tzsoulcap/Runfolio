"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInFallback() {
  return (
    <Button size="lg" className="w-full" disabled>
      เข้าสู่ระบบด้วย Google
    </Button>
  );
}

export function GoogleSignInButton() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const next = safeNextPath(searchParams.get("next"));
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={signIn}
      >
        {pending ? "กำลังเปิด Google…" : "เข้าสู่ระบบด้วย Google"}
      </Button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-charcoal">
          เปิดหน้า Google ไม่ได้ ลองใหม่อีกครั้ง
        </p>
      )}
    </div>
  );
}
