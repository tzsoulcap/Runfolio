import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { CalendarDays, CirclePlus, Target } from "lucide-react";
import { RunningIcon } from "@/components/running-icon";

import { getSessionUserId } from "@/lib/auth/session";

import { DemoSignInButton } from "./demo-button";
import { GoogleSignInButton, GoogleSignInFallback } from "./google-button";

function LoginCard({ children }: { children: ReactNode }) {
  return (
    <section className="app-page">
      <div className="today-card rounded-[20px] p-6 text-paper">
        <span className="flex size-12 items-center justify-center rounded-full bg-lime">
          <RunningIcon className="size-7 text-forest" aria-hidden />
        </span>
        <h1 className="mt-4 text-[36px] leading-tight font-semibold tracking-tight">
          Runfolio
        </h1>
        <p className="mt-2 text-lg font-medium">ทุกก้าว มีเรื่องให้บันทึก</p>
        <p className="mt-1 max-w-64 text-sm leading-relaxed text-paper/85">
          วางแผนการซ้อม บันทึกสิ่งที่ทำ
          <br />
          และเห็นความต่อเนื่องของคุณ
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-[#f6f4ef] p-3 text-center text-xs text-muted">
        <span>
          <CalendarDays
            className="mx-auto mb-1.5 size-5 text-forest"
            aria-hidden
          />
          วางแผน
        </span>
        <span>
          <CirclePlus
            className="mx-auto mb-1.5 size-5 text-forest"
            aria-hidden
          />
          บันทึก
        </span>
        <span>
          <Target className="mx-auto mb-1.5 size-5 text-forest" aria-hidden />
          ไปถึงเป้าหมาย
        </span>
      </div>
      <div className="surface mt-4">
        <h2 className="section-title">เริ่มต้นการซ้อมของคุณ</h2>
        <p className="mt-1 text-sm text-muted">
          เข้าสู่ระบบเพื่อเก็บแผนและบันทึกของคุณ
        </p>
        <div className="mt-4">{children}</div>
      </div>
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
      <Suspense>
        <DemoSignInButton />
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
