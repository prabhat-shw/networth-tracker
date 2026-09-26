/**
 * Identity-vault relay (ADR-0022). The signed-in user stores and fetches their own vault so
 * a fresh browser profile can unlock with the passphrase or recovery code. The server
 * validates the shape (same bounded codec the client uses) but cannot open anything in it.
 */
import { eq, sql } from "drizzle-orm";
import {
  decodeVault,
  encodeVault,
  MAX_VAULT_JSON_BYTES,
  VaultFormatError,
} from "@/crypto/wire";
import { identityVaults } from "./db/schema";
import { deny, type GuardDeps } from "./guard";

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
 * Creates or replaces the caller's vault. The public key is fixed by the first upload; a
 * later upload with a different key is refused (409), atomically in one upsert.
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
  const written = await deps.db
    .insert(identityVaults)
    .values({ userId, publicKey: vault.publicKey, vault: canonical })
    .onConflictDoUpdate({
      target: identityVaults.userId,
      set: { vault: canonical, updatedAt: sql`now()` },
      setWhere: sql`${identityVaults.publicKey} = excluded.public_key`,
    })
    .returning({ userId: identityVaults.userId });
  if (written.length === 0) return fail(409, "public key cannot change");
  return new Response(null, { status: 204 });
}
