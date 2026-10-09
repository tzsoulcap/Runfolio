import { describe, expect, it } from "vitest";

import {
  addDays,
  isMonday,
  mondayOf,
  todayInTimeZone,
  weekDates,
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
