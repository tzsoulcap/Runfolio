import { describe, expect, it } from "vitest";

import {
  formatDayMonthTh,
  formatDayRange,
  formatKm,
  formatPrescriptionTh,
  parsePaceInput,
} from "@/lib/format";

describe("parsePaceInput", () => {
  it("parses m:ss and plain seconds", () => {
    expect(parsePaceInput("6:40")).toBe(400);
    expect(parsePaceInput("7:05")).toBe(425);
    expect(parsePaceInput("400")).toBe(400);
  });

  it("rejects blank, malformed, and out-of-range input", () => {
    expect(parsePaceInput("")).toBeNull();
    expect(parsePaceInput("  ")).toBeNull();
    expect(parsePaceInput("6:70")).toBeNull();
    expect(parsePaceInput("abc")).toBeNull();
    expect(parsePaceInput("-5")).toBeNull();
    expect(parsePaceInput("6:4")).toBeNull();
  });
});

describe("formatPrescriptionTh", () => {
  it("formats per-side reps with load and rest", () => {
    expect(
      formatPrescriptionTh({
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
        loadKg: 8,
        restSec: 60,
      }),
    ).toBe("3 เซ็ต × 10 ครั้งต่อข้าง · 8 kg · พัก 60 วิ");
  });

  it("formats alternating totals in steps without per-side meaning", () => {
    expect(
      formatPrescriptionTh(
        {
          measurement: "REPS",
          sets: 3,
          reps: 20,
          countMode: "TOTAL_ALTERNATING",
          loadKg: 0,
        },
        "STEPS",
      ),
    ).toBe("3 เซ็ต × 20 ก้าวรวมสลับข้าง · น้ำหนักตัว");
  });

  it("formats time doses in seconds and omits null load", () => {
    expect(
      formatPrescriptionTh({
        measurement: "TIME",
        sets: 3,
        durationSec: 45,
        countMode: "TOTAL",
        loadKg: null,
      }),
    ).toBe("3 เซ็ต × 45 วินาที");
  });

  it("formats per-direction and plain totals", () => {
    expect(
      formatPrescriptionTh(
        {
          measurement: "REPS",
          sets: 3,
          reps: 15,
          countMode: "PER_DIRECTION",
          loadKg: 0,
        },
        "STEPS",
      ),
    ).toBe("3 เซ็ต × 15 ก้าวต่อทิศทาง · น้ำหนักตัว");
    expect(
      formatPrescriptionTh({
        measurement: "REPS",
        sets: 3,
        reps: 20,
        countMode: "TOTAL",
        loadKg: 0,
      }),
    ).toBe("3 เซ็ต × 20 ครั้ง · น้ำหนักตัว");
  });
});

describe("formatKm", () => {
  it("trims whole and fractional kilometers", () => {
    expect(formatKm(10000)).toBe("10");
    expect(formatKm(26000)).toBe("26");
    expect(formatKm(21097.5)).toBe("21.1");
    expect(formatKm(0)).toBe("0");
  });
});

describe("formatDayMonthTh", () => {
  it("renders Thai short dates", () => {
    expect(formatDayMonthTh("2026-10-12")).toBe("12 ต.ค.");
  });
});

describe("formatDayRange", () => {
  it("collapses same-month ranges", () => {
    expect(formatDayRange("2026-10-12", "2026-10-18")).toBe("12–18 ต.ค.");
  });

  it("spells cross-month ranges in full", () => {
    expect(formatDayRange("2026-09-28", "2026-10-04")).toBe(
      "28 ก.ย. – 4 ต.ค.",
    );
  });
});
