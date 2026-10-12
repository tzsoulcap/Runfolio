"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  achieveGoalAction,
  archiveGoalAction,
  linkResultAction,
  setPrimaryGoalAction,
  unlinkResultAction,
} from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import { formatDateTh, formatDistanceM, formatHMS } from "@/lib/format";
import type { ResultCandidate } from "@/lib/services/goals";

function useGoalMutation(
  run: () => Promise<{ ok: boolean; code?: string; message?: string }>,
  loginNext: string,
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function fire() {
    setError(null);
    setBusy(true);
    try {
      const res = await run();
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent(loginNext)}`);
          return;
        }
        setError(res.message ?? "เกิดข้อผิดพลาด");
      }
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, fire };
}

function GoalMutationButton({
  label,
  variant,
  run,
}: {
  label: string;
  variant?: "ghost";
  run: () => Promise<{ ok: boolean; code?: string; message?: string }>;
}) {
  const { busy, error, fire } = useGoalMutation(run, "/goals");
  return (
    <span>
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={fire}
        disabled={busy}
      >
        {busy ? "กำลังบันทึก…" : label}
      </Button>
      {error && (
        <span role="alert" className="ml-2 text-base text-charcoal">
          {error}
        </span>
      )}
    </span>
  );
}

export function SetPrimaryButton({ goalId }: { goalId: string }) {
  return (
    <GoalMutationButton
      label="ตั้งเป็นเป้าหมายหลัก"
      run={() => setPrimaryGoalAction({ goalId })}
    />
  );
}

export function ArchiveGoalButton({ goalId }: { goalId: string }) {
  return (
    <GoalMutationButton
      label="เก็บเป้าหมาย"
      variant="ghost"
      run={() => archiveGoalAction({ goalId })}
    />
  );
}

export function AchieveGoalButton({ goalId }: { goalId: string }) {
  return (
    <GoalMutationButton
      label="ทำสำเร็จแล้ว"
      run={() => achieveGoalAction({ goalId })}
    />
  );
}

export function UnlinkResultButton({ goalId }: { goalId: string }) {
  return (
    <GoalMutationButton
      label="ยกเลิกการเชื่อม"
      variant="ghost"
      run={() => unlinkResultAction({ goalId })}
    />
  );
}

export function LinkResultForm({
  goalId,
  candidates,
}: {
  goalId: string;
  candidates: ResultCandidate[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(candidates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLink() {
    if (!picked) return;
    setError(null);
    setBusy(true);
    try {
      const res = await linkResultAction({ goalId, logId: picked });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent("/goals")}`);
          return;
        }
        setError(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="mt-2 text-base text-muted">
        ยังไม่มีผล Race Day ให้เชื่อม บันทึกผลแข่งก่อนแล้วกลับมาเลือก
      </p>
    );
  }
  return (
    <div className="mt-2">
      <label className={labelCls} htmlFor={`result-pick-${goalId}`}>
        เลือกผล Race Day
      </label>
      <div className="flex gap-2">
        <select
          id={`result-pick-${goalId}`}
          className={inputCls}
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {formatDateTh(c.performedDate)} ·{" "}
              {formatDistanceM(c.distanceM)}
              {c.movingDurationSec !== null &&
                ` · ${formatHMS(c.movingDurationSec)}`}
              {c.note ? ` · ${c.note}` : ""}
            </option>
          ))}
        </select>
        <Button type="button" onClick={onLink} disabled={busy || !picked}>
          {busy ? "กำลังบันทึก…" : "เชื่อมผล"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-base text-charcoal">
          {error}
        </p>
      )}
    </div>
  );
}
