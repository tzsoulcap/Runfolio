import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Dumbbell,
  List,
} from "lucide-react";
import { RunningIcon } from "@/components/running-icon";
import { Disclosure } from "@/components/ui/disclosure";

import { getSessionUserId } from "@/lib/auth/session";
import {
  formatDateTh,
  formatDayMonthTh,
  formatDistanceM,
  formatHMS,
  formatMonthTh,
  logDisplayName,
  weekdayTh,
} from "@/lib/format";
import {
  addDays,
  DateOnlySchema,
  MonthSchema,
  monthGrid,
  shiftMonth,
  todayInTimeZone,
} from "@/lib/domain/week";
import { paceLabelFor } from "@/lib/domain/metrics";
import { toRunningOptions, toStrengthOptions } from "@/lib/master-options";
import {
  countLogsByDay,
  listLogs,
  type JournalEntry,
  type LogFilters,
} from "@/lib/services/journal";
import {
  listRunningMasters,
  listStrengthMasters,
} from "@/lib/services/planner";
import { getOwnProfile } from "@/lib/services/profile";
import { inputCls, labelCls } from "@/components/ui/field";
import { LogForm } from "@/features/journal/log-form";
import { StrengthLogForm } from "@/features/journal/strength-log-form";
import { UndoToast } from "@/features/journal/undo-toast";

const WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(sp: SearchParams): {
  filters: LogFilters;
  view: "timeline" | "calendar";
  month: string | null;
  active: boolean;
} {
  const view = first(sp.view) === "calendar" ? "calendar" : "timeline";
  const from = first(sp.from);
  const to = first(sp.to);
  const activity = first(sp.activity);
  const workoutCode = first(sp.code);
  const outcome = first(sp.outcome);
  const q = first(sp.q);
  const month = first(sp.month);
  const limitRaw = Number(first(sp.limit));
  const filters: LogFilters = {
    limit: Number.isFinite(limitRaw) ? limitRaw : PAGE_SIZE,
  };
  if (from && DateOnlySchema.safeParse(from).success) filters.from = from;
  if (to && DateOnlySchema.safeParse(to).success) filters.to = to;
  if (activity === "RUNNING" || activity === "STRENGTH") {
    filters.activity = activity;
  }
  if (workoutCode && workoutCode.length > 0) filters.workoutCode = workoutCode;
  if (outcome === "COMPLETED" || outcome === "PARTIAL") {
    filters.outcome = outcome;
  }
  if (q && q.trim() !== "") filters.q = q.trim();
  const active =
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.activity !== undefined ||
    filters.workoutCode !== undefined ||
    filters.outcome !== undefined ||
    filters.q !== undefined;
  return {
    filters,
    view,
    month:
      view === "calendar" && month && MonthSchema.safeParse(month).success
        ? month
        : null,
    active,
  };
}

function toQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs === "" ? "/journal" : `/journal?${qs}`;
}

function JournalFallback() {
  return (
    <div className="app-page">
      <h1 className="page-title">บันทึก</h1>
      <p className="mt-2 text-sm text-muted">กำลังโหลดบันทึก…</p>
    </div>
  );
}

