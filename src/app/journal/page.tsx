import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import { formatDateTh, formatDistanceM, formatHMS, logDisplayName, weekdayTh } from "@/lib/format";
import { todayInTimeZone } from "@/lib/domain/week";
import type {
  MuscleGroup,
  StrengthPrescription,
} from "@/lib/domain/master";
import { paceLabelFor } from "@/lib/domain/metrics";
import { listLogs } from "@/lib/services/journal";
import {
  listRunningMasters,
  listStrengthMasters,
} from "@/lib/services/planner";
import { getOwnProfile } from "@/lib/services/profile";
import { LogForm } from "@/features/journal/log-form";
import { StrengthLogForm } from "@/features/journal/strength-log-form";

function JournalFallback() {
  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">บันทึก</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดบันทึก…</p>
    </div>
  );
}

async function JournalContent() {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/journal")}`);
  }
  const [entries, masters, strength, profile] = await Promise.all([
    listLogs(userId),
    listRunningMasters(),
    listStrengthMasters(),
    getOwnProfile(userId),
  ]);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const runningOptions = masters.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
  }));
  const strengthOptions = strength.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    muscleGroup: m.muscleGroup as MuscleGroup,
    repLabel: m.repLabel as "REPS" | "STEPS",
    defaultVariant: m.defaultVariant,
    defaultPrescription: m.defaultPrescription as StrengthPrescription,
    guidance: m.guidance,
    hint: m.hint,
  }));
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = groups.get(e.log.performedDate) ?? [];
    list.push(e);
    groups.set(e.log.performedDate, list);
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">บันทึก</h1>
      <section
        aria-label="บันทึกนอกแผน"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <h2 className="text-xl font-semibold">บันทึกนอกแผน</h2>
        <p className="mt-1 text-base text-muted">
          ซ้อมเองโดยไม่ได้อยู่ในแผน บันทึกย้อนหลังได้ไม่จำกัด
          ไม่รับวันในอนาคต
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <LogForm
            runningWorkoutCode={runningOptions[0]?.code ?? "EASY_RUN"}
            masters={runningOptions}
            today={today}
          />
          <StrengthLogForm
            planned={[]}
            masters={strengthOptions}
            today={today}
          />
        </div>
      </section>
      {entries.length === 0 ? (
        <div className="mt-4 rounded-card border border-line bg-paper p-6">
          <p className="text-base text-muted">ยังไม่มีบันทึก</p>
          <Link
            href="/plan"
            className="mt-3 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
          >
            ไปวางแผน
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {[...groups].map(([date, list]) => (
            <section key={date} aria-label={`วันที่ ${formatDateTh(date)}`}>
              <h2 className="text-xl font-semibold">
                วัน{weekdayTh(date)}
                <span className="ml-2 text-base font-normal text-muted">
                  {formatDateTh(date)}
                </span>
              </h2>
              <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-paper">
                {list.map(({ log, plan }) => {
                  const isStrength = log.activityType === "STRENGTH";
                  const name = isStrength
                    ? (plan?.title ?? "เวท")
                    : logDisplayName(log);
                  const pace = isStrength
                    ? null
                    : paceLabelFor(log.distanceM, log.movingDurationSec);
                  return (
                    <li key={log.id}>
                      <Link
                        href={`/journal/${log.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                      >
                        <span>
                          <span className="text-base font-semibold">
                            {name}
                          </span>
                          {!plan && (
                            <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-sm text-muted">
                              นอกแผน
                            </span>
                          )}
                          <span className="block text-base text-muted">
                            {isStrength ? (
                              <>เวท{log.rpe !== null && ` · RPE ${log.rpe}`}</>
                            ) : (
                              <>
                                {formatDistanceM(log.distanceM)}
                                {log.movingDurationSec !== null &&
                                  ` · ${formatHMS(log.movingDurationSec)}`}
                                {pace !== null && ` · ${pace}/km`}
                                {log.rpe !== null && ` · RPE ${log.rpe}`}
                              </>
                            )}
                          </span>
                          {log.note && (
                            <span className="mt-0.5 line-clamp-2 block text-base text-charcoal">
                              {log.note}
                            </span>
                          )}
                        </span>
                        <span aria-hidden="true" className="text-muted">
                          ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={<JournalFallback />}>
      <JournalContent />
    </Suspense>
  );
}
