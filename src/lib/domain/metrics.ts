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
  const m = Math.floor(pace / 60);
  const s = Math.round(pace % 60);
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
