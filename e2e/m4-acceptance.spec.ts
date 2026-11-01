// M4 acceptance (#172; docs/phases/M4.md item 11). Two households with different holdings
// add them before any prices exist (manual values), then get the same price files. Their
// price requests are byte-identical, so no request can name a holding (ADR-0005). The values
// match hand-computed fixtures, FX and fractional units included. The files are three days
// old, so the stale warning shows. A poisoned file is rejected at ingest and the last good one
// keeps serving (ADR-0065). The DB scan and household isolation still hold.
import { expect, type Page, type Request, test } from "@playwright/test";
import {
  allFixtures,
  fixture,
  HELD,
  ingestFixtures,
  istDaysAgo,
} from "./prices";
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

type Holding = {
  bucket: string;
  kind: string;
  name: string;
  manual: string;
  units: string;
  codeLabel: string;
  code: string;
  plan?: string;
};

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/**
 * A price request as sent, minus the session cookie (differs by design) and the referer (the
 * page it went from, which depends on timing, never on holdings).
 */
function describe(r: Request) {
  const { cookie: _c, referer: _r, ...headers } = r.headers();
  const sorted = Object.keys(headers)
    .sort()
    .map((k) => `${k}: ${headers[k]}`);
  return [`${r.method()} ${r.url()}`, ...sorted, r.postData() ?? ""].join("\n");
}

const hero = (page: Page) => page.getByRole("region", { name: "Net worth" });

async function addHolding(page: Page, h: Holding) {
  await page
    .getByRole("button", { name: /^(Add|Add your first account)$/ })
    .click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: h.bucket }).click();
  await form.getByRole("button", { name: h.kind, exact: true }).click();
  await form.getByLabel("Name").fill(h.name);
  await form.getByLabel("Current value ₹").fill(h.manual);
  await form.getByLabel("Units held").fill(h.units);
  await form.getByLabel(h.codeLabel).fill(h.code);
  if (h.plan) await form.getByLabel("Plan").selectOption(h.plan);
  await expect(form.getByText("Prices aren't downloaded yet")).toBeVisible();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).toBeHidden();
}

