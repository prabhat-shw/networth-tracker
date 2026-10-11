// M1 acceptance (#79, closes #46; docs/phases/M1.md; onboarding v2, #97): two members share a
// household key and B decrypts A's record; A protects the account with a recovery kit at the
// first invite (ADR-0040) and later restores with it on a fresh profile; a third user in
// another household gets 404; no secret appears in a request, in browser storage, or in any
// server table. Records are sealed and opened by the E2E-only probe (ADR-0036) and inserted
// straight into Postgres, standing in for M2's push.
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  appHeading,
  codeUnder,
  database,
  dumpTables,
  firstRun,
  invite,
  newEmail,
  protectWithKit,
  signIn,
} from "./support";

/** The only passphrase in this flow: chosen when A restores with the kit. */
const PASS_A2 = "alpha restored granite willow e2e";

test("M1: invite, B decrypts A's record, restore on a fresh profile, isolation, no leaks", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const requests: string[] = [];
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  async function open(b: Browser) {
    const context = await b.newContext();
    context.on("request", (r) =>
      requests.push(`${r.method()} ${r.url()}\n${r.postData() ?? ""}`),
    );
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    return page;
  }
  const sql = database();
  const email = { a: newEmail("a"), b: newEmail("b"), c: newEmail("c") };
  const secret = `m1 acceptance secret ${Date.now()}`;

  try {
    // A: sign in, identity + household, seal a record.
    invite(email.a);
    const a = await open(browser);
    await signIn(a, email.a);
    await firstRun(a);
    await expect(appHeading(a)).toBeVisible();
    await a.getByLabel("Probe text").fill(secret);
    await a.getByRole("button", { name: "Seal" }).click();
    const sealedOut = a.getByLabel("Sealed record");
    await expect(sealedOut).toContainText("ciphertext");
    const sealed = JSON.parse((await sealedOut.textContent()) ?? "") as {
      id: string;
      householdId: string;
      version: number;
      ciphertext: string;
    };
    // M2 push stand-in: only the envelope's opaque bytes reach the server.
    await sql`
      insert into records (id, household_id, version, ciphertext)
      values (${sealed.id}, ${sealed.householdId}, ${sealed.version},
              ${Buffer.from(sealed.ciphertext, "base64url")})`;

    // Home leads with the empty state; the household panel is a secondary action (#105).
    await a.getByRole("button", { name: "Invite a member" }).click();
    // A invites B. The key is only on A's device, so the server refuses until A picks a
    // recovery method (ADR-0040); the invite then goes out without another tap.
    await a.getByLabel("Invite member").fill(email.b);
    await a.getByRole("button", { name: "Invite", exact: true }).click();
    const wordsA = await protectWithKit(a);
    await expect(a.getByText("⏳ Invite pending")).toBeVisible({
      timeout: 30_000,
    });

    // B: separate context, own identity; waits to join and shows a code.
    const b = await open(browser);
    await signIn(b, email.b);
    await firstRun(b);
    await expect(
      b.getByRole("heading", { name: "Waiting to join" }),
    ).toBeVisible();
    const bCode = await codeUnder(b, "Your code");

    // A (the panel doesn't poll): reload, which opens straight into the app on this
    // device (no unlock), then check B's code and add B.
    await a.reload();
    await expect(appHeading(a)).toBeVisible({ timeout: 30_000 });
    await expect(a.getByLabel("Passphrase")).toHaveCount(0);
    await a.getByRole("button", { name: "Invite a member" }).click();
    await a.getByRole("button", { name: new RegExp(email.b) }).click();
    const check = a.getByRole("dialog", { name: "Check their code" });
    await expect(check).toBeVisible();
    expect(await codeUnder(a, `${email.b}'s code`)).toBe(bCode);
    const aCode = await codeUnder(a, "Your code");
    await check.getByRole("button", { name: /It matches/ }).click();
    await expect(a.getByText("🔑 Has access")).toHaveCount(2);

    // B: confirms A's code, opens the household and decrypts A's record.
    await expect(
      b.getByRole("heading", { name: "Check who added you" }),
    ).toBeVisible({ timeout: 20_000 });
    expect(await codeUnder(b, "Their code")).toBe(aCode);
    await b.getByRole("button", { name: "Yes — open household" }).click();
    await expect(appHeading(b)).toBeVisible();
    await b.getByRole("button", { name: "Open records" }).click();
    await expect(b.getByLabel("Opened records")).toHaveText(secret);

    // A loses the device: a fresh profile restores with the kit chosen at the invite.
    const a2 = await open(browser);
    await signIn(a2, email.a);
    await a2.getByRole("button", { name: "Use recovery kit instead" }).click();
    await a2.getByLabel("Recovery kit words").fill(wordsA.join(" "));
    await a2.getByRole("button", { name: "Restore" }).click();
    await a2.getByLabel("New passphrase").fill(PASS_A2);
    await a2.getByRole("button", { name: "Save and unlock" }).click();
    await expect(appHeading(a2)).toBeVisible({ timeout: 30_000 });
    await a2.getByRole("button", { name: "Open records" }).click();
    await expect(a2.getByLabel("Opened records")).toHaveText(secret);

    // C: another household; every household-1 route is a 404 (ADR-0021: never 403).
    invite(email.c);
    const c = await open(browser);
    await signIn(c, email.c);
    await firstRun(c);
    await expect(appHeading(c)).toBeVisible();
    for (const path of ["records", "members", "invites"]) {
      const res = await c.request.get(
        `/api/households/${sealed.householdId}/${path}`,
      );
      expect(res.status(), path).toBe(404);
    }

    // Leak scans. Private keys and the HDK are non-extractable CryptoKeys, so no raw form
    // exists to search for; the unit suites assert they never leave (SECURITY.md). Here:
    // every secret a person typed or read, and the record's plaintext.
    const phrases = [
      wordsA.join(" "),
      ...wordsA.slice(0, 22).map((_, i) => wordsA.slice(i, i + 3).join(" ")),
    ];
    const secrets = [PASS_A2, secret, ...phrases];
    const hex = (s: string) => Buffer.from(s).toString("hex");

    for (const r of requests)
      for (const s of secrets) expect(r, "request").not.toContain(s);

    for (const page of pages) {
      const stored = await page.evaluate(async () => ({
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        idb: (await indexedDB.databases()).map((d) => d.name),
      }));
      // Only the device slot's database (ADR-0038): a non-extractable key and wrapped bytes.
      for (const name of stored.idb) expect(name).toBe("nwt-device");
      for (const s of secrets) {
        expect(stored.local).not.toContain(s);
        expect(stored.session).not.toContain(s);
      }
    }

    const tables = await dumpTables(sql);
    expect(tables).toContain("records"); // the scan did read the tables
    for (const s of secrets) {
      expect(tables).not.toContain(s);
      expect(tables).not.toContain(hex(s));
    }
  } finally {
    await sql.end();
    for (const context of contexts) await context.close();
  }
});
