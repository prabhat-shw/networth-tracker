// Invite an email address to register (ADR-0020). Bootstraps the first owner; in-app
// invites for a spouse come later. Stores only SHA-256(normalised email).
//   DATABASE_URL=... pnpm auth:invite someone@example.com
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const TTL_DAYS = 14;

/** Must match `emailHash` in src/server/invites.ts (auth.test.ts checks it). */
export async function emailHash(email) {
  const bytes = new TextEncoder().encode(
    email.normalize("NFKC").trim().toLowerCase(),
  );
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function main() {
  const email = process.argv[2];
  if (!email?.includes("@")) throw new Error("usage: pnpm auth:invite <email>");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    onnotice: () => {},
  });
  try {
    const hash = Buffer.from(await emailHash(email));
    await sql`
      insert into invites (email_hash, expires_at)
      values (${hash}, now() + ${`${TTL_DAYS} days`}::interval)
      on conflict (email_hash) do update
        set expires_at = excluded.expires_at, consumed_at = null`;
    console.log(`invited; valid for ${TTL_DAYS} days`);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
