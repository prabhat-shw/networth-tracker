import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let db: Db | undefined;

/**
 * Lazily connects on first use, so `next build` never needs a database. One pool per
 * process; `globalThis` keeps dev hot-reloads from leaking connections.
 */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const g = globalThis as { __pg?: postgres.Sql };
  g.__pg ??= postgres(url, { max: 10, onnotice: () => {} });
  db = drizzle(g.__pg, { schema });
  return db;
}
