import { describe, expect, it } from "vitest";

import {
  addDays,
  isMonday,
  mondayOf,
  monthGrid,
  shiftMonth,
  todayInTimeZone,
  weekDates,
  zonedTimeToUtc,
} from "@/lib/domain/week";

describe("mondayOf", () => {
  it("returns the Monday of a Friday", () => {
    expect(mondayOf("2026-10-09")).toBe("2026-10-05");
  });

  it("returns the same day for a Monday", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });

  it("returns the Monday before a Sunday", () => {
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });
});

describe("isMonday", () => {
  it("accepts Monday and rejects other days", () => {
    expect(isMonday("2026-10-05")).toBe(true);
    expect(isMonday("2026-10-06")).toBe(false);
  });
});

describe("addDays / weekDates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-05", 6)).toBe("2026-10-11");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds a 7-day week from Monday", () => {
    expect(weekDates("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });
});

describe("todayInTimeZone", () => {
  it("resolves 00:30 Bangkok to the Bangkok date, not UTC", () => {
    const now = new Date("2026-10-08T17:30:00.000Z");
    expect(todayInTimeZone("Asia/Bangkok", now)).toBe("2026-10-09");
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-08");
  });
});

describe("zonedTimeToUtc", () => {
  it("combines date and wall time in the given zone", () => {
    expect(
      zonedTimeToUtc("2026-10-09", "06:30", "Asia/Bangkok").toISOString(),
    ).toBe("2026-10-08T23:30:00.000Z");
  });

  it("resolves DST on both sides of the transition", () => {
    expect(
      zonedTimeToUtc("2026-07-09", "06:30", "America/New_York").toISOString(),
    ).toBe("2026-07-09T10:30:00.000Z");
    expect(
      zonedTimeToUtc("2026-01-09", "06:30", "America/New_York").toISOString(),
    ).toBe("2026-01-09T11:30:00.000Z");
  });
});

describe("monthGrid", () => {
  it("pads a Monday-first grid with leading days", () => {
    // 2026-02-01 is a Sunday: 6 leading days, then Feb 1..28.
    const grid = monthGrid("2026-02");
    expect(grid.slice(0, 6).map((d) => d.date)).toEqual([
      "2026-01-26",
      "2026-01-27",
      "2026-01-28",
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
    ]);
    expect(grid.slice(0, 6).every((d) => !d.inMonth)).toBe(true);
    expect(grid[6]).toEqual({ date: "2026-02-01", inMonth: true });
    expect(grid).toHaveLength(34);
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
