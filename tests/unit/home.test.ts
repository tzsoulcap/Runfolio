import { describe, expect, it } from "vitest";

import {
  countdownDays,
  deriveStripDay,
  deriveTodayState,
  summarizeWeek,
  type TodayItem,
} from "@/lib/domain/home";
import {
  formatStructuredDetail,
  formatStructuredMain,
  greetingTh,
} from "@/lib/format";
import type { RunningTarget } from "@/lib/domain/master";

function item(overrides: Partial<TodayItem> = {}): TodayItem {
  return {
    id: overrides.id ?? `item-${Math.random()}`,
    title: "Easy Run",
    activityType: "RUNNING",
    runningTarget: { kind: "DISTANCE", distanceM: 6000 },
    plannedStartTime: null,
    note: null,
    planState: "SCHEDULED",
    log: null,
    status: "PLANNED",
    ...overrides,
  };
}

function logged(overrides: Partial<TodayItem> = {}) {
  return item({
    log: { id: "log-1", outcome: "COMPLETED", distanceM: 5000, movingDurationSec: 2280 },
    status: "COMPLETED",
    ...overrides,
  });
}

describe("deriveTodayState", () => {
  it("is EMPTY when the week has no day yet", () => {
    expect(deriveTodayState(undefined, [])).toEqual({ kind: "EMPTY" });
  });

  it("is EMPTY when today has no sessions planned", () => {
    expect(
      deriveTodayState({ isRestDay: false, note: null }, []),
    ).toEqual({ kind: "EMPTY" });
  });

  it("is REST with the plan note on rest days", () => {
    expect(
      deriveTodayState({ isRestDay: true, note: "พักขา" }, []),
    ).toEqual({ kind: "REST", note: "พักขา" });
  });

  it("is SINGLE for one pending session", () => {
    const one = item();
    expect(
      deriveTodayState({ isRestDay: false, note: null }, [one]),
    ).toEqual({ kind: "SINGLE", item: one });
  });

  it("is DONE_ALL when the only session is logged", () => {
    const state = deriveTodayState(
      { isRestDay: false, note: null },
      [logged()],
    );
    expect(state.kind).toBe("DONE_ALL");
    if (state.kind === "DONE_ALL") {
      expect(state.loggedCount).toBe(1);
      expect(state.runningM).toBe(5000);
      expect(state.runningSec).toBe(2280);
      expect(state.strengthCount).toBe(0);
    }
  });

  it("separates strength logs from running totals", () => {
    const state = deriveTodayState(
      { isRestDay: false, note: null },
      [
        logged({ id: "a" }),
        {
          ...logged({ id: "b" }),
          activityType: "STRENGTH",
          runningTarget: null,
          log: { id: "log-2", outcome: "COMPLETED", distanceM: null, movingDurationSec: null },
        },
      ],
    );
    expect(state.kind).toBe("DONE_ALL");
    if (state.kind === "DONE_ALL") {
      expect(state.loggedCount).toBe(2);
      expect(state.runningM).toBe(5000);
      expect(state.strengthCount).toBe(1);
    }
  });

  it("is MULTI with the first pending session as hero", () => {
    const done = logged({ id: "a" });
    const next = item({ id: "b" });
    const later = item({ id: "c" });
    const state = deriveTodayState(
      { isRestDay: false, note: null },
      [done, next, later],
    );
    expect(state).toEqual({
      kind: "MULTI",
      hero: next,
      others: [done, later],
      total: 3,
    });
  });

  it("is DONE_ALL when every session is logged or skipped", () => {
    const state = deriveTodayState(
      { isRestDay: false, note: null },
      [logged({ id: "a" }), item({ id: "b", planState: "SKIPPED", status: "SKIPPED" })],
    );
    expect(state.kind).toBe("DONE_ALL");
    if (state.kind === "DONE_ALL") expect(state.loggedCount).toBe(1);
  });

  it("is DONE_ALL with zero logged when everything was skipped", () => {
    const state = deriveTodayState(
      { isRestDay: false, note: null },
      [item({ planState: "SKIPPED", status: "SKIPPED" })],
    );
    expect(state.kind).toBe("DONE_ALL");
    if (state.kind === "DONE_ALL") {
      expect(state.loggedCount).toBe(0);
      expect(state.runningM).toBe(0);
      expect(state.strengthCount).toBe(0);
    }
  });
});

