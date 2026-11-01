/**
 * Keeps the device's price universes current (ADR-0067, #168). Once per price day it asks
 * `/api/prices/universe/:kind/latest` for **every** kind, in a fixed order, whatever the
 * household holds: it never sees a record, so no request can name a holding (ADR-0005).
 * A `304` only marks the kind checked. A failure keeps the last good file and retries on the
 * next trigger, so offline the app values from what it already has.
 */
import type { PriceStore } from "@/db/price-store";
import {
  UNIVERSE_KINDS,
  type UniverseKind,
  universe,
} from "@/domain/prices/universe";

/**
 * The price day: the IST date, turning over at 07:30 IST, after the server's morning retry
 * (ADR-0066). One check per kind per price day picks up both of the server's runs.
 */
export const priceDay = (now: Date) =>
  new Date(now.getTime() - 2 * 3_600_000).toISOString().slice(0, 10);

export type KindOutcome =
  | "fresh"
  | "updated"
  | "unchanged"
  | "missing"
  | "failed";

export interface PriceRefreshResult {
  day: string;
  outcomes: Record<UniverseKind, KindOutcome>;
}

export interface PriceRefresher {
  /** Checks every kind not yet checked this price day; shares a run already in flight. */
  refresh(): Promise<PriceRefreshResult>;
}

export interface PriceRefreshOptions {
  store: PriceStore;
  fetcher?: typeof fetch;
  now?: () => Date;
  /** After a run that saved a newer file. */
  onUpdate?: () => void;
}

const url = (kind: UniverseKind) => `/api/prices/universe/${kind}/latest`;

export function createPriceRefresher({
  store,
  fetcher = (...a) => fetch(...a),
  now = () => new Date(),
  onUpdate,
}: PriceRefreshOptions): PriceRefresher {
  // Kinds answered this price day, including a 404 (no file on the server yet).
  const answered = new Map<UniverseKind, string>();
  let inflight: Promise<PriceRefreshResult> | null = null;

  const one = async (kind: UniverseKind, day: string): Promise<KindOutcome> => {
    if (answered.get(kind) === day) return "fresh";
    const row = await store.get(kind);
    if (row?.checkedOn === day) {
      answered.set(kind, day);
      return "fresh";
    }
    let res: Response;
    try {
      res = await fetcher(url(kind), {
        credentials: "same-origin",
        cache: "no-store",
        headers: row?.etag ? { "if-none-match": row.etag } : {},
      });
    } catch {
      return "failed";
    }
    if (res.status === 304 && row) {
      await store.touch(kind, day);
      answered.set(kind, day);
      return "unchanged";
    }
    if (res.status === 404) {
      answered.set(kind, day);
      return "missing";
    }
    if (!res.ok) return "failed";
    try {
      const u = universe.parse(await res.json());
      if (u.kind !== kind) return "failed";
      await store.put({
        kind,
        universe: u,
        etag: res.headers.get("etag"),
        checkedOn: day,
      });
    } catch {
      return "failed";
    }
    answered.set(kind, day);
    return "updated";
  };

  const run = async (day: string): Promise<PriceRefreshResult> => {
    const list = await Promise.all(UNIVERSE_KINDS.map((k) => one(k, day)));
    const outcomes = Object.fromEntries(
      UNIVERSE_KINDS.map((k, i) => [k, list[i]]),
    ) as Record<UniverseKind, KindOutcome>;
    if (list.includes("updated")) onUpdate?.();
    return { day, outcomes };
  };

  return {
    refresh() {
      inflight ??= run(priceDay(now())).finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}
