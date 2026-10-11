// Harness smoke (#78, ADR-0035): an invited address signs in with an emailed code, runs
// first run against the real server and Postgres, lands in the app, and unlocks again after
// a reload with the passphrase. The M1 acceptance spec (#79) builds on these steps.
import { expect, test } from "@playwright/test";
import {
  appHeading,
  firstRun,
  invite,
  newEmail,
  signIn,
  skipIfOffered,
} from "./support";

const PASSPHRASE = "correct horse battery staple e2e";

test("sign in → first run → unlocked → reload → unlock", async ({ page }) => {
  const email = newEmail("smoke");
  invite(email);

  await signIn(page, email);
  await expect(page.getByText("Choose a passphrase")).toBeVisible();
  await firstRun(page, PASSPHRASE);
  await expect(appHeading(page)).toBeVisible();

  // A reload drops the in-memory keys: the vault comes back from the server.
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel("Passphrase").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await skipIfOffered(page);
  await expect(appHeading(page)).toBeVisible();
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
