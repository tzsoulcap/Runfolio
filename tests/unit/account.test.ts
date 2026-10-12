import { describe, expect, it } from "vitest";

import { resolveAccountName } from "@/lib/auth/account";

describe("account display name", () => {
  it("keeps a name chosen in Runfolio ahead of the Google name", () => {
    expect(resolveAccountName("  Caps  ", { full_name: "Google Name" })).toBe(
      "Caps",
    );
  });

  it("uses the Google full name when the profile has no name", () => {
    expect(resolveAccountName(null, { full_name: "  Chayodom  " })).toBe(
      "Chayodom",
    );
  });

  it("falls back to provider name when full_name is missing or invalid", () => {
    expect(resolveAccountName(" ", { full_name: 123, name: "Google Name" })).toBe(
      "Google Name",
    );
  });

  it("keeps the generic greeting for accounts without name metadata", () => {
    expect(resolveAccountName(null, undefined)).toBe("นักวิ่ง");
    expect(resolveAccountName("", { full_name: " ", name: null })).toBe("นักวิ่ง");
  });
});
