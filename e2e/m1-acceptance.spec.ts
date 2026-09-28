// M1 acceptance (#79, closes #46; docs/phases/M1.md): two members share a household key and
// B decrypts A's record; B restores on a fresh profile with the recovery kit; a third user in
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
  signIn,
  unlock,
} from "./support";

const PASS = {
  a: "alpha orchard lantern violet e2e",
  b: "bravo harbour cobalt meadow e2e",
  b2: "bravo restored granite willow e2e",
  c: "charlie summit ember thistle e2e",
};

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
    const wordsA = await firstRun(a, PASS.a);
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

    // A invites B from the Household panel.
    await a.getByLabel("Invite member").fill(email.b);
    await a.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(a.getByText("⏳ Invite pending")).toBeVisible();

    // B: separate context, own identity; waits to join and shows a code.
    const b = await open(browser);
    await signIn(b, email.b);
    const wordsB = await firstRun(b, PASS.b);
    await expect(
      b.getByRole("heading", { name: "Waiting to join" }),
    ).toBeVisible();
    const bCode = await codeUnder(b, "Your code");

    // A (the panel doesn't poll): reload, unlock, check B's code, add B.
    await a.reload();
    await unlock(a, PASS.a);
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

    // B loses the device: a fresh profile restores with the recovery kit.
    const b2 = await open(browser);
    await signIn(b2, email.b);
    await b2.getByRole("button", { name: "Use recovery kit instead" }).click();
    await b2.getByLabel("Recovery kit words").fill(wordsB.join(" "));
    await b2.getByRole("button", { name: "Restore" }).click();
    await b2.getByLabel("New passphrase").fill(PASS.b2);
    await b2.getByRole("button", { name: "Save and unlock" }).click();
    // A new device trusts no sender yet (ADR-0030): confirm A's code again.
    await expect(
      b2.getByRole("heading", { name: "Check who added you" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await codeUnder(b2, "Their code")).toBe(aCode);
    await b2.getByRole("button", { name: "Yes — open household" }).click();
    await expect(appHeading(b2)).toBeVisible();
    await b2.getByRole("button", { name: "Open records" }).click();
    await expect(b2.getByLabel("Opened records")).toHaveText(secret);

    // C: another household; every household-1 route is a 404 (ADR-0021: never 403).
    invite(email.c);
    const c = await open(browser);
    await signIn(c, email.c);
    const wordsC = await firstRun(c, PASS.c);
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
    const phrases = [wordsA, wordsB, wordsC].flatMap((w) => [
      w.join(" "),
      ...w.slice(0, 22).map((_, i) => w.slice(i, i + 3).join(" ")),
    ]);
    const secrets = [...Object.values(PASS), secret, ...phrases];
    const hex = (s: string) => Buffer.from(s).toString("hex");

    for (const r of requests)
      for (const s of secrets) expect(r, "request").not.toContain(s);

    for (const page of pages) {
      const stored = await page.evaluate(async () => ({
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        idb: (await indexedDB.databases()).map((d) => d.name),
      }));
      expect(stored.idb).toEqual([]);
      for (const s of secrets) {
        expect(stored.local).not.toContain(s);
        expect(stored.session).not.toContain(s);
      }
    }

    const tables = await dumpTables(sql);
    expect(tables).toContain("records"); // the scan did read the tables
    for (const s of [...Object.values(PASS), secret, ...phrases]) {
      expect(tables).not.toContain(s);
      expect(tables).not.toContain(hex(s));
    }
  } finally {
    await sql.end();
    for (const context of contexts) await context.close();
  }
});
