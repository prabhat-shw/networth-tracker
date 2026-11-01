// M4 E2E price fixtures (#172). Universes go in through the real `ingest()` pipeline (the
// sanity checks included) with a stub feed in place of the network, so the throwaway stack
// never fetches a real price (PRICE_INGEST=off, ADR-0066).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Universe, UniverseKind } from "@/domain/prices/universe";
import * as schema from "@/server/db/schema";
import { ingest } from "@/server/prices";
import { E2E_ENV } from "./env";

/**
 * Held codes and their prices, chosen so each value lands on a half-paisa or half-rupee
 * edge: a value off by one paisa (truncation, a float, rounding twice) shows a different
 * whole rupee on screen. Hand-computed in the spec; never derived from app code.
 */
export const HELD = {
  mf: { code: "990001", nav: "9850" },
  us: { code: "NWTUS", price: "231.81" },
  nse: { code: "NWTNSE", price: "1523.83" },
  crypto: { code: "NWTBTC", price: "96500000" },
  usd: "84.2",
} as const;

const PRICES: Record<UniverseKind, [string, Record<string, string>]> = {
  amfi: [
    "INR",
    { [HELD.mf.code]: HELD.mf.nav, "990002": "12.3456", "990003": "101.5" },
  ],
  nse: ["INR", { [HELD.nse.code]: HELD.nse.price, NWTX: "10", NWTY: "20" }],
  bse: ["INR", { NWTB1: "55.5", NWTB2: "66.6", NWTB3: "77.7" }],
  us: ["USD", { [HELD.us.code]: HELD.us.price, NWTQ: "1.5", NWTR: "2.5" }],
  crypto: ["INR", { [HELD.crypto.code]: HELD.crypto.price, NWTE: "250000" }],
  fx: ["INR", { USD: HELD.usd, EUR: "91.05", GBP: "108.4" }],
  metal: ["INR", { gold999: "7650.25", silver999: "95.4" }],
};

const KINDS = Object.keys(PRICES) as UniverseKind[];

export function fixture(
  kind: UniverseKind,
  date: string,
  prices = PRICES[kind][1],
): Universe {
  return {
    kind,
    date,
    // Fetched that evening: over 36 h before "now" once `date` is three days back.
    fetchedAt: `${date}T18:00:00.000Z`,
    source: "e2e fixture",
    currency: PRICES[kind][0],
    prices,
  };
}

function priceDb() {
  const client = postgres(E2E_ENV.DATABASE_URL, { max: 1, onnotice: () => {} });
  return { db: drizzle(client, { schema }), end: () => client.end() };
}

/** Ingests `files` (one per kind) through the real pipeline; returns each result. */
export async function ingestFixtures(files: Universe[]) {
  const { db, end } = priceDb();
  try {
    const out = [];
    for (const u of files)
      out.push(
        await ingest(
          { db, fetchUniverse: async () => ({ universe: u, skipped: 0 }) },
          u.kind,
          u.date,
        ),
      );
    return out;
  } finally {
    await end();
  }
}

/** Every kind's fixture for `date`. */
export const allFixtures = (date: string) =>
  KINDS.map((kind) => fixture(kind, date));

/** The IST calendar date `days` before today. */
export const istDaysAgo = (days: number) =>
  new Date(Date.now() + 19_800_000 - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
