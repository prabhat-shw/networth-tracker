/**
 * The device's copy of the public price universes (ADR-0067, #168), in IndexedDB via Dexie.
 * One row per kind: the newest good file, its ETag, and the price day it was last checked.
 * Public data, the same bytes for every household, so it lives in its own database, is
 * shared by every household on the device, and is never cleared on lock or sign-out.
 */
import Dexie, { type EntityTable } from "dexie";
import type {
  Universe,
  UniverseKind,
  Universes,
} from "@/domain/prices/universe";

export const PRICE_DB_NAME = "nwt-prices";

export interface StoredUniverse {
  kind: UniverseKind;
  universe: Universe;
  etag: string | null;
  /** The price day (`priceDay`) of the last answer from the server, 200 or 304. */
  checkedOn: string;
}

type PricesDb = Dexie & { universes: EntityTable<StoredUniverse, "kind"> };

let shared: PricesDb | null = null;

function db(): PricesDb {
  if (shared) return shared;
  const d = new Dexie(PRICE_DB_NAME) as PricesDb;
  d.version(1).stores({ universes: "kind" });
  shared = d;
  return d;
}

export interface PriceStore {
  all(): Promise<StoredUniverse[]>;
  get(kind: UniverseKind): Promise<StoredUniverse | undefined>;
  /** Saves a downloaded file; one older than the stored file only refreshes `checkedOn`. */
  put(row: StoredUniverse): Promise<void>;
  /** Marks a kind checked (a `304`). */
  touch(kind: UniverseKind, checkedOn: string): Promise<void>;
}

/** The universes as a lookup map, for valuation. */
export const toUniverses = (rows: StoredUniverse[]): Universes =>
  Object.fromEntries(rows.map((r) => [r.kind, r.universe]));

export function priceStore(): PriceStore {
  const d = db();
  return {
    all: () => d.universes.toArray(),
    get: (kind) => d.universes.get(kind),
    put: (row) =>
      d.transaction("rw", d.universes, async () => {
        const cur = await d.universes.get(row.kind);
        if (cur && cur.universe.date > row.universe.date)
          await d.universes.put({ ...cur, checkedOn: row.checkedOn });
        else await d.universes.put(row);
      }),
    touch: (kind, checkedOn) =>
      d.universes.update(kind, { checkedOn }).then(() => {}),
  };
}

/** In memory, for tests and for a browser without IndexedDB. */
export function memoryPriceStore(): PriceStore {
  const rows = new Map<UniverseKind, StoredUniverse>();
  return {
    all: async () => [...rows.values()],
    get: async (kind) => rows.get(kind),
    async put(row) {
      const cur = rows.get(row.kind);
      rows.set(
        row.kind,
        cur && cur.universe.date > row.universe.date
          ? { ...cur, checkedOn: row.checkedOn }
          : row,
      );
    },
    async touch(kind, checkedOn) {
      const cur = rows.get(kind);
      if (cur) rows.set(kind, { ...cur, checkedOn });
    },
  };
}
