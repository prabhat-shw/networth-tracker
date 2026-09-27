// Member relay on real Postgres (ADR-0023) and the M1 acceptance test: a second member is
// invited, receives the HDK through the server, and decrypts a record the first one made.
// Sessions are stubbed; the session → user path is covered in records.pg.test.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { open, recordAad, seal } from "@/crypto/aead";
import {
  type HouseholdKey,
  createHousehold as newHouseholdKey,
  unwrapHouseholdKey,
  wrapHouseholdKey,
} from "@/crypto/household";
import { createIdentity, type UnlockedIdentity } from "@/crypto/vault";
import { encodeVault, fromBase64url, toBase64url } from "@/crypto/wire";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { pgInviteStore } from "./invites";
import {
  addMember,
  createHousehold,
  inviteMember,
  listInvites,
  listMembers,
} from "./members";
import { listRecords } from "./records";

const ORIGIN = "https://nwt.example";
const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const CHITRA = "0c000000-0000-4000-8000-0000000000c1";
const RECORD = "5f1c2a7e-0000-4000-8000-000000000001";
/** Shaped like a v1 wrap blob; the server cannot tell it from a real one. */
const FAKE_WRAP = Uint8Array.from({ length: 123 }, (_, i) => (i === 0 ? 1 : 7));

let db: Awaited<ReturnType<typeof migratedDb>>;
let deps: GuardDeps;
let asha: UnlockedIdentity;
let bala: UnlockedIdentity;
let hdk: HouseholdKey;
let hh: string;

const storeVault = async (userId: string) => {
  const { vault, identity } = await createIdentity("pass phrase one");
  await db
    .insert(schema.identityVaults)
    .values({ userId, publicKey: vault.publicKey, vault: "{}" });
  return { identity, wire: encodeVault(vault) };
};

beforeAll(async () => {
  db = await migratedDb();
  await db.insert(schema.user).values([
    { id: ASHA, name: "Asha", email: "asha@example.com" },
    { id: CHITRA, name: "Chitra", email: "chitra@example.com" },
  ]);
  deps = { db, sessionUser: async (h) => h.get("x-test-user") };
  asha = (await storeVault(ASHA)).identity;
  const created = await newHouseholdKey(asha);
  hdk = created.household;
  hh = hdk.householdId;
  expect((await create(ASHA, created.selfWrap)).status).toBe(201);
}, 60_000);

