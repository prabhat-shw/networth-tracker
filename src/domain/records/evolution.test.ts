import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canOverwrite, type Registry, readRecord } from "./evolution";

// A toy `goal` type at v3: v1 had `title`, v2 renamed it to `name`, v3 added `priority`.
const goalV3 = z.strictObject({ name: z.string(), priority: z.int() });
const registry: Registry = {
  goal: {
    current: 3,
    schema: goalV3,
    upgrades: {
      1: (d) => {
        const { title, ...rest } = d as { title: string };
        return { ...rest, name: title };
      },
      2: (d) => ({ ...(d as object), priority: 0 }),
    },
  },
};

describe("readRecord", () => {
  it("parses a current record as is", () => {
    const r = readRecord(registry, {
      type: "goal",
      schemaVersion: 3,
      data: { name: "House", priority: 1 },
    });
    expect(r).toEqual({
      status: "ok",
      value: { name: "House", priority: 1 },
      upgraded: false,
    });
    expect(canOverwrite(r)).toBe(true);
  });

  it("upgrades an old record step by step, in memory", () => {
    const data = { title: "House" };
    const r = readRecord(registry, { type: "goal", schemaVersion: 1, data });
    expect(r).toEqual({
      status: "ok",
      value: { name: "House", priority: 0 },
      upgraded: true,
    });
    expect(data).toEqual({ title: "House" }); // the stored data is untouched
  });

  it("keeps a record from a newer app and refuses to overwrite it", () => {
    const r = readRecord(registry, {
      type: "goal",
      schemaVersion: 4,
      data: { name: "House", priority: 1, colour: "teal" },
    });
    expect(r).toEqual({ status: "too-new", schemaVersion: 4 });
    expect(canOverwrite(r)).toBe(false);
  });

  it("keeps a type it has never heard of, including inherited names", () => {
    for (const type of ["vehicleLog", "toString", "__proto__", "constructor"]) {
      const r = readRecord(registry, { type, schemaVersion: 1, data: {} });
      expect(r).toEqual({ status: "unknown-type" });
      expect(canOverwrite(r)).toBe(false);
    }
  });

  it("reports a record that doesn't match the version it claims", () => {
    const r = readRecord(registry, {
      type: "goal",
      schemaVersion: 3,
      data: { name: "House", priority: 1, extra: true },
    });
    expect(r.status).toBe("invalid");
    expect(canOverwrite(r)).toBe(false);
  });

  it("names paths and rules, not values, in its issues", () => {
    const r = readRecord(registry, {
      type: "goal",
      schemaVersion: 3,
      data: { name: 42_00_000, priority: "secret-folio-998877" },
    });
    if (r.status !== "invalid") throw new Error(r.status);
    expect(r.issues.join(" ")).toMatch(/name/);
    expect(r.issues.join(" ")).not.toMatch(/4200000|998877/);
  });

  it("fails soft when an upgrade step throws or is missing", () => {
    expect(
      readRecord(registry, { type: "goal", schemaVersion: 1, data: null })
        .status,
    ).toBe("invalid");
    const gap: Registry = {
      goal: { current: 3, schema: goalV3, upgrades: { 2: (d) => d } },
    };
    expect(
      readRecord(gap, { type: "goal", schemaVersion: 1, data: {} }),
    ).toEqual({ status: "invalid", issues: ["no upgrade from v1"] });
  });
});
