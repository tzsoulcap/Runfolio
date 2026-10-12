import Link from "next/link";

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
    return { main: "Strength", detail: null };
  const t = item.runningTarget;
  if (!t) return { main: "–", detail: null };
  if (t.kind === "STRUCTURED")
    return {
      main: formatStructuredMain(t) ?? formatTargetTh(t),
      detail: formatStructuredDetail(t),
    };
  return { main: formatTargetTh(t), detail: null };
}

function PlanItemHero({
  item,
  label,
  planHref,
}: {
  item: TodayItem;
  label: string | null;
  planHref: string;
}) {
  const target = heroNumber(item);
  return (
    <article className="rounded-card border border-line bg-paper p-4">
      {label && <p className="text-sm text-muted">{label}</p>}
      <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
      <p className="mt-1 text-3xl font-semibold sm:text-4xl">{target.main}</p>
      {target.detail && <p className="mt-1 text-base text-muted">{target.detail}</p>}
      {item.plannedStartTime && (
        <p className="mt-1 text-base text-muted">
          เริ่ม {item.plannedStartTime}
        </p>
      )}
      {item.note && <p className="mt-1 text-base text-charcoal">{item.note}</p>}
      <div className="mt-3">
        <Link href={planHref} className={primaryBtn}>
          บันทึก
        </Link>
      </div>
    </article>
  );
}

function CompactRow({ item, planHref }: { item: TodayItem; planHref: string }) {
  return (
    <li>
      <Link
        href={planHref}
        className="flex min-h-11 items-center justify-between gap-3 px-4 py-2"
      >
        <span className="text-base font-medium">{item.title}</span>
        <span className="shrink-0 text-sm text-muted">
          {heroNumber(item).main} · {STATUS_TH[item.status]}
        </span>
      </Link>
    </li>
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
    <article className="rounded-card border border-line bg-paper p-4">
      <h2 className="text-xl font-semibold">
        {state.loggedCount > 0 ? "ซ้อมครบแล้ววันนี้" : "วันนี้ข้ามหมดแล้ว"}
      </h2>
      {state.loggedCount > 0 ? (
        <p className="mt-1 text-base text-charcoal">
          {parts.length > 0 ? parts.join(" · ") : "บันทึกแล้ว"}
        </p>
      ) : (
        <p className="mt-1 text-base text-muted">ไม่มีผลบันทึกวันนี้</p>
      )}
      <div className="mt-3">
        <Link href="/journal" className={primaryBtn}>
          ดูบันทึกวันนี้
        </Link>
      </div>
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
        <article className="rounded-card border border-line bg-paper p-4">
          <h2 className="text-xl font-semibold">วันนี้ยังไม่มีแผน</h2>
          <p className="mt-1 text-base text-muted">
            วางแผนซ้อม หรือบันทึกผลนอกแผนได้เลย
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
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
        <article className="rounded-card border border-line bg-paper p-4">
          <h2 className="text-xl font-semibold">วันพัก</h2>
          {state.note && (
            <p className="mt-1 text-base text-charcoal">{state.note}</p>
          )}
          <div className="mt-3">
            <Link href="/journal" className={secondaryBtn}>
              บันทึกนอกแผน
            </Link>
          </div>
        </article>
      );
    case "SINGLE":
      return <PlanItemHero item={state.item} label={null} planHref={planHref} />;
    case "MULTI":
      return (
        <div>
          <PlanItemHero
            item={state.hero}
            label={`วันนี้ ${state.total} เซสชัน`}
            planHref={planHref}
          />
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-paper">
            {state.others.map((item) => (
              <CompactRow key={item.id} item={item} planHref={planHref} />
            ))}
          </ul>
        </div>
      );
    case "DONE_ALL":
      return <DoneAll state={state} />;
  }
}
