import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/", "/plan", "/journal/abc?x=1"])("allows %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([null, "", "//evil.com", "https://evil.com/x", "javascript:alert(1)"])(
    "rejects %s",
    (path) => {
      expect(safeNextPath(path)).toBe("/");
    },
  );
});
