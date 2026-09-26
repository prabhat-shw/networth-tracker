import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { householdMembers, households, records } from "./schema";

const columnTypes = (table: PgTable) =>
  Object.fromEntries(
    getTableConfig(table).columns.map((c) => [c.name, c.getSQLType()]),
  );

// Security invariant: the server stores ciphertext and routing metadata, nothing else.
describe("server schema", () => {
  it("records has exactly the ADR-0003 envelope columns", () => {
    expect(columnTypes(records)).toEqual({
      id: "uuid",
      household_id: "uuid",
      version: "bigint",
      updated_at: "timestamp with time zone",
      ciphertext: "bytea",
      deleted: "boolean",
    });
  });

  it("households and members hold ids, public keys and wrapped keys only", () => {
    expect(columnTypes(households)).toEqual({
      id: "uuid",
      created_at: "timestamp with time zone",
    });
    expect(columnTypes(householdMembers)).toEqual({
      household_id: "uuid",
      member_id: "uuid",
      public_key: "bytea",
      wrapped_hdk: "bytea",
      created_at: "timestamp with time zone",
    });
  });

  it("records and members belong to a household (FK)", () => {
    for (const table of [records, householdMembers]) {
      const [fk] = getTableConfig(table).foreignKeys;
      expect(getTableConfig(fk.reference().foreignTable).name).toBe(
        "households",
      );
    }
  });

  it("has no column that could hold readable household data", () => {
    const plaintextish = /text|char|json|numeric|decimal|enum|\[\]/i;
    for (const table of [records, households, householdMembers]) {
      for (const [name, type] of Object.entries(columnTypes(table))) {
        expect(plaintextish.test(type), `${name}: ${type}`).toBe(false);
      }
    }
  });
});
