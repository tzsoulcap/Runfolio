import { describe, expect, it } from "vitest";

import {
  summarizeTemplatePayload,
  TemplatePayloadSchema,
} from "@/lib/domain/template";

const RUNNING_ITEM = {
  activityType: "RUNNING",
  runningWorkoutCode: "EASY_RUN",
  runningTarget: { kind: "DISTANCE", distanceM: 6000 },
  intensityTarget: { kind: "NONE" },
  title: "Easy Run",
  plannedStartTime: "06:30",
  note: "เช้า",
} as const;

const STRENGTH_ITEM = {
  activityType: "STRENGTH",
  title: "Legs and core",
  exercises: [
    {
      exerciseCode: "BULGARIAN_SPLIT_SQUAT",
      variant: "STANDARD",
      prescription: {
        measurement: "REPS",
        sets: 3,
        reps: 10,
        countMode: "PER_SIDE",
        loadKg: 8,
      },
    },
    {
      exerciseCode: "PLANK",
      variant: "STANDARD",
      prescription: {
        measurement: "TIME",
        sets: 3,
        durationSec: 45,
        countMode: "TOTAL",
        loadKg: 0,
      },
    },
  ],
} as const;

function day(index: number, overrides = {}) {
  return { dayIndex: index, isRestDay: false, items: [], ...overrides };
}

function payload(days: unknown[]) {
  return { schemaVersion: 1, days };
}

describe("TemplatePayloadSchema", () => {
  it("accepts a week with running, strength, rest, and empty days", () => {
    const parsed = TemplatePayloadSchema.safeParse(
      payload([
        day(0, { items: [RUNNING_ITEM] }),
        day(1, { items: [STRENGTH_ITEM] }),
        day(2, { isRestDay: true, note: "พัก" }),
        day(3),
        day(4, { items: [RUNNING_ITEM, STRENGTH_ITEM] }),
        day(5),
        day(6, { isRestDay: true }),
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("requires exactly 7 days indexed 0-6", () => {
    expect(
      TemplatePayloadSchema.safeParse(
        payload([0, 1, 2, 3, 4, 5].map((i) => day(i))),
      ).success,
    ).toBe(false);
    expect(
      TemplatePayloadSchema.safeParse(
        payload([0, 1, 2, 3, 4, 5, 5].map((i) => day(i))),
      ).success,
    ).toBe(false);
  });

  it("rejects rest days carrying items and unknown schema versions", () => {
    expect(
      TemplatePayloadSchema.safeParse(
        payload([
          day(0, { isRestDay: true, items: [RUNNING_ITEM] }),
          day(1),
          day(2),
          day(3),
          day(4),
          day(5),
          day(6),
        ]),
      ).success,
    ).toBe(false);
    expect(
      TemplatePayloadSchema.safeParse({
        schemaVersion: 2,
        days: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i)),
      }).success,
    ).toBe(false);
  });

  it("validates nested targets and prescriptions", () => {
    expect(
      TemplatePayloadSchema.safeParse(
        payload([
          day(0, {
            items: [
              {
                ...RUNNING_ITEM,
                runningTarget: { kind: "DISTANCE", distanceM: -5 },
              },
            ],
          }),
          day(1),
          day(2),
          day(3),
          day(4),
          day(5),
          day(6),
        ]),
      ).success,
    ).toBe(false);
    expect(
      TemplatePayloadSchema.safeParse(
        payload([
          day(0),
          day(1, {
            items: [
              {
                ...STRENGTH_ITEM,
                exercises: [
                  {
                    exerciseCode: "PLANK",
                    variant: "STANDARD",
                    prescription: {
                      measurement: "TIME",
                      sets: 3,
                      durationSec: 45,
                      reps: 10,
                      countMode: "TOTAL",
                      loadKg: 0,
                    },
                  },
                ],
              },
            ],
          }),
          day(2),
          day(3),
          day(4),
          day(5),
          day(6),
        ]),
      ).success,
    ).toBe(false);
  });
});

describe("summarizeTemplatePayload", () => {
  it("counts items and rest days, tolerating unknown shapes", () => {
    expect(
      summarizeTemplatePayload(
        payload([
          day(0, { items: [RUNNING_ITEM, STRENGTH_ITEM] }),
          day(1, { isRestDay: true }),
          day(2),
          day(3),
          day(4),
          day(5),
          day(6),
        ]),
      ),
    ).toEqual({ itemCount: 2, restCount: 1 });
    expect(summarizeTemplatePayload(null)).toEqual({
      itemCount: 0,
      restCount: 0,
    });
    expect(summarizeTemplatePayload({})).toEqual({
      itemCount: 0,
      restCount: 0,
    });
  });
});
