// Shared E2E steps (ADR-0035): invite an address, read its sign-in code from Mailpit,
// sign in (code or link), walk first run, and protect the account. They drive the real UI; nothing
// reaches into app state. The database helpers stand in for M2's record push, and the leak scan
// checks requests, browser storage and every table afterwards (ADR-0036, onboarding v2 #92).
import { execFileSync } from "node:child_process";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test";
import postgres from "postgres";
import { E2E_ENV, MAILPIT } from "./env";

/** A fresh address per run, so each mailbox holds exactly the codes this run asked for. */
export const newEmail = (who: string) =>
  `${who}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

/** Registration is invite-only (ADR-0020): uses the same script an owner would. */
export function invite(email: string) {
  execFileSync(process.execPath, ["scripts/invite.mjs", email], {
    env: { ...process.env, DATABASE_URL: E2E_ENV.DATABASE_URL },
    stdio: "ignore",
  });
}

type MailSummary = { ID: string };

async function mailTo(email: string): Promise<MailSummary[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}

/** The first match of `pattern` in the first mail to `email` beyond the `before` already there. */
async function fromMail(
  email: string,
  before: number,
  pattern: RegExp,
): Promise<string> {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const messages = await mailTo(email); // newest first
        if (messages.length <= before) return undefined;
        const msg = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        const { Text } = (await msg.json()) as { Text: string };
        found = pattern.exec(Text)?.[1];
        return found;
      },
      { timeout: 15_000, message: `no sign-in mail for ${email}` },
    )
    .toBeTruthy();
  return found as string;
}

/** The sign-in code in the first mail to `email` beyond the `before` already there. */
export const signInCode = (email: string, before = 0) =>
  fromMail(email, before, /code is (\d{6})/);

/**
 * Every browser here shares one IP, and sign-in sends are limited to 3 per 5 min per IP
 * (RATE_LIMITS, ADR-0020). Reset the throwaway counters rather than weaken the limit.
 */
async function resetRateLimits() {
  const sql = database();
  try {
    await sql`delete from rate_limit`;
  } finally {
    await sql.end();
  }
}

export async function signIn(page: Page, email: string) {
  await resetRateLimits();
  const before = (await mailTo(email)).length;
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(await signInCode(email, before));
}

/** Sign in with the emailed one-time link instead of a code (ADR-0039). */
export async function signInWithLink(page: Page, email: string) {
  await resetRateLimits();
  const before = (await mailTo(email)).length;
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link instead" }).click();
  const link = await fromMail(email, before, /(http\S+#link=\S+)/);
  // Opened from the mail, as a fresh load: a hash-only change on "/" would not reload.
  await page.goto("about:blank");
  await page.goto(link);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** The value shown under a code label (`<p>label</p><p>value</p>`). */
export async function codeUnder(page: Page, label: string): Promise<string> {
  const value = page
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::p[1]");
  await expect(value).not.toHaveText("…");
  return (await value.textContent())?.trim() ?? "";
}

/**
 * First run (UX.md §3.0 B, ADR-0037): asks nothing. Ends in the app, or on "Waiting to
 * join" for an invitee.
 */
export async function firstRun(page: Page) {
  const waiting = page.getByRole("heading", { name: "Waiting to join" });
  await expect(appHeading(page).or(waiting)).toBeVisible({ timeout: 30_000 });
}

/**
 * "Protect your account first" (UX.md §3.0 E, ADR-0040), shown at the first invite: picks
 * the recovery kit and types back the two requested words. Returns the 24 words.
 */
export async function protectWithKit(page: Page): Promise<string[]> {
  await expect(
    page.getByRole("heading", { name: "Protect your account first" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save a recovery kit" }).click();
  const list = page.getByRole("list", { name: "Recovery words" });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const words = await list
    .getByRole("listitem")
    .evaluateAll((items) =>
      items.map((li) => li.lastElementChild?.textContent ?? ""),
    );
  expect(words).toHaveLength(24);
  for (const field of await page.getByLabel(/^Word \d+$/).all()) {
    const label = await field.evaluate(
      (el) => el.closest("label")?.textContent ?? "",
    );
    const n = Number(/Word (\d+)/.exec(label)?.[1]);
    await field.fill(words[n - 1]);
  }
  await page.getByRole("button", { name: "Done" }).click();
  return words;
}

/** Direct database access: M2's push stand-in and the plaintext scan. */
export function database() {
  return postgres(E2E_ENV.DATABASE_URL, { max: 1, onnotice: () => {} });
}

/** Every row of every table in `public`, as text (bytea shows as `\x…` hex). */
export async function dumpTables(sql: postgres.Sql): Promise<string> {
  const tables = await sql<{ name: string }[]>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;
  const out: string[] = [];
  for (const { name } of tables) {
    const rows = await sql`select t::text as row from ${sql(name)} t`;
    out.push(name, ...rows.map((r) => String(r.row)));
  }
  return out.join("\n");
}

/** The unlocked app shell. */
export const appHeading = (page: Page) =>
  page.getByRole("heading", { name: "NetWorth", exact: true });

/**
 * The device slots this profile keeps (ADR-0038), described without their bytes. Reads the
 * app's own `nwt-device` database only if it exists: opening it here would create it empty.
 */
export function deviceSlots(page: Page) {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes("nwt-device")) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("nwt-device");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const all = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction("slots").objectStore("slots").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return all.map((v) => {
        const slot = v as Record<string, unknown>;
        const key = slot.key as CryptoKey;
        return {
          fields: Object.keys(slot).sort(),
          key: `${key.type} ${key.algorithm.name} extractable=${key.extractable}`,
          bytes: [slot.publicKey, slot.wrap].every(
            (b) => b instanceof Uint8Array,
          ),
        };
      });
    } finally {
      db.close();
    }
  });
}

/** What app lock off keeps on the device: a non-extractable key and two byte strings. */
export const DEVICE_SLOT = {
  fields: ["key", "publicKey", "wrap"],
  key: "secret AES-GCM extractable=false",
  bytes: true,
};

/** Fresh browser profiles whose every request is recorded for the leak scan. */
export function profiles(browser: Browser) {
  const requests: string[] = [];
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  return {
    requests,
    pages,
    async open() {
      const context = await browser.newContext();
      context.on("request", (r) =>
        requests.push(`${r.method()} ${r.url()}
${r.postData() ?? ""}`),
      );
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      return page;
    },
    async close() {
      for (const context of contexts) await context.close();
    },
  };
}

/**
 * No secret a person typed or read appears in any request, in local or session storage, or
 * in any server table (as text or hex). IndexedDB may hold only the device slot's database.
 * Private keys and the HDK are non-extractable CryptoKeys with no raw form to search for;
 * the unit suites assert they never leave (SECURITY.md).
 */
export async function expectNoLeaks(
  run: ReturnType<typeof profiles>,
  sql: postgres.Sql,
  secrets: string[],
) {
  for (const r of run.requests)
    for (const s of secrets) expect(r, "request").not.toContain(s);

  for (const page of run.pages) {
    const stored = await page.evaluate(async () => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      idb: (await indexedDB.databases()).map((d) => d.name),
    }));
    for (const name of stored.idb) expect(name).toBe("nwt-device");
    for (const s of secrets) {
      expect(stored.local).not.toContain(s);
      expect(stored.session).not.toContain(s);
    }
  }

  const hex = (s: string) => Buffer.from(s).toString("hex");
  const tables = await dumpTables(sql);
  expect(tables).toContain("records"); // the scan did read the tables
  for (const s of secrets) {
    expect(tables).not.toContain(s);
    expect(tables).not.toContain(hex(s));
  }
}