function TimelineList({
  entries,
  today,
}: {
  entries: JournalEntry[];
  today: string;
}) {
  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.log.performedDate) ?? [];
    list.push(e);
    groups.set(e.log.performedDate, list);
  }
  return (
    <div className="mt-4 space-y-4">
      {[...groups].map(([date, list]) => (
        <section key={date} aria-label={`วันที่ ${formatDateTh(date)}`}>
          <h2 className="flex items-baseline text-[17px] font-semibold">
            {weekdayTh(date)}
            <span className="ml-2 text-sm font-normal text-muted">
              {date.slice(0, 4) === today.slice(0, 4)
                ? formatDayMonthTh(date)
                : formatDateTh(date)}
            </span>
            <span className="ml-auto text-xs font-normal text-muted">
              {list.length} บันทึก
            </span>
          </h2>
          <ul className="mt-2 space-y-2">
            {list.map(({ log, plan, strengthSummary }) => {
              const isStrength = log.activityType === "STRENGTH";
              const name = isStrength
                ? (plan?.title ?? "เวท")
                : logDisplayName(log);
              const pace = isStrength
                ? null
                : paceLabelFor(log.distanceM, log.movingDurationSec);
              const Icon = isStrength ? Dumbbell : RunningIcon;
              return (
                <li
                  key={log.id}
                  className={`relative rounded-button ${isStrength ? "bg-[#eef1f3]" : "bg-[#f6f4ef]"}`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1.5 rounded-l-button ${isStrength ? "bg-steel" : "bg-lime-deep"}`}
                  />
                  <Link
                    href={`/journal/${log.id}`}
                    className="flex min-h-[68px] items-center gap-3 py-3 pr-3 pl-4"
                  >
                    <Icon
                      className={`size-6 shrink-0 ${isStrength ? "rotate-45 text-muted" : "text-forest"}`}
                      strokeWidth={1.7}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[15px] font-semibold">{name}</span>
                      {!plan && (
                        <span className="ml-2 rounded-full bg-paper/70 px-2 py-0.5 text-[11px] text-muted">
                          นอกแผน
                        </span>
                      )}
                      <span className="block text-[13px] leading-relaxed text-muted">
                        {isStrength ? (
                          <>
                            {strengthSummary
                              ? `เวท ${strengthSummary.exercises} ท่า · ${strengthSummary.setsWithResult} เซ็ต`
                              : "เวท"}
                            {log.rpe !== null && ` · RPE ${log.rpe}`}
                          </>
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
                        <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">
                          {log.note}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function JournalContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/journal")}`);
  }
  const {
    filters,
    view,
    month: monthParam,
    active,
  } = parseFilters(searchParams);
  const deletedId = first(searchParams.deleted);
  const [masters, strength, profile] = await Promise.all([
    listRunningMasters(),
    listStrengthMasters(),
    getOwnProfile(userId),
  ]);
  const today = todayInTimeZone(profile?.timezone ?? "Asia/Bangkok");
  const month = monthParam ?? today.slice(0, 7);
  // Remount the filter form when the effective filters change: soft
  // navigation reuses the DOM, so defaultValue alone would keep showing the
  // previous selection. Limit excluded — loading more must not wipe typing.
  const formKey = JSON.stringify([
    view,
    month,
    filters.from,
    filters.to,
    filters.activity,
    filters.workoutCode,
    filters.outcome,
    filters.q,
  ]);
  const [{ entries, total }, counts] = await Promise.all([
    view === "timeline"
      ? listLogs(userId, filters)
      : Promise.resolve({ entries: [], total: 0 }),
    view === "calendar"
      ? countLogsByDay(
          userId,
          `${month}-01`,
          addDays(`${shiftMonth(month, 1)}-01`, -1),
          {
            activity: filters.activity,
            workoutCode: filters.workoutCode,
            outcome: filters.outcome,
            q: filters.q,
          },
        )
      : Promise.resolve(null as Record<string, number> | null),
  ]);
  const runningOptions = toRunningOptions(masters);
  const strengthOptions = toStrengthOptions(strength);
  const baseParams = {
    view: view === "calendar" ? "calendar" : undefined,
    from: filters.from,
    to: filters.to,
    activity: filters.activity,
    code: filters.workoutCode,
    outcome: filters.outcome,
    q: filters.q,
    month: view === "calendar" ? month : undefined,
  };
  const grid = view === "calendar" ? monthGrid(month) : [];

  return (
    <div className="app-page">
      <h1 className="page-title">บันทึก</h1>
      <p className="mt-1 text-sm text-muted">ทุกการซ้อม เก็บไว้ในที่เดียว</p>
      {deletedId && <UndoToast logId={deletedId} />}
      <section
        aria-label="บันทึกนอกแผน"
        className="mt-4 rounded-[16px] bg-[#f6f4ef] p-3.5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CirclePlus className="size-4 text-forest" aria-hidden />
          บันทึกนอกแผน
        </h2>
        <p className="mt-1 text-xs text-muted">
          ซ้อมเพิ่มหรือบันทึกย้อนหลัง เลือกกิจกรรมได้เลย
        </p>
        <div className="mt-3 grid grid-cols-2 items-start gap-2">
          <LogForm
            triggerLabel={
              <>
                <RunningIcon aria-hidden />
                บันทึกวิ่ง
              </>
            }
            runningWorkoutCode={runningOptions[0]?.code ?? "EASY_RUN"}
            masters={runningOptions}
            today={today}
          />
          <StrengthLogForm
            triggerLabel={
              <>
                <Dumbbell className="rotate-45" aria-hidden />
                บันทึกเวท
              </>
            }
            planned={[]}
            masters={strengthOptions}
            today={today}
          />
        </div>
      </section>

      <div className="segmented-control mt-4" role="group" aria-label="มุมมอง">
        <Link
          href={toQuery({ ...baseParams, view: undefined, month: undefined })}
          aria-current={view === "timeline" ? "page" : undefined}
          className="segmented-link"
        >
          <List className="size-4" aria-hidden />
          ไทม์ไลน์
        </Link>
        <Link
          href={toQuery({ ...baseParams, view: "calendar", month })}
          aria-current={view === "calendar" ? "page" : undefined}
          className="segmented-link"
        >
          <CalendarDays className="size-4" aria-hidden />
          ปฏิทิน
        </Link>
      </div>

      <div className="mt-3">
        <Disclosure
          key={formKey}
          title={active ? "ตัวกรอง · กำลังใช้งาน" : "ตัวกรอง"}
          open={active}
        >
          <form
            key={formKey}
            method="get"
            action="/journal"
            aria-label="ตัวกรองบันทึก"
          >
            {view === "calendar" && (
              <>
                <input type="hidden" name="view" value="calendar" />
                <input type="hidden" name="month" value={month} />
              </>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls} htmlFor="journal-q">
                  ค้นหาชื่อหรือหมายเหตุ
                </label>
                <input
                  id="journal-q"
                  name="q"
                  type="search"
                  defaultValue={filters.q ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="journal-activity">
                  กิจกรรม
                </label>
                <select
                  id="journal-activity"
                  name="activity"
                  defaultValue={filters.activity ?? ""}
                  className={inputCls}
                >
                  <option value="">ทั้งหมด</option>
                  <option value="RUNNING">วิ่ง</option>
                  <option value="STRENGTH">เวท</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="journal-code">
                  ประเภทวิ่ง
                </label>
                <select
                  id="journal-code"
                  name="code"
                  defaultValue={filters.workoutCode ?? ""}
                  className={inputCls}
                >
                  <option value="">ทั้งหมด</option>
                  {runningOptions.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.nameTh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="journal-outcome">
                  ผล
                </label>
                <select
                  id="journal-outcome"
                  name="outcome"
                  defaultValue={filters.outcome ?? ""}
                  className={inputCls}
                >
                  <option value="">ทั้งหมด</option>
                  <option value="COMPLETED">เสร็จแล้ว</option>
                  <option value="PARTIAL">ทำบางส่วน</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="journal-from">
                  ตั้งแต่
                </label>
                <input
                  id="journal-from"
                  name="from"
                  type="date"
                  max={today}
                  defaultValue={filters.from ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="journal-to">
                  ถึง
                </label>
                <input
                  id="journal-to"
                  name="to"
                  type="date"
                  max={today}
                  defaultValue={filters.to ?? ""}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
              >
                ค้นหา
              </button>
              {active && (
                <Link
                  href={toQuery({
                    view: view === "calendar" ? "calendar" : undefined,
                    month: view === "calendar" ? month : undefined,
                  })}
                  className="inline-flex h-11 items-center rounded-button border border-line px-5 text-base font-medium text-charcoal"
                >
                  ล้างตัวกรอง
                </Link>
              )}
            </div>
          </form>
        </Disclosure>
      </div>

      {view === "calendar" && counts ? (
        <section aria-label="ปฏิทินบันทึก" className="surface mt-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={toQuery({ ...baseParams, month: shiftMonth(month, -1) })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-button text-charcoal hover:bg-ivory"
              aria-label="เดือนก่อน"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
            <h2 className="text-base font-semibold">{formatMonthTh(month)}</h2>
            <Link
              href={toQuery({ ...baseParams, month: shiftMonth(month, 1) })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-button text-charcoal hover:bg-ivory"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          </div>
          <ol className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAY_SHORT.map((d) => (
              <li
                key={d}
                aria-hidden="true"
                className="py-2 text-center text-xs text-muted"
              >
                {d}
              </li>
            ))}
            {grid.map(({ date, inMonth }) => {
              const count = counts[date] ?? 0;
              const dayNum = Number(date.slice(8, 10));
              return (
                <li
                  key={date}
                  className={`min-h-[54px] rounded-button text-center ${
                    date === today
                      ? "bg-lime-soft"
                      : count > 0
                        ? "bg-[#f6f8f0]"
                        : ""
                  } ${inMonth ? "" : "bg-ivory/40"}`}
                >
                  {count > 0 ? (
                    <Link
                      href={toQuery({
                        ...baseParams,
                        view: undefined,
                        month: undefined,
                        from: date,
                        to: date,
                      })}
                      aria-label={`${formatDateTh(date)} มี ${count} บันทึก`}
                      className="flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-1"
                    >
                      <span
                        className={`text-sm ${inMonth ? "text-charcoal" : "text-muted"}`}
                      >
                        {dayNum}
                      </span>
                      <span className="flex size-[18px] items-center justify-center rounded-full bg-forest text-[11px] text-paper">
                        {count}
                      </span>
                    </Link>
                  ) : (
                    <span
                      aria-label={formatDateTh(date)}
                      className={`flex min-h-[54px] items-center justify-center text-sm ${
                        inMonth ? "text-charcoal" : "text-muted"
                      }`}
                    >
                      {dayNum}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : entries.length === 0 ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-line p-6 text-center">
          <RunningIcon
            className="mx-auto mb-3 size-8 text-forest"
            aria-hidden
          />
          <p className="text-sm text-muted">
            {active ? "ไม่พบบันทึกที่ตรงกับตัวกรอง" : "ยังไม่มีบันทึก"}
          </p>
          {active ? (
            <Link
              href="/journal"
              className="mt-3 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
            >
              ล้างตัวกรอง
            </Link>
          ) : (
            <Link
              href="/plan"
              className="mt-3 inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory"
            >
              ไปวางแผน
            </Link>
          )}
        </div>
      ) : (
        <>
          <TimelineList entries={entries} today={today} />
          {entries.length < total && (
            <div className="mt-4 text-center">
              <Link
                href={toQuery({
                  ...baseParams,
                  limit: String((filters.limit ?? PAGE_SIZE) + PAGE_SIZE),
                })}
                className="inline-flex h-11 items-center rounded-button border border-line bg-paper px-5 text-base font-medium text-charcoal"
              >
                โหลดเพิ่ม ({entries.length}/{total})
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JournalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<JournalFallback />}>
      <JournalParamsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function JournalParamsLoader({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const sp = await searchParams;
  return <JournalContent searchParams={sp} />;
}