describe("summarizeWeek", () => {
  const plan = (
    activityType = "RUNNING",
    runningTarget: TodayItem["runningTarget"] = {
      kind: "DISTANCE",
      distanceM: 6000,
    },
    log: TodayItem["log"] = null,
  ) => ({ activityType, runningTarget, planState: "SCHEDULED", log });

  it("is all zeros without plans or logs", () => {
    expect(summarizeWeek([], [])).toEqual({
      runningActualM: 0,
      runningActualSec: 0,
      plannedDistanceM: 0,
      estimatedStructuredM: 0,
      timeBasedItems: 0,
      doneItems: 0,
      partialItems: 0,
      totalItems: 0,
      skippedItems: 0,
      strengthActual: 0,
      strengthPlanned: 0,
    });
  });

  it("sums plan distance and counts done sessions", () => {
    const s = summarizeWeek(
      [
        {
          items: [
            plan("RUNNING", { kind: "DISTANCE", distanceM: 6000 }, {
              id: "l",
              outcome: "COMPLETED",
              distanceM: 5000,
              movingDurationSec: 2280,
            }),
            plan("RUNNING", { kind: "DISTANCE", distanceM: 10000 }),
          ],
        },
      ],
      [
        { activityType: "RUNNING", distanceM: 5000, movingDurationSec: 2280 },
      ],
    );
    expect(s.plannedDistanceM).toBe(16000);
    expect(s.runningActualM).toBe(5000);
    expect(s.runningActualSec).toBe(2280);
    expect(s.doneItems).toBe(1);
    expect(s.totalItems).toBe(2);
    expect(s.timeBasedItems).toBe(0);
  });

  it("counts off-plan logs in actuals but not in sessions", () => {
    const s = summarizeWeek([], [
      { activityType: "RUNNING", distanceM: 3000, movingDurationSec: 1200 },
    ]);
    expect(s.runningActualM).toBe(3000);
    expect(s.totalItems).toBe(0);
    expect(s.doneItems).toBe(0);
  });

  it("counts duration plans separately instead of inventing distance", () => {
    const s = summarizeWeek(
      [
        {
          items: [
            plan("RUNNING", { kind: "DISTANCE", distanceM: 24000 }),
            plan("RUNNING", { kind: "DURATION", durationSec: 1800 }),
          ],
        },
      ],
      [],
    );
    expect(s.plannedDistanceM).toBe(24000);
    expect(s.timeBasedItems).toBe(1);
    expect(s.totalItems).toBe(2);
  });

  it("counts partials separately and drops skipped from the denominator (ADR-0001)", () => {
    const s = summarizeWeek(
      [
        {
          items: [
            { ...plan(), log: { id: "l", outcome: "PARTIAL", distanceM: 2000, movingDurationSec: 800 } },
            { ...plan(), planState: "SKIPPED" },
            { ...plan(), log: { id: "m", outcome: "COMPLETED", distanceM: 6000, movingDurationSec: 2400 } },
          ],
        },
      ],
      [],
    );
    expect(s.doneItems).toBe(1);
    expect(s.partialItems).toBe(1);
    expect(s.totalItems).toBe(2);
    expect(s.skippedItems).toBe(1);
  });

  it("counts strength plans and actuals separately", () => {
    const s = summarizeWeek(
      [{ items: [plan("STRENGTH", null), plan("STRENGTH", null)] }],
      [{ activityType: "STRENGTH", distanceM: null, movingDurationSec: null }],
    );
    expect(s.strengthPlanned).toBe(2);
    expect(s.strengthActual).toBe(1);
    expect(s.totalItems).toBe(2);
    expect(s.runningActualM).toBe(0);
  });

  it("keeps structured estimates out of the definite planned total", () => {
    const s = summarizeWeek(
      [
        {
          items: [
            plan("RUNNING", {
              kind: "STRUCTURED",
              steps: [
                {
                  kind: "REPEAT",
                  repeatCount: 5,
                  includeFinalRecovery: true,
                  steps: [
                    {
                      kind: "STEP",
                      phase: "WORK",
                      target: { kind: "DISTANCE", distanceM: 800 },
                      intensity: { kind: "NONE" },
                    },
                  ],
                },
              ],
              estimatedTotalDistanceM: 8000,
            }),
          ],
        },
      ],
      [],
    );
    expect(s.plannedDistanceM).toBe(0);
    expect(s.estimatedStructuredM).toBe(8000);
    expect(s.timeBasedItems).toBe(0);
  });
});

