// Client-side unique keys for dynamic form rows (splits, sets). Module
// counter plus timestamp: unique within a session, never persisted.
let nextKey = 1;

export function mintKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${Date.now()}-${nextKey}`;
}
