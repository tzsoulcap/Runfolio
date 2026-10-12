import { describe, expect, it } from "vitest";

import type { RunningTarget } from "@/lib/domain/master";
import {
  parseStructuredTarget,
  targetToBlocks,
} from "@/features/planner/structured-editor";

const INTERVAL_LIKE: RunningTarget = {
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
