// M1 acceptance (#79, closes #46; docs/phases/M1.md; onboarding v2, #97): two members share a
// household key and B decrypts A's record; A protects the account with a recovery kit at the
// first invite (ADR-0040) and later restores with it on a fresh profile; a third user in
// another household gets 404; no secret appears in a request, in browser storage, or in any
// server table. IndexedDB holds only the device slot with app lock off, and nothing on the
// restored profile, where app lock is on (#92). Records go through the E2E-only probe
// (ADR-0036) and the real sync engine: A's write is pushed once A has a recovery method.
import { expect, test } from "@playwright/test";
import { expectRecords, seal } from "./household";
import {
  appHeading,
  codeUnder,
  DEVICE_SLOT,
  database,
  deviceSlots,
  expectNoLeaks,
  firstRun,
  invite,
  newEmail,
  profiles,
  protectWithKit,
  signIn,
} from "./support";

/** The only passphrase in this flow: chosen when A restores with the kit. */
const PASS_A2 = "alpha restored granite willow e2e";

test("M1: invite, B decrypts A's record, restore on a fresh profile, isolation, no leaks", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const run = profiles(browser);
  const sql = database();
  const email = { a: newEmail("a"), b: newEmail("b"), c: newEmail("c") };
  const secret = `m1 acceptance secret ${Date.now()}`;

  try {
    // A: sign in, identity + household, seal a record.
    invite(email.a);
    const a = await run.open();
    await signIn(a, email.a);
    await firstRun(a);
    await expect(appHeading(a)).toBeVisible();
    // App lock off (first run): the device keeps only its slot (ADR-0038).
    expect(await deviceSlots(a)).toEqual([DEVICE_SLOT]);
    // Sealed and queued on the device; the server refuses the push until A has a
    // recovery method (ADR-0040), so it goes out after the kit below.
    const sealed = await seal(a, secret);

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
    const b = await run.open();
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
    await expectRecords(b, [secret]);

    // A loses the device: a fresh profile restores with the kit chosen at the invite.
    const a2 = await run.open();
    await signIn(a2, email.a);
    await a2.getByRole("button", { name: "Use recovery kit instead" }).click();
    await a2.getByLabel("Recovery kit words").fill(wordsA.join(" "));
    await a2.getByRole("button", { name: "Restore" }).click();
    await a2.getByLabel("New passphrase").fill(PASS_A2);
    await a2.getByRole("button", { name: "Save and unlock" }).click();
    await expect(appHeading(a2)).toBeVisible({ timeout: 30_000 });
    await expectRecords(a2, [secret]);
    // A new device starts with app lock on: no slot, nothing to take from its disk.
    expect(await deviceSlots(a2)).toEqual([]);

    // C: another household; every household-1 route is a 404 (ADR-0021: never 403).
    invite(email.c);
    const c = await run.open();
    await signIn(c, email.c);
    await firstRun(c);
    await expect(appHeading(c)).toBeVisible();
    for (const path of ["records", "members", "invites"]) {
      const res = await c.request.get(
        `/api/households/${sealed.householdId}/${path}`,
      );
      expect(res.status(), path).toBe(404);
    }

    // Leak scans: every secret a person typed or read, and the record's plaintext.
    const phrases = [
      wordsA.join(" "),
      ...wordsA.slice(0, 22).map((_, i) => wordsA.slice(i, i + 3).join(" ")),
    ];
    await expectNoLeaks(run, sql, [PASS_A2, secret, ...phrases]);
  } finally {
    await sql.end();
    await run.close();
  }
});
