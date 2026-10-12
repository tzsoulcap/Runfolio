// Thai display formatting (§17: ปี ค.ศ. หน่วย km/นาที/วินาที).
import type {
  CountMode,
  IntensityTarget,
  MuscleGroup,
  RunningTarget,
  StrengthPrescription,
} from "@/lib/domain/master";
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

const MONTH_TH = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function formatMonthTh(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_TH[(m ?? 1) - 1] ?? ""} ${y ?? ""}`;
}

const dayMonthTh = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const monthShortTh = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  month: "short",
  timeZone: "UTC",
});

// Prose day/month ("12 ต.ค.").
export function formatDayMonthTh(dateStr: string): string {
  return dayMonthTh.format(parseDateOnly(dateStr));
}

// Week-style ranges: "12–18 ต.ค.", or "28 ก.ย. – 4 ต.ค." across months.
export function formatDayRange(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${Number(from.slice(8, 10))}–${Number(to.slice(8, 10))} ${monthShortTh.format(parseDateOnly(to))}`;
  }
  return `${formatDayMonthTh(from)} – ${formatDayMonthTh(to)}`;
}

// Compact day/month for chart axes ("09/02").
export function formatDayMonth(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

export const GOAL_TYPE_TH: Record<string, string> = {
  FINISH: "จบการแข่งขัน",
  TARGET_TIME: "ทำเวลา",
};

export const GOAL_STATUS_TH: Record<string, string> = {
  ACTIVE: "กำลังทำ",
  ACHIEVED: "สำเร็จแล้ว",
  ARCHIVED: "เก็บแล้ว",
};

// Event countdown (§8): calendar days; past events say passed, never
// auto-achieve.
export function goalCountdownTh(days: number): string {
  if (days > 0) return `อีก ${days} วัน`;
  if (days === 0) return "แข่งวันนี้!";
  return "ผ่านมาแล้ว";
}

export function goalDisplayName(goal: {
  distanceCode: string;
  eventName: string | null;
}): string {
  return goal.eventName ?? "เป้าหมาย";
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

// Bare km number for stat blocks ("10 / 12 km" composes the unit once).
export function formatKm(m: number): string {
  return trimNum(m / 1000);
}

export function formatIntensityTh(target: IntensityTarget | null | undefined): string | null {
  if (!target || target.kind === "NONE") return null;
  if (target.kind === "HR_ZONE") {
    return `Zone ${target.zoneMin}${target.zoneMax === target.zoneMin ? "" : `–${target.zoneMax}`}`;
  }
  if (target.kind === "EFFORT") return target.label;
  const pace = (seconds: number) => {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  };
  return `${pace(target.fastSecPerKm)}–${pace(target.slowSecPerKm)}/km`;
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

// Full one-line target: structured main plus its detail part (§6 plan ref).
export function formatTargetFullTh(
  target: RunningTarget | null | undefined,
): string | null {
  if (!target) return null;
  const main = formatStructuredMain(target) ?? formatTargetTh(target);
  const detail = formatStructuredDetail(target);
  return detail ? `${main} · ${detail}` : main;
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

export const MUSCLE_GROUP_TH: Record<MuscleGroup, string> = {
  SINGLE_LEG: "ขาเดี่ยว",
  GLUTES_HIPS: "ก้นและสะโพก",
  CALVES_ANKLES: "น่องและข้อเท้า",
  CORE: "แกนกลาง",
  UPPER_BODY: "ช่วงบน",
};

export type ActualSide =
  | "BOTH"
  | "LEFT"
  | "RIGHT"
  | "ALTERNATING"
  | "OUTBOUND"
  | "RETURN";

export const SIDE_TH: Record<ActualSide, string> = {
  BOTH: "รวม",
  LEFT: "ข้างซ้าย",
  RIGHT: "ข้างขวา",
  ALTERNATING: "สลับข้าง",
  OUTBOUND: "ทิศไป",
  RETURN: "ทิศกลับ",
};

// DB-backed lookup: unknown codes fall back to the raw value.
export function sideTh(side: string): string {
  return (SIDE_TH as Record<string, string>)[side] ?? side;
}

export const COUNT_MODE_TH: Record<CountMode, string> = {
  TOTAL: "รวมนับเดียว",
  PER_SIDE: "ต่อข้าง",
  TOTAL_ALTERNATING: "รวมสลับข้าง",
  PER_DIRECTION: "ต่อทิศทาง",
};

const COUNT_SUFFIX_TH: Record<CountMode, string> = {
  TOTAL: "",
  PER_SIDE: "ต่อข้าง",
  TOTAL_ALTERNATING: "รวมสลับข้าง",
  PER_DIRECTION: "ต่อทิศทาง",
};

export function formatPrescriptionTh(
  p: StrengthPrescription,
  repLabel: "REPS" | "STEPS" = "REPS",
): string {
  const unit =
    p.measurement === "REPS"
      ? repLabel === "STEPS"
        ? "ก้าว"
        : "ครั้ง"
      : "วินาที";
  const dose =
    p.measurement === "REPS" ? p.reps : p.durationSec;
  const parts = [
    `${p.sets} เซ็ต × ${dose} ${unit}${COUNT_SUFFIX_TH[p.countMode]}`,
  ];
  if (p.loadKg !== null) {
    parts.push(p.loadKg === 0 ? "น้ำหนักตัว" : `${p.loadKg} kg`);
  }
  if (p.restSec !== undefined) {
    parts.push(`พัก ${p.restSec} วิ`);
  }
  return parts.join(" · ");
}

export type LogOutcome = "COMPLETED" | "PARTIAL";

export const OUTCOME_TH: Record<LogOutcome, string> = {
  COMPLETED: "เสร็จแล้ว",
  PARTIAL: "ทำบางส่วน",
};

// DB-backed lookup: unknown outcomes fall back to the raw value.
export function outcomeTh(outcome: string): string {
  return (OUTCOME_TH as Record<string, string>)[outcome] ?? outcome;
}

export function formatTimeTh(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(d);
}

export const STATUS_TH: Record<DerivedPlanStatus, string> = {
  PLANNED: "ตามแผน",
  COMPLETED: "เสร็จแล้ว",
  PARTIAL: "ทำบางส่วน",
  SKIPPED: "ข้าม",
  MISSED: "พลาด",
};
