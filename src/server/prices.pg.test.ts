// Price store contract (ADR-0064, #166) against real Postgres (PGlite + committed migrations).
import { gunzipSync } from "node:zlib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FeedResult, Universe } from "@/domain/prices/universe";
import { priceUniverses } from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { Db } from "./guard";
import { ingest, serveUniverse } from "./prices";

const AT = "2026-10-30T18:00:00.000Z";

const fx = (date: string, prices: Record<string, string>): Universe => ({
  kind: "fx",
  date,
  fetchedAt: AT,
  source: "test",
  currency: "INR",
  prices,
});

const many = (n: number, price = "10") =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`C${i}`, price]));

let db: Db;
beforeAll(async () => {
  db = (await migratedDb()) as unknown as Db;
}, 60_000);
beforeEach(async () => {
  await db.delete(priceUniverses);
});

const feed = (u: Universe | Error) => async (): Promise<FeedResult> => {
  if (u instanceof Error) throw u;
  return { universe: u, skipped: 2 };
};
const run = (u: Universe | Error, date = "2026-10-30") =>
  ingest({ db, fetchUniverse: feed(u) }, "fx", date);
const rows = () => db.select().from(priceUniverses);

describe("ingest", () => {
  it("stores a universe gzipped, with its count", async () => {
    const r = await run(fx("2026-10-30", many(10)));
    expect(r).toEqual({
      kind: "fx",
      status: "stored",
      date: "2026-10-30",
      count: 10,
      skipped: 2,
      flagged: [],
    });
    const [row] = await rows();
    expect(row).toMatchObject({
      kind: "fx",
      date: "2026-10-30",
      count: 10,
      flagged: 0,
    });
    expect(JSON.parse(gunzipSync(row.gzip).toString()).prices.C3).toBe("10");
  });

  it("rejects a file with under half the previous codes and keeps the last good one", async () => {
    await run(fx("2026-10-29", many(10)));
    expect(await run(fx("2026-10-30", many(4)))).toEqual({
      kind: "fx",
      status: "rejected",
      date: "2026-10-30",
      count: 4,
      previous: 10,
    });
    expect((await run(fx("2026-10-30", many(5)))).status).toBe("stored");
    expect((await rows()).map((r) => r.date).sort()).toEqual([
      "2026-10-29",
      "2026-10-30",
    ]);
  });

  it("flags moves over 50% either way but stores them", async () => {
    await run(fx("2026-10-29", { A: "100", B: "100", C: "100", D: "100" }));
    const r = await run(
      fx("2026-10-30", { A: "150", B: "150.01", C: "49.99", D: "50", E: "1" }),
    );
    expect(r).toMatchObject({ status: "stored", flagged: ["B", "C"] });
    const [today] = (await rows()).filter((x) => x.date === "2026-10-30");
    expect(today.flagged).toBe(2);
  });

  it("writes nothing when the fetch fails or the file is malformed", async () => {
    await run(fx("2026-10-29", many(3)));
    expect(await run(new Error("api.frankfurter.dev answered 503"))).toEqual({
      kind: "fx",
      status: "failed",
      error: "api.frankfurter.dev answered 503",
    });
    expect((await run(fx("not-a-date", many(3)))).status).toBe("failed");
    expect(
      (await run({ ...fx("2026-10-30", many(3)), kind: "us" })).status,
    ).toBe("failed");
    expect(await rows()).toHaveLength(1);
  });

  it("replaces a same-day file on retry and drops files over 400 days old", async () => {
    await run(fx("2025-09-24", many(3)));
    await run(fx("2025-09-26", many(3)));
    await run(fx("2026-10-30", many(3, "1")));
    await run(fx("2026-10-30", many(3, "1.2")));
    const all = await rows();
    expect(all.map((r) => r.date).sort()).toEqual(["2025-09-26", "2026-10-30"]);
    const today = all.find((r) => r.date === "2026-10-30");
    expect(
      JSON.parse(gunzipSync(today?.gzip ?? new Uint8Array()).toString()).prices
        .C0,
    ).toBe("1.2");
  });
});

describe("GET /api/prices/universe/:kind/:date", () => {
  const signedIn = (id: string | null) => ({
    db,
    sessionUser: async () => id,
    today: () => "2026-10-31",
  });
  const get = (
    who: string | null,
    kind: string,
    date: string,
    headers: Record<string, string> = { "accept-encoding": "gzip, br" },
  ) =>
    serveUniverse(
      signedIn(who),
      new Request(`https://nwt.example/api/prices/universe/${kind}/${date}`, {
        headers,
      }),
      kind,
      date,
    );

  beforeEach(async () => {
    await run(fx("2026-10-29", many(3, "1")));
    await run(fx("2026-10-31", many(3, "2")));
  });

  it("needs a session, then answers every caller with the same bytes", async () => {
    expect((await get(null, "fx", "latest")).status).toBe(401);
    const a = await get("user-a", "fx", "latest");
    const b = await get("user-b", "fx", "latest");
    expect(a.status).toBe(200);
    expect(a.headers.get("content-encoding")).toBe("gzip");
    expect(a.headers.get("content-type")).toBe("application/json");
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
    const [ba, bb] = [
      new Uint8Array(await a.arrayBuffer()),
      new Uint8Array(await b.arrayBuffer()),
    ];
    expect(ba).toEqual(bb);
    expect(JSON.parse(gunzipSync(ba).toString())).toMatchObject({
      kind: "fx",
      date: "2026-10-31",
    });
  });

  it("caches a past day forever and revalidates today's or the latest", async () => {
    const past = await get("u", "fx", "2026-10-29");
    expect(past.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    const today = await get("u", "fx", "2026-10-31");
    expect(today.headers.get("cache-control")).toBe("private, no-cache");
    expect((await get("u", "fx", "latest")).headers.get("cache-control")).toBe(
      "private, no-cache",
    );
  });

  it("answers 304 to a matching If-None-Match", async () => {
    const etag = (await get("u", "fx", "latest")).headers.get("etag") ?? "";
    const r = await get("u", "fx", "latest", {
      "if-none-match": `"x", ${etag}`,
    });
    expect(r.status).toBe(304);
    expect(r.headers.get("etag")).toBe(etag);
  });

  it("serves plain JSON to a client that doesn't take gzip", async () => {
    const r = await get("u", "fx", "2026-10-29", {});
    expect(r.headers.get("content-encoding")).toBe(null);
    expect((await r.json()).prices.C0).toBe("1");
  });

  it("answers 404 for an unknown kind or a missing day, 400 for a bad date", async () => {
    expect((await get("u", "stocks", "latest")).status).toBe(404);
    expect((await get("u", "amfi", "latest")).status).toBe(404);
    expect((await get("u", "fx", "2026-10-30")).status).toBe(404);
    expect((await get("u", "fx", "2026-13-45")).status).toBe(400);
    expect((await get("u", "fx", "yesterday")).status).toBe(400);
  });
});
