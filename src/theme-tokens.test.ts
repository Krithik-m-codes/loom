import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

describe("Loom palette roles", () => {
  it("uses the supplied black canvas and green surface swatches", () => {
    expect(css).toMatch(/--loom-bg:\s*#070b0a\s*;/i);
    expect(css).toMatch(/--loom-surface:\s*#0f2918\s*;/i);
  });

  it("keeps the desktop canvas black while reserving surface color for navigation and panels", () => {
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--loom-bg\)/s);
    expect(css).toMatch(/\.loom-app-shell\s*\{[^}]*background:\s*var\(--loom-bg\)/s);
    expect(css).toMatch(/\.loom-page\s*\{[^}]*background:\s*var\(--loom-bg\)/s);
    expect(css).toMatch(/\.loom-sidebar\s*\{[^}]*background:\s*var\(--loom-surface\)/s);
    expect(css).toMatch(/\.loom-topnav\s*\{[^}]*background:\s*var\(--loom-surface\)/s);
    expect(css).toMatch(/\.loom-panel\s*\{[^}]*background:\s*var\(--loom-surface\)/s);
  });
});