describe("countdownDays", () => {
  it("counts whole days between today and the race", () => {
    expect(countdownDays("2026-12-13", "2026-10-09")).toBe(65);
    expect(countdownDays("2026-10-10", "2026-10-09")).toBe(1);
    expect(countdownDays("2026-10-09", "2026-10-09")).toBe(0);
    expect(countdownDays("2026-10-01", "2026-10-09")).toBe(-8);
  });
});

describe("greetingTh", () => {
  it("greets by hour of day", () => {
    expect(greetingTh(6)).toBe("สวัสดีตอนเช้า");
    expect(greetingTh(13)).toBe("สวัสดีตอนบ่าย");
    expect(greetingTh(18)).toBe("สวัสดีตอนเย็น");
    expect(greetingTh(22)).toBe("สวัสดีตอนกลางคืน");
  });
});

describe("structured target display", () => {
  const interval: RunningTarget = {
    kind: "STRUCTURED",
    steps: [
      {
        kind: "REPEAT",
        repeatCount: 5,
        includeFinalRecovery: true,
        steps: [
          {
            kind: "STEP",
            phase: "WORK",
            target: { kind: "DISTANCE", distanceM: 800 },
            intensity: { kind: "NONE" },
          },
          {
            kind: "STEP",
            phase: "RECOVERY",
            target: { kind: "DISTANCE", distanceM: 200 },
            intensity: { kind: "NONE" },
          },
        ],
      },
    ],
  };

  it("shows repeat × work distance as the hero number", () => {
    expect(formatStructuredMain(interval)).toBe("5 × 800 m");
  });

  it("shows recovery details", () => {
    expect(formatStructuredDetail(interval)).toBe("พัก 200 m");
  });

  it("returns null without a repeat to headline", () => {
    expect(formatStructuredMain({ kind: "DISTANCE", distanceM: 1000 })).toBeNull();
    expect(formatStructuredMain(null)).toBeNull();
    expect(formatStructuredDetail(null)).toBeNull();
  });
});

describe("deriveStripDay", () => {
  it("marks today, planned, logged, and rest", () => {
    expect(
      deriveStripDay("2026-10-09", "2026-10-09", {
        isRestDay: false,
        items: [{ log: { id: "l", outcome: "COMPLETED" } }, { log: null }],
      }),
    ).toEqual({
      date: "2026-10-09",
      isToday: true,
      isRestDay: false,
      hasPlanned: true,
      hasLogged: true,
      allDone: false,
    });
    expect(
      deriveStripDay("2026-10-10", "2026-10-09", {
        isRestDay: true,
        items: [],
      }),
    ).toEqual({
      date: "2026-10-10",
      isToday: false,
      isRestDay: true,
      hasPlanned: false,
      hasLogged: false,
      allDone: false,
    });
    expect(
      deriveStripDay("2026-10-11", "2026-10-09", undefined),
    ).toEqual({
      date: "2026-10-11",
      isToday: false,
      isRestDay: false,
      hasPlanned: false,
      hasLogged: false,
      allDone: false,
    });
  });
});
