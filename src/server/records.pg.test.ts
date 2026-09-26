// Authorisation against real Postgres and real Better Auth sessions (ADR-0021): a member of
// household A must never see household B's ciphertext, whatever id they ask for.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "./auth";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { emailHash, pgInviteStore } from "./invites";
import { listRecords } from "./records";

const ORIGIN = "https://nwt.example";
const HH_A = "0a000000-0000-4000-8000-00000000000a";
const HH_B = "0b000000-0000-4000-8000-00000000000b";
const MISSING = "0c000000-0000-4000-8000-00000000000c";

let deps: GuardDeps;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  const db = await migratedDb();
  const codes: string[] = [];
  const auth = createAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    invites: pgInviteStore(db),
    sendMail: async (_to, _s, text) => {
      codes.push(/\b(\d{6})\b/.exec(text)?.[1] ?? "");
    },
    origin: ORIGIN,
    secret: "test-secret-test-secret-test-secret-32",
    rateLimitStorage: "memory",
  });
  const post = (path: string, body: unknown, ip: string) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(body),
      }),
    );
  const signIn = async (email: string, ip: string) => {
    await db.insert(schema.invites).values({
      emailHash: await emailHash(email),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await post(
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      ip,
    );
    const res = await post(
      "/sign-in/email-otp",
      { email, otp: codes.at(-1) },
      ip,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { userId: body.user.id, cookie };
  };

  const a = await signIn("asha@example.com", "10.0.0.1");
  const b = await signIn("bala@example.com", "10.0.0.2");
  cookieA = a.cookie;
  cookieB = b.cookie;

  await db.insert(schema.households).values([{ id: HH_A }, { id: HH_B }]);
  const key = new Uint8Array(65);
  await db.insert(schema.householdMembers).values([
    { householdId: HH_A, memberId: a.userId, publicKey: key, wrappedHdk: key },
    { householdId: HH_B, memberId: b.userId, publicKey: key, wrappedHdk: key },
  ]);
  await db.insert(schema.records).values([
    {
      id: crypto.randomUUID(),
      householdId: HH_A,
      version: 1,
      ciphertext: new Uint8Array([1, 2, 3]),
    },
    {
      id: crypto.randomUUID(),
      householdId: HH_A,
      version: 2,
      ciphertext: new Uint8Array([4]),
    },
    {
      id: crypto.randomUUID(),
      householdId: HH_B,
      version: 1,
      ciphertext: new Uint8Array([9]),
    },
  ]);

  deps = {
    db,
    sessionUser: async (headers) =>
      (await auth.api.getSession({ headers }))?.user.id ?? null,
  };
}, 30_000);

const get = (householdId: string, cookie?: string, query = "") =>
  listRecords(
    deps,
    new Request(`${ORIGIN}/api/households/${householdId}/records${query}`, {
      headers: cookie ? { cookie } : {},
    }),
    householdId,
  );

describe("household records", () => {
  it("returns a member's own records as base64url, in version order", async () => {
    const res = await get(HH_A, cookieA);
    expect(res.status).toBe(200);
    const { records } = (await res.json()) as {
      records: { householdId: string; version: number; ciphertext: string }[];
    };
    expect(records.map((r) => r.version)).toEqual([1, 2]);
    expect(records.every((r) => r.householdId === HH_A)).toBe(true);
    expect(records[0].ciphertext).toBe("AQID");
  });

  it("honours ?since=", async () => {
    const res = await get(HH_A, cookieA, "?since=1");
    const { records } = (await res.json()) as {
      records: { version: number }[];
    };
    expect(records.map((r) => r.version)).toEqual([2]);
  });

  it("gives another household's member the same 404 as a missing household", async () => {
    const other = await get(HH_A, cookieB);
    const missing = await get(MISSING, cookieB);
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await other.text()).toBe(await missing.text());
    // …and B still reads B.
    expect((await get(HH_B, cookieB)).status).toBe(200);
  });

  it("rejects requests without a session", async () => {
    expect((await get(HH_A)).status).toBe(401);
    expect((await get(HH_A, "better-auth.session_token=forged")).status).toBe(
      401,
    );
  });

  it("404s a malformed id and 400s a bad cursor", async () => {
    expect((await get("not-a-uuid", cookieA)).status).toBe(404);
    expect((await get(HH_A, cookieA, "?since=-1")).status).toBe(400);
  });

  it("refuses a member row for a user that does not exist (FK)", async () => {
    const key = new Uint8Array(65);
    await expect(
      deps.db.insert(schema.householdMembers).values({
        householdId: HH_A,
        memberId: crypto.randomUUID(),
        publicKey: key,
        wrappedHdk: key,
      }),
    ).rejects.toThrow();
  });
});
