import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  formatDateTh,
  formatDayMonth,
  formatDistanceM,
  formatHMS,
} from "@/lib/format";
import { formatPace, paceLabelFor } from "@/lib/domain/metrics";
import { completionText } from "@/lib/domain/progress";
import {
  DateOnlySchema,
  mondayOf,
  todayInTimeZone,
} from "@/lib/domain/week";
import { getProgress } from "@/lib/services/progress";
import { listRunningMasters } from "@/lib/services/planner";
import { getOwnProfile } from "@/lib/services/profile";
import { inputCls, labelCls } from "@/components/ui/field";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ProgressFallback() {
  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">สถิติ</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดสถิติ…</p>
    </div>
  );
}

// §8 proportions across the four settled states (pending future items
// stay out). Shares appear only when there is something to share.
function ProportionList({
  done,
  partial,
  skipped,
  missed,
}: {
  done: number;
  partial: number;
  skipped: number;
  missed: number;
}) {
  const total = done + partial + skipped + missed;
  const share = (n: number) =>
    total > 0 ? ` (${Math.round((n / total) * 100)}%)` : "";
  return (
    <ul className="mt-2 space-y-1 text-base text-muted">
      <li>
        สำเร็จ {done} เซสชัน{share(done)}
      </li>
      <li>
        ทำบางส่วน {partial} เซสชัน{share(partial)}
      </li>
      <li>
        ข้าม {skipped} เซสชัน{share(skipped)}
      </li>
      <li>
        พลาด {missed} เซสชัน{share(missed)}
      </li>
    </ul>
  );
}

