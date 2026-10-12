/**
 * Record codec (ADR-0045, ADR-0047): a record's plaintext is JSON, padded to whole 256-byte
 * blocks so its length hints nothing about its type, and sealed under the household data key
 * with AAD `recordAad(id, version)`. `deleted` is sealed inside as well, so a server that flips
 * the envelope's plain `deleted` flag is caught. Every decode failure is a `DecryptError`.
 */
import { DecryptError, open, parseEnvelope, recordAad, seal } from "./aead";
import type { HouseholdKey } from "./household";
import type { Bytes } from "./kdf";

export const PAD_BLOCK = 256;
const PAD_MARK = 0x80;
const FORMAT = 1;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_LC =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TYPE_CHARS = 64;

/** What a member edits. `modifiedAt` is the client's clock (`Date#toISOString`), ms precision. */
export interface RecordContent {
  type: string;
  schemaVersion: number;
  data: unknown;
  modifiedAt: string;
  /** The editing member's user id; breaks `modifiedAt` ties (ADR-0045). */
  modifiedBy: string;
}

/** A decrypted record, in memory only. */
export interface PlainRecord extends RecordContent {
  id: string;
  version: number;
  deleted: boolean;
}

/** The sealed form exchanged with the store and the server. */
export interface SealedRecord {
  id: string;
  version: number;
  deleted: boolean;
  ciphertext: Bytes;
}

/** ISO/IEC 7816-4 padding: `0x80`, then zeros, up to the next multiple of 256 (always ≥ 1 byte). */
export function pad(bytes: Bytes): Bytes {
  const out = new Uint8Array(
    (Math.floor(bytes.length / PAD_BLOCK) + 1) * PAD_BLOCK,
  );
  out.set(bytes);
  out[bytes.length] = PAD_MARK;
  return out;
}

/** Inverse of `pad`; throws `DecryptError` on anything `pad` could not have produced. */
export function unpad(bytes: Bytes): Bytes {
  if (bytes.length === 0 || bytes.length % PAD_BLOCK !== 0)
    throw new DecryptError();
  let i = bytes.length - 1;
  while (i >= 0 && bytes[i] === 0) i--;
  if (i < 0 || bytes[i] !== PAD_MARK || bytes.length - i > PAD_BLOCK)
    throw new DecryptError();
  return bytes.slice(0, i);
}

function checkContent(c: RecordContent): boolean {
  return (
    typeof c.type === "string" &&
    c.type.length > 0 &&
    c.type.length <= MAX_TYPE_CHARS &&
    Number.isSafeInteger(c.schemaVersion) &&
    c.schemaVersion >= 1 &&
    typeof c.modifiedAt === "string" &&
    ISO_MS.test(c.modifiedAt) &&
    !Number.isNaN(Date.parse(c.modifiedAt)) &&
    typeof c.modifiedBy === "string" &&
    UUID_LC.test(c.modifiedBy)
  );
}

export async function encodeRecord(
  hdk: HouseholdKey,
  record: PlainRecord,
): Promise<SealedRecord> {
  const { id, version, deleted, ...content } = record;
  if (!checkContent(content)) throw new Error("invalid record content");
  const json = JSON.stringify({
    f: FORMAT,
    deleted,
    type: content.type,
    schemaVersion: content.schemaVersion,
    data: content.data ?? null,
    modifiedAt: content.modifiedAt,
    modifiedBy: content.modifiedBy,
  });
  const plaintext = pad(new TextEncoder().encode(json));
  const ciphertext = await seal(
    hdk.key,
    plaintext,
    recordAad(id, version),
    hdk.kid,
  );
  return { id, version, deleted, ciphertext };
}

/**
 * Opens a sealed record. `knownVersion` is the highest version this device already holds for
 * the id: anything older is a replay and is refused, even though it would decrypt.
 */
export async function decodeRecord(
  hdk: HouseholdKey,
  sealed: SealedRecord,
  knownVersion = 0,
): Promise<PlainRecord> {
  const { id, version, deleted } = sealed;
  if (!Number.isSafeInteger(version) || version < 1 || version < knownVersion)
    throw new DecryptError();
  let aad: Bytes;
  try {
    aad = recordAad(id, version);
  } catch {
    throw new DecryptError();
  }
  // GCM does not authenticate the envelope's kid (it is not in the AAD), so check it here.
  if (parseEnvelope(sealed.ciphertext).kid !== hdk.kid)
    throw new DecryptError();
  const plaintext = unpad(await open(hdk.key, sealed.ciphertext, aad));
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
  } catch {
    throw new DecryptError();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new DecryptError();
  const content = {
    type: body.type,
    schemaVersion: body.schemaVersion,
    data: body.data,
    modifiedAt: body.modifiedAt,
    modifiedBy: body.modifiedBy,
  } as RecordContent;
  if (body.f !== FORMAT || body.deleted !== deleted || !checkContent(content))
    throw new DecryptError();
  return { id, version, deleted, ...content };
}
