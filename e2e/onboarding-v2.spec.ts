// Onboarding v2 acceptance (#92, ADR-0037): signing in with an emailed link lands in the app
// with nothing asked; Settings → Security adds a passphrase through the chooser; app lock on
// leaves no device slot and asks on reload, app lock off keeps only the slot and asks
// nothing; a fresh profile gets in with the passphrase alone. The passphrase never appears in
// a request, browser storage or a server table. Passkeys can't run headless (ADR-0035).
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  appHeading,
  DEVICE_SLOT,
  database,
  deviceSlots,
  expectNoLeaks,
  firstRun,
  invite,
  newEmail,
  profiles,
  signIn,
  signInWithLink,
} from "./support";

const PASS = "copper lantern meadow e2e v2";

/**
 * The unlock screen (ADR-0024): the passphrase is the only way in on a headless browser. The
 * passkey offer that may follow (ADR-0034) is declined, then `landing` must show.
 */
async function unlock(page: Page, landing: Locator) {
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  const notNow = page.getByRole("button", { name: "Not now" });
  await expect(landing.or(notNow)).toBeVisible({ timeout: 30_000 });
  if (await notNow.isVisible()) await notNow.click();
  await expect(landing).toBeVisible();
}

test("v2: link → in, passphrase from the chooser, app lock on/off, new device, no leaks", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const run = profiles(browser);
  const sql = database();
  const email = newEmail("v2");

  try {
    invite(email);
    const p = await run.open();
    await signInWithLink(p, email);
    await firstRun(p);
    await expect(appHeading(p)).toBeVisible();
    expect(await deviceSlots(p)).toEqual([DEVICE_SLOT]);

    // Settings → Security: a passphrase through the chooser (#103 reuses it).
    await p.goto("/settings");
    const settings = p.getByRole("heading", { name: "Settings" });
    await expect(settings).toBeVisible({ timeout: 30_000 });
    await p.getByRole("button", { name: "Add a way back in" }).click();
    await p.getByRole("button", { name: "Choose a passphrase" }).click();
    await p.getByLabel("Passphrase").fill(PASS);
    await p.getByRole("button", { name: "Save passphrase" }).click();
    await expect(
      p.getByRole("listitem").filter({ hasText: "Passphrase" }),
    ).toBeVisible();

    // App lock on: the slot is gone, and a reload asks before anything opens.
    const appLock = p.getByRole("switch");
    await expect(appLock).not.toBeChecked();
    await appLock.click();
    await expect(appLock).toBeChecked();
    expect(await deviceSlots(p)).toEqual([]);
    await p.reload();
    await unlock(p, settings);
    expect(await deviceSlots(p)).toEqual([]);

    // App lock off: confirm it's you, then only the slot is kept and a reload asks nothing.
    await appLock.click();
    const confirm = p.getByRole("dialog", { name: "Confirm it's you" });
    await confirm.getByLabel("Passphrase").fill(PASS);
    await confirm.getByRole("button", { name: "Confirm" }).click();
    await expect(appLock).not.toBeChecked();
    expect(await deviceSlots(p)).toEqual([DEVICE_SLOT]);
    await p.reload();
    await expect(settings).toBeVisible({ timeout: 30_000 });
    await expect(p.getByLabel("Passphrase")).toHaveCount(0);

    // A new device: code sign-in, the passphrase opens it, and it starts with app lock on.
    const q = await run.open();
    await signIn(q, email);
    await unlock(q, appHeading(q));
    expect(await deviceSlots(q)).toEqual([]);

    await expectNoLeaks(run, sql, [PASS]);
  } finally {
    await sql.end();
    await run.close();
  }
});
