// M3 acceptance (#140; docs/phases/M3.md item 14): two members name themselves, A adds a joint
// FD (50/50) and B a solo PPF through Add anything, and each device's Home hero shows the right
// Me, Household and other-member figures. The server holds only padded ciphertext: no name,
// amount or kind appears in any request, browser storage or table, and another household
// still gets 404 on every household-1 route (ADR-0021).
import { expect, type Page, test } from "@playwright/test";
import { pairHousehold } from "./household";
import {
  appHeading,
  database,
  expectNoLeaks,
  firstRun,
  invite,
  newEmail,
  profiles,
  protectWithKit,
  signIn,
} from "./support";

/** ADR-0013 envelope v1 overhead around the padded plaintext (version, kid length, IV, tag). */
const OVERHEAD = 1 + 1 + 12 + 16;

async function setName(page: Page, name: string) {
  await page.getByLabel("What should your household call you?").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You appear as")).toBeVisible();
}

/** Opens Add anything at a kind's form; the first-run CTA and the later "Add" both work. */
async function openForm(page: Page, bucket: string, kind: string) {
  await page
    .getByRole("button", { name: /^(Add|Add your first account)$/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: bucket }).click();
  await dialog.getByRole("button", { name: kind, exact: true }).click();
  return dialog;
}

/** Syncs (the probe's "Open records") until `lens` on this device's hero reads `amount`. */
async function expectNet(page: Page, lens: string, amount: string) {
  await expect(async () => {
    await page.getByRole("button", { name: "Open records" }).click();
    await page
      .getByRole("group", { name: "Whose net worth" })
      .getByRole("button", { name: lens, exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Net worth" })
        .getByText(amount, { exact: true }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
}

test("M3: joint FD and solo PPF give the right lens figures on both devices, no leaks", async ({
  browser,
}) => {
  test.setTimeout(400_000);
  const run = profiles(browser);
  const sql = database();
  const tag = Date.now();
  const text = {
    nameA: `Asha ${tag}`,
    nameB: `Ravi ${tag}`,
    fd: `Joint FD ${tag}`,
    ppf: `Solo PPF ${tag}`,
  };
  const email = { a: newEmail("m3a"), b: newEmail("m3b"), c: newEmail("m3c") };

  try {
    const { a, b, words } = await pairHousehold(run, email.a, email.b);
    // B needs a recovery method before the server accepts B's pushes (ADR-0040).
    await b.goto("/settings");
    await b.getByRole("button", { name: "Add a way back in" }).click();
    const wordsB = await protectWithKit(b, "Add a way back in");
    await b.goto("/");
    await expect(appHeading(b)).toBeVisible({ timeout: 30_000 });

    await setName(a, text.nameA);
    await setName(b, text.nameB);

    // A: a joint FD of ₹2,00,000. "Owned by" offers B once B's profile has synced to A.
    await expect(async () => {
      await a.keyboard.press("Escape");
      await a.getByRole("button", { name: "Open records" }).click();
      const form = await openForm(a, "Deposits", "Fixed deposit");
      await form.getByRole("button", { name: "Change" }).click();
      await form
        .getByRole("checkbox", { name: text.nameB })
        .check({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    const fd = a.getByRole("dialog");
    await fd.getByLabel("Name").fill(text.fd);
    await fd.getByLabel("Current value ₹").fill("2,00,000");
    await expect(fd.getByLabel("Your share")).toHaveValue("50");
    await expect(fd.getByLabel(`${text.nameB}'s share`)).toHaveValue("50");
    await expect(fd.getByText("Shares add up to 100%")).toBeVisible();
    await fd.getByRole("button", { name: "Save", exact: true }).click();
    await expect(fd).toBeHidden();

    // B: a solo PPF of ₹50,000 ("Just me" is the default owner).
    await expectNet(b, "Household", "₹2,00,000");
    const ppf = await openForm(b, "Retirement & Small Savings", "PPF");
    await ppf.getByLabel("Name").fill(text.ppf);
    await ppf.getByLabel("Current value ₹").fill("50,000");
    await expect(ppf.getByText("Just me")).toBeVisible();
    await ppf.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ppf).toBeHidden();

    // Hand-computed: Household 2,50,000; A = half the FD; B = half the FD + the PPF.
    for (const [page, other] of [
      [a, text.nameB],
      [b, text.nameA],
    ] as const) {
      await expectNet(page, "Household", "₹2,50,000");
      const mine = page === a ? "₹1,00,000" : "₹1,50,000";
      const theirs = page === a ? "₹1,50,000" : "₹1,00,000";
      await expectNet(page, "Me", mine);
      await expectNet(page, other, theirs);
    }

    // The server holds two profiles, two holdings and one daily snapshot (ADR-0070: both
    // devices derive the same id, so there is never a second), all padded ciphertext.
    const [{ householdId }] = await sql<{ householdId: string }[]>`
      select m.household_id as "householdId" from household_members m
      join "user" u on u.id = m.member_id where u.email = ${email.a}`;
    const live = () => sql<{ ct: Buffer }[]>`
      select ciphertext as ct from records
      where household_id = ${householdId} and not deleted`;
    await expect.poll(async () => (await live()).length).toBe(5);
    const rows = await live();
    for (const row of rows) {
      const body = row.ct.length - OVERHEAD - row.ct[1];
      expect(body % 256, "padded to 256-byte blocks").toBe(0);
    }

    // C: another household; every household-1 route is a 404 and Home starts empty.
    invite(email.c);
    const c = await run.open();
    await signIn(c, email.c);
    await firstRun(c);
    await expect(appHeading(c)).toBeVisible();
    await expect(
      c.getByText("Your household net worth will show up here"),
    ).toBeVisible();
    for (const path of ["records", "members", "invites"]) {
      const res = await c.request.get(`/api/households/${householdId}/${path}`);
      expect(res.status(), path).toBe(404);
    }

    // No name, amount or kind as plaintext anywhere: requests, browser storage, tables.
    await expectNoLeaks(run, sql, [
      ...Object.values(text),
      '"value":20000000',
      '"value":5000000',
      '"shareBps":5000',
      '"kind":"fixedDeposit"',
      '"kind":"ppf"',
      '"type":"asset"',
      '"type":"member"',
      '"type":"snapshot"',
      words.join(" "),
      wordsB.join(" "),
    ]);
  } finally {
    await sql.end();
    await run.close();
  }
});
