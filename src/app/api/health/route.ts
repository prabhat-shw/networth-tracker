import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 2_000;

/** Liveness + DB reachability. Status words only: never a URL, host, or error message. */
export async function GET() {
  let db: "ok" | "down" = "down";
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
      ),
    ]);
    db = "ok";
  } catch {
    // Swallowed on purpose: driver errors can echo the connection string.
  }
  const ok = db === "ok";
  return Response.json(
    { status: ok ? "ok" : "degraded", app: "ok", db },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
