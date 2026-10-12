import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeft, Dumbbell } from "lucide-react";
import { RunningIcon } from "@/components/running-icon";
import { ExercisePreview } from "@/components/exercise-preview";

import { getSessionUserId } from "@/lib/auth/session";
import {
  formatDateTh,
  formatDistanceM,
  formatHMS,
  formatPrescriptionTh,
  formatTargetFullTh,
  formatTimeTh,
  logDisplayName,
  outcomeTh,
  sideTh,
  weekdayTh,
} from "@/lib/format";
import {
  RunningTargetSchema,
  StrengthPrescriptionSchema,
  type CountMode,
} from "@/lib/domain/master";
import { todayInTimeZone } from "@/lib/domain/week";
import {
  paceLabelFor,
  type SplitAmount,
  sumSplits,
} from "@/lib/domain/metrics";
import { ServiceError } from "@/lib/services/errors";
import { getLogDetail } from "@/lib/services/journal";
import {
  listRunningMasters,
  listStrengthMasters,
} from "@/lib/services/planner";
import { getOwnProfile } from "@/lib/services/profile";
import { toRunningOptions, toStrengthOptions } from "@/lib/master-options";
import { PagePlaceholder } from "@/components/page-placeholder";
import { DeleteLogButton } from "@/features/journal/delete-log-button";
import { LogForm, type LogFormInitial } from "@/features/journal/log-form";
import {
  StrengthLogForm,
  type PlannedLogRow,
  type StrengthLogInitial,
} from "@/features/journal/strength-log-form";

function planTargetText(plan: { runningTarget?: unknown } | null): string {
  if (!plan || typeof plan !== "object") return "–";
  const parsed = RunningTargetSchema.safeParse(
    (plan as { runningTarget?: unknown }).runningTarget,
  );
  if (!parsed.success) return "–";
  return formatTargetFullTh(parsed.data) ?? "–";
}

type StrengthPlanned = {
  date?: string;
  title?: string;
  exercises?: Array<{
    plannedExerciseId?: string;
    exerciseCode?: string;
    prescription?: unknown;
  }>;
};

function formatSetDose(
  set: { measurement: string; reps: number | null; durationSec: number | null },
  repLabel: string,
): string {
  if (set.reps === null && set.durationSec === null) return "ข้าม";
  if (set.measurement === "TIME") return `${set.durationSec} วินาที`;
  const unit = repLabel === "STEPS" ? "ก้าว" : "ครั้ง";
  return `${set.reps} ${unit}`;
}

function formatSetLoad(loadKg: number | null): string | null {
  if (loadKg === null) return null;
  return loadKg === 0 ? "น้ำหนักตัว" : `${loadKg} kg`;
}

function formatAmountBits(amount: SplitAmount): string[] {
  return [
    amount.distanceM !== null ? formatDistanceM(amount.distanceM) : null,
    amount.durationSec !== null ? formatHMS(amount.durationSec) : null,
  ].filter((b): b is string => b !== null);
}

// Splits sum next to user-typed totals (§6, spec line 275): the sum is
// reference-only, stats always use totals.
function SplitsTotal({
  splits,
  distanceM,
  movingDurationSec,
}: {
  splits: Array<SplitAmount>;
  distanceM: number | null;
  movingDurationSec: number | null;
}) {
  const sum = sumSplits(splits);
  const sumBits = formatAmountBits(sum);
  const totalBits = formatAmountBits({
    distanceM,
    durationSec: movingDurationSec,
  });
  return (
    <p className="mt-2 text-base">
      รวมรอบ: {sumBits.join(" · ")} เทียบ totals ที่กรอก {totalBits.join(" · ")}
      <span className="block text-sm text-muted">
        ยอดรวมรอบใช้อ้างอิงเท่านั้น สถิติใช้ totals ที่กรอกด้านบน
      </span>
    </p>
  );
}

type StrengthActual = {
  exercise: {
    id: string;
    exerciseCode: string;
    plannedExerciseId: string | null;
    masterSnapshot: unknown;
  };
  sets: Array<{
    setIndex: number;
    side: string;
    measurement: string;
    reps: number | null;
    durationSec: number | null;
    loadKg: number | null;
  }>;
};

