/**
 * The inviter's side of joining (#64, UX.md §3.0 C / §3.8, ADR-0031): list members and open
 * invites, invite an email, and add a ready invitee. The HDK is wrapped only to the exact
 * public key whose code the inviter just compared, and only after *It matches*.
 */
import { type HouseholdKey, wrapHouseholdKey } from "@/crypto/household";
import type { UnlockedIdentity } from "@/crypto/vault";
import { fromBase64url, toBase64url } from "@/crypto/wire";

export interface Member {
  userId: string;
  publicKey: string;
  joinedAt: string;
}

export interface Invitee {
  userId: string;
  email: string;
  publicKey: string;
}

export interface OpenInvite {
  emailHash: string;
  expiresAt: string;
  /** Filled in once the invited address has an account and a vault: ready to add. */
  invitee: Invitee | null;
}

export interface PanelApi {
  members(householdId: string): Promise<Member[]>;
  invites(householdId: string): Promise<OpenInvite[]>;
  invite(householdId: string, email: string): Promise<void>;
  add(householdId: string, userId: string, wrappedHdk: string): Promise<void>;
  cancel(householdId: string, emailHash: string): Promise<void>;
}

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res;
}

const base = (id: string) => `/api/households/${id}`;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const httpPanelApi: PanelApi = {
  async members(id) {
    const res = await fetch(`${base(id)}/members`, { cache: "no-store" });
    return (await (await ok(res, "members")).json()).members;
  },
  async invites(id) {
    const res = await fetch(`${base(id)}/invites`, { cache: "no-store" });
    return (await (await ok(res, "invites")).json()).invites;
  },
  async invite(id, email) {
    await ok(
      await fetch(`${base(id)}/invites`, json("POST", { email })),
      "invite",
    );
  },
  async add(id, userId, wrappedHdk) {
    await ok(
      await fetch(`${base(id)}/members`, json("POST", { userId, wrappedHdk })),
      "add",
    );
  },
  async cancel(id, emailHash) {
    await ok(
      await fetch(`${base(id)}/invites`, json("DELETE", { emailHash })),
      "cancel",
    );
  },
};

/**
 * *It matches*: wraps the HDK to `invitee.publicKey` — the same bytes the shown code was
 * computed from — and relays it. The server re-checks that key against the invitee's vault.
 */
export async function addInvitee(
  sender: UnlockedIdentity,
  household: HouseholdKey,
  invitee: Invitee,
  api: PanelApi,
): Promise<void> {
  const wrap = await wrapHouseholdKey(
    sender,
    household,
    fromBase64url(invitee.publicKey),
  );
  await api.add(household.householdId, invitee.userId, toBase64url(wrap));
}
