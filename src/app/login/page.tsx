import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";

import { getSessionUserId } from "@/lib/auth/session";

import { GoogleSignInButton, GoogleSignInFallback } from "./google-button";

function LoginCard({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-md rounded-card border border-line bg-paper p-6 sm:p-8">
      <h1 className="text-3xl font-semibold">Running Journal</h1>
      <p className="mt-2 text-base text-muted">
        สมุดซ้อมวิ่งส่วนตัว เข้าสู่ระบบเพื่อเริ่มใช้งาน
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

async function LoginGate() {
  if (await getSessionUserId()) {
    redirect("/");
  }
  return (
    <LoginCard>
      <Suspense fallback={<GoogleSignInFallback />}>
        <GoogleSignInButton />
      </Suspense>
    </LoginCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <LoginCard>
          <GoogleSignInFallback />
        </LoginCard>
      }
    >
      <LoginGate />
    </Suspense>
  );
}
