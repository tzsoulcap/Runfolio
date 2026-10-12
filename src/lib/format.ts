// Thai display formatting (§17: ปี ค.ศ. หน่วย km/นาที/วินาที).
import type { RunningTarget } from "@/lib/domain/master";
import type { DerivedPlanStatus } from "@/lib/domain/plan";
import { parseDateOnly } from "@/lib/domain/week";

const WEEKDAYS_TH = [
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
  "อาทิตย์",
];

const gregorianTh = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function weekdayTh(dateStr: string): string {
  const day = parseDateOnly(dateStr).getUTCDay();
  return WEEKDAYS_TH[(day + 6) % 7] ?? "";
}

export function formatDateTh(dateStr: string): string {
  return gregorianTh.format(parseDateOnly(dateStr));
}

export function logDisplayName(log: {
  masterSnapshot: Record<string, unknown> | null;
  runningWorkoutCode: string | null;
}): string {
  const snapshot = log.masterSnapshot?.nameEn;
  if (typeof snapshot === "string" && snapshot.length > 0) return snapshot;
  return log.runningWorkoutCode ?? "Strength";
}

function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatDistanceM(m: number | null): string {
  if (m === null) return "–";
  if (m >= 1000) return `${trimNum(m / 1000)} km`;
  return `${trimNum(m)} m`;
}

export function formatTargetTh(
  target: RunningTarget | null | undefined,
): string {
  if (!target) return "–";
  if (target.kind === "DISTANCE") return formatDistanceM(target.distanceM);
  if (target.kind === "DURATION")
    return `${trimNum(target.durationSec / 60)} นาที`;
  return "Structured";
}

// Parses plan-form pace input: "m:ss" or plain seconds. Null when invalid.
export function parsePaceInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const mss = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (mss) return Number(mss[1]) * 60 + Number(mss[2]);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

export function formatHMS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function greetingTh(hour: number): string {
  if (hour >= 5 && hour < 12) return "สวัสดีตอนเช้า";
  if (hour >= 12 && hour < 17) return "สวัสดีตอนบ่าย";
  if (hour >= 17 && hour < 21) return "สวัสดีตอนเย็น";
  return "สวัสดีตอนกลางคืน";
}

// Interval-style hero number: "5 × 800 m" from the first repeat block.
// Null when there is no repeat to headline (caller falls back).
export function formatStructuredMain(
  target: RunningTarget | null | undefined,
): string | null {
  if (target?.kind !== "STRUCTURED") return null;
  const repeat = target.steps.find((s) => s.kind === "REPEAT");
  if (!repeat || repeat.kind !== "REPEAT") return null;
  const work =
    repeat.steps.find(
      (s) => s.phase === "WORK" && s.target.kind === "DISTANCE",
    ) ??
    repeat.steps.find(
      (s) => s.phase === "WORK" && s.target.kind === "DURATION",
    );
  if (!work) return null;
  const t = work.target;
  const dist =
    t.kind === "DISTANCE"
      ? formatDistanceM(t.distanceM)
      : t.kind === "DURATION"
        ? formatTargetTh(t)
        : t.instruction;
  return `${repeat.repeatCount} × ${dist}`;
}

export function formatStructuredDetail(
  target: RunningTarget | null | undefined,
): string | null {
  if (target?.kind !== "STRUCTURED") return null;
  const recoveryBits: string[] = [];
  for (const block of target.steps) {
    const steps = block.kind === "REPEAT" ? block.steps : [block];
    for (const step of steps) {
      if (step.phase !== "RECOVERY") continue;
      const t = step.target;
      recoveryBits.push(
        t.kind === "OPEN" ? `พัก ${t.instruction}` : `พัก ${formatTargetTh(t)}`,
      );
    }
  }
  return recoveryBits.length > 0 ? recoveryBits.join(" · ") : null;
}

export const STATUS_TH: Record<DerivedPlanStatus, string> = {
  PLANNED: "ตามแผน",
  COMPLETED: "เสร็จแล้ว",
  PARTIAL: "ทำบางส่วน",
  SKIPPED: "ข้าม",
  MISSED: "พลาด",
};
