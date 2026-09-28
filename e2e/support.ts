// Shared E2E steps (ADR-0035): invite an address, read its sign-in code from Mailpit,
// sign in, and walk first run. They drive the real UI; nothing reaches into app state.
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
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

/** Newest sign-in code sent to `email`, waiting for it to arrive. */
export async function signInCode(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
        const { messages } = (await res.json()) as { messages: MailSummary[] };
        if (!messages.length) return undefined;
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
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(await signInCode(email));
}

/**
 * First run (UX.md §3.0 B): passphrase → recovery kit (typing back the two requested
 * words) → skip the passkey step. Returns the 24 words, for a later restore.
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
  await skipIfOffered(page);
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

/** The unlocked app shell. */
export const appHeading = (page: Page) =>
  page.getByRole("heading", { name: "NetWorth", exact: true });
