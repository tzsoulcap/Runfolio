import { describe, expect, it } from "vitest";

import { normalizeProfileInput } from "@/lib/domain/profile";

describe("normalizeProfileInput", () => {
  it("trims the display name", () => {
    const res = normalizeProfileInput({
      displayName: "  นักวิ่ง  ",
      timezone: "Asia/Bangkok",
    });
    expect(res).toEqual({
      ok: true,
      displayName: "นักวิ่ง",
      timezone: "Asia/Bangkok",
    });
  });

  it("treats a blank display name as unset", () => {
    const res = normalizeProfileInput({
      displayName: "   ",
      timezone: "Asia/Bangkok",
    });
    expect(res).toEqual({
      ok: true,
      displayName: null,
      timezone: "Asia/Bangkok",
    });
  });

  it("rejects display names over 80 characters", () => {
    const res = normalizeProfileInput({
      displayName: "ก".repeat(81),
      timezone: "Asia/Bangkok",
    });
    expect(res.ok).toBe(false);
  });

  it("accepts any valid IANA timezone", () => {
    const res = normalizeProfileInput({
      displayName: null,
      timezone: "America/New_York",
    });
    expect(res).toEqual({
      ok: true,
      displayName: null,
      timezone: "America/New_York",
    });
  });

  it("rejects unknown timezones", () => {
    const res = normalizeProfileInput({
      displayName: null,
      timezone: "Mars/Olympus",
    });
    expect(res.ok).toBe(false);
  });
});
