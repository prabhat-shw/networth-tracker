// Shared by the Add anything browser tests: an in-memory household sync and its mount.
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { Universes } from "@/domain/prices/universe";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { AddAnything } from "./add-anything";

const NO_PRICES: Universes = {};

export const ASHA = "0a000000-0000-4000-8000-0000000000a1";
export const BALA = "0b000000-0000-4000-8000-0000000000b1";

/** Bala's self-written profile, so the split control can name them. */
export const balaProfile: PlainRecord = {
  id: "1b000000-0000-4000-8000-0000000000b1",
  version: 1,
  deleted: false,
  type: "member",
  schemaVersion: 1,
  data: { memberId: BALA, name: "Bala" },
  modifiedAt: "2026-10-29T00:00:00.000Z",
  modifiedBy: BALA,
};

/** An in-memory sync: writes land in `records` and notify, like the real handle. */
export function fakeSync(
  initial: PlainRecord[] = [],
  universes: Universes = NO_PRICES,
) {
  let records = initial;
  const listeners = new Set<() => void>();
  const sync: HouseholdSync = {
    householdId: "h",
    userId: ASHA,
    records: () => records,
    async write(id, type, data, deleted = false, schemaVersion = 1) {
      const record: PlainRecord = {
        id,
        version: 1,
        deleted,
        type,
        schemaVersion,
        data,
        modifiedAt: new Date().toISOString(),
        modifiedBy: ASHA,
      };
      records = [...records.filter((r) => r.id !== id), record];
      for (const l of listeners) l();
      return record;
    },
    status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
    universes: () => universes,
    sync: async () => ({}) as never,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    stop() {},
  };
  return { sync, saved: () => records.filter((r) => r.type !== "member") };
}

export const mount = (sync: HouseholdSync, ui = <AddAnything />) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      {ui}
    </SyncProvider>,
  );
