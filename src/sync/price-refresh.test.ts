import { describe, expect, it, vi } from "vitest";
import { memoryPriceStore, toUniverses } from "@/db/price-store";
import {
  UNIVERSE_KINDS,
  type Universe,
  type UniverseKind,
} from "@/domain/prices/universe";
import { createPriceRefresher, priceDay } from "./price-refresh";

const file = (kind: UniverseKind, date: string, price = "10"): Universe => ({
  kind,
  date,
  fetchedAt: `${date}T18:00:00.000Z`,
  source: "test",
  currency: "INR",
  prices: { A: price },
});

type Reply = { status: number; body?: unknown; etag?: string } | "offline";

/** A fake server: `reply(kind, ifNoneMatch)` decides; every call is logged. */
function fakeFetch(reply: (kind: UniverseKind, inm: string | null) => Reply) {
  const calls: { url: string; inm: string | null }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const inm =
        (init?.headers as Record<string, string> | undefined)?.[
          "if-none-match"
        ] ?? null;
      calls.push({ url, inm });
      const kind = url.split("/")[4] as UniverseKind;
      const r = reply(kind, inm);
      if (r === "offline") throw new TypeError("Failed to fetch");
      return new Response(
        r.status === 304 || r.body === undefined
          ? null
          : JSON.stringify(r.body),
        {
          status: r.status,
          headers: r.etag ? { etag: r.etag } : {},
        },
      );
    },
  );
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

// 10:00 IST on 2026-10-31 and the next morning.
const DAY1 = new Date("2026-10-31T04:30:00Z");
const DAY2 = new Date("2026-11-01T04:30:00Z");

describe("priceDay", () => {
  it("turns over at 07:30 IST", () => {
    expect(priceDay(new Date("2026-11-01T01:59:00Z"))).toBe("2026-10-31");
    expect(priceDay(new Date("2026-11-01T02:00:00Z"))).toBe("2026-11-01");
  });
});

describe("price refresh", () => {
  it("downloads every kind with the same requests, whatever is held", async () => {
    const store = memoryPriceStore();
    const { fetcher, calls } = fakeFetch((kind) => ({
      status: 200,
      body: file(kind, "2026-10-30"),
      etag: `"${kind}1"`,
    }));
    const onUpdate = vi.fn();
    const r = await createPriceRefresher({
      store,
      fetcher,
      now: () => DAY1,
      onUpdate,
    }).refresh();
    expect(calls).toEqual(
      UNIVERSE_KINDS.map((k) => ({
        url: `/api/prices/universe/${k}/latest`,
        inm: null,
      })),
    );
    expect(Object.values(r.outcomes)).toEqual(
      UNIVERSE_KINDS.map(() => "updated"),
    );
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(Object.keys(toUniverses(await store.all())).sort()).toEqual(
      [...UNIVERSE_KINDS].sort(),
    );
  });

  it("never downloads twice in a price day, even across concurrent triggers or a reload", async () => {
    const store = memoryPriceStore();
    const { fetcher, calls } = fakeFetch((kind) => ({
      status: 200,
      body: file(kind, "2026-10-30"),
    }));
    const p = createPriceRefresher({ store, fetcher, now: () => DAY1 });
    await Promise.all([p.refresh(), p.refresh(), p.refresh()]);
    await p.refresh();
    // A new page load on the same day reads `checkedOn` from the store.
    const reloaded = await createPriceRefresher({
      store,
      fetcher,
      now: () => DAY1,
    }).refresh();
    expect(calls).toHaveLength(UNIVERSE_KINDS.length);
    expect(Object.values(reloaded.outcomes)).toEqual(
      UNIVERSE_KINDS.map(() => "fresh"),
    );
  });

  it("revalidates with the ETag the next day and keeps the file on a 304", async () => {
    const store = memoryPriceStore();
    let today = DAY1;
    const { fetcher, calls } = fakeFetch((kind, inm) =>
      inm === `"${kind}1"`
        ? { status: 304 }
        : { status: 200, body: file(kind, "2026-10-30"), etag: `"${kind}1"` },
    );
    const p = createPriceRefresher({ store, fetcher, now: () => today });
    await p.refresh();
    today = DAY2;
    const r = await p.refresh();
    expect(r.outcomes.amfi).toBe("unchanged");
    expect(calls.slice(UNIVERSE_KINDS.length).map((c) => c.inm)).toEqual(
      UNIVERSE_KINDS.map((k) => `"${k}1"`),
    );
    expect((await store.get("amfi"))?.checkedOn).toBe("2026-11-01");
    expect((await store.get("amfi"))?.universe.date).toBe("2026-10-30");
  });

  it("offline keeps the last good set and retries on the next trigger", async () => {
    const store = memoryPriceStore();
    let offline = false;
    let today = DAY1;
    const { fetcher, calls } = fakeFetch((kind) =>
      offline
        ? "offline"
        : {
            status: 200,
            body: file(kind, today === DAY1 ? "2026-10-30" : "2026-10-31"),
          },
    );
    const p = createPriceRefresher({ store, fetcher, now: () => today });
    await p.refresh();
    offline = true;
    today = DAY2;
    const r = await p.refresh();
    expect(Object.values(r.outcomes)).toEqual(
      UNIVERSE_KINDS.map(() => "failed"),
    );
    expect(toUniverses(await store.all()).nse?.date).toBe("2026-10-30");

    offline = false;
    const back = await p.refresh();
    expect(back.outcomes.nse).toBe("updated");
    expect(toUniverses(await store.all()).nse?.date).toBe("2026-10-31");
    expect(calls).toHaveLength(UNIVERSE_KINDS.length * 3);
  });

  it("asks once about a kind the server has no file for, and rejects a bad file", async () => {
    const store = memoryPriceStore();
    const { fetcher, calls } = fakeFetch((kind) =>
      kind === "metal"
        ? { status: 404 }
        : kind === "crypto"
          ? { status: 200, body: { ...file("fx", "2026-10-30") } }
          : kind === "us"
            ? { status: 200, body: { kind: "us", prices: "nope" } }
            : { status: 200, body: file(kind, "2026-10-30") },
    );
    const p = createPriceRefresher({ store, fetcher, now: () => DAY1 });
    const r = await p.refresh();
    expect(r.outcomes).toMatchObject({
      metal: "missing",
      crypto: "failed",
      us: "failed",
      amfi: "updated",
    });
    expect(await store.get("crypto")).toBeUndefined();
    await p.refresh();
    // Only the two failures are asked again.
    expect(calls.slice(UNIVERSE_KINDS.length).map((c) => c.url)).toEqual([
      "/api/prices/universe/us/latest",
      "/api/prices/universe/crypto/latest",
    ]);
  });

  it("never replaces a newer file with an older one", async () => {
    const store = memoryPriceStore();
    await store.put({
      kind: "fx",
      universe: file("fx", "2026-10-31"),
      etag: null,
      checkedOn: "2026-10-31",
    });
    await store.put({
      kind: "fx",
      universe: file("fx", "2026-10-30"),
      etag: null,
      checkedOn: "2026-11-01",
    });
    expect(await store.get("fx")).toMatchObject({
      checkedOn: "2026-11-01",
      universe: { date: "2026-10-31" },
    });
  });
});
