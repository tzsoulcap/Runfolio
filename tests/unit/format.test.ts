import { describe, expect, it } from "vitest";

import { parsePaceInput } from "@/lib/format";

describe("parsePaceInput", () => {
  it("parses m:ss and plain seconds", () => {
    expect(parsePaceInput("6:40")).toBe(400);
    expect(parsePaceInput("7:05")).toBe(425);
    expect(parsePaceInput("400")).toBe(400);
  });

  it("rejects blank, malformed, and out-of-range input", () => {
    expect(parsePaceInput("")).toBeNull();
    expect(parsePaceInput("  ")).toBeNull();
    expect(parsePaceInput("6:70")).toBeNull();
    expect(parsePaceInput("abc")).toBeNull();
    expect(parsePaceInput("-5")).toBeNull();
    expect(parsePaceInput("6:4")).toBeNull();
  });
});
