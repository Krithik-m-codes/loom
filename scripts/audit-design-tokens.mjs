import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "src", "index.css"), "utf8");
const requiredTokens = [
  "--loom-bg", "--loom-bg-secondary", "--loom-surface", "--loom-surface-elevated",
  "--loom-border", "--loom-primary", "--loom-green", "--loom-text",
  "--loom-text-secondary", "--loom-text-muted", "--loom-warning", "--loom-error",
];
const failures = requiredTokens
  .filter((token) => !css.includes(token))
  .map((token) => `Missing ${token} in src/index.css`);

if (!css.includes("@media (prefers-reduced-motion: reduce)")) {
  failures.push("Missing reduced-motion guard in src/index.css");
}

const collectTsx = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return collectTsx(path);
  return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
});

const files = collectTsx(join(root, "src"));
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(line)) {
      failures.push(`${relative(root, file)}:${index + 1} contains a literal color`);
    }
  });
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Loom design audit passed for ${files.length} component files.`);
