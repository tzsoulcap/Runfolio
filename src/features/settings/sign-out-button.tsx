"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const result = await signOutAction();
      if (!result.ok) {
        setError(result.message);
        setPending(false);
        return;
      }
      // Start a fresh document so cached pages no longer contain this account.
      window.location.replace("/login");
    } catch {
      setError("เชื่อมต่อไม่ได้ ลองออกจากระบบอีกครั้ง");
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="w-full text-sm"
        disabled={pending}
        onClick={signOut}
      >
        <LogOut aria-hidden />
        {pending ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
      </Button>
      {error && (
        <div className="mt-3">
          <FieldError message={error} />
        </div>
      )}
    </div>
  );
}
