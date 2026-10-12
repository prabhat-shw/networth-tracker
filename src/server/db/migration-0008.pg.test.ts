// Migration 0008 (ADR-0045) on a database that already holds records: each household's rows
// get seq 1…n in their old pull order, and the household counter continues from n.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const apply = async (pg: PGlite, file: string) => {
  for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split(
    "--> statement-breakpoint",
  ))
    await pg.exec(stmt);
};

describe("migration 0008_record_seq", () => {
  it("backfills seq per household and sets the counter", async () => {
    const pg = new PGlite();
    const files = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const at = files.findIndex((f) => f.startsWith("0008_"));
    for (const f of files.slice(0, at)) await apply(pg, f);

    const A = "0a000000-0000-4000-8000-00000000000a";
    const B = "0b000000-0000-4000-8000-00000000000b";
    const C = "0c000000-0000-4000-8000-00000000000c";
    await pg.exec(`
      insert into households (id) values ('${A}'), ('${B}'), ('${C}');
      insert into records (id, household_id, version, ciphertext) values
        ('1a000000-0000-4000-8000-000000000003', '${A}', 3, '\\x01'),
        ('1a000000-0000-4000-8000-000000000001', '${A}', 1, '\\x01'),
        ('1b000000-0000-4000-8000-000000000001', '${B}', 7, '\\x01');`);
    await apply(pg, files[at]);

    const rows = await pg.query<{
      household_id: string;
      version: string;
      seq: string;
    }>(
      "select household_id, version, seq from records order by household_id, seq",
    );
    expect(
      rows.rows.map((r) => [r.household_id, Number(r.version), Number(r.seq)]),
    ).toEqual([
      [A, 1, 1],
      [A, 3, 2],
      [B, 7, 1],
    ]);
    const hh = await pg.query<{ id: string; record_seq: string }>(
      "select id, record_seq from households order by id",
    );
    expect(hh.rows.map((r) => Number(r.record_seq))).toEqual([2, 1, 0]);
  }, 30_000);
});
