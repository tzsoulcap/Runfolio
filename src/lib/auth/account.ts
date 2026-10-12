export function resolveAccountName(
  displayName: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
): string {
  for (const candidate of [displayName, metadata?.full_name, metadata?.name]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "นักวิ่ง";
}
