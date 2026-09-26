import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Opaque AES-256-GCM output (nonce ‖ ciphertext ‖ tag). The server never decodes it.
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** A household is only an id: its name and everything else live inside records. */
export const households = pgTable("households", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

/**
 * One row per member (ADR-0019): their identity public key and the HDK wrapped to it. The
 * inviter writes the row; the server only relays `wrappedHdk`, which it cannot open.
 * `memberId` gains a FK to the auth user table in #6.
 */
export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(),
    publicKey: bytea("public_key").notNull(),
    wrappedHdk: bytea("wrapped_hdk").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.memberId] })],
);

/**
 * The encrypted sync envelope (ADR-0003). Deliberately nothing else: no record type,
 * no amounts, no names. Anything a human could read lives inside `ciphertext`.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    version: bigint("version", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ciphertext: bytea("ciphertext").notNull(),
    deleted: boolean("deleted").notNull().default(false),
  },
  (t) => [index("records_household_version_idx").on(t.householdId, t.version)],
);

// --- Auth (ADR-0020) -----------------------------------------------------------------
// Better Auth's tables, field-for-field (`auth.test.ts` checks them against its schema).
// They hold who may *sync*: email, sessions, passkey public keys. No household data.

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().default(sql`now()`);

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
});

const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().default(sql`now()`),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: userRef(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: userRef(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const passkey = pgTable(
  "passkey",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: userRef(),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: ts("created_at").default(sql`now()`),
    aaguid: text("aaguid"),
  },
  (t) => [
    index("passkey_user_idx").on(t.userId),
    index("passkey_credential_idx").on(t.credentialID),
  ],
);

export const rateLimit = pgTable("rate_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Invite-only sign-up: SHA-256 of the normalised address, never the address itself. */
export const invites = pgTable("invites", {
  emailHash: bytea("email_hash").primaryKey(),
  createdAt: created(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
});
