// Date-only helpers (YYYY-MM-DD). Weeks start Monday (§5); "today" resolves in
// the user's IANA timezone (§13). Pure: no Date.now inside except defaults.
import { z } from "zod";

const DAY_MS = 86_400_000;

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "invalid calendar date");

export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  return toDateStr(new Date(parseDateOnly(dateStr).getTime() + days * DAY_MS));
}

export function mondayOf(dateStr: string): string {
  const day = parseDateOnly(dateStr).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((day + 6) % 7));
}

export function isMonday(dateStr: string): boolean {
  return parseDateOnly(dateStr).getUTCDay() === 1;
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function todayInTimeZone(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
