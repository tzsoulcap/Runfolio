import { describe, expect, it } from "vitest";

import {
  bucketByWeek,
  completionText,
  countMissed,
  paceByType,
  summarizeRange,
  trainingDays,
} from "@/lib/domain/progress";

const DIST = { kind: "DISTANCE", distanceM: 6000 } as const;

function day(
  date: string,
  items: Array<{
    activityType?: string;
    planState?: string;
    outcome?: string | null;
    target?: typeof DIST | null;
  }>,
) {
  return {
    date,
    items: items.map((i) => ({
      activityType: i.activityType ?? "RUNNING",
      runningTarget: (i.target === undefined ? DIST : i.target) as never,
      planState: i.planState ?? "SCHEDULED",
      log: i.outcome === undefined || i.outcome === null ? null : { outcome: i.outcome },
    })),
  };
}

describe("summarizeRange", () => {
  it("reuses the home week math over any day list (§14)", () => {
    const summary = summarizeRange(
      [day("2026-02-10", [{ outcome: "COMPLETED" }])],
      [
        { activityType: "RUNNING", distanceM: 5000, movingDurationSec: 1800 },
        { activityType: "RUNNING", distanceM: 10000, movingDurationSec: 4200 },
        { activityType: "STRENGTH", distanceM: null, movingDurationSec: null },
      ],
    );
    expect(summary.runningActualM).toBe(15000);
    expect(summary.runningActualSec).toBe(6000);
    expect(summary.doneItems).toBe(1);
    expect(summary.totalItems).toBe(1);
    expect(summary.strengthActual).toBe(1);
  });

  it("weights average pace by distance (§14 example: 6:40 not 6:30)", () => {
    const summary = summarizeRange([], [
      { activityType: "RUNNING", distanceM: 5000, movingDurationSec: 1800 },
      { activityType: "RUNNING", distanceM: 10000, movingDurationSec: 4200 },
    ]);
    // 6000s / 15km = 400 s/km = 6:40/km. A mean of 6:00 and 7:00 would lie.
    expect(summary.runningActualSec / (summary.runningActualM / 1000)).toBe(
      400,
    );
  });
});

describe("completionText", () => {
  it("counts completed over non-skipped (ADR-0001)", () => {
    expect(
      completionText({ doneItems: 3, partialItems: 1, totalItems: 5, skippedItems: 2 }),
    ).toBe("สำเร็จ 3 / 5 เซสชัน · ทำบางส่วน 1");
  });

  it("names the empty states instead of 0%/100% (§14)", () => {
    expect(
      completionText({ doneItems: 0, partialItems: 0, totalItems: 0, skippedItems: 3 }),
    ).toBe("ข้ามทั้งหมด");
    expect(
      completionText({ doneItems: 0, partialItems: 0, totalItems: 0, skippedItems: 0 }),
    ).toBe("ยังไม่มีแผน");
  });
});

describe("countMissed", () => {
  it("counts past unlogged non-skipped plan items only", () => {
    const days = [
      day("2026-02-09", [
        { outcome: null }, // missed
        { outcome: "COMPLETED" }, // done
        { planState: "SKIPPED", outcome: null }, // skipped
      ]),
      day("2026-02-11", [{ outcome: null }]), // future: not missed
    ];
    expect(countMissed(days, "2026-02-10")).toBe(1);
  });
});

describe("trainingDays", () => {
  it("counts distinct performed dates with a log (§14)", () => {
    expect(
      trainingDays(["2026-02-10", "2026-02-10", "2026-02-11"]),
    ).toBe(2);
    expect(trainingDays([])).toBe(0);
  });
});

describe("paceByType", () => {
  it("aggregates moving time per workout code (§14)", () => {
    const rows = paceByType([
      { code: "EASY_RUN", distanceM: 5000, movingDurationSec: 1800 },
      { code: "EASY_RUN", distanceM: 5000, movingDurationSec: 1800 },
      { code: "TEMPO", distanceM: 5000, movingDurationSec: 1500 },
      { code: "EASY_RUN", distanceM: null, movingDurationSec: null },
    ]);
    expect(rows).toEqual([
      { code: "EASY_RUN", distanceM: 10000, movingDurationSec: 3600, paceSecPerKm: 360 },
      { code: "TEMPO", distanceM: 5000, movingDurationSec: 1500, paceSecPerKm: 300 },
    ]);
  });
});

describe("bucketByWeek", () => {
  it("buckets distance into monday weeks ending at the given week", () => {
    const buckets = bucketByWeek(
      [
        { performedDate: "2026-02-10", distanceM: 5000 },
        { performedDate: "2026-02-11", distanceM: 3000 },
        { performedDate: "2026-02-03", distanceM: 2000 },
      ],
      "2026-02-09",
      3,
    );
    expect(buckets).toEqual([
      { monday: "2026-01-26", distanceM: 0 },
      { monday: "2026-02-02", distanceM: 2000 },
      { monday: "2026-02-09", distanceM: 8000 },
    ]);
  });
});