function PresetPill({
  href,
  current,
  label,
}: {
  href: string;
  current: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex h-11 items-center rounded-button px-5 text-base font-medium ${
        current
          ? "bg-forest text-ivory"
          : "border border-line bg-paper text-charcoal"
      }`}
    >
      {label}
    </Link>
  );
}

async function ProgressContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/progress")}`);
  }
  const profile = await getOwnProfile(userId);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const preset = first(searchParams.preset);
  const rawFrom = first(searchParams.from);
  const rawTo = first(searchParams.to);
  const chart = first(searchParams.chart) === "table" ? "table" : "bar";
  // Progress looks backward: ranges never extend past today.
  const to =
    rawTo && DateOnlySchema.safeParse(rawTo).success && rawTo <= today
      ? rawTo
      : today;
  const monthStart = `${today.slice(0, 7)}-01`;
  const from =
    preset === "month"
      ? monthStart
      : preset === "week"
        ? mondayOf(today)
        : rawFrom && DateOnlySchema.safeParse(rawFrom).success && rawFrom <= to
          ? rawFrom
          : mondayOf(today);
  const [progress, masters] = await Promise.all([
    getProgress(userId, { from, to, today }),
    listRunningMasters(),
  ]);
  const { summary } = progress;
  const masterName = new Map(masters.map((m) => [m.code, m.nameTh]));
  const avgPace = paceLabelFor(
    summary.runningActualM,
    summary.runningActualSec,
  );
  const maxBucket = Math.max(
    1,
    ...progress.buckets.map((b) => b.distanceM),
  );
  const qs = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (preset) sp.set("preset", preset);
    if (rawFrom) sp.set("from", rawFrom);
    if (rawTo) sp.set("to", rawTo);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return s === "" ? "/progress" : `/progress?${s}`;
  };
  const incompletePlan =
    summary.estimatedStructuredM > 0 || summary.timeBasedItems > 0;

  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">สถิติ</h1>
      <p className="mt-1 text-base text-muted">
        {formatDateTh(progress.effectiveFrom)} – {formatDateTh(progress.to)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="ช่วงเวลา">
        <PresetPill
          href="/progress?preset=week"
          current={preset !== "month" && !rawFrom}
          label="สัปดาห์นี้"
        />
        <PresetPill
          href="/progress?preset=month"
          current={preset === "month"}
          label="เดือนนี้"
        />
      </div>

      <form
        method="get"
        action="/progress"
        className="mt-4 rounded-card border border-line bg-paper p-4"
        aria-label="ช่วงวันที่กำหนดเอง"
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} htmlFor="progress-from">
              ตั้งแต่
            </label>
            <input
              id="progress-from"
              name="from"
              type="date"
              max={today}
              defaultValue={from}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="progress-to">
              ถึง
            </label>
            <input
              id="progress-to"
              name="to"
              type="date"
              max={today}
              defaultValue={to}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
          >
            ดูช่วงนี้
          </button>
        </div>
      </form>

      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-card border border-line bg-paper p-4 text-center sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">ระยะวิ่งสะสม</dt>
          <dd className="text-xl font-semibold">
            {formatDistanceM(summary.runningActualM)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">เวลาวิ่งรวม</dt>
          <dd className="text-xl font-semibold">
            {formatHMS(summary.runningActualSec)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">เพซเฉลี่ย</dt>
          <dd className="text-xl font-semibold">
            {avgPace !== null ? (
              `${avgPace}/km`
            ) : (
              <>
                –{" "}
                <span className="text-sm font-normal text-muted">
                  ยังไม่มีข้อมูล
                </span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">เซสชันวิ่ง</dt>
          <dd className="text-xl font-semibold">{progress.runningSessions}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">เซสชันเวท</dt>
          <dd className="text-xl font-semibold">{progress.strengthSessions}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">วันซ้อม</dt>
          <dd className="text-xl font-semibold">{progress.trainingDaysCount}</dd>
        </div>
      </dl>

      <section
        aria-label="ความต่อเนื่องตามแผน"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <h2 className="text-xl font-semibold">ความต่อเนื่องตามแผน</h2>
        <p className="mt-2 text-base">{completionText(summary)}</p>
        <ProportionList
          done={summary.doneItems}
          partial={summary.partialItems}
          skipped={summary.skippedItems}
          missed={progress.missed}
        />
        <p className="mt-2 text-sm text-muted">
          ผลจริงนับตามวันที่ซ้อม ความสำเร็จอ้างตามสัปดาห์ของแผน
          เซสชันที่ข้ามออกจากตัวหาร
        </p>
      </section>

      <section
        aria-label="แผนระยะเทียบผลจริง"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <h2 className="text-xl font-semibold">แผนระยะเทียบผลจริง</h2>
        <p className="mt-2 text-base">
          วิ่งแล้ว {formatDistanceM(summary.runningActualM)} / แผนระยะที่ระบุ{" "}
          {summary.plannedDistanceM > 0
            ? formatDistanceM(summary.plannedDistanceM)
            : "–"}
          {summary.timeBasedItems > 0 &&
            ` + ${summary.timeBasedItems} เซสชันแบบเวลา`}
          {summary.estimatedStructuredM > 0 &&
            ` + ประมาณ ${formatDistanceM(summary.estimatedStructuredM)}`}
        </p>
        {incompletePlan && (
          <p className="mt-1 text-sm text-muted">
            มีแผนที่ระยะไม่ครบ จึงไม่แสดงแถบเทียบระยะ
          </p>
        )}
      </section>

      <section
        aria-label="ระยะทางรายสัปดาห์"
        className="mt-4 rounded-card border border-line bg-paper p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">ระยะทางรายสัปดาห์</h2>
          <Link
            href={qs({ chart: chart === "bar" ? "table" : undefined })}
            className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
          >
            {chart === "bar" ? "ดูแบบตาราง" : "ดูแบบกราฟ"}
          </Link>
        </div>
        {chart === "bar" ? (
          <ol
            aria-label="กราฟระยะทาง 10 สัปดาห์"
            className="mt-3 flex h-40 items-end gap-1"
          >
            {progress.buckets.map((b) => {
              const pct =
                b.distanceM > 0
                  ? Math.max(4, Math.round((b.distanceM / maxBucket) * 100))
                  : 0;
              return (
                <li
                  key={b.monday}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${formatDateTh(b.monday)}: ${formatDistanceM(b.distanceM)}`}
                >
                  <span className="text-xs text-muted">
                    {b.distanceM > 0
                      ? (b.distanceM / 1000).toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })
                      : ""}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-1 w-full max-w-8 rounded-t bg-forest"
                    style={{ height: `${pct}%` }}
                  />
                  <span className="mt-1 text-xs text-muted">
                    {formatDayMonth(b.monday)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <table className="mt-3 w-full text-base">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  สัปดาห์เริ่ม
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  ระยะทาง
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {progress.buckets.map((b) => (
                <tr key={b.monday}>
                  <td className="py-1 pr-2">{formatDateTh(b.monday)}</td>
                  <td className="py-1 text-right">
                    {formatDistanceM(b.distanceM)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {progress.paceRows.length > 0 && (
        <section
          aria-label="เพซแยกตามประเภท"
          className="mt-4 rounded-card border border-line bg-paper p-4"
        >
          <h2 className="text-xl font-semibold">เพซแยกตามประเภท</h2>
          <table className="mt-3 w-full text-base">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  ประเภท
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  ระยะทาง
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  เวลา
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  เพซ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {progress.paceRows.map((row) => (
                <tr key={row.code}>
                  <td className="py-1 pr-2">
                    {masterName.get(row.code) ?? row.code}
                  </td>
                  <td className="py-1 text-right">
                    {formatDistanceM(row.distanceM)}
                  </td>
                  <td className="py-1 text-right">
                    {formatHMS(row.movingDurationSec)}
                  </td>
                  <td className="py-1 text-right">
                    {row.paceSecPerKm !== null
                      ? `${formatPace(row.paceSecPerKm)}/km`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-muted">
            เพซรวมจากเวลาที่เคลื่อนไหวทั้งหมดต่อประเภท ไม่เทียบข้ามประเภท
          </p>
        </section>
      )}
    </div>
  );
}

export default function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<ProgressFallback />}>
      <ProgressParamsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function ProgressParamsLoader({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const sp = await searchParams;
  return <ProgressContent searchParams={sp} />;
}
