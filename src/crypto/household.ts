/**
 * Household data key (ADR-0002, ADR-0019). One random AES-256-GCM HDK per household, wrapped
 * separately to each member's identity public key. The server stores and relays the wrapped
 * blobs; it can neither read nor forge them.
 *
 * Wrap blob bytes: [0x01][senderPub:65][salt:16][kidLen:u8][kid utf8][AES-KW(HDK):40]
 * KEK = AES-KW( HKDF-SHA-256( ECDH(sender, recipient), salt,
 *                             "nwt/hdk-wrap/v1|<householdId>|<kid>|" ‖ senderPub ‖ recipientPub ) )
 */
import { DecryptError } from "./aead";
import { type Bytes, randomBytes } from "./kdf";
import {
  deriveWrappingKey,
  exportPublicKey,
  generateDataKey,
  importPublicKey,
  unwrapDataKey,
  wrapDataKey,
} from "./keys";
import type { UnlockedIdentity } from "./vault";

const FORMAT_V1 = 0x01;
const PUB_BYTES = 65;
const SALT_BYTES = 16;
const WRAPPED_BYTES = 40;
const MAX_KID_BYTES = 255;

/** First HDK of a household. A rotation (later milestone) issues `hdk:2`, `hdk:3`, … */
export const FIRST_KID = "hdk:1";

/** Decrypted, in memory only. `kid` goes into every record envelope sealed with `key`. */
export interface HouseholdKey {
  householdId: string;
  kid: string;
  key: CryptoKey;
}

function wrapInfo(
  householdId: string,
  kid: string,
  senderPub: Bytes,
  recipientPub: Bytes,
): Bytes {
  if (householdId.includes("|") || kid.includes("|"))
    throw new Error("ids must not contain '|'");
  const label = new TextEncoder().encode(
    `nwt/hdk-wrap/v1|${householdId}|${kid}|`,
  );
  const info = new Uint8Array(label.length + PUB_BYTES * 2);
  info.set(label);
  info.set(senderPub, label.length);
  info.set(recipientPub, label.length + PUB_BYTES);
  return info;
}

/** New household with a fresh HDK, plus the blob that wraps it to its creator. */
export async function createHousehold(
  creator: UnlockedIdentity,
  householdId: string = crypto.randomUUID(),
): Promise<{ household: HouseholdKey; selfWrap: Bytes }> {
  const household = {
    householdId,
    kid: FIRST_KID,
    key: await generateDataKey(),
  };
  const selfWrap = await wrapHouseholdKey(
    creator,
    household,
    await exportPublicKey(creator.publicKey),
  );
  return { household, selfWrap };
}

/**
 * Wraps the HDK to a member's public key (an invite, or the creator's own copy). Check the
 * recipient's `keyFingerprint` out of band first: the server chose which key you were given.
 */
export async function wrapHouseholdKey(
  sender: UnlockedIdentity,
  household: HouseholdKey,
  recipientPublicKey: Bytes,
): Promise<Bytes> {
  const kid = new TextEncoder().encode(household.kid);
  if (kid.length > MAX_KID_BYTES) throw new Error("kid too long");
  const senderPub = await exportPublicKey(sender.publicKey);
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveWrappingKey(
    sender.privateKey,
    await importPublicKey(recipientPublicKey),
    salt,
    wrapInfo(
      household.householdId,
      household.kid,
      senderPub,
      recipientPublicKey,
    ),
  );
  const wrapped = await wrapDataKey(kek, household.key);
  const out = new Uint8Array(
    1 + PUB_BYTES + SALT_BYTES + 1 + kid.length + wrapped.length,
  );
  out[0] = FORMAT_V1;
  out.set(senderPub, 1);
  out.set(salt, 1 + PUB_BYTES);
  out[1 + PUB_BYTES + SALT_BYTES] = kid.length;
  out.set(kid, 2 + PUB_BYTES + SALT_BYTES);
  out.set(wrapped, 2 + PUB_BYTES + SALT_BYTES + kid.length);
  return out;
}

/**
 * Accept-invite / unlock: unwraps a blob addressed to `recipient`. Returns the sender's
 * public key so the caller can compare it with the fingerprint the inviter showed.
 * Throws `DecryptError` for a blob meant for someone else, another household, or tampered.
 */
export async function unwrapHouseholdKey(
  recipient: UnlockedIdentity,
  householdId: string,
  blob: Bytes,
): Promise<{ household: HouseholdKey; senderPublicKey: Bytes }> {
  const kidAt = 2 + PUB_BYTES + SALT_BYTES;
  if (blob.length < kidAt || blob[0] !== FORMAT_V1) throw new DecryptError();
  const kidLen = blob[kidAt - 1];
  if (blob.length !== kidAt + kidLen + WRAPPED_BYTES) throw new DecryptError();
  const senderPublicKey = blob.slice(1, 1 + PUB_BYTES);
  const salt = blob.slice(1 + PUB_BYTES, kidAt - 1);
  const kid = new TextDecoder().decode(blob.subarray(kidAt, kidAt + kidLen));
  try {
    const kek = await deriveWrappingKey(
      recipient.privateKey,
      await importPublicKey(senderPublicKey),
      salt,
      wrapInfo(
        householdId,
        kid,
        senderPublicKey,
        await exportPublicKey(recipient.publicKey),
      ),
    );
    const key = await unwrapDataKey(kek, blob.slice(kidAt + kidLen));
    return { household: { householdId, kid, key }, senderPublicKey };
  } catch {
    throw new DecryptError();
  }
}

/**
 * Safety number for comparing a public key in person or over a call: SHA-256, first 80 bits,
 * as five groups of four hex digits. Defeats a server that swaps in its own key.
 */
export async function keyFingerprint(publicKey: Bytes): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", publicKey),
  );
  const hex = Array.from(digest.subarray(0, 10), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return hex.match(/.{4}/g)?.join(" ") ?? hex;
}
