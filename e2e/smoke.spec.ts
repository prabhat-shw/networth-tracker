// Harness smoke (#78, ADR-0035; onboarding v2, #97): an invited address signs in with an
// emailed code, first run asks nothing and lands in the app, and a reload opens the app
// again from this device's key with no unlock step. The M1 acceptance spec builds on these.
import { expect, test } from "@playwright/test";
import { appHeading, firstRun, invite, newEmail, signIn } from "./support";

test("sign in → app (nothing asked) → reload → app, no unlock", async ({
  page,
}) => {
  const email = newEmail("smoke");
  invite(email);

  await signIn(page, email);
  await firstRun(page);
  await expect(appHeading(page)).toBeVisible();

  // A reload drops the in-memory keys; the device slot opens them again silently.
  await page.reload();
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Passphrase")).toHaveCount(0);
});

// #84: the page itself follows the system theme, not just the controls (UX.md §6.1).
test("page colours follow light and dark mode", async ({ page }) => {
  const colours = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return [s.backgroundColor, s.color];
    });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await colours()).toEqual(["rgb(249, 249, 247)", "rgb(11, 11, 11)"]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await colours()).toEqual(["rgb(13, 13, 13)", "rgb(255, 255, 255)"]);
});
