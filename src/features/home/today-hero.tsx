import Link from "next/link";
import { ArrowRight, ChevronRight, Dumbbell, Moon } from "lucide-react";
import { RunningIcon } from "@/components/running-icon";

import type { TodayItem, TodayState } from "@/lib/domain/home";
import { paceLabelFor } from "@/lib/domain/metrics";
import {
  formatDistanceM,
  formatHMS,
  formatIntensityTh,
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
  return [
    detail,
    formatIntensityTh(item.intensityTarget),
    item.note,
    item.plannedStartTime ? `เริ่ม ${item.plannedStartTime}` : null,
  ].filter(Boolean).join(" · ") || null;
}

function HeroTarget({ item }: { item: TodayItem }) {
  const target = item.runningTarget;
  if (item.activityType === "RUNNING" && target?.kind === "DISTANCE") {
    return (
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[clamp(60px,15.5vw,72px)] leading-none font-bold tracking-tight">
        <span>{(target.distanceM / 1000).toFixed(1)}</span>{" "}
        <span className="text-[clamp(26px,6.7vw,32px)] font-semibold tracking-normal">km</span>
      </p>
    );
  }
  return <p className="mt-1 break-words text-4xl leading-tight font-bold tracking-tight">{heroNumber(item).main}</p>;
}

function CompactRow({ item, planHref }: { item: TodayItem; planHref: string }) {
  const Icon = item.activityType === "STRENGTH" ? Dumbbell : RunningIcon;
  return (
    <li>
      <Link
        href={planHref}
        className="flex min-h-14 items-center gap-4 border-t border-paper/25 px-1 pt-2"
      >
        <Icon className={`size-7 shrink-0 text-paper ${item.activityType === "STRENGTH" ? "rotate-45" : ""}`} strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg leading-tight font-medium text-paper">
            {item.title}
          </span>
          <span className="block text-sm text-paper/85">
            {heroNumber(item).main}{item.status !== "PLANNED" && ` · ${STATUS_TH[item.status]}`}
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
    <article className="today-card rounded-[20px] px-[18px] py-4 text-paper sm:p-5">
      {label && (
        <p className="inline-flex rounded-full bg-lime px-4 py-1 text-xs font-semibold text-charcoal sm:text-sm">
          {label}
        </p>
      )}
      <h2 className="mt-2.5 text-[clamp(26px,6.8vw,30px)] leading-tight font-semibold">{item.title}</h2>
      <HeroTarget item={item} />
      {sub && <p className="mt-1.5 text-[clamp(14px,3.5vw,16px)] leading-normal text-paper/95">{sub}</p>}
      <Link
        href={planHref}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-lime text-base font-semibold text-charcoal transition-colors hover:bg-lime-deep"
      >
        บันทึกการซ้อม <ArrowRight className="size-5" aria-hidden />
      </Link>
      {others.length > 0 && (
        <ul className="mt-3">
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
    <article className="today-card rounded-[20px] p-5 text-paper sm:p-6">
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
        <PlanItemHero item={state.item} others={[]} label="วันนี้ · 1 เซสชัน" planHref={planHref} />
      );
    case "MULTI":
      return (
        <PlanItemHero
          item={state.hero}
          others={state.others}
          label={`วันนี้ · ${state.total} เซสชัน`}
          planHref={planHref}
        />
      );
    case "DONE_ALL":
      return <DoneAll state={state} />;
  }
}
