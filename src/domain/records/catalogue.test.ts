import { describe, expect, it } from "vitest";
import { assetKinds } from "./asset";
import {
  ASSET_PLACEMENT,
  BALANCE_SHEET_CODECS,
  BUCKETS,
  LIABILITY_PLACEMENT,
  PRICED_KINDS,
  SECTIONS,
} from "./catalogue";
import { FULL_BPS } from "./common";
import { readRecord } from "./evolution";
import { liabilityKinds } from "./liability";

const placements = [
  ...Object.values(ASSET_PLACEMENT),
  ...Object.values(LIABILITY_PLACEMENT),
];

describe("placement", () => {
  it("places exactly the kinds the schemas define", () => {
    expect(Object.keys(ASSET_PLACEMENT).sort()).toEqual(
      assetKinds.map((k) => k.shape.kind.value).sort(),
    );
    expect(Object.keys(LIABILITY_PLACEMENT).sort()).toEqual(
      liabilityKinds.map((k) => k.shape.kind.value).sort(),
    );
  });

  it("uses all seven buckets and all nine sections", () => {
    expect(new Set(placements.map((p) => p.bucket))).toEqual(new Set(BUCKETS));
    expect(new Set(placements.map((p) => p.section))).toEqual(
      new Set(SECTIONS),
    );
  });

  it("puts receivables and loans in one bucket but separate sections (UX §3.4)", () => {
    expect(ASSET_PLACEMENT.moneyLent).toEqual({
      bucket: "lendingLoans",
      section: "lending",
    });
    expect(LIABILITY_PLACEMENT.loan).toEqual({
      bucket: "lendingLoans",
      section: "loans",
    });
  });

  it("gives every priced kind a quantity and an instrument", () => {
    for (const k of assetKinds) {
      const kind = k.shape.kind.value;
      const hasPrice = "instrument" in k.shape && "quantity" in k.shape;
      expect([kind, hasPrice]).toEqual([kind, PRICED_KINDS.has(kind)]);
    }
  });
});

describe("codecs", () => {
  const data = {
    kind: "cash",
    owners: [
      { memberId: "0a000000-0000-4000-8000-0000000000a1", shareBps: FULL_BPS },
    ],
    includeInNetWorth: true,
    tags: [],
    asOf: "2026-10-27",
    allocations: [],
    name: "Cash at home",
    value: 20_000_00,
  };

  it("reads an asset through readRecord", () => {
    const r = readRecord(BALANCE_SHEET_CODECS, {
      type: "asset",
      schemaVersion: 1,
      data,
    });
    expect(r).toEqual({ status: "ok", value: data, upgraded: false });
  });

  it("refuses an asset filed as a liability", () => {
    const r = readRecord(BALANCE_SHEET_CODECS, {
      type: "liability",
      schemaVersion: 1,
      data,
    });
    expect(r.status).toBe("invalid");
  });
});
