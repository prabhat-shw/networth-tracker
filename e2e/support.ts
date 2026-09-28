// Shared E2E steps (ADR-0035): invite an address, read its sign-in code from Mailpit,
// sign in, and walk first run. They drive the real UI; nothing reaches into app state.
// The database helpers stand in for M2's record push and scan tables afterwards (ADR-0036).
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
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

/** The sign-in code in the first mail to `email` beyond the `before` already there. */
export async function signInCode(email: string, before = 0): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const messages = await mailTo(email); // newest first
        if (messages.length <= before) return undefined;
        const msg = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        const { Text } = (await msg.json()) as { Text: string };
        code = /code is (\d{6})/.exec(Text)?.[1];
        return code;
      },
      { timeout: 15_000, message: `no sign-in code for ${email}` },
    )
    .toMatch(/^\d{6}$/);
  return code as string;
}

export async function signIn(page: Page, email: string) {
  const before = (await mailTo(email)).length;
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(await signInCode(email, before));
}

export async function unlock(page: Page, passphrase: string) {
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock" }).click();
  await skipIfOffered(page);
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
 * First run (UX.md §3.0 B): passphrase → recovery kit (typing back the two requested
 * words) → skip the passkey step. Ends in the app, or on "Waiting to join" for an invitee.
 * Returns the 24 words, for a later restore.
 */
export async function firstRun(page: Page, passphrase: string) {
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Continue" }).click();
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
  // Step 3 (passkey) appears only where WebAuthn exists; headless Chrome has it.
  const notNow = page.getByRole("button", { name: "Not now" });
  const waiting = page.getByRole("heading", { name: "Waiting to join" });
  await expect(appHeading(page).or(notNow).or(waiting)).toBeVisible({
    timeout: 30_000,
  });
  if (await notNow.isVisible()) await notNow.click();
  await expect(appHeading(page).or(waiting)).toBeVisible({ timeout: 30_000 });
  return words;
}

/**
 * Waits for the app, declining an optional screen on the way: first run's passkey step or
 * the one-time fast-unlock offer after a passphrase unlock (ADR-0034).
 */
export async function skipIfOffered(page: Page) {
  const notNow = page.getByRole("button", { name: "Not now" });
  await expect(appHeading(page).or(notNow)).toBeVisible({ timeout: 30_000 });
  if (await notNow.isVisible()) await notNow.click();
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
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
