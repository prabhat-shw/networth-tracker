// Auth against real Postgres SQL: PGlite runs every committed migration, then Better Auth
// goes through the drizzle adapter exactly as in production (#40: the memory adapter hid
// a missing id default that made every /api/auth request fail).
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { createAuth } from "./auth";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import { emailHash, pgInviteStore } from "./invites";

const ORIGIN = "https://nwt.example";

it(
  "signs an invited user in through Postgres",
  { timeout: 30_000 },
  async () => {
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

    for (let i = 0; i < 2; i++) {
      const res = await call("/get-session");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("null");
    }

    const email = "asha@example.com";
    const hash = await emailHash(email);
    await db.insert(schema.invites).values({
      emailHash: hash,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await call("/email-otp/send-verification-otp", { email, type: "sign-in" });
    expect(codes).toHaveLength(1);
    const res = await call("/sign-in/email-otp", { email, otp: codes[0] });
    expect(res.status).toBe(200);

    const [user] = await db.select().from(schema.user);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.select().from(schema.session)).toHaveLength(1);
    const [invite] = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.emailHash, hash));
    expect(invite.consumedAt).toBeInstanceOf(Date);
  },
);
