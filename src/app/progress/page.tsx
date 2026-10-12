import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ChartColumn, Table2 } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";

import { getSessionUserId } from "@/lib/auth/session";
import {
  formatDateTh,
  formatDayMonth,
  formatDistanceM,
  formatHMS,
  formatKm,
} from "@/lib/format";
import { formatPace, paceLabelFor } from "@/lib/domain/metrics";
import { completionText } from "@/lib/domain/progress";
import { DateOnlySchema, mondayOf, todayInTimeZone } from "@/lib/domain/week";
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
    <div className="app-page">
      <h1 className="page-title">สถิติ</h1>
      <p className="mt-2 text-sm text-muted">กำลังโหลดสถิติ…</p>
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
    <ul className="mt-3 grid grid-cols-2 gap-2 text-xs leading-relaxed text-muted">
      <li className="rounded-button bg-[#f6f8f0] p-2.5">
        สำเร็จ {done} เซสชัน{share(done)}
      </li>
      <li className="rounded-button bg-clay/50 p-2.5">
        ทำบางส่วน {partial} เซสชัน{share(partial)}
      </li>
      <li className="rounded-button bg-[#eef1f3] p-2.5">
        ข้าม {skipped} เซสชัน{share(skipped)}
      </li>
      <li className="rounded-button bg-[#f6f4ef] p-2.5">
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
      className="segmented-link"
    >
      {label}
    </Link>
  );
}

