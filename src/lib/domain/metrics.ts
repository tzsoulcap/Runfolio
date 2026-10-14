// Metric calculators (§14). Average pace weights by distance: total seconds ÷
// total km — never the mean of per-session paces.
export function paceSecPerKm(
  distanceM: number,
  movingSec: number,
): number | null {
  if (distanceM <= 0) return null;
  return movingSec / (distanceM / 1000);
}

export function formatPace(pace: number | null): string | null {
  if (pace === null) return null;
  const seconds = Math.floor(pace);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Null-safe pace label for a log-like pair; null when pace is meaningless
// (no distance, or no positive moving time).
export function paceLabelFor(
  distanceM: number | null,
  movingSec: number | null,
): string | null {
  if (distanceM === null || movingSec === null || movingSec <= 0) return null;
  return formatPace(paceSecPerKm(distanceM, movingSec));
}

// A measurable amount: distance, duration, or both (one split, or a sum).
export type SplitAmount = {
  distanceM: number | null;
  durationSec: number | null;
};

// Splits reference total (§6): independent sums; a component is null when no
// split carries it. Never feeds stats — totals stay user-typed.
export function sumSplits(splits: Array<SplitAmount>): SplitAmount {
  let distanceM: number | null = null;
  let durationSec: number | null = null;
  for (const s of splits) {
    if (s.distanceM !== null) distanceM = (distanceM ?? 0) + s.distanceM;
    if (s.durationSec !== null) durationSec = (durationSec ?? 0) + s.durationSec;
  }
  return { distanceM, durationSec };
}
