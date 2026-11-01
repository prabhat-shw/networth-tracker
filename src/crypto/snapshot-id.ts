/**
 * Daily snapshot ids (ADR-0064 §8, ADR-0070). Every device in a household derives the same
 * record id for a date, so the first two devices to snapshot that day write one record
 * between them. The server only sees an id that looks random and gives away no date.
 *
 * The HDK is never exported. AES-GCM over 32 zero bytes with a fixed, labelled IV returns the
 * AES-CTR keystream for that IV: a PRF of the HDK. HKDF turns it into a non-extractable
 * HMAC-SHA-256 key, and the id is the HMAC of the date, formatted as a UUIDv8.
 */
import type { HouseholdKey } from "./household";
import { hkdf } from "./keys";

const enc = new TextEncoder();
/** 12 bytes, used only here. Record IVs are random, so a clash has odds of about 2⁻⁹⁶. */
const PRF_IV = enc.encode("nwt/snapid/1");
const INFO = enc.encode("nwt/snapshot-id/v1");

/** The household's snapshot-id key. Derive it once per unlocked session; never export it. */
export async function snapshotIdKey(hdk: HouseholdKey): Promise<CryptoKey> {
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: PRF_IV },
      hdk.key,
      new Uint8Array(32),
    ),
  );
  const ikm = sealed.slice(0, 32);
  sealed.fill(0);
  try {
    const okm = await hkdf(ikm, enc.encode(hdk.householdId), INFO, 32);
    try {
      return await crypto.subtle.importKey(
        "raw",
        okm,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } finally {
      okm.fill(0);
    }
  } finally {
    ikm.fill(0);
  }
}

const hex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** The record id of the snapshot for `date` (`YYYY-MM-DD`): a UUIDv8 from the HMAC. */
export async function snapshotId(
  key: CryptoKey,
  date: string,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("not a date");
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`snapshot|${date}`)),
  );
  const b = mac.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80; // version 8
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562 variant
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
