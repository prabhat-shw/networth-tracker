/**
 * Instrument search over the device's cached universes (#170). Pure: it reads only what is
 * already downloaded, so picking a holding never sends its name or code anywhere (ADR-0005).
 */
import { normaliseCode, type UniverseKind, type Universes } from "./universe";

export type InstrumentSource = Exclude<UniverseKind, "fx" | "metal">;

export interface Match {
  source: InstrumentSource;
  code: string;
  name?: string;
  price: string;
  currency: string;
}

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Up to `limit` instruments in `sources` matching `query`: an exact code first, then codes
 * starting with it, then names containing every word. Ties keep the universe's order.
 */
export function searchUniverse(
  universes: Universes,
  sources: readonly InstrumentSource[],
  query: string,
  limit = 8,
): Match[] {
  const q = query.trim();
  if (!q) return [];
  const code = normaliseCode(q);
  const want = words(q);
  const ranked: { rank: number; m: Match }[] = [];
  for (const source of sources) {
    const u = universes[source];
    if (!u) continue;
    for (const c of Object.keys(u.prices)) {
      const name = u.names?.[c];
      const rank =
        c === code
          ? 0
          : c.startsWith(code)
            ? 1
            : name && want.every((w) => name.toLowerCase().includes(w))
              ? 2
              : -1;
      if (rank < 0) continue;
      ranked.push({
        rank,
        m: { source, code: c, name, price: u.prices[c], currency: u.currency },
      });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.m);
}
