import { describe, expect, it } from "vitest";

import {
  formatPace,
  paceLabelFor,
  paceSecPerKm,
  sumSplits,
} from "@/lib/domain/metrics";

describe("paceSecPerKm", () => {
  it("weights pace by distance (spec §14 example: 6:40/km)", () => {
    expect(paceSecPerKm(15000, 6000)).toBe(400);
  });

  it("computes 5 km in 38 min as 7:36/km", () => {
    expect(paceSecPerKm(5000, 2280)).toBe(456);
  });

  it("returns null when distance is zero", () => {
    expect(paceSecPerKm(0, 600)).toBeNull();
  });
});

describe("formatPace", () => {
  it("truncates fractional seconds without displaying :60", () => {
    expect(formatPace(479.5)).toBe("7:59");
    expect(formatPace(479.999)).toBe("7:59");
    expect(formatPace(480)).toBe("8:00");
    expect(paceLabelFor(2000, 959)).toBe("7:59");
  });
  it("formats seconds per km as m:ss", () => {
    expect(formatPace(400)).toBe("6:40");
    expect(formatPace(456)).toBe("7:36");
  });

  it("returns null display for null input", () => {
    expect(formatPace(null)).toBeNull();
  });
});

describe("paceLabelFor", () => {
  it("labels pace for a complete log pair", () => {
    expect(paceLabelFor(5000, 2280)).toBe("7:36");
  });

  it("returns null when pace is meaningless", () => {
    expect(paceLabelFor(null, 2280)).toBeNull();
    expect(paceLabelFor(5000, null)).toBeNull();
    expect(paceLabelFor(5000, 0)).toBeNull();
    expect(paceLabelFor(0, 600)).toBeNull();
  });
});

describe("sumSplits", () => {
  it("sums distance and duration independently (§6 reference total)", () => {
    expect(
      sumSplits([
        { distanceM: 1000, durationSec: 420 },
        { distanceM: 2000, durationSec: null },
        { distanceM: null, durationSec: 300 },
      ]),
    ).toEqual({ distanceM: 3000, durationSec: 720 });
  });

  it("returns null per component when no split has it", () => {
    expect(sumSplits([{ distanceM: 1000, durationSec: null }])).toEqual({
      distanceM: 1000,
      durationSec: null,
    });
    expect(sumSplits([])).toEqual({ distanceM: null, durationSec: null });
  });
});
