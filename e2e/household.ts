// Shared E2E flows for two-member households and the record probe (ADR-0036, ADR-0050).
import { expect, type Page } from "@playwright/test";
import {
  appHeading,
  codeUnder,
  firstRun,
  invite,
  type profiles,
  protectWithKit,
  signIn,
} from "./support";

/**
 * A creates a household, protects it with a kit at the invite (ADR-0040), and adds B after
 * both codes match. Returns both pages in the app and A's recovery words.
 */
export async function pairHousehold(
  run: ReturnType<typeof profiles>,
  emailA: string,
  emailB: string,
) {
  invite(emailA);
  const a = await run.open();
  await signIn(a, emailA);
  await firstRun(a);
  await expect(appHeading(a)).toBeVisible();
  await a.getByRole("button", { name: "Invite a member" }).click();
  await a.getByLabel("Invite member").fill(emailB);
  await a.getByRole("button", { name: "Invite", exact: true }).click();
  const words = await protectWithKit(a);
  await expect(a.getByText("⏳ Invite pending")).toBeVisible({
    timeout: 30_000,
  });

  const b = await run.open();
  await signIn(b, emailB);
  await firstRun(b);
  const bCode = await codeUnder(b, "Your code");

  await a.reload();
  await expect(appHeading(a)).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: "Invite a member" }).click();
  await a.getByRole("button", { name: new RegExp(emailB) }).click();
  const check = a.getByRole("dialog", { name: "Check their code" });
  expect(await codeUnder(a, `${emailB}'s code`)).toBe(bCode);
  await check.getByRole("button", { name: /It matches/ }).click();
  await expect(a.getByText("🔑 Has access")).toHaveCount(2);

  await expect(
    b.getByRole("heading", { name: "Check who added you" }),
  ).toBeVisible({ timeout: 20_000 });
  await b.getByRole("button", { name: "Yes — open household" }).click();
  await expect(appHeading(b)).toBeVisible();
  return { a, b, words };
}

/** Writes a probe record (new, or `id` when given) and returns its sealed summary. */
export async function seal(page: Page, text: string, id = "") {
  const out = page.getByLabel("Sealed record");
  const before = (await out.textContent()) ?? "";
  await page.getByLabel("Probe text").fill(text);
  await page.getByLabel("Probe record").fill(id);
  await page.getByRole("button", { name: "Seal" }).click();
  await expect(out).not.toHaveText(before);
  return JSON.parse((await out.textContent()) ?? "") as {
    id: string;
    householdId: string;
    version: number;
  };
}

export async function deleteRecord(page: Page, id: string) {
  await page.getByLabel("Probe record").fill(id);
  await page.getByRole("button", { name: "Delete" }).click();
}

/** Syncs ("Open records") until the device shows exactly `texts`, in record-id order. */
export async function expectRecords(page: Page, texts: string[]) {
  await expect(async () => {
    await page.getByRole("button", { name: "Open records" }).click();
    await expect(
      page.getByLabel("Opened records").getByRole("listitem"),
    ).toHaveText(texts, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
