/**
 * The typed view over decrypted records (ADR-0054). Reads fail soft per record: one bad or
 * newer record becomes an error entry in its own list and never hides the rest. Writes are
 * validated here first, so nothing invalid reaches `sync.write`, and a record this build
 * couldn't fully read is never saved over (ADR-0051).
 */
import type { AssetData } from "./asset";
import { BALANCE_SHEET_CODECS } from "./catalogue";
import { allocationsFit } from "./common";
import {
  canOverwrite,
  type ReadResult,
  type Registry,
  readRecord,
  type StoredData,
} from "./evolution";
import { GOAL_CODEC, type GoalData } from "./goal";
import type { LiabilityData } from "./liability";
import { MEMBER_CODEC, type MemberData } from "./member";

export const RECORD_CODECS = {
  ...BALANCE_SHEET_CODECS,
  goal: GOAL_CODEC,
  member: MEMBER_CODEC,
} satisfies Registry;

export interface TypeData {
  asset: AssetData;
  liability: LiabilityData;
  goal: GoalData;
  member: MemberData;
}
export type KnownType = keyof TypeData;

/** What the typed layer needs from a decrypted record (`PlainRecord` satisfies it). */
export interface StoredRecord extends StoredData {
  id: string;
  modifiedAt: string;
  modifiedBy: string;
}

export interface Entry<T> {
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  result: ReadResult<T>;
}

export interface TypedRecords {
  asset: Entry<AssetData>[];
  liability: Entry<LiabilityData>[];
  goal: Entry<GoalData>[];
  member: Entry<MemberData>[];
  /** Types this build doesn't know: kept and shown, never written. */
  unknown: Entry<never>[];
  /** Display profiles by member id: the latest valid self-written profile wins. */
  profiles: ReadonlyMap<string, MemberData>;
}

const isKnown = (type: string): type is KnownType =>
  Object.hasOwn(RECORD_CODECS, type);

function read(record: StoredRecord): ReadResult {
  const result = readRecord(RECORD_CODECS, record);
  if (
    result.status === "ok" &&
    record.type === "member" &&
    (result.value as MemberData).memberId !== record.modifiedBy
  )
    return {
      status: "invalid",
      issues: ["memberId: written by another member"],
    };
  return result;
}

export function typeRecords(records: readonly StoredRecord[]): TypedRecords {
  const out: TypedRecords = {
    asset: [],
    liability: [],
    goal: [],
    member: [],
    unknown: [],
    profiles: new Map(),
  };
  const latest = new Map<string, Entry<MemberData>>();
  for (const r of records) {
    const entry = {
      id: r.id,
      modifiedAt: r.modifiedAt,
      modifiedBy: r.modifiedBy,
      result: read(r),
    };
    if (!isKnown(r.type)) {
      out.unknown.push(entry as Entry<never>);
      continue;
    }
    (out[r.type] as Entry<unknown>[]).push(entry);
    if (r.type !== "member" || entry.result.status !== "ok") continue;
    const seen = latest.get(r.modifiedBy);
    if (!seen || seen.modifiedAt < r.modifiedAt)
      latest.set(r.modifiedBy, entry as Entry<MemberData>);
  }
  out.profiles = new Map(
    [...latest].map(([id, e]) => [
      id,
      (e.result as { value: MemberData }).value,
    ]),
  );
  return out;
}

/** The member's own profile record, to update in place rather than add a second one. */
export function ownProfile(
  typed: TypedRecords,
  memberId: string,
): Entry<MemberData> | undefined {
  return typed.member
    .filter(
      (e) => e.result.status === "ok" && e.result.value.memberId === memberId,
    )
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))[0];
}

export class InvalidRecordError extends Error {
  /** Paths and rules only, never values: show them, never log or send them. */
  constructor(readonly issues: string[]) {
    super("invalid record");
  }
}

export interface PreparedWrite {
  type: KnownType;
  schemaVersion: number;
  data: unknown;
}

/**
 * Checks a save before it is sealed. `existing` is the record now stored under the same id,
 * if any: it must be the same type and one this build fully read. Throws `InvalidRecordError`.
 */
export function prepareWrite<K extends KnownType>(
  type: K,
  data: TypeData[K],
  existing?: StoredRecord,
): PreparedWrite {
  if (existing) {
    if (existing.type !== type)
      throw new InvalidRecordError(["(root): the record is another type"]);
    if (!canOverwrite(read(existing)))
      throw new InvalidRecordError([
        "(root): this record can't be edited here",
      ]);
  }
  const codec = RECORD_CODECS[type];
  const parsed = codec.schema.safeParse(data);
  if (!parsed.success)
    throw new InvalidRecordError(
      parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    );
  const value = parsed.data;
  if (
    (type === "asset" || type === "liability") &&
    !allocationsFit(
      (value as AssetData).allocations,
      (value as AssetData).value,
    )
  )
    throw new InvalidRecordError(["allocations: more than the value"]);
  return { type, schemaVersion: codec.current, data: value };
}
