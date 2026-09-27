import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("design audit", () => {
  it("accepts the committed Loom visual system", () => {
    expect(() =>
      execFileSync("node", ["scripts/audit-design-tokens.mjs"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
