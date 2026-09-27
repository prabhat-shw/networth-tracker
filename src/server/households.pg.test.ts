// GET /api/households on real Postgres (#56): own memberships only, and an `invited` flag
// that matches the caller's normalised email against open household invites.
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { listMyHouseholds } from "./households";
import { emailHash } from "./invites";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const CHITRA = "0c000000-0000-4000-8000-0000000000c1";
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

  it("flags an open invite for a caller with no household", async () => {
    expect((await mine(BALA)).body).toEqual({ households: [], invited: true });
  });

  it("ignores an expired invite", async () => {
    expect((await mine(CHITRA)).body).toEqual({
      households: [],
      invited: false,
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