test("M4: identical price requests, values to the paisa, stale warning, poisoned file rejected, no leaks", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const run = profiles(browser);
  const sql = database();
  const tag = Date.now();
  const seeded = istDaysAgo(3);
  const email = { a: newEmail("m4a"), b: newEmail("m4b") };
  const log = { a: [] as string[], b: [] as string[] };
  const holdings: Record<"a" | "b", Holding[]> = {
    a: [
      {
        bucket: "Investments",
        kind: "Mutual fund",
        name: `Index fund ${tag}`,
        manual: "1,000",
        units: "123.4567",
        codeLabel: "Scheme code",
        code: HELD.mf.code,
        plan: "direct",
      },
      {
        bucket: "Investments",
        kind: "US stocks",
        name: `US shares ${tag}`,
        manual: "2,000",
        units: "2.5",
        codeLabel: "Ticker",
        code: HELD.us.code,
      },
    ],
    b: [
      {
        bucket: "Investments",
        kind: "Indian stocks",
        name: `NSE shares ${tag}`,
        manual: "500",
        units: "3",
        codeLabel: "Symbol",
        code: HELD.nse.code,
      },
      {
        bucket: "Investments",
        kind: "Crypto",
        name: `Coins ${tag}`,
        manual: "700",
        units: "0.00123457",
        codeLabel: "Coin",
        code: HELD.crypto.code,
      },
    ],
  };

  try {
    // No prices on the server: the first downloads are 404s and the values are manual.
    await sql`delete from price_universes`;

    // The same steps for both households, so their request logs are comparable.
    const pages = {} as Record<"a" | "b", Page>;
    const words: string[][] = [];
    for (const who of ["a", "b"] as const) {
      invite(email[who]);
      const page = await run.open();
      page.context().on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/prices/"))
          log[who].push(describe(r));
      });
      await signIn(page, email[who]);
      await firstRun(page);
      await expect(appHeading(page)).toBeVisible();
      // A recovery method first: the server accepts pushes only then (ADR-0040).
      await page.goto("/settings");
      await page.getByRole("button", { name: "Add a way back in" }).click();
      words.push(await protectWithKit(page, "Add a way back in"));
      await page.goto("/");
      await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
      for (const h of holdings[who]) await addHolding(page, h);
      pages[who] = page;
    }
    const { a, b } = pages;
    await expect(hero(a).getByText("₹3,000", { exact: true })).toBeVisible();
    await expect(hero(b).getByText("₹1,200", { exact: true })).toBeVisible();

    // Three-day-old files for every kind, through the real ingest.
    const stored = await ingestFixtures(allFixtures(seeded));
    expect(stored.map((r) => r.status)).toEqual(Array(7).fill("stored"));

    // A poisoned AMFI file for today (one code where there were three) is refused.
    const [poison] = await ingestFixtures([
      fixture("amfi", istDaysAgo(0), { [HELD.mf.code]: "1" }),
    ]);
    expect(poison).toMatchObject({ status: "rejected", count: 1, previous: 3 });
    const latest = await a.request.get("/api/prices/universe/amfi/latest");
    expect((await latest.json()).date).toBe(seeded);

    // Hand-computed, half-up to the paisa, then shown in whole rupees (half-up):
    //   A: 123.4567 × ₹9850 = 12,16,048.495 → .50; 2.5 × $231.81 × ₹84.2 = 48,796.005 → .01
    //      total 12,64,844.51 → ₹12,64,845 (one paisa short of either and it shows ₹12,64,844)
    //   B: 3 × ₹1523.83 = 4,571.49; 0.00123457 × ₹9,65,00,000 = 1,19,136.005 → .01
    //      total 1,23,707.50 → ₹1,23,708 (a lost paisa shows ₹1,23,707)
    const expected = {
      a: { total: "₹12,64,845", rows: ["₹12,16,049", "₹48,796"] },
      b: { total: "₹1,23,708", rows: ["₹4,571", "₹1,19,136"] },
    };
    const stale = new RegExp(`stale · as of ${short(seeded)}`);
    for (const who of ["a", "b"] as const) {
      const page = pages[who];
      await page.reload();
      await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
      await expect(
        hero(page).getByText(expected[who].total, { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(hero(page).getByText(stale)).toBeVisible();
      await page.goto("/accounts");
      // Each holding's row: its value cell, and its As-of cell in the stale tone.
      for (const [i, value] of expected[who].rows.entries()) {
        const row = page.getByRole("row", { name: holdings[who][i].name });
        await expect(
          row.getByRole("cell", { name: value, exact: true }),
        ).toBeVisible({ timeout: 30_000 });
        await expect(row.getByRole("cell", { name: stale })).toBeVisible();
      }
    }

    // Different holdings, the same requests (404s first, then the files): one per kind,
    // each a fixed URL with no query and no body.
    const distinct = (l: string[]) => [...new Set(l)].sort();
    expect(distinct(log.a)).toHaveLength(7);
    for (const line of distinct(log.a))
      expect(line).toMatch(/^GET \S+\/api\/prices\/universe\/[a-z]+\/latest\n/);
    for (const line of distinct(log.a)) expect(line.endsWith("\n")).toBe(true);
    expect(distinct(log.b)).toEqual(distinct(log.a));

    // Both households' holdings reached the server, as ciphertext only.
    const ids = await sql<{ email: string; householdId: string }[]>`
      select u.email, m.household_id as "householdId" from household_members m
      join "user" u on u.id = m.member_id where u.email in ${sql([email.a, email.b])}`;
    const home = (e: string) =>
      ids.find((r) => r.email === e)?.householdId ?? "";
    for (const e of [email.a, email.b])
      await expect
        .poll(
          async () =>
            (
              await sql`select id from records
                where household_id = ${home(e)} and not deleted`
            ).length,
        )
        .toBeGreaterThanOrEqual(2);

    // B cannot reach A's household: every route is a 404 (ADR-0021).
    for (const path of ["records", "members", "invites"]) {
      const res = await b.request.get(
        `/api/households/${home(email.a)}/${path}`,
      );
      expect(res.status(), path).toBe(404);
    }

    await expectNoLeaks(run, sql, [
      ...Object.values(holdings).flatMap((list) => list.map((h) => h.name)),
      ...Object.values(holdings).flatMap((list) =>
        list.flatMap((h) => [`"code":"${h.code}"`, `"quantity":"${h.units}"`]),
      ),
      '"kind":"mutualFund"',
      '"kind":"usStock"',
      '"kind":"stock"',
      // Not '"kind":"crypto"': the public price cache names its crypto universe that way.
      '"type":"asset"',
      ...words.map((w) => w.join(" ")),
    ]);
  } finally {
    await run.close();
    await sql.end();
  }
});
