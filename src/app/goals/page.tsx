import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  GOAL_STATUS_TH,
  GOAL_TYPE_TH,
  formatDateTh,
  goalCountdownTh,
  goalDisplayName,
} from "@/lib/format";
import { countdownDays } from "@/lib/domain/home";
import { todayInTimeZone } from "@/lib/domain/week";
import { listAllGoals } from "@/lib/services/goals";
import { getOwnProfile } from "@/lib/services/profile";
import { GoalForm } from "@/features/goals/goal-form";

function GoalsFallback() {
  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">เป้าหมาย</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดเป้าหมาย…</p>
    </div>
  );
}

type GoalRow = {
  id: string;
  distanceCode: string;
  goalType: string;
  eventName: string | null;
  eventDate: string | null;
  isPrimary: boolean;
  status: string;
};

function GoalListItem({ goal, today }: { goal: GoalRow; today: string }) {
  const done = goal.status !== "ACTIVE";
  return (
    <li>
      <Link
        href={`/goals/${goal.id}`}
        className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
      >
        <span>
          <span className="text-base font-semibold">
            {goalDisplayName(goal)} {goal.distanceCode}
          </span>
          {goal.isPrimary && !done && (
            <span className="ml-2 rounded-full bg-forest px-2 py-0.5 text-sm text-ivory">
              หลัก
            </span>
          )}
          {done && (
            <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-sm text-muted">
              {GOAL_STATUS_TH[goal.status] ?? goal.status}
            </span>
          )}
          <span className="block text-base text-muted">
            {GOAL_TYPE_TH[goal.goalType] ?? goal.goalType}
            {goal.eventDate &&
              ` · ${formatDateTh(goal.eventDate)}${done ? "" : ` · ${goalCountdownTh(countdownDays(goal.eventDate, today))}`}`}
          </span>
        </span>
        <span aria-hidden="true" className="text-muted">
          ›
        </span>
      </Link>
    </li>
  );
}

async function GoalsContent() {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/goals")}`);
  }
  const [goals, profile] = await Promise.all([
    listAllGoals(userId),
    getOwnProfile(userId),
  ]);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const active = goals.filter((g) => g.status === "ACTIVE");
  const done = goals.filter((g) => g.status !== "ACTIVE");

  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">เป้าหมาย</h1>
      <div className="mt-4">
        <GoalForm idSuffix="new" />
      </div>

      {goals.length === 0 ? (
        <div className="mt-4 rounded-card border border-line bg-paper p-6">
          <p className="text-base text-muted">
            ยังไม่มีเป้าหมาย เพิ่มเป้าหมาย 5K, 10K, 21K หรือ 42K แรกได้เลย
          </p>
        </div>
      ) : (
        <>
          <section aria-label="เป้าหมายที่กำลังทำ" className="mt-6">
            <h2 className="text-xl font-semibold">กำลังทำ ({active.length})</h2>
            {active.length === 0 ? (
              <p className="mt-2 text-base text-muted">
                ไม่มีเป้าหมายที่กำลังทำ
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-paper">
                {active.map((goal) => (
                  <GoalListItem key={goal.id} goal={goal} today={today} />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section aria-label="เป้าหมายที่จบแล้ว" className="mt-6">
              <h2 className="text-xl font-semibold">จบแล้ว ({done.length})</h2>
              <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-paper">
                {done.map((goal) => (
                  <GoalListItem key={goal.id} goal={goal} today={today} />
                ))}
              </ul>
            </section>
          )}
        </>
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
