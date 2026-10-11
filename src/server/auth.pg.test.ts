// Auth against real Postgres SQL: PGlite runs every committed migration, then Better Auth
// goes through the drizzle adapter exactly as in production (#40: the memory adapter hid
// a missing id default that made every /api/auth request fail). The bootstrap claim
// (ADR-0046) is tested here too: its atomicity only means something against real SQL.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createAuth } from "./auth";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import { emailHash, normaliseEmail, pgInviteStore } from "./invites";

const ORIGIN = "https://nwt.example";

type Db = Awaited<ReturnType<typeof migratedDb>>;

/** Better Auth over PGlite; `codes` maps each mailed address to its latest code. */
function authOn(db: Db) {
  const codes = new Map<string, string>();
  const auth = createAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    invites: pgInviteStore(db),
    sendMail: async (to, _s, text) => {
      codes.set(normaliseEmail(to), /code is (\d{6})/.exec(text)?.[1] ?? "");
    },
    origin: ORIGIN,
    secret: "test-secret-test-secret-test-secret-32",
    rateLimitStorage: "database",
  });
  const call = (path: string, body?: unknown) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": "10.1.1.1",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const sendCode = (email: string) =>
    call("/email-otp/send-verification-otp", { email, type: "sign-in" });
  const signIn = (email: string) =>
    call("/sign-in/email-otp", {
      email,
      otp: codes.get(normaliseEmail(email)) ?? "000000",
    });
  return { codes, call, sendCode, signIn };
}

const OPTS = { timeout: 30_000 };

it("signs an invited user in through Postgres", OPTS, async () => {
  const db = await migratedDb();
  const t = authOn(db);
  for (let i = 0; i < 2; i++) {
    const res = await t.call("/get-session");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("null");
  }

  const email = "asha@example.com";
  const hash = await emailHash(email);
  await db.insert(schema.invites).values({
    emailHash: hash,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await t.sendCode(email);
  expect(t.codes.has(email)).toBe(true);
  expect((await t.signIn(email)).status).toBe(200);

  const [user] = await db.select().from(schema.user);
  expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await db.select().from(schema.session)).toHaveLength(1);
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.emailHash, hash));
  expect(invite.consumedAt).toBeInstanceOf(Date);
  expect(await db.select().from(schema.serverOwner)).toHaveLength(0);
});

describe("first sign-up on an empty server (ADR-0046)", () => {
  it(
    "becomes the owner without an invite; the next address needs one",
    OPTS,
    async () => {
      const db = await migratedDb();
      const t = authOn(db);
      const owner = "Owner@Example.com";

      await t.sendCode(owner);
      expect(t.codes.has(normaliseEmail(owner))).toBe(true);
      expect((await t.signIn(owner)).status).toBe(200);
      const [claim] = await db.select().from(schema.serverOwner);
      expect(Buffer.from(claim.emailHash).equals(await emailHash(owner))).toBe(
        true,
      );

      const stranger = "stranger@example.com";
      expect((await t.sendCode(stranger)).status).toBe(200); // same answer…
      expect(t.codes.has(stranger)).toBe(false); // …but no mail
      expect((await t.signIn(stranger)).status).not.toBe(200);
      expect(await db.select().from(schema.user)).toHaveLength(1);
    },
  );

  it("racing first sign-ups make exactly one owner", OPTS, async () => {
    const db = await migratedDb();
    const t = authOn(db);
    const [a, b] = ["a@example.com", "b@example.com"];
    await t.sendCode(a);
    await t.sendCode(b);
    expect(t.codes.size).toBe(2); // both mailed while nobody owns the server

    const results = await Promise.all([t.signIn(a), t.signIn(b)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.select().from(schema.user)).toHaveLength(1);
    expect(await db.select().from(schema.serverOwner)).toHaveLength(1);
  });

  it(
    "a server that already has users never opens, claim or not",
    OPTS,
    async () => {
      const db = await migratedDb();
      await db.insert(schema.user).values({
        name: "",
        email: "existing@example.com",
        emailVerified: true,
      });
      const t = authOn(db);
      await t.sendCode("new@example.com");
      expect(t.codes.size).toBe(0);
      expect((await t.signIn("new@example.com")).status).not.toBe(200);
      expect(await db.select().from(schema.serverOwner)).toHaveLength(0);
    },
  );
});
