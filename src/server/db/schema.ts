import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  pgTable,
  primaryKey,
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
