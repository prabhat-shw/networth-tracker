#!/usr/bin/env node
/**
 * Documentation gate. Docs rot when nothing fails on staleness, so this runs in CI:
 *   1. size caps  — the context budget in docs/CONTEXT.md stays real
 *   2. links      — every relative Markdown link resolves
 *   3. ADR hygiene — numbering is unique, filenames are well-formed, each has a Status
 * See docs/kb/07-keeping-docs-current.md for the whole strategy.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const failures = [];

// ---------------------------------------------------------------- 1. size caps
const CAPS = [
  { path: "CLAUDE.md", max: 120 },
  { path: "docs/STATE.md", max: 80 },
  { dir: "docs/phases", max: 150 },
  { dir: "docs/decisions", max: 60 },
];

const lineCount = (p) => readFileSync(p, "utf8").split("\n").length;

for (const cap of CAPS) {
  const files = cap.dir
    ? existsSync(cap.dir)
      ? readdirSync(cap.dir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => join(cap.dir, f))
      : []
    : existsSync(cap.path)
      ? [cap.path]
      : [];
  for (const file of files) {
    const n = lineCount(file);
    if (n > cap.max) {
      failures.push(
        `${file}: ${n} lines (max ${cap.max}) — split it or move detail to a reference doc`,
      );
    }
  }
}

// ------------------------------------------------------------------- 2. links
function markdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", ".next", "dist", "build"].includes(entry))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) markdownFiles(full, found);
    else if (entry.endsWith(".md")) found.push(full);
  }
  return found;
}

const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of markdownFiles(".")) {
  const body = readFileSync(file, "utf8");
  for (const [, rawTarget] of body.matchAll(LINK)) {
    const target = rawTarget.split("#")[0].trim();
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = normalize(resolve(dirname(file), target));
    if (!existsSync(resolved))
      failures.push(`${file}: broken link → ${target}`);
  }
}

// --------------------------------------------------------------- 3. ADR hygiene
const adrDir = "docs/decisions";
if (existsSync(adrDir)) {
  const seen = new Map();
  for (const file of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
    const match = /^(\d{4})-[a-z0-9-]+\.md$/.exec(file);
    if (!match) {
      failures.push(`${adrDir}/${file}: name must be NNNN-kebab-slug.md`);
      continue;
    }
    const number = match[1];
    if (seen.has(number))
      failures.push(
        `${adrDir}: ADR ${number} used twice (${seen.get(number)}, ${file})`,
      );
    seen.set(number, file);
    if (!/\*\*Status:\*\*/.test(readFileSync(join(adrDir, file), "utf8"))) {
      failures.push(`${adrDir}/${file}: missing a **Status:** line`);
    }
  }
}

if (failures.length) {
  console.error("Documentation checks failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Documentation checks OK");