async function ProgressContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
  const maxBucket = Math.max(1, ...progress.buckets.map((b) => b.distanceM));
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
    <div className="app-page">
      <h1 className="page-title">สถิติ</h1>
      <p className="mt-1 text-sm text-muted">
        {formatDateTh(progress.effectiveFrom)} – {formatDateTh(progress.to)}
      </p>

      <div
        className="segmented-control mt-4"
        role="group"
        aria-label="ช่วงเวลา"
      >
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

      <div className="mt-3">
        <Disclosure
          key={`${from}-${to}`}
          title="กำหนดช่วงวันที่"
          open={Boolean(rawFrom || rawTo)}
        >
          <form method="get" action="/progress" aria-label="ช่วงวันที่กำหนดเอง">
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
        </Disclosure>
      </div>

      <dl className="today-card mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[20px] p-4 text-paper">
        <div className="col-span-full">
          <dt className="flex items-center justify-between text-sm text-paper/85">
            ระยะวิ่งสะสม
            <ChartColumn className="size-6 text-lime" aria-hidden />
          </dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-2 leading-none">
            <span className="min-w-0 text-[52px] font-semibold tracking-tight break-all">
              {formatKm(summary.runningActualM)}
            </span>{" "}
            <span className="text-2xl font-medium">km</span>
          </dd>
        </div>
        <div className="border-t border-paper/25 pt-3">
          <dt className="text-xs text-paper/85">เวลาวิ่งรวม</dt>
          <dd className="mt-1 text-xl font-medium">
            {formatHMS(summary.runningActualSec)}
          </dd>
        </div>
        <div className="border-t border-paper/25 pt-3">
          <dt className="text-xs text-paper/85">เพซเฉลี่ย</dt>
          <dd className="mt-1 text-xl font-medium">
            {avgPace !== null ? (
              `${avgPace}/km`
            ) : (
              <>
                –{" "}
                <span className="text-xs font-normal text-paper/85">
                  ยังไม่มีข้อมูล
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <dl className="mt-3 grid grid-cols-3 rounded-[14px] bg-[#f6f4ef] p-2.5 text-center">
        <div className="min-w-0">
          <dt className="text-xs text-muted">เซสชันวิ่ง</dt>
          <dd className="mt-1 text-2xl font-semibold">
            {progress.runningSessions}
          </dd>
        </div>
        <div className="min-w-0 border-x border-line">
          <dt className="text-xs text-muted">เซสชันเวท</dt>
          <dd className="mt-1 text-2xl font-semibold">
            {progress.strengthSessions}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">วันซ้อม</dt>
          <dd className="mt-1 text-2xl font-semibold">
            {progress.trainingDaysCount}
          </dd>
        </div>
      </dl>

      <section aria-label="ระยะทางรายสัปดาห์" className="surface mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">ระยะทางรายสัปดาห์</h2>
          <Link
            href={qs({ chart: chart === "bar" ? "table" : undefined })}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-forest"
          >
            {chart === "bar" ? (
              <Table2 className="size-4" aria-hidden />
            ) : (
              <ChartColumn className="size-4" aria-hidden />
            )}
            {chart === "bar" ? "ดูแบบตาราง" : "ดูแบบกราฟ"}
          </Link>
        </div>
        {chart === "bar" ? (
          <ol
            aria-label="กราฟระยะทาง 10 สัปดาห์"
            className="mt-3 flex h-36 items-end gap-1 sm:h-44"
          >
            {progress.buckets.map((b) => {
              const pct = b.distanceM > 0 ? (b.distanceM / maxBucket) * 100 : 0;
              return (
                <li
                  key={b.monday}
                  className="flex h-full min-w-0 flex-1 flex-col items-center"
                  title={`${formatDateTh(b.monday)}: ${formatDistanceM(b.distanceM)}`}
                >
                  <span className="flex h-7 w-full shrink-0 items-end justify-center text-center text-[10px] leading-tight break-words text-muted">
                    {b.distanceM > 0
                      ? (b.distanceM / 1000).toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })
                      : ""}
                  </span>
                  <span className="flex w-full min-h-0 flex-1 items-end justify-center border-b border-line">
                    <span
                      aria-hidden="true"
                      className="w-full max-w-6 rounded-t-[5px] bg-forest"
                      style={{ height: `${pct}%` }}
                    />
                  </span>
                  <span className="mt-2 text-[10px] text-muted">
                    {formatDayMonth(b.monday)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <table className="compact-table mt-3">
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

      <section aria-label="ความต่อเนื่องตามแผน" className="surface mt-4">
        <h2 className="section-title">ความต่อเนื่องตามแผน</h2>
        <p className="mt-2 text-sm font-medium text-forest">
          {completionText(summary)}
        </p>
        {summary.totalItems > 0 && (
          <div
            role="progressbar"
            aria-label="เซสชันที่สำเร็จเทียบแผน"
            aria-valuenow={Math.round(
              (summary.doneItems / summary.totalItems) * 100,
            )}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-ivory"
          >
            <div
              className="h-full rounded-full bg-forest"
              style={{
                width: `${(summary.doneItems / summary.totalItems) * 100}%`,
              }}
            />
          </div>
        )}
        <ProportionList
          done={summary.doneItems}
          partial={summary.partialItems}
          skipped={summary.skippedItems}
          missed={progress.missed}
        />
        <p className="mt-3 text-xs leading-relaxed text-muted">
          ผลจริงนับตามวันที่ซ้อม ความสำเร็จอ้างตามสัปดาห์ของแผน
          เซสชันที่ข้ามออกจากตัวหาร
        </p>
      </section>

      <section aria-label="แผนระยะเทียบผลจริง" className="surface mt-4">
        <h2 className="section-title">แผนระยะเทียบผลจริง</h2>
        <p className="mt-2 text-sm leading-relaxed">
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
          <p className="mt-2 text-xs text-muted">
            มีแผนที่ระยะไม่ครบ จึงไม่แสดงแถบเทียบระยะ
          </p>
        )}
      </section>

      {progress.paceRows.length > 0 && (
        <section aria-label="เพซแยกตามประเภท" className="surface mt-4">
          <h2 className="section-title">เพซแยกตามประเภท</h2>
          <table className="compact-table mt-3">
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
          <p className="mt-3 text-xs leading-relaxed text-muted">
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
