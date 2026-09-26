import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Opaque AES-256-GCM output (nonce ‖ ciphertext ‖ tag). The server never decodes it.
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/**
 * The encrypted sync envelope (ADR-0003). Deliberately nothing else: no record type,
 * no amounts, no names. Anything a human could read lives inside `ciphertext`.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ciphertext: bytea("ciphertext").notNull(),
    deleted: boolean("deleted").notNull().default(false),
  },
  (t) => [index("records_household_version_idx").on(t.householdId, t.version)],
);
