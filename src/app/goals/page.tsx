import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Target } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import { todayInTimeZone } from "@/lib/domain/week";
import { listGoalsWithProgress } from "@/lib/services/goals";
import { getOwnProfile } from "@/lib/services/profile";
import { GoalForm } from "@/features/goals/goal-form";
import { GoalSummaryCard } from "@/features/goals/goal-summary-card";

function GoalsFallback() {
  return (
    <div className="app-page">
      <h1 className="page-title">เป้าหมาย</h1>
      <p className="mt-2 text-sm text-muted">กำลังโหลดเป้าหมาย…</p>
    </div>
  );
}

async function GoalsContent() {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent("/goals")}`);

  const [goals, profile] = await Promise.all([
    listGoalsWithProgress(userId),
    getOwnProfile(userId),
  ]);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const active = goals.filter((goal) => goal.status === "ACTIVE");
  const primary = active.find((goal) => goal.isPrimary);
  const others = active.filter((goal) => goal.id !== primary?.id);
  const done = goals.filter((goal) => goal.status !== "ACTIVE");

  return (
    <div className="app-page">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3">
        <h1 className="page-title">เป้าหมาย</h1>
        <GoalForm idSuffix="new" />
      </div>
      <p className="mt-1 text-sm text-muted">ตั้งจุดหมายให้การซ้อมของคุณ</p>

      {goals.length === 0 ? (
        <div className="mt-5 rounded-[16px] border border-dashed border-line px-5 py-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-lime-soft">
            <Target className="size-8 text-forest" aria-hidden />
          </span>
          <h2 className="section-title mt-4">ยังไม่มีเป้าหมาย</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            เพิ่มเป้าหมาย 5K, 10K, 21K หรือ 42K
            <br />
            แล้วค่อย ๆ ซ้อมไปด้วยกัน
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {primary && (
            <section aria-label="เป้าหมายหลัก">
              <ul>
                <li><GoalSummaryCard goal={primary} today={today} /></li>
              </ul>
            </section>
          )}
          {(others.length > 0 || !primary) && (
            <section aria-label="เป้าหมายที่กำลังทำ">
              <div className="flex items-center justify-between">
                <h2 className="section-title">
                  {primary ? "เป้าหมายอื่น" : "กำลังทำ"}
                </h2>
                <span className="text-sm text-muted">
                  {others.length} เป้าหมาย
                </span>
              </div>
              {others.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  ไม่มีเป้าหมายที่กำลังทำ
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {others.map((goal) => (
                    <li key={goal.id}><GoalSummaryCard goal={goal} today={today} compact /></li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {done.length > 0 && (
            <section
              aria-label="เป้าหมายที่จบแล้ว"
              className="border-t border-line pt-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="section-title">จบแล้ว</h2>
                <span className="text-sm text-muted">
                  {done.length} เป้าหมาย
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {done.map((goal) => (
                  <li key={goal.id}><GoalSummaryCard goal={goal} today={today} compact /></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<GoalsFallback />}>
      <GoalsContent />
    </Suspense>
  );
}
