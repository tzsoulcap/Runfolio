import Link from "next/link";
import { ChevronRight, Dumbbell, Moon, Route } from "lucide-react";

import type { TodayItem, TodayState } from "@/lib/domain/home";
import { paceLabelFor } from "@/lib/domain/metrics";
import {
  formatDistanceM,
  formatHMS,
  formatStructuredDetail,
  formatStructuredMain,
  formatTargetTh,
  STATUS_TH,
} from "@/lib/format";

const primaryBtn =
  "inline-flex h-11 items-center rounded-button bg-forest px-5 text-base font-medium text-ivory";
const secondaryBtn =
  "inline-flex h-11 items-center rounded-button border border-line bg-paper px-5 text-base";

function heroNumber(item: TodayItem): { main: string; detail: string | null } {
  if (item.activityType === "STRENGTH")
    return {
      main:
        item.strengthCount !== undefined ? `${item.strengthCount} ท่า` : "Strength",
      detail: null,
    };
  const t = item.runningTarget;
  if (!t) return { main: "–", detail: null };
  if (t.kind === "STRUCTURED")
    return {
      main: formatStructuredMain(t) ?? formatTargetTh(t),
      detail: formatStructuredDetail(t),
    };
  return { main: formatTargetTh(t), detail: null };
}

function heroSub(item: TodayItem, detail: string | null): string | null {
  if (detail) return detail;
  if (item.plannedStartTime) return `เริ่ม ${item.plannedStartTime}`;
  if (item.note) return item.note;
  return null;
}

function CompactRow({ item, planHref }: { item: TodayItem; planHref: string }) {
  const Icon = item.activityType === "STRENGTH" ? Dumbbell : Route;
  return (
    <li>
      <Link
        href={planHref}
        className="flex min-h-11 items-center gap-3 border-t border-ivory/15 px-1 py-3"
      >
        <Icon className="size-5 shrink-0 text-ivory/80" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-ivory">
            {item.title}
          </span>
          <span className="block text-sm text-ivory/70">
            {heroNumber(item).main} · {STATUS_TH[item.status]}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ivory/70" aria-hidden />
      </Link>
    </li>
  );
}

function PlanItemHero({
  item,
  others,
  label,
  planHref,
}: {
  item: TodayItem;
  others: TodayItem[];
  label: string | null;
  planHref: string;
}) {
  const target = heroNumber(item);
  const sub = heroSub(item, target.detail);
  return (
    <article className="rounded-[28px] bg-forest p-5 text-ivory sm:p-6">
      {label && (
        <p className="inline-flex rounded-full bg-lime px-3 py-1 text-sm font-semibold text-charcoal">
          {label}
        </p>
      )}
      <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
      <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">
        {target.main}
      </p>
      {sub && <p className="mt-1 text-base text-ivory/75">{sub}</p>}
      <Link
        href={planHref}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-button bg-lime text-base font-semibold text-charcoal"
      >
        บันทึกการซ้อม <span aria-hidden="true">→</span>
      </Link>
      {others.length > 0 && (
        <ul className="mt-2">
          {others.map((o) => (
            <CompactRow key={o.id} item={o} planHref={planHref} />
          ))}
        </ul>
      )}
    </article>
  );
}

function DoneAll({
  state,
}: {
  state: Extract<TodayState, { kind: "DONE_ALL" }>;
}) {
  // Omit distance when there is none (§4: never invent distance for
  // duration-based sessions); strength never renders as วิ่ง.
  const parts: string[] = [];
  if (state.runningM > 0) parts.push(`วิ่ง ${formatDistanceM(state.runningM)}`);
  if (state.runningSec > 0) parts.push(formatHMS(state.runningSec));
  const pace = paceLabelFor(state.runningM, state.runningSec);
  if (pace !== null) parts.push(`${pace}/km`);
  if (state.strengthCount > 0)
    parts.push(`Strength ${state.strengthCount} ครั้ง`);
  return (
    <article className="rounded-[28px] bg-forest p-5 text-ivory sm:p-6">
      <h2 className="text-xl font-semibold">
        {state.loggedCount > 0 ? "ซ้อมครบแล้ววันนี้" : "วันนี้ข้ามหมดแล้ว"}
      </h2>
      {state.loggedCount > 0 ? (
        <p className="mt-1 text-base text-ivory/80">
          {parts.length > 0 ? parts.join(" · ") : "บันทึกแล้ว"}
        </p>
      ) : (
        <p className="mt-1 text-base text-ivory/70">ไม่มีผลบันทึกวันนี้</p>
      )}
      <Link
        href="/journal"
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-button bg-lime text-base font-semibold text-charcoal"
      >
        ดูบันทึกวันนี้ <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function TodayHero({
  state,
  today,
}: {
  state: TodayState;
  today: string;
}) {
  const planHref = `/plan#day-${today}`;
  switch (state.kind) {
    case "EMPTY":
      return (
        <article className="rounded-card border border-line bg-paper p-5 sm:p-6">
          <h2 className="text-xl font-semibold">วันนี้ยังไม่มีแผน</h2>
          <p className="mt-1 text-base text-muted">
            วางแผนซ้อม หรือบันทึกผลนอกแผนได้เลย
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={planHref} className={primaryBtn}>
              เพิ่มแผน
            </Link>
            <Link href="/journal" className={secondaryBtn}>
              บันทึกนอกแผน
            </Link>
          </div>
        </article>
      );
    case "REST":
      return (
        <article className="rounded-card border border-line bg-paper p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-forest/10">
              <Moon className="size-5 text-forest" aria-hidden />
            </span>
            <h2 className="text-xl font-semibold">วันพัก</h2>
          </div>
          {state.note && (
            <p className="mt-2 text-base text-charcoal">{state.note}</p>
          )}
          <div className="mt-4">
            <Link href="/journal" className={secondaryBtn}>
              บันทึกนอกแผน
            </Link>
          </div>
        </article>
      );
    case "SINGLE":
      return (
        <PlanItemHero item={state.item} others={[]} label={null} planHref={planHref} />
      );
    case "MULTI":
      return (
        <PlanItemHero
          item={state.hero}
          others={state.others}
          label={`วันนี้ ${state.total} เซสชัน`}
          planHref={planHref}
        />
      );
    case "DONE_ALL":
      return <DoneAll state={state} />;
  }
}
