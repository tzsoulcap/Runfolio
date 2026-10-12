import { describe, expect, it } from "vitest";

import { formatPrescriptionTh, parsePaceInput } from "@/lib/format";

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
