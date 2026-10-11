/**
 * Identity-vault relay (ADR-0022). The signed-in user stores and fetches their own vault so
 * a fresh browser profile can unlock with the passphrase or recovery code. The server
 * validates the shape (same bounded codec the client uses) but cannot open anything in it.
 * Since v3 (ADR-0038) it may hold no slot at all; the server reads only which slots exist.
 */
import { and, eq, not, sql } from "drizzle-orm";
import {
  decodeVault,
  encodeVault,
  hasRecoveryMethod,
  MAX_VAULT_JSON_BYTES,
  VaultFormatError,
  type VaultSlots,
  vaultSlots,
} from "@/crypto/wire";
import { identityVaults } from "./db/schema";
import { type Db, deny, type GuardDeps } from "./guard";

const fail = (status: 409 | 413 | 415, error: string) =>
  Response.json({ error }, { status });

export async function getVault(
  deps: GuardDeps,
  request: Request,
): Promise<Response> {
  const userId = await deps.sessionUser(request.headers);
  if (!userId) return deny(401);
  const [row] = await deps.db
    .select({ vault: identityVaults.vault })
    .from(identityVaults)
    .where(eq(identityVaults.userId, userId))
    .limit(1);
  if (!row) return deny(404);
  return new Response(row.vault, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Stored vaults are canonical JSON (re-encoded on write), where a slot's key is present
 * exactly when the slot exists (`encodeVault`). So this reads "the stored vault has a
 * recovery method" without decoding it, inside the upsert.
 */
const storedHasRecovery = sql`jsonb_exists_any(${identityVaults.vault}::jsonb, array['byPassphrase', 'byRecovery', 'passkeys'])`;

/**
 * Creates or replaces the caller's vault. The public key is fixed by the first upload; a
 * later upload with a different key is refused (409). An upload that would drop the last
 * recovery method of a vault that had one is refused too (409 `recovery-required`, ADR-0043,
 * #108). Both checks run atomically in the one upsert.
 */
export async function putVault(
  deps: GuardDeps,
  request: Request,
): Promise<Response> {
  const userId = await deps.sessionUser(request.headers);
  if (!userId) return deny(401);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return fail(415, "content-type must be application/json");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_VAULT_JSON_BYTES)
    return fail(413, "vault too large");

  let vault: ReturnType<typeof decodeVault>;
  try {
    vault = decodeVault(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof VaultFormatError)
      return deny(400);
    throw e;
  }
  // Stored re-encoded, so only canonical, validated JSON is ever served back.
  const canonical = JSON.stringify(encodeVault(vault));
  const sameKey = sql`${identityVaults.publicKey} = excluded.public_key`;
  const keepsRecovery = hasRecoveryMethod(vaultSlots(vault));
  const written = await deps.db
    .insert(identityVaults)
    .values({ userId, publicKey: vault.publicKey, vault: canonical })
    .onConflictDoUpdate({
      target: identityVaults.userId,
      set: { vault: canonical, updatedAt: sql`now()` },
      setWhere: keepsRecovery ? sameKey : and(sameKey, not(storedHasRecovery)),
    })
    .returning({ userId: identityVaults.userId });
  if (written.length === 0)
    return keepsRecovery
      ? fail(409, "public key cannot change")
      : refusedFor(deps.db, userId, vault.publicKey);
  return new Response(null, { status: 204 });
}

/** Nothing was written; says why. Only a read, so no race can change the outcome. */
async function refusedFor(
  db: Db,
  userId: string,
  publicKey: Uint8Array,
): Promise<Response> {
  const [row] = await db
    .select({ publicKey: identityVaults.publicKey })
    .from(identityVaults)
    .where(eq(identityVaults.userId, userId))
    .limit(1);
  const same = row && Buffer.from(row.publicKey).equals(Buffer.from(publicKey));
  return fail(409, same ? "recovery-required" : "public key cannot change");
}

/**
 * Which slots the user's stored vault has (never their contents), or null with no vault.
 * #90 refuses the first record write or invite while `hasRecoveryMethod` is false.
 */
export async function storedVaultSlots(
  db: Db,
  userId: string,
): Promise<VaultSlots | null> {
  const [row] = await db
    .select({ vault: identityVaults.vault })
    .from(identityVaults)
    .where(eq(identityVaults.userId, userId))
    .limit(1);
  return row ? vaultSlots(decodeVault(JSON.parse(row.vault))) : null;
}

/**
 * Protect before the first data (ADR-0037, ADR-0040): an invite, and from M2 a record push,
 * needs at least one recovery slot in the caller's vault, so nothing exists that only this
 * device could open. `null` = go ahead; otherwise the 409 to return. No vault counts as none.
 */
export async function requireRecoveryMethod(
  db: Db,
  userId: string,
): Promise<Response | null> {
  const slots = await storedVaultSlots(db, userId);
  if (slots && hasRecoveryMethod(slots)) return null;
  return Response.json({ error: "recovery-required" }, { status: 409 });
}
