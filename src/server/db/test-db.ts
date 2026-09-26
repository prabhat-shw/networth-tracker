// Test-only: a fresh in-memory Postgres (PGlite) with every committed migration applied,
// so server tests run against the real SQL schema rather than a mock (#40).
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

export async function migratedDb() {
  const pg = new PGlite();
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
  for (const file of files.sort())
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split(
      "--> statement-breakpoint",
    ))
      await pg.exec(stmt);
  return drizzle(pg, { schema });
}
