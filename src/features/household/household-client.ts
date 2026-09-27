/**
 * Which household key this member should hold, and whether they may use it yet (#63,
 * ADR-0030). Runs after every unlock: the key session holds only the identity until this
 * unwraps the member's own wrapped HDK. A wrap made by someone else is used only after the
 * member has compared that person's code (ADR-0025): the server chose which key wrapped it.
 */
import {
  type HouseholdKey,
  keyFingerprint,
  unwrapHouseholdKey,
} from "@/crypto/household";
import { exportPublicKey } from "@/crypto/keys";
import type { UnlockedIdentity } from "@/crypto/vault";
import { fromBase64url } from "@/crypto/wire";

export interface MyHouseholds {
  households: { id: string }[];
  invites: { householdId: string; invitedBy: string }[];
}

export interface HouseholdApi {
  myHouseholds(): Promise<MyHouseholds>;
  /** The caller's own wrapped HDK for a household they belong to (base64url). */
  myWrap(householdId: string): Promise<string>;
  decline(householdId: string): Promise<void>;
}

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res;
}

export const httpHouseholdApi: HouseholdApi = {
  async myHouseholds() {
    const res = await fetch("/api/households", { cache: "no-store" });
    return (await ok(res, "households")).json();
  },
  async myWrap(householdId) {
    const res = await fetch(`/api/households/${householdId}/members`, {
      cache: "no-store",
    });
    const body = await (await ok(res, "members")).json();
    if (typeof body.wrappedHdk !== "string") throw new Error("no wrap");
    return body.wrappedHdk;
  },
  async decline(householdId) {
    await ok(
      await fetch(`/api/households/${householdId}/invite`, {
        method: "DELETE",
      }),
      "decline",
    );
  },
};

/**
 * Per-device record of confirmed senders: `householdId → fingerprint` of the key that
 * wrapped this member's HDK. Public-key fingerprints, not secrets. Storage may be off.
 */
const TRUST_KEY = "nwt.trusted-senders";

export const trustStore = {
  get(householdId: string): string | null {
    try {
      return (
        JSON.parse(localStorage.getItem(TRUST_KEY) ?? "{}")[householdId] ?? null
      );
    } catch {
      return null;
    }
  },
  set(householdId: string, fingerprint: string) {
    try {
      const all = JSON.parse(localStorage.getItem(TRUST_KEY) ?? "{}");
      localStorage.setItem(
        TRUST_KEY,
        JSON.stringify({ ...all, [householdId]: fingerprint }),
      );
    } catch {
      // Storage off: the member confirms again next unlock, which is safe.
    }
  },
};

export type Resolved =
  | { kind: "ready"; household: HouseholdKey }
  | {
      kind: "confirm";
      household: HouseholdKey;
      senderFingerprint: string;
    }
  | { kind: "waiting"; householdId: string; invitedBy: string }
  | { kind: "none" };

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Decides what the member sees after unlock. Throws `DecryptError` if the wrap is not
 * addressed to this identity or was tampered with; the caller shows that as an error.
 */
export async function resolveHousehold(
  identity: UnlockedIdentity,
  api: HouseholdApi,
  trust: Pick<typeof trustStore, "get"> = trustStore,
): Promise<Resolved> {
  const mine = await api.myHouseholds();
  const first = mine.households[0];
  if (!first) {
    const invite = mine.invites[0];
    return invite
      ? {
          kind: "waiting",
          householdId: invite.householdId,
          invitedBy: invite.invitedBy,
        }
      : { kind: "none" };
  }
  const { household, senderPublicKey } = await unwrapHouseholdKey(
    identity,
    first.id,
    fromBase64url(await api.myWrap(first.id)),
  );
  if (sameBytes(senderPublicKey, await exportPublicKey(identity.publicKey)))
    return { kind: "ready", household };
  const senderFingerprint = await keyFingerprint(senderPublicKey);
  if (trust.get(first.id) === senderFingerprint)
    return { kind: "ready", household };
  return { kind: "confirm", household, senderFingerprint };
}