const req = (user: string | undefined, path: string, body?: unknown) =>
  new Request(`${ORIGIN}/api/households${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(user ? { "x-test-user": user } : {}),
      "content-type": "application/json",
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
const create = (user: string | undefined, wrap: Uint8Array, id = hh) =>
  createHousehold(deps, req(user, "", { id, wrappedHdk: toBase64url(wrap) }));
const members = (user?: string) =>
  listMembers(deps, req(user, `/${hh}/members`), hh);
const invite = (user: string | undefined, email: string) =>
  inviteMember(deps, req(user, `/${hh}/invites`, { email }), hh);
const invitesOf = (user?: string) =>
  listInvites(deps, req(user, `/${hh}/invites`), hh);
const add = (user: string | undefined, userId: string, wrap: Uint8Array) =>
  addMember(
    deps,
    req(user, `/${hh}/members`, { userId, wrappedHdk: toBase64url(wrap) }),
    hh,
  );

describe("household member relay", () => {
  it("creates the household with the creator's own wrap and vault key", async () => {
    const res = await members(ASHA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].userId).toBe(ASHA);
    const back = await unwrapHouseholdKey(
      asha,
      hh,
      fromBase64url(body.wrappedHdk),
    );
    expect(back.household.kid).toBe(hdk.kid);
  });

  it("refuses a taken id, a caller without a vault, and a malformed body", async () => {
    const wrap = FAKE_WRAP;
    expect((await create(ASHA, wrap)).status).toBe(409);
    const other = crypto.randomUUID();
    expect((await create(CHITRA, wrap, other)).status).toBe(409);
    expect((await create(undefined, wrap, other)).status).toBe(401);
    const bad = (body: unknown) => createHousehold(deps, req(ASHA, "", body));
    expect(
      (await bad({ id: "nope", wrappedHdk: toBase64url(wrap) })).status,
    ).toBe(400);
    expect((await bad({ id: other, wrappedHdk: "AAAA" })).status).toBe(400);
    expect((await bad({ id: other })).status).toBe(400);
    expect((await bad("{not json")).status).toBe(400);
  });

  it("hides the household from non-members", async () => {
    expect((await members()).status).toBe(401);
    expect((await members(CHITRA)).status).toBe(404);
    expect((await invite(CHITRA, "x@example.com")).status).toBe(404);
    expect((await invitesOf(CHITRA)).status).toBe(404);
  });

  it("invites an email: household invite plus an open sign-up invite", async () => {
    expect((await invite(ASHA, "not an email")).status).toBe(400);
    expect((await invite(ASHA, " Bala@Example.com ")).status).toBe(204);
    expect(await pgInviteStore(db).isInvited("bala@example.com")).toBe(true);
    const { invites } = await (await invitesOf(ASHA)).json();
    expect(invites).toHaveLength(1);
    expect(invites[0].invitee).toBeNull();
  });

  it("will not relay a wrap to someone the household did not invite", async () => {
    const wrap = FAKE_WRAP;
    expect((await add(ASHA, CHITRA, wrap)).status).toBe(404);
  });

  it("lets the invitee decrypt a record the creator made (M1 acceptance)", async () => {
    // Asha writes a record before Bala exists.
    const plaintext = new TextEncoder().encode('{"name":"PPF"}');
    await db.insert(schema.records).values({
      id: RECORD,
      householdId: hh,
      version: 1,
      ciphertext: await seal(hdk.key, plaintext, recordAad(RECORD, 1), hdk.kid),
    });

    // Bala signs up (the invite allowed it) and uploads a vault.
    await db
      .insert(schema.user)
      .values({ id: BALA, name: "Bala", email: "bala@example.com" });
    let found = (await (await invitesOf(ASHA)).json()).invites[0].invitee;
    expect(found).toBeNull();
    const b = await storeVault(BALA);
    bala = b.identity;

    // Asha sees Bala's vault key, wraps the HDK to it; the server relays the blob.
    found = (await (await invitesOf(ASHA)).json()).invites[0].invitee;
    expect(found).toMatchObject({ userId: BALA, email: "bala@example.com" });
    expect(found.publicKey).toBe(b.wire.publicKey);
    const wrap = await wrapHouseholdKey(
      asha,
      hdk,
      fromBase64url(found.publicKey),
    );
    expect((await add(ASHA, BALA, wrap)).status).toBe(201);
    expect((await add(ASHA, BALA, wrap)).status).toBe(404); // invite consumed
    expect((await (await invitesOf(ASHA)).json()).invites).toHaveLength(0);

    // Bala, now a member, unwraps and decrypts.
    const mine = await (await members(BALA)).json();
    expect(mine.members.map((m: { userId: string }) => m.userId)).toEqual([
      ASHA,
      BALA,
    ]);
    const { household } = await unwrapHouseholdKey(
      bala,
      hh,
      fromBase64url(mine.wrappedHdk),
    );
    const list = await listRecords(
      deps,
      new Request(`${ORIGIN}/api/households/${hh}/records`, {
        headers: { "x-test-user": BALA },
      }),
      hh,
    );
    const [rec] = (await list.json()).records;
    const out = await open(
      household.key,
      fromBase64url(rec.ciphertext),
      recordAad(rec.id, rec.version),
    );
    expect(new TextDecoder().decode(out)).toBe('{"name":"PPF"}');
  });

  it("refuses to add an existing member again", async () => {
    await invite(ASHA, "bala@example.com");
    const wrap = FAKE_WRAP;
    expect((await add(BALA, BALA, wrap)).status).toBe(409);
  });
});
