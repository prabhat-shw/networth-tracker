import { describe, expect, it } from "vitest";
import { FULL_BPS } from "./common";
import {
  InvalidRecordError,
  ownProfile,
  prepareWrite,
  type StoredRecord,
  typeRecords,
} from "./typed";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const GOAL = "9a000000-0000-4000-8000-000000000001";

const cash = {
  kind: "cash" as const,
  owners: [{ memberId: ASHA, shareBps: FULL_BPS }],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-27",
  allocations: [],
  name: "Cash at home",
  value: 20_000_00,
};

let n = 0;
const rec = (
  type: string,
  data: unknown,
  extra: Partial<StoredRecord> = {},
): StoredRecord => ({
  id: `r${++n}`,
  type,
  schemaVersion: 1,
  data,
  modifiedAt: "2026-10-27T10:00:00.000Z",
  modifiedBy: ASHA,
  ...extra,
});

describe("typeRecords", () => {
  it("sorts records by type and keeps a bad one as an error entry", () => {
    const t = typeRecords([
      rec("asset", cash),
      rec("asset", { ...cash, value: -1 }),
      rec("liability", { ...cash, kind: "borrowing" }),
    ]);
    expect(t.asset.map((e) => e.result.status)).toEqual(["ok", "invalid"]);
    expect(t.liability).toHaveLength(1);
    expect(t.goal).toEqual([]);
  });

  it("keeps newer and unknown records apart, untouched", () => {
    const t = typeRecords([
      rec("asset", { future: true }, { schemaVersion: 9 }),
      rec("transaction", { amount: 1 }),
      rec("budget", {}),
    ]);
    expect(t.asset[0].result).toEqual({ status: "too-new", schemaVersion: 9 });
    expect(t.unknown.map((e) => e.result.status)).toEqual([
      "unknown-type",
      "unknown-type",
    ]);
  });

  it("takes each member's latest self-written profile", () => {
    const t = typeRecords([
      rec("member", { memberId: ASHA, name: "Asha" }),
      rec(
        "member",
        { memberId: ASHA, name: "Asha R" },
        { modifiedAt: "2026-10-27T11:00:00.000Z" },
      ),
      rec("member", { memberId: BALA, name: "Bala" }, { modifiedBy: BALA }),
    ]);
    expect(Object.fromEntries(t.profiles)).toEqual({
      [ASHA]: { memberId: ASHA, name: "Asha R" },
      [BALA]: { memberId: BALA, name: "Bala" },
    });
    expect(ownProfile(t, ASHA)?.id).toBe(t.member[1].id);
  });

  it("ignores a profile one member wrote for another", () => {
    const t = typeRecords([rec("member", { memberId: BALA, name: "Bob" })]);
    expect(t.member[0].result.status).toBe("invalid");
    expect(t.profiles.size).toBe(0);
  });
});

describe("prepareWrite", () => {
  it("returns parsed data at the current schema version", () => {
    expect(prepareWrite("asset", cash)).toEqual({
      type: "asset",
      schemaVersion: 1,
      data: cash,
    });
  });

  it("rejects invalid data with paths, not values", () => {
    const bad = { ...cash, owners: [{ memberId: ASHA, shareBps: 5000 }] };
    expect(() => prepareWrite("asset", bad)).toThrow(InvalidRecordError);
    try {
      prepareWrite("asset", bad);
    } catch (e) {
      expect((e as InvalidRecordError).issues).toEqual([
        "owners: shares must add up to 100%",
      ]);
    }
  });

  it("rejects fixed allocations larger than the value", () => {
    const over = {
      ...cash,
      allocations: [
        { goalId: GOAL, mode: "fixed" as const, amount: cash.value + 1 },
      ],
    };
    expect(() => prepareWrite("asset", over)).toThrow(InvalidRecordError);
  });

  it("never saves over a newer, unreadable or other-type record", () => {
    for (const existing of [
      rec("asset", { future: true }, { schemaVersion: 2 }),
      rec("asset", { broken: true }),
      rec("liability", { ...cash, kind: "borrowing" }),
    ])
      expect(() => prepareWrite("asset", cash, existing)).toThrow(
        InvalidRecordError,
      );
    expect(() => prepareWrite("asset", cash, rec("asset", cash))).not.toThrow();
  });
});
