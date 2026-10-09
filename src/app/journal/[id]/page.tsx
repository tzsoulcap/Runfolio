import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  formatDateTh,
  formatDistanceM,
  formatHMS,
  formatTargetTh,
  logDisplayName,
  weekdayTh,
} from "@/lib/format";
import { RunningTargetSchema } from "@/lib/domain/master";
import { formatPace, paceSecPerKm } from "@/lib/domain/metrics";
import { ServiceError } from "@/lib/services/errors";
import { getLogDetail } from "@/lib/services/journal";
import { PagePlaceholder } from "@/components/page-placeholder";

function planTargetText(plan: { runningTarget?: unknown } | null): string {
  if (!plan || typeof plan !== "object") return "–";
  const parsed = RunningTargetSchema.safeParse(
    (plan as { runningTarget?: unknown }).runningTarget,
  );
  return parsed.success ? formatTargetTh(parsed.data) : "–";
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
  const { log, plan } = detail;
  const name = logDisplayName(log);
  const planned = log.plannedSnapshot as {
    date?: string;
    title?: string;
    runningTarget?: unknown;
  } | null;
  const pace =
    log.distanceM !== null && log.movingDurationSec !== null
      ? formatPace(paceSecPerKm(log.distanceM, log.movingDurationSec))
      : null;

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

      <section
        aria-label="แผนเทียบผลจริง"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <h2 className="text-xl font-semibold">แผนเทียบผลจริง</h2>
        {planned ? (
          <div className="mt-2 space-y-1 text-base">
            <p>
              แผน {planTargetText(planned)} / จริง{" "}
              {formatDistanceM(log.distanceM)}
            </p>
            {planned.date && planned.date !== log.performedDate && (
              <p className="text-muted">
                แผนวัน{weekdayTh(planned.date)}ที่ {formatDateTh(planned.date)}{" "}
                · ทำจริงวัน{weekdayTh(log.performedDate)}ที่{" "}
                {formatDateTh(log.performedDate)}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-base text-muted">
            ผลนอกแผน ไม่ได้ผูกกับแผนซ้อม
          </p>
        )}
      </section>

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
