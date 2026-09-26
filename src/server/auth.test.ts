import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getAuthTables } from "better-auth/db";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getTableColumns, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emailHash as scriptEmailHash } from "../../scripts/invite.mjs";
import { createAuth, RATE_LIMITS } from "./auth";
import * as schema from "./db/schema";
import { emailHash, type InviteStore, normaliseEmail } from "./invites";

const ORIGIN = "https://nwt.example";
const INVITED = "Asha@Example.com";

function setup() {
  const invited = new Set([normaliseEmail(INVITED)]);
  const consumed: string[] = [];
  const invites: InviteStore = {
    isInvited: async (e) => invited.has(normaliseEmail(e)),
    consume: async (e) => {
      invited.delete(normaliseEmail(e));
      consumed.push(normaliseEmail(e));
    },
  };
  const mail: { to: string; otp: string }[] = [];
  const db: Record<string, unknown[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    passkey: [],
    rateLimit: [],
  };
  const auth = createAuth({
    database: memoryAdapter(db),
    invites,
    sendMail: async (to, _s, text) => {
      mail.push({ to, otp: /\b(\d{6})\b/.exec(text)?.[1] ?? "" });
    },
    origin: ORIGIN,
    secret: "test-secret-test-secret-test-secret-32",
    rateLimitStorage: "memory",
  });
  let ip = 1;
  const post = (path: string, body: unknown, from = `10.0.0.${ip++}`) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": from,
        },
        body: JSON.stringify(body),
      }),
    );
  const sendOtp = (email: string, from?: string) =>
    post("/email-otp/send-verification-otp", { email, type: "sign-in" }, from);
  const signIn = (email: string, otp: string) =>
    post("/sign-in/email-otp", { email, otp });
  return { db, mail, invited, consumed, post, sendOtp, signIn };
}

describe("invite-only sign-in", () => {
  it("an invited address gets a code, signs in, and the invite is consumed", async () => {
    const t = setup();
    expect((await t.sendOtp(INVITED)).status).toBe(200);
    expect(t.mail).toHaveLength(1);

    const res = await t.signIn(INVITED, t.mail[0].otp);
    expect(res.status).toBe(200);
    expect(t.db.user).toHaveLength(1);
    expect(t.consumed).toEqual([normaliseEmail(INVITED)]);

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/__Secure-/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("an uninvited address gets the same answer, no mail and no account", async () => {
    const t = setup();
    const res = await t.sendOtp("stranger@example.com");
    expect(res.status).toBe(200);
    expect(t.mail).toHaveLength(0);
    expect((await t.signIn("stranger@example.com", "123456")).ok).toBe(false);
    expect(t.db.user).toHaveLength(0);
  });

  it("the account is refused if the invite is gone by the time the code is used", async () => {
    const t = setup();
    await t.sendOtp(INVITED);
    t.invited.clear();
    const res = await t.signIn(INVITED, t.mail[0].otp);
    expect(res.status).toBe(403);
    expect(t.db.user).toHaveLength(0);
  });

  it("offers no open sign-up path", async () => {
    const t = setup();
    const signUp = await t.post("/sign-up/email", {
      email: "x@example.com",
      password: "password123456",
      name: "x",
    });
    expect(signUp.ok).toBe(false);
    const passkeyReg = await t.post("/passkey/generate-register-options", {});
    expect(passkeyReg.ok).toBe(false);
    expect(t.db.user).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("throttles OTP requests per client", async () => {
    const t = setup();
    const { max } = RATE_LIMITS["/email-otp/send-verification-otp"];
    for (let i = 0; i < max; i++)
      expect((await t.sendOtp(INVITED, "10.9.9.9")).status).toBe(200);
    expect((await t.sendOtp(INVITED, "10.9.9.9")).status).toBe(429);
  });
});

describe("schema", () => {
  it("Drizzle tables carry exactly Better Auth's fields", () => {
    const expected = getAuthTables({
      rateLimit: { enabled: true, storage: "database" },
      plugins: [
        emailOTP({ sendVerificationOTP: async () => {} }),
        passkeyPlugin(),
      ],
    });
    const tables: Record<string, Table> = schema;
    for (const [model, def] of Object.entries(expected)) {
      const cols = Object.keys(getTableColumns(tables[model])).sort();
      expect(cols, model).toEqual(["id", ...Object.keys(def.fields)].sort());
    }
  });

  it("invites hash the normalised address the same way as the CLI", async () => {
    const a = await emailHash(" Asha@EXAMPLE.com ");
    expect(a).toEqual(await emailHash("asha@example.com"));
    expect(await scriptEmailHash(" Asha@EXAMPLE.com ")).toEqual(a);
  });
});
