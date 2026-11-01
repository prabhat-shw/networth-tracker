// The price store in real IndexedDB (#168, ADR-0067): one row per kind, never moved back to
// an older file, and kept across page loads.
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { Universe, UniverseKind } from "@/domain/prices/universe";
import { PRICE_DB_NAME, priceStore, toUniverses } from "./price-store";

const file = (kind: UniverseKind, date: string): Universe => ({
  kind,
  date,
  fetchedAt: `${date}T18:00:00.000Z`,
  source: "test",
  currency: "INR",
  prices: { A: "1.5" },
});

const store = priceStore();

afterEach(async () => {
  const d = new Dexie(PRICE_DB_NAME);
  d.version(1).stores({ universes: "kind" });
  await d.table("universes").clear();
  d.close();
});

describe("price store (IndexedDB)", () => {
  it("keeps the newest file per kind and marks checks", async () => {
    await store.put({
      kind: "amfi",
      universe: file("amfi", "2026-10-31"),
      etag: '"a"',
      checkedOn: "2026-10-31",
    });
    await store.put({
      kind: "amfi",
      universe: file("amfi", "2026-10-30"),
      etag: '"old"',
      checkedOn: "2026-11-01",
    });
    await store.put({
      kind: "fx",
      universe: file("fx", "2026-10-31"),
      etag: null,
      checkedOn: "2026-10-31",
    });
    await store.touch("fx", "2026-11-01");

    expect(await store.get("amfi")).toMatchObject({
      etag: '"a"',
      checkedOn: "2026-11-01",
      universe: { date: "2026-10-31" },
    });
    expect((await store.get("fx"))?.checkedOn).toBe("2026-11-01");
    const all = toUniverses(await store.all());
    expect(Object.keys(all).sort()).toEqual(["amfi", "fx"]);
    expect(all.amfi?.prices.A).toBe("1.5");
  });
});
