#!/usr/bin/env node
// Enforces the context budget from docs/CONTEXT.md: small docs stay small, so a fresh
// session can load its working set cheaply. Fails CI when a cap is breached.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CAPS = [
  { path: "CLAUDE.md", max: 120 },
  { path: "docs/STATE.md", max: 80 },
  { dir: "docs/phases", max: 150 },
  { dir: "docs/decisions", max: 60 },
];

const lines = (p) => readFileSync(p, "utf8").split("\n").length;
const failures = [];

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
    const n = lines(file);
    if (n > cap.max) failures.push(`${file}: ${n} lines (max ${cap.max})`);
  }
}

if (failures.length) {
  console.error("Doc size caps exceeded (see docs/CONTEXT.md):");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nSplit the file or move detail into a reference doc.");
  process.exit(1);
}
console.log("Doc size caps OK");
