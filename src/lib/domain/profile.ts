// Profile input rules (§13): display names are trimmed, blank means unset,
// and timezones must be real IANA names. Stored plan/log dates are plain
// calendar strings, so a timezone change never shifts them.

export const DISPLAY_NAME_MAX = 80;

export type ProfileInput = {
  displayName?: string | null;
  timezone?: string;
};

export type NormalizedProfileInput =
  | { ok: true; displayName: string | null; timezone: string }
  | { ok: false; code: "VALIDATION"; message: string };

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeProfileInput(
  raw: ProfileInput,
): NormalizedProfileInput {
  const timezone = raw.timezone ?? "Asia/Bangkok";
  if (!isValidTimezone(timezone)) {
    return { ok: false, code: "VALIDATION", message: "เขตเวลาไม่ถูกต้อง" };
  }
  const trimmed = (raw.displayName ?? "").trim();
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return {
      ok: false,
      code: "VALIDATION",
      message: `ชื่อที่แสดงยาวเกิน ${DISPLAY_NAME_MAX} ตัวอักษร`,
    };
  }
  return { ok: true, displayName: trimmed === "" ? null : trimmed, timezone };
}
