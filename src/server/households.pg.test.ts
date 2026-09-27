// GET /api/households on real Postgres (#56): own memberships only, and an `invited` flag
// that matches the caller's normalised email against open household invites.
import { beforeAll, describe, expect, it } from "vitest";
import { toBase64url } from "@/crypto/wire";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { cancelInvite, declineInvite, listMyHouseholds } from "./households";
import { emailHash } from "./invites";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const CHITRA = "0c000000-0000-4000-8000-0000000000c1";
const DEV = "0e000000-0000-4000-8000-0000000000e1";
const HH = "0d000000-0000-4000-8000-00000000000d";
const KEY = new Uint8Array(65);

let db: Awaited<ReturnType<typeof migratedDb>>;
let deps: GuardDeps;

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const mine = async (user?: string) => {
  const res = await listMyHouseholds(
    deps,
    new Request("https://nwt.example/api/households", {
      headers: user ? { "x-test-user": user } : {},
    }),
  );
  return { status: res.status, body: res.ok ? await res.json() : null };
};

beforeAll(async () => {
  db = await migratedDb();
  deps = { db, sessionUser: async (h) => h.get("x-test-user") };
  await db.insert(schema.user).values([
    { id: ASHA, name: "Asha", email: "asha@example.com" },
    // Stored with different case: the invite hash is of the normalised address.
    { id: BALA, name: "Bala", email: "Bala@Example.com" },
    { id: CHITRA, name: "Chitra", email: "chitra@example.com" },
    { id: DEV, name: "", email: "dev@example.com" },
  ]);
  await db.insert(schema.households).values({ id: HH });
  await db.insert(schema.householdMembers).values({
    householdId: HH,
    memberId: ASHA,
    publicKey: KEY,
    wrappedHdk: KEY,
  });
  await db.insert(schema.householdInvites).values([
    {
      householdId: HH,
      emailHash: await emailHash("bala@example.com"),
      invitedBy: ASHA,
      expiresAt: days(14),
    },
    {
      householdId: HH,
      emailHash: await emailHash("chitra@example.com"),
      invitedBy: ASHA,
      expiresAt: days(-1),
    },
  ]);
}, 30_000);

describe("GET /api/households", () => {
  it("needs a session", async () => {
    expect((await mine()).status).toBe(401);
  });

  it("lists the caller's own households, not invited", async () => {
    const { body } = await mine(ASHA);
    expect(body.invited).toBe(false);
    expect(body.households.map((h: { id: string }) => h.id)).toEqual([HH]);
  });

  it("flags an open invite for a caller with no household, and says who sent it", async () => {
    expect((await mine(BALA)).body).toEqual({
      households: [],
      invited: true,
      invites: [{ householdId: HH, invitedBy: "Asha" }],
    });
  });

  it("ignores an expired invite", async () => {
    expect((await mine(CHITRA)).body).toEqual({
      households: [],
      invited: false,
      invites: [],
    });
  });

  it("stops flagging once the invitee is a member", async () => {
    await db.insert(schema.householdMembers).values({
      householdId: HH,
      memberId: BALA,
      publicKey: KEY,
      wrappedHdk: KEY,
    });
    const { body } = await mine(BALA);
    expect(body.invited).toBe(false);
    expect(body.households).toHaveLength(1);
  });
});

/** Opens (or reopens) an invite to HH for `email`, sent by `by`. */
const invite = async (email: string, by = ASHA) => {
  const row = {
    householdId: HH,
    emailHash: await emailHash(email),
    invitedBy: by,
    expiresAt: days(14),
  };
  await db
    .insert(schema.householdInvites)
    .values(row)
    .onConflictDoUpdate({
      target: [
        schema.householdInvites.householdId,
        schema.householdInvites.emailHash,
      ],
      set: { invitedBy: by, expiresAt: row.expiresAt },
    });
};
const req = (user: string | undefined, body?: unknown) =>
  new Request(`https://nwt.example/api/households/${HH}/invites`, {
    method: "DELETE",
    headers: {
      ...(user ? { "x-test-user": user } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("ending an invite without a member row (#52)", () => {
  it("lets a member cancel an invite by its email hash", async () => {
    await invite("dev@example.com");
    const hash = toBase64url(await emailHash("dev@example.com"));
    expect(
      (await cancelInvite(deps, req(CHITRA, { emailHash: hash }), HH)).status,
    ).toBe(404);
    expect(
      (await cancelInvite(deps, req(undefined, { emailHash: hash }), HH))
        .status,
    ).toBe(401);
    expect(
      (await cancelInvite(deps, req(ASHA, { emailHash: "short" }), HH)).status,
    ).toBe(400);
    expect(
      (await cancelInvite(deps, req(ASHA, { emailHash: 42 }), HH)).status,
    ).toBe(400);
    expect((await mine(DEV)).body.invited).toBe(true);

    expect(
      (await cancelInvite(deps, req(ASHA, { emailHash: hash }), HH)).status,
    ).toBe(204);
    expect((await mine(DEV)).body.invited).toBe(false);
    expect(
      (await cancelInvite(deps, req(ASHA, { emailHash: hash }), HH)).status,
    ).toBe(404);
  });

  it("falls back to the inviter's email when they have no display name", async () => {
    await invite("chitra@example.com", DEV);
    expect((await mine(CHITRA)).body.invites).toEqual([
      { householdId: HH, invitedBy: "dev@example.com" },
    ]);
  });

  it("lets the invitee decline, answering 204 whatever the id", async () => {
    expect((await declineInvite(deps, req(undefined), HH)).status).toBe(401);
    expect((await declineInvite(deps, req(CHITRA), HH)).status).toBe(204);
    expect((await mine(CHITRA)).body.invited).toBe(false);
    expect((await declineInvite(deps, req(CHITRA), HH)).status).toBe(204);
    expect((await declineInvite(deps, req(CHITRA), "not-a-uuid")).status).toBe(
      204,
    );
  });
});
