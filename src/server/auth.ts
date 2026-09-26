/**
 * Sync-access authentication (ADR-0001, ADR-0020). Better Auth with passkeys and an email
 * OTP fallback; no passwords, no social logins, no open sign-up. Auth only gates *access*
 * to ciphertext: it never sees or derives a data key.
 */
import { passkey } from "@better-auth/passkey";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { createTransport } from "nodemailer";
import { getDb } from "./db/client";
import * as schema from "./db/schema";
import { type InviteStore, pgInviteStore } from "./invites";

export type SendMail = (
  to: string,
  subject: string,
  text: string,
) => Promise<void>;

export interface AuthDeps {
  database: BetterAuthOptions["database"];
  invites: InviteStore;
  sendMail: SendMail;
  /** Public origin, e.g. https://networth.tailXXXX.ts.net. */
  origin: string;
  secret: string;
  /** Rate-limit counters: "database" in production (survives restarts, serverless-safe). */
  rateLimitStorage: "memory" | "database";
}

/** Per 60 s window. OTP routes are the brute-force and mail-bombing targets. */
export const RATE_LIMITS = {
  default: { window: 60, max: 30 },
  "/email-otp/send-verification-otp": { window: 300, max: 3 },
  "/sign-in/email-otp": { window: 300, max: 5 },
  "/passkey/verify-authentication": { window: 60, max: 10 },
} as const;

export function createAuth(deps: AuthDeps) {
  const { hostname, protocol } = new URL(deps.origin);
  const secure = protocol === "https:";
  const { default: base, ...customRules } = RATE_LIMITS;
  return betterAuth({
    appName: "NetWorth",
    baseURL: deps.origin,
    trustedOrigins: [deps.origin],
    secret: deps.secret,
    database: deps.database,
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    rateLimit: {
      enabled: true,
      storage: deps.rateLimitStorage,
      ...base,
      customRules,
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "lax" },
      database: { generateId: "uuid" },
    },
    databaseHooks: {
      user: {
        create: {
          // The only way an account is created. Invite-less emails never get this far
          // (no OTP is sent), but the gate is enforced here regardless of the path.
          before: async (user) => {
            if (!(await deps.invites.isInvited(user.email)))
              throw new APIError("FORBIDDEN", { message: "invite required" });
          },
          after: async (user) => {
            await deps.invites.consume(user.email);
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        // Same response either way, so the endpoint does not reveal who is registered.
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (type !== "sign-in") return;
          const known =
            (await ctx?.context.internalAdapter.findUserByEmail(email)) ?? null;
          if (!known && !(await deps.invites.isInvited(email))) return;
          await deps.sendMail(
            email,
            "Your NetWorth sign-in code",
            `Your sign-in code is ${otp}. It expires in 5 minutes.\n\n` +
              "If you did not ask for it, ignore this email.",
          );
        },
      }),
      passkey({ rpID: hostname, rpName: "NetWorth", origin: deps.origin }),
      nextCookies(),
    ],
  });
}

/** SMTP via env (ADR-0020). On staging (DEMO_MODE) every mail goes to SMTP_DEMO_TO. */
export function smtpMailer(env = process.env): SendMail {
  const transport = createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_PORT === "465",
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return async (to, subject, text) => {
    const demo = env.DEMO_MODE === "true";
    if (demo && !env.SMTP_DEMO_TO) return;
    if (!env.SMTP_HOST || !env.SMTP_FROM)
      throw new Error("SMTP is not configured");
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: demo ? env.SMTP_DEMO_TO : to,
      subject,
      text,
    });
  };
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Lazy, like `getDb`, so `next build` needs neither a database nor secrets. */
export function getAuth() {
  if (instance) return instance;
  const { APP_ORIGIN, BETTER_AUTH_SECRET } = process.env;
  if (!APP_ORIGIN || !BETTER_AUTH_SECRET)
    throw new Error("APP_ORIGIN and BETTER_AUTH_SECRET must be set");
  const db = getDb();
  instance = createAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    invites: pgInviteStore(db),
    sendMail: smtpMailer(),
    origin: APP_ORIGIN,
    secret: BETTER_AUTH_SECRET,
    rateLimitStorage: "database",
  });
  return instance;
}
