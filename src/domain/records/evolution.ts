/**
 * Reading a decrypted record into a typed value, across schema versions (ADR-0051).
 *
 * Every device in a household runs its own build, so a record can arrive from a newer app
 * (a higher `schemaVersion`, or a `type` this build has never heard of). Those are kept
 * as they are and never overwritten: saving one would rewrite it in an older shape and
 * erase what the newer app added. Older versions are upgraded in memory by pure functions;
 * the upgraded shape is only written back when the member next saves that record.
 */
import type { ZodType } from "zod";

/** The envelope `type`s. Each kind lives in `data.kind` (ADR-0051). */
export const RECORD_TYPES = [
  "member",
  "asset",
  "liability",
  "goal",
  "transaction",
  "snapshot",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** One type's current schema and the steps that bring older data up to it. */
export interface TypeCodec<T> {
  /** The `schemaVersion` this build writes. */
  current: number;
  schema: ZodType<T>;
  /** `upgrades[v]` turns version `v` data into version `v + 1`, for every `v < current`. */
  upgrades: Readonly<Record<number, (data: unknown) => unknown>>;
}

export type Registry = Partial<Record<string, TypeCodec<unknown>>>;

/** What `readRecord` needs from a decrypted record (`PlainRecord` satisfies it). */
export interface StoredData {
  type: string;
  schemaVersion: number;
  data: unknown;
}

export type ReadResult<T = unknown> =
  /** Parsed. `upgraded` means it was stored at an older version than `current`. */
  | { status: "ok"; value: T; upgraded: boolean }
  /** A type this build has no codec for. */
  | { status: "unknown-type" }
  /** Written by a newer app: shown as "needs a newer app version". */
  | { status: "too-new"; schemaVersion: number }
  /** Claims a known version but doesn't match it: the UI shows an error row. `issues` name
   * paths and rules only, never values, but stay on screen: never log or send them. */
  | { status: "invalid"; issues: string[] };

export function readRecord(registry: Registry, record: StoredData): ReadResult {
  const codec = Object.hasOwn(registry, record.type)
    ? registry[record.type]
    : undefined;
  if (!codec) return { status: "unknown-type" };
  if (record.schemaVersion > codec.current)
    return { status: "too-new", schemaVersion: record.schemaVersion };

  let data = record.data;
  try {
    for (let v = record.schemaVersion; v < codec.current; v++) {
      const step = codec.upgrades[v];
      if (!step)
        return { status: "invalid", issues: [`no upgrade from v${v}`] };
      data = step(data);
    }
  } catch {
    return { status: "invalid", issues: ["upgrade failed"] };
  }

  const parsed = codec.schema.safeParse(data);
  if (!parsed.success)
    return {
      status: "invalid",
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  return {
    status: "ok",
    value: parsed.data,
    upgraded: record.schemaVersion < codec.current,
  };
}

/**
 * Whether this build may save over the record. Only a record it fully understood: a newer
 * or unknown one would lose data, and an invalid one is shown for the member to fix or
 * delete (deleting is always allowed; it writes a tombstone and keeps no data).
 */
export function canOverwrite(result: ReadResult): boolean {
  return result.status === "ok";
}
