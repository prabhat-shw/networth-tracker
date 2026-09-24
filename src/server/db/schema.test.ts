import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { records } from "./schema";

// Security invariant: the server stores ciphertext and routing metadata, nothing else.
describe("records schema", () => {
  const { columns } = getTableConfig(records);
  const byName = Object.fromEntries(
    columns.map((c) => [c.name, c.getSQLType()]),
  );

  it("has exactly the ADR-0003 envelope columns", () => {
    expect(byName).toEqual({
      id: "uuid",
      household_id: "uuid",
      version: "bigint",
      updated_at: "timestamp with time zone",
      ciphertext: "bytea",
      deleted: "boolean",
    });
  });

  it("has no column that could hold readable household data", () => {
    const plaintextish = /text|char|json|numeric|decimal|enum|\[\]/i;
    for (const [name, type] of Object.entries(byName)) {
      expect(plaintextish.test(type), `${name}: ${type}`).toBe(false);
    }
  });
});
