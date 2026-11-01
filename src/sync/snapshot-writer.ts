/**
 * Writes the household's daily snapshot (ADR-0070, #171). After a sync run that succeeded,
 * so this device has pulled any snapshot another device already wrote today, it derives
 * today's id from the HDK and writes the record only if none exists. Two devices racing
 * write the same id; the engine's last-write-wins keeps one (later `modifiedAt`, then the
 * greater `modifiedBy`, ADR-0045). Their figures differ by at most a price refresh.
 */
import type { HouseholdKey } from "@/crypto/household";
import type { PlainRecord } from "@/crypto/record-codec";
import { snapshotId, snapshotIdKey } from "@/crypto/snapshot-id";
import type { Universes } from "@/domain/prices/universe";
import type { AssetData } from "@/domain/records/asset";
import type { LiabilityData } from "@/domain/records/liability";
import { buildSnapshot, istDate } from "@/domain/records/snapshot";
import { prepareWrite, typeRecords } from "@/domain/records/typed";

export type SnapshotOutcome = "written" | "exists" | "skipped";

export interface SnapshotWriterOptions {
  userId: string;
  hdk: () => HouseholdKey | null;
  records: () => PlainRecord[];
  /** The cached price universes, read fresh so today's refresh is included. */
  universes: () => Promise<Universes>;
  write: (
    id: string,
    type: string,
    data: unknown,
    deleted: boolean,
    schemaVersion: number,
  ) => Promise<unknown>;
  now?: () => Date;
}

const ok = <T>(list: { result: { status: string; value?: T } }[]): T[] =>
  list.flatMap((e) => (e.result.status === "ok" ? [e.result.value as T] : []));

export function createSnapshotWriter({
  userId,
  hdk,
  records,
  universes,
  write,
  now = () => new Date(),
}: SnapshotWriterOptions) {
  let doneOn: string | null = null;
  let derived: { hk: HouseholdKey; key: Promise<CryptoKey> } | null = null;
  let inflight: Promise<SnapshotOutcome> | null = null;

  const idFor = (hk: HouseholdKey, date: string) => {
    if (derived?.hk !== hk) derived = { hk, key: snapshotIdKey(hk) };
    return derived.key.then((key) => snapshotId(key, date));
  };

  async function run(): Promise<SnapshotOutcome> {
    const at = now();
    const date = istDate(at);
    if (doneOn === date) return "exists";
    const hk = hdk();
    if (!hk) return "skipped";
    const id = await idFor(hk, date);
    if (records().some((r) => r.id === id)) {
      doneOn = date;
      return "exists";
    }
    const typed = typeRecords(records());
    const assets = ok<AssetData>(typed.asset);
    const liabilities = ok<LiabilityData>(typed.liability);
    // Nothing to record yet: the timeline starts with the first real figure.
    if (assets.length + liabilities.length === 0) return "skipped";
    const members = [
      userId,
      ...[...typed.profiles.keys()].filter((m) => m !== userId),
    ];
    const data = buildSnapshot(
      assets,
      liabilities,
      await universes(),
      members,
      at,
    );
    const w = prepareWrite("snapshot", data);
    // The session may have locked while prices loaded: never write under a stale key.
    if (hdk() !== hk) return "skipped";
    await write(id, w.type, w.data, false, w.schemaVersion);
    doneOn = date;
    return "written";
  }

  return {
    /** Writes today's snapshot if no device has; shares a run already in flight. */
    maybeWrite(): Promise<SnapshotOutcome> {
      inflight ??= run().finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}
