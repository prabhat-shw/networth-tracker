/**
 * WebAuthn PRF ceremonies for passkey fast unlock (ADR-0033, ADR-0034). The assertion is
 * used only for its PRF output, on this device: nothing here talks to the server, and the
 * random challenge is never verified by anyone. User verification is always required,
 * because authenticators derive a different PRF secret with and without it.
 */
import { randomBytes } from "@/crypto/kdf";
import type { IdentityVault } from "@/crypto/vault";
import { newPrfSalt, type PasskeyPrf } from "@/crypto/vault-passkey";
import { toBase64url } from "@/crypto/wire";

export interface PrfApi {
  /** False only when the browser says it cannot do PRF (or has no WebAuthn at all). */
  available(): Promise<boolean>;
  /** Asks for one of the vault's passkeys. `null`: the authenticator gave no PRF output. */
  unlock(vault: IdentityVault): Promise<PasskeyPrf | null>;
  /** Asks for any passkey of this site, with a fresh salt. `null`: no PRF output. */
  enrol(): Promise<PasskeyPrf | null>;
}

type PrfResults = { results?: { first?: BufferSource } };

async function assert(
  options: Omit<PublicKeyCredentialRequestOptions, "challenge">,
): Promise<{
  rawId: Uint8Array<ArrayBuffer>;
  prf: Uint8Array<ArrayBuffer> | null;
  backedUp: boolean;
}> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: randomBytes(32),
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("no credential");
  const { prf } = credential.getClientExtensionResults() as {
    prf?: PrfResults;
  };
  const first = prf?.results?.first;
  const { authenticatorData } =
    credential.response as AuthenticatorAssertionResponse;
  return {
    rawId: new Uint8Array(credential.rawId),
    backedUp: backupState(new Uint8Array(authenticatorData)),
    prf: first
      ? new Uint8Array(
          ArrayBuffer.isView(first) ? first.buffer.slice(0) : first.slice(0),
        )
      : null,
  };
}

export const webAuthnPrf: PrfApi = {
  async available() {
    if (typeof PublicKeyCredential === "undefined") return false;
    const get = (
      PublicKeyCredential as unknown as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      }
    ).getClientCapabilities;
    if (!get) return true; // unknown: try, and fall back quietly if no PRF comes back
    try {
      return (await get.call(PublicKeyCredential))["extension:prf"] !== false;
    } catch {
      return true;
    }
  },

  async unlock(vault) {
    const evalByCredential: Record<string, { first: BufferSource }> = {};
    for (const slot of vault.passkeys)
      evalByCredential[toBase64url(slot.credentialId)] = {
        first: slot.prfSalt,
      };
    const { rawId, prf, backedUp } = await assert({
      allowCredentials: vault.passkeys.map((s) => ({
        type: "public-key",
        id: s.credentialId,
      })),
      extensions: {
        prf: { evalByCredential },
      } as AuthenticationExtensionsClientInputs,
    });
    const slot = vault.passkeys.find(
      (s) => toBase64url(s.credentialId) === toBase64url(rawId),
    );
    if (!prf || !slot) return null;
    markSynced(rawId, backedUp);
    return { credentialId: rawId, prfSalt: slot.prfSalt, prfOutput: prf };
  },

  async enrol() {
    const prfSalt = newPrfSalt();
    const { rawId, prf, backedUp } = await assert({
      extensions: {
        prf: { eval: { first: prfSalt } },
      } as AuthenticationExtensionsClientInputs,
    });
    if (!prf) return null;
    markSynced(rawId, backedUp);
    return { credentialId: rawId, prfSalt, prfOutput: prf };
  },
};

/** Per-device: the fast-unlock offer is made once, then Settings owns it. */
export const FAST_UNLOCK_KEY = "nwt.fastUnlock";

export function fastUnlockOffered(): boolean {
  try {
    return localStorage.getItem(FAST_UNLOCK_KEY) !== null;
  } catch {
    return true; // no storage: don't nag on every unlock
  }
}

export function markFastUnlock(outcome: "enrolled" | "declined") {
  try {
    localStorage.setItem(FAST_UNLOCK_KEY, outcome);
  } catch {
    // Storage off: the offer may come back next time; harmless.
  }
}

/**
 * The WebAuthn backup-state (BS) flag: bit 4 of the flags byte that follows the 32-byte RP
 * id hash in authenticator data. Set when the passkey is synced (iCloud Keychain, Google
 * Password Manager), so losing this device does not lose it (ADR-0042).
 */
export function backupState(authenticatorData: Uint8Array): boolean {
  return authenticatorData.length > 32 && (authenticatorData[32] & 0x10) !== 0;
}

/**
 * Per-device memory of which passkeys reported BS on their last ceremony here, keyed by
 * base64url credential id. Credential ids are public vault values; the flag only steers
 * the protection banner, so a missing entry just means "not known to be synced".
 */
export const SYNCED_PASSKEYS_KEY = "nwt.syncedPasskeys";

function syncedMap(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SYNCED_PASSKEYS_KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markSynced(credentialId: Uint8Array, synced: boolean) {
  try {
    const map = syncedMap();
    map[toBase64url(credentialId)] = synced;
    localStorage.setItem(SYNCED_PASSKEYS_KEY, JSON.stringify(map));
  } catch {
    // Storage off: the banner keeps asking for a second method; harmless.
  }
}

export function isSynced(credentialId: Uint8Array): boolean {
  return syncedMap()[toBase64url(credentialId)] === true;
}
