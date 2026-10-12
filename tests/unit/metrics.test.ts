import { describe, expect, it } from "vitest";

import { formatPace, paceLabelFor, paceSecPerKm } from "@/lib/domain/metrics";

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
