// Allow only in-app paths; everything else falls back to "/".
export function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}
