import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

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
} from "@/lib/domain/master";
import {
  paceLabelFor,
  type SplitAmount,
  sumSplits,
} from "@/lib/domain/metrics";
import { ServiceError } from "@/lib/services/errors";
import { getLogDetail } from "@/lib/services/journal";
import { getOwnProfile } from "@/lib/services/profile";
import { PagePlaceholder } from "@/components/page-placeholder";

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
      รวมรอบ: {sumBits.join(" · ")} เทียบ totals ที่กรอก{" "}
      {totalBits.join(" · ")}
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
        const parsed = StrengthPrescriptionSchema.safeParse(
          snap?.prescription,
        );
        const repLabel = snapshot?.repLabel ?? "REPS";
        const bySet = new Map<number, typeof sets>();
        for (const s of sets) {
          const list = bySet.get(s.setIndex) ?? [];
          list.push(s);
          bySet.set(s.setIndex, list);
        }
        return (
          <div key={exercise.id}>
            <h3 className="text-base font-semibold">
              {snapshot?.nameTh ?? exercise.exerciseCode}
            </h3>
            {parsed.success && (
              <p className="text-sm text-muted">
                แผน{" "}
                {formatPrescriptionTh(
                  parsed.data,
                  repLabel === "STEPS" ? "STEPS" : "REPS",
                )}
              </p>
            )}
            <ol className="mt-1 space-y-0.5 text-base">
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

  return (
    <div>
      <Link
        href="/journal"
        className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
      >
        ‹ บันทึกทั้งหมด
      </Link>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{name}</h1>
      <p className="mt-1 text-base text-muted">
        วัน{weekdayTh(log.performedDate)}ที่ {formatDateTh(log.performedDate)}
        {!plan && (
          <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-sm">
            นอกแผน
          </span>
        )}
      </p>

      {isStrength ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-card border border-line bg-paper p-4 text-center">
          <div>
            <dt className="text-sm text-muted">ผล</dt>
            <dd className="text-xl font-semibold">
              {outcomeTh(log.outcome)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">เวลาเซสชัน</dt>
            <dd className="text-xl font-semibold">
              {log.sessionDurationSec !== null
                ? formatHMS(log.sessionDurationSec)
                : "–"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">เวลาเริ่ม</dt>
            <dd className="text-xl font-semibold">
              {log.startedAt ? formatTimeTh(log.startedAt, timezone) : "–"}
            </dd>
          </div>
        </dl>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 rounded-card border border-line bg-paper p-4 text-center">
            <div>
              <dt className="text-sm text-muted">ระยะจริง</dt>
              <dd className="text-xl font-semibold">
                {formatDistanceM(log.distanceM)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">เวลาเคลื่อนไหว</dt>
              <dd className="text-xl font-semibold">
                {log.movingDurationSec !== null
                  ? formatHMS(log.movingDurationSec)
                  : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Pace</dt>
              <dd className="text-xl font-semibold">
                {pace !== null ? `${pace}/km` : "–"}
              </dd>
            </div>
          </dl>
          <dl className="mt-4 grid grid-cols-2 gap-2 rounded-card border border-line bg-paper p-4 sm:grid-cols-4">
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

      <section
        aria-label="แผนเทียบผลจริง"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <h2 className="text-xl font-semibold">แผนเทียบผลจริง</h2>
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
          <div className="mt-2 space-y-1 text-base">
            <p>
              แผน {planTargetText(planned)} / จริง{" "}
              {formatDistanceM(log.distanceM)}
            </p>
            {planned.date && planned.date !== log.performedDate && (
              <p className="text-muted">
                แผนวัน{weekdayTh(planned.date)}ที่ {formatDateTh(planned.date)}{" "}
                · ทำจริงวัน{weekdayTh(log.performedDate)}ที่{" "}
                {formatDateTh(log.performedDate)} ·
                ความสำเร็จนับกับสัปดาห์แผน ระยะสะสมนับวันที่ทำจริง
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-base text-muted">
            ผลนอกแผน ไม่ได้ผูกกับแผนซ้อม
          </p>
        )}
        {isStrength &&
          planned?.date &&
          planned.date !== log.performedDate && (
            <p className="mt-2 text-base text-muted">
              แผนวัน{weekdayTh(planned.date)}ที่ {formatDateTh(planned.date)} ·
              ทำจริงวัน{weekdayTh(log.performedDate)}ที่{" "}
              {formatDateTh(log.performedDate)} ·
              ความสำเร็จนับกับสัปดาห์แผน ผลงานเวทนับวันที่ทำจริง
            </p>
          )}
      </section>

      {isStrength &&
        (!planned?.exercises || planned.exercises.length === 0) &&
        strength.length > 0 && (
          <section
            aria-label="ผลเวท"
            className="mt-4 rounded-card border border-line bg-paper p-4"
          >
            <h2 className="text-xl font-semibold">ผลเวท</h2>
            <StrengthActuals strength={strength} />
          </section>
        )}

      {!isStrength && splits.length > 0 && (
        <section
          aria-label="รอบที่วัดได้"
          className="mt-4 rounded-card border border-line bg-paper p-4"
        >
          <h2 className="text-xl font-semibold">รอบที่วัดได้</h2>
          {planned && (
            <p className="mt-1 text-sm text-muted">
              แผนอ้างอิง: {planTargetText(planned)}
            </p>
          )}
          <ol className="mt-2 space-y-1 text-base">
            {splits.map((s, i) => (
              <li key={s.id}>
                รอบที่ {i + 1}:{" "}
                {[
                  s.distanceM !== null
                    ? formatDistanceM(s.distanceM)
                    : null,
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
        <section
          aria-label="บันทึกเพิ่มเติม"
          className="mt-4 rounded-card border border-line bg-paper p-4"
        >
          <h2 className="text-xl font-semibold">บันทึกเพิ่มเติม</h2>
          <div className="mt-2 space-y-1 text-base">
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
