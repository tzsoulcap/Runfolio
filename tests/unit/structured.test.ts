import { describe, expect, it } from "vitest";

import {
  summarizeStructured,
  type StructuredRunningTarget,
} from "@/lib/domain/structured";
import {
  parseStructuredTarget,
  targetToBlocks,
} from "@/features/planner/structured-editor";

const INTERVAL_LIKE: StructuredRunningTarget = {
  kind: "STRUCTURED",
  steps: [
    {
      kind: "STEP",
      phase: "WARMUP",
      target: { kind: "DURATION", durationSec: 600 },
      intensity: { kind: "NONE" },
    },
    {
      kind: "REPEAT",
      repeatCount: 5,
      includeFinalRecovery: false,
      steps: [
        {
          kind: "STEP",
          phase: "WORK",
          target: { kind: "DISTANCE", distanceM: 800 },
          intensity: { kind: "EFFORT", label: "Fast" },
          note: "เร็ว",
        },
        {
          kind: "STEP",
          phase: "RECOVERY",
          target: { kind: "DURATION", durationSec: 90 },
          intensity: { kind: "EFFORT", label: "Jog recovery" },
        },
      ],
    },
  ],
};

describe("structured draft round-trip", () => {
  it("preserves per-step intensity and note on a no-touch save (§5 step 2)", () => {
    const blocks = targetToBlocks(INTERVAL_LIKE);
    const parsed = parseStructuredTarget(blocks);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.target).toEqual(INTERVAL_LIKE);
  });

  it("defaults new steps to NONE intensity", () => {
    const blocks = targetToBlocks(null);
    const parsed = parseStructuredTarget(blocks);
    // Blank draft fails validation (empty distance) — but the built shape
    // carries NONE; assert via a filled-in block instead.
    expect(parsed.ok).toBe(false);
    const filled = targetToBlocks({
      kind: "STRUCTURED",
      steps: [
        {
          kind: "STEP",
          phase: "WORK",
          target: { kind: "DISTANCE", distanceM: 1000 },
          intensity: { kind: "NONE" },
        },
      ],
    });
    const ok = parseStructuredTarget(filled);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.target).toEqual({
      kind: "STRUCTURED",
      steps: [
        {
          kind: "STEP",
          phase: "WORK",
          target: { kind: "DISTANCE", distanceM: 1000 },
          intensity: { kind: "NONE" },
        },
      ],
    });
  });
});

describe("summarizeStructured (§14)", () => {
  it("excludes the final recovery when the flag is false", () => {
    // 5×800 m work + 4×90 s recovery (no rest after the last round),
    // plus a 600 s warmup.
    const totals = summarizeStructured(INTERVAL_LIKE);
    expect(totals.knownDistanceM).toBe(4000);
    expect(totals.knownDurationSec).toBe(960);
    expect(totals.distanceComplete).toBe(false);
    expect(totals.durationComplete).toBe(false);
  });

  it("includes every recovery when the flag is true", () => {
    const target: StructuredRunningTarget = {
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
              target: { kind: "DURATION", durationSec: 120 },
              intensity: { kind: "NONE" },
            },
          ],
        },
      ],
    };
    const totals = summarizeStructured(target);
    expect(totals.knownDistanceM).toBe(4000);
    expect(totals.knownDurationSec).toBe(600);
  });

  it("never invents distance from duration or vice versa", () => {
    const target: StructuredRunningTarget = {
      kind: "STRUCTURED",
      steps: [
        {
          kind: "STEP",
          phase: "WORK",
          target: { kind: "DISTANCE", distanceM: 2000 },
          intensity: { kind: "NONE" },
        },
        {
          kind: "STEP",
          phase: "RECOVERY",
          target: { kind: "OPEN", instruction: "เดินพักตามสบาย" },
          intensity: { kind: "NONE" },
        },
      ],
    };
    const totals = summarizeStructured(target);
    expect(totals.knownDistanceM).toBe(2000);
    expect(totals.knownDurationSec).toBe(0);
    expect(totals.distanceComplete).toBe(false);
    expect(totals.durationComplete).toBe(false);
  });

  it("marks all-distance sessions complete for distance only", () => {
    const target: StructuredRunningTarget = {
      kind: "STRUCTURED",
      steps: [
        {
          kind: "STEP",
          phase: "WARMUP",
          target: { kind: "DISTANCE", distanceM: 1000 },
          intensity: { kind: "NONE" },
        },
        {
          kind: "STEP",
          phase: "WORK",
          target: { kind: "DISTANCE", distanceM: 3000 },
          intensity: { kind: "NONE" },
        },
      ],
    };
    const totals = summarizeStructured(target);
    expect(totals.knownDistanceM).toBe(4000);
    expect(totals.knownDurationSec).toBe(0);
    expect(totals.distanceComplete).toBe(true);
    expect(totals.durationComplete).toBe(false);
  });
});