// Shared per-exercise actuals; planned lines appear only when the matching
// planned snapshot entry is passed (from-plan logs).
function StrengthActuals({
  strength,
  plannedExercises,
}: {
  strength: StrengthActual[];
  plannedExercises?: StrengthPlanned["exercises"];
}) {
  return (
    <div className="mt-2 space-y-3">
      {strength.map(({ exercise, sets }) => {
        const snapshot = exercise.masterSnapshot as {
          nameTh?: string;
          repLabel?: string;
        } | null;
        const snap = plannedExercises?.find(
          (p) => p.plannedExerciseId === exercise.plannedExerciseId,
        );
        const parsed = StrengthPrescriptionSchema.safeParse(snap?.prescription);
        const repLabel = snapshot?.repLabel ?? "REPS";
        const bySet = new Map<number, typeof sets>();
        for (const s of sets) {
          const list = bySet.get(s.setIndex) ?? [];
          list.push(s);
          bySet.set(s.setIndex, list);
        }
        return (
          <div key={exercise.id} className="rounded-button bg-[#f6f4ef] p-3">
            <h3 className="text-[15px] font-semibold">
              {snapshot?.nameTh ?? exercise.exerciseCode}
            </h3>
            <ExercisePreview
              compact
              exerciseCode={exercise.exerciseCode}
              nameTh={snapshot?.nameTh ?? exercise.exerciseCode}
            />
            {parsed.success && (
              <p className="text-sm text-muted">
                แผน{" "}
                {formatPrescriptionTh(
                  parsed.data,
                  repLabel === "STEPS" ? "STEPS" : "REPS",
                )}
              </p>
            )}
            <ol className="mt-2 space-y-1 text-sm leading-relaxed">
              {[...bySet].map(([setIndex, rows]) => (
                <li key={setIndex}>
                  เซ็ต {setIndex}:{" "}
                  {rows
                    .map((s) => {
                      const dose = formatSetDose(s, repLabel);
                      const load = formatSetLoad(s.loadKg);
                      const label =
                        rows.length > 1 ? `${sideTh(s.side)} ${dose}` : dose;
                      return load ? `${label} · ${load}` : label;
                    })
                    .join(" / ")}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

async function JournalDetail({ id }: { id: string }) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/journal/${id}`)}`);
  }
  let detail;
  try {
    detail = await getLogDetail(userId, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }
  const profile = await getOwnProfile(userId);
  const timezone = profile?.timezone ?? "Asia/Bangkok";
  const today = todayInTimeZone(timezone);
  const { log, plan, splits, strength } = detail;
  const isStrength = log.activityType === "STRENGTH";
  const name = isStrength ? (plan?.title ?? "เวท") : logDisplayName(log);
  const planned = log.plannedSnapshot as {
    date?: string;
    title?: string;
    runningTarget?: unknown;
    exercises?: StrengthPlanned["exercises"];
  } | null;
  const pace = isStrength
    ? null
    : paceLabelFor(log.distanceM, log.movingDurationSec);
  const [runningMasters, strengthMasters] = await Promise.all([
    listRunningMasters(),
    listStrengthMasters(),
  ]);
  const runningOptions = toRunningOptions(runningMasters);
  const strengthOptions = toStrengthOptions(strengthMasters);

  const splitHMS = (totalSec: number) => ({
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  });
  const moving = splitHMS(log.movingDurationSec ?? 0);
  const runInitial: LogFormInitial = {
    performedDate: log.performedDate,
    distanceKm: (log.distanceM ?? 0) / 1000,
    hours: moving.hours,
    minutes: moving.minutes,
    seconds: moving.seconds,
    ...(log.elapsedDurationSec !== null
      ? (() => {
          const e = splitHMS(log.elapsedDurationSec);
          return {
            elapsedHours: e.hours,
            elapsedMinutes: e.minutes,
            elapsedSeconds: e.seconds,
          };
        })()
      : {}),
    avgHeartRate: log.avgHeartRate ?? undefined,
    startTime: log.startedAt
      ? formatTimeTh(log.startedAt, timezone)
      : undefined,
    splits: splits.map((s) => ({
      distanceKm: s.distanceM !== null ? String(s.distanceM / 1000) : "",
      minutes:
        s.durationSec !== null ? String(Math.floor(s.durationSec / 60)) : "",
      seconds: s.durationSec !== null ? String(s.durationSec % 60) : "",
    })),
    outcome: log.outcome === "PARTIAL" ? "PARTIAL" : "COMPLETED",
    rpe: log.rpe ?? undefined,
    feeling: log.feeling ?? undefined,
    note: log.note ?? undefined,
  };
  const plannedRows: PlannedLogRow[] = (planned?.exercises ?? []).flatMap(
    (e, i) => {
      const parsed = StrengthPrescriptionSchema.safeParse(e.prescription);
      if (!parsed.success || !e.plannedExerciseId || !e.exerciseCode) {
        return [];
      }
      return [
        {
          id: e.plannedExerciseId,
          exerciseCode: e.exerciseCode,
          prescription: parsed.data,
          sortOrder: i,
          masterSnapshot: null,
        },
      ];
    },
  );
  const strengthInitial: StrengthLogInitial = {
    performedDate: log.performedDate,
    sessionMinutes:
      log.sessionDurationSec !== null
        ? String(Math.round(log.sessionDurationSec / 60))
        : undefined,
    startTime: log.startedAt
      ? formatTimeTh(log.startedAt, timezone)
      : undefined,
    outcome: log.outcome === "PARTIAL" ? "PARTIAL" : "COMPLETED",
    rpe: log.rpe !== null ? String(log.rpe) : undefined,
    feeling: log.feeling ?? undefined,
    note: log.note ?? undefined,
    exercises: strength.map(({ exercise, sets }) => {
      const bySet = new Map<number, typeof sets>();
      for (const s of sets) {
        const list = bySet.get(s.setIndex) ?? [];
        list.push(s);
        bySet.set(s.setIndex, list);
      }
      const firstSet = sets[0];
      return {
        plannedExerciseId: exercise.plannedExerciseId ?? undefined,
        exerciseCode: exercise.exerciseCode,
        measurement:
          firstSet?.measurement === "TIME" ? "TIME" : ("REPS" as const),
        countMode: exercise.countMode as CountMode,
        sets: [...bySet].map(([setNumber, rows]) => ({
          setNumber,
          slots: rows.map((s) => ({
            side: s.side,
            dose:
              s.reps !== null
                ? String(s.reps)
                : s.durationSec !== null
                  ? String(s.durationSec)
                  : "",
            load: s.loadKg !== null ? String(s.loadKg) : "",
          })),
        })),
      };
    }),
  };
  const editTarget = RunningTargetSchema.safeParse(planned?.runningTarget);

  return (
    <div className="app-page">
      <Link
        href="/journal"
        className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted"
      >
        <ChevronLeft className="size-5" aria-hidden />
        บันทึกทั้งหมด
      </Link>
      <h1 className="page-title mt-1">{name}</h1>
      <p className="mt-2 text-sm text-muted">
        วัน{weekdayTh(log.performedDate)}ที่ {formatDateTh(log.performedDate)}
        {!plan && (
          <span className="ml-2 rounded-full bg-ivory px-2 py-0.5 text-xs">
            นอกแผน
          </span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        {isStrength ? (
          <StrengthLogForm
            planItemId={log.planItemId ?? undefined}
            planDate={planned?.date}
            planned={plannedRows}
            masters={strengthOptions}
            today={today}
            edit={{ logId: log.id, initial: strengthInitial }}
          />
        ) : (
          <LogForm
            planItemId={log.planItemId ?? undefined}
            planDate={planned?.date}
            runningWorkoutCode={log.runningWorkoutCode ?? "EASY_RUN"}
            runningTarget={editTarget.success ? editTarget.data : null}
            masters={runningOptions}
            today={today}
            edit={{ logId: log.id, initial: runInitial }}
          />
        )}
        <DeleteLogButton logId={log.id} />
      </div>

      {isStrength ? (
        <dl className="today-card mt-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-[20px] p-5 text-paper">
          <div className="col-span-full">
            <dt className="flex items-center justify-between text-sm text-paper/85">
              ผล
              <Dumbbell className="size-6 rotate-45 text-lime" aria-hidden />
            </dt>
            <dd className="mt-2 text-[32px] leading-tight font-semibold">
              {outcomeTh(log.outcome)}
            </dd>
          </div>
          <div className="border-t border-paper/25 pt-3">
            <dt className="text-xs text-paper/85">เวลาเซสชัน</dt>
            <dd className="mt-1 text-xl font-medium">
              {log.sessionDurationSec !== null
                ? formatHMS(log.sessionDurationSec)
                : "–"}
            </dd>
          </div>
          <div className="border-t border-paper/25 pt-3">
            <dt className="text-xs text-paper/85">เวลาเริ่ม</dt>
            <dd className="mt-1 text-xl font-medium">
              {log.startedAt ? formatTimeTh(log.startedAt, timezone) : "–"}
            </dd>
          </div>
        </dl>
      ) : (
        <>
          <dl className="today-card mt-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-[20px] p-5 text-paper">
            <div className="col-span-full">
              <dt className="flex items-center justify-between text-sm text-paper/85">
                ระยะจริง
                <RunningIcon className="size-6 text-lime" aria-hidden />
              </dt>
              <dd className="mt-1 text-[44px] leading-tight font-semibold tracking-tight">
                {formatDistanceM(log.distanceM)}
              </dd>
            </div>
            <div className="border-t border-paper/25 pt-3">
              <dt className="text-xs text-paper/85">เวลาเคลื่อนไหว</dt>
              <dd className="mt-1 text-xl font-medium">
                {log.movingDurationSec !== null
                  ? formatHMS(log.movingDurationSec)
                  : "–"}
              </dd>
            </div>
            <div className="border-t border-paper/25 pt-3">
              <dt className="text-xs text-paper/85">Pace</dt>
              <dd className="mt-1 text-xl font-medium">
                {pace !== null ? `${pace}/km` : "–"}
              </dd>
            </div>
          </dl>
          <dl className="surface mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">ผล</dt>
              <dd className="text-base font-semibold">
                {outcomeTh(log.outcome)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">เวลารวมทั้งหมด</dt>
              <dd className="text-base font-semibold">
                {log.elapsedDurationSec !== null
                  ? formatHMS(log.elapsedDurationSec)
                  : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">HR เฉลี่ย</dt>
              <dd className="text-base font-semibold">
                {log.avgHeartRate !== null ? `${log.avgHeartRate} bpm` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">เวลาเริ่ม</dt>
              <dd className="text-base font-semibold">
                {log.startedAt ? formatTimeTh(log.startedAt, timezone) : "–"}
              </dd>
            </div>
          </dl>
        </>
      )}

      <section aria-label="แผนเทียบผลจริง" className="surface mt-4">
        <h2 className="section-title">แผนเทียบผลจริง</h2>
        {isStrength ? (
          planned?.exercises ? (
            <StrengthActuals
              strength={strength}
              plannedExercises={planned.exercises}
            />
          ) : (
            <p className="mt-2 text-base text-muted">
              ผลนอกแผน ไม่ได้ผูกกับแผนซ้อม
            </p>
          )
        ) : planned ? (
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            <p>
              แผน {planTargetText(planned)} / จริง{" "}
              {formatDistanceM(log.distanceM)}
            </p>
            {planned.date && planned.date !== log.performedDate && (
              <p className="text-muted">
                แผนวัน{weekdayTh(planned.date)}ที่ {formatDateTh(planned.date)}{" "}
                · ทำจริงวัน{weekdayTh(log.performedDate)}ที่{" "}
                {formatDateTh(log.performedDate)} · ความสำเร็จนับกับสัปดาห์แผน
                ระยะสะสมนับวันที่ทำจริง
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-base text-muted">
            ผลนอกแผน ไม่ได้ผูกกับแผนซ้อม
          </p>
        )}
        {isStrength && planned?.date && planned.date !== log.performedDate && (
          <p className="mt-2 text-base text-muted">
            แผนวัน{weekdayTh(planned.date)}ที่ {formatDateTh(planned.date)} ·
            ทำจริงวัน{weekdayTh(log.performedDate)}ที่{" "}
            {formatDateTh(log.performedDate)} · ความสำเร็จนับกับสัปดาห์แผน
            ผลงานเวทนับวันที่ทำจริง
          </p>
        )}
      </section>

      {isStrength &&
        (!planned?.exercises || planned.exercises.length === 0) &&
        strength.length > 0 && (
          <section aria-label="ผลเวท" className="surface mt-4">
            <h2 className="section-title">ผลเวท</h2>
            <StrengthActuals strength={strength} />
          </section>
        )}

      {!isStrength && splits.length > 0 && (
        <section aria-label="รอบที่วัดได้" className="surface mt-4">
          <h2 className="section-title">รอบที่วัดได้</h2>
          {planned && (
            <p className="mt-1 text-sm text-muted">
              แผนอ้างอิง: {planTargetText(planned)}
            </p>
          )}
          <ol className="mt-2 space-y-2 text-sm leading-relaxed">
            {splits.map((s, i) => (
              <li key={s.id}>
                รอบที่ {i + 1}:{" "}
                {[
                  s.distanceM !== null ? formatDistanceM(s.distanceM) : null,
                  s.durationSec !== null ? formatHMS(s.durationSec) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ol>
          <SplitsTotal
            splits={splits}
            distanceM={log.distanceM}
            movingDurationSec={log.movingDurationSec}
          />
        </section>
      )}

      {(log.rpe !== null || log.feeling || log.note) && (
        <section aria-label="บันทึกเพิ่มเติม" className="surface mt-4">
          <h2 className="section-title">บันทึกเพิ่มเติม</h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            {log.rpe !== null && <p>RPE {log.rpe}</p>}
            {log.feeling && <p>ความรู้สึก {log.feeling}</p>}
            {log.note && <p>{log.note}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

export default function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <PagePlaceholder
          title="รายละเอียดผลซ้อม"
          description="กำลังโหลดรายละเอียด…"
        />
      }
    >
      <JournalDetailLoader params={params} />
    </Suspense>
  );
}

async function JournalDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <JournalDetail id={id} />;
}
