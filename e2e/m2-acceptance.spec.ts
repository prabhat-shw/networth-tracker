// M2 acceptance (#118; docs/phases/M2.md, ADR-0050): two members sync records through the real
// push and pull. A writes while offline and B sees it once A reconnects (the scheduler's
// `online` trigger, no click on A); concurrent offline edits of one record resolve LWW to the
// same text on both; a delete propagates. The server holds only padded ciphertext, and no
// record text appears in any request, browser storage or table.
import { expect, test } from "@playwright/test";
import { deleteRecord, expectRecords, pairHousehold, seal } from "./household";
import {
  appHeading,
  database,
  expectNoLeaks,
  newEmail,
  profiles,
  protectWithKit,
} from "./support";

/** ADR-0013 envelope v1 overhead around the padded plaintext (version, kid length, IV, tag). */
const OVERHEAD = 1 + 1 + 12 + 16;

test("M2: offline write reaches B, LWW conflict converges, delete propagates, no leaks", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const run = profiles(browser);
  const sql = database();
  const tag = Date.now();
  const text = {
    first: `m2 first ${tag}`,
    offline: `m2 written offline ${tag}`,
    fromA: `m2 edit from A ${tag}`,
    fromB: `m2 edit from B ${tag}`,
  };

  try {
    const { a, b, words } = await pairHousehold(
      run,
      newEmail("m2a"),
      newEmail("m2b"),
    );
    // B needs a recovery method before the server accepts B's pushes (ADR-0040).
    await b.goto("/settings");
    await b.getByRole("button", { name: "Add a way back in" }).click();
    const wordsB = await protectWithKit(b, "Add a way back in");
    await b.goto("/");
    await expect(appHeading(b)).toBeVisible({ timeout: 30_000 });

    // Online round trip through the real push.
    const first = await seal(a, text.first);
    await expectRecords(b, [text.first]);

    // A writes offline: kept on the device, pushed by the `online` trigger.
    await a.context().setOffline(true);
    const offline = await seal(a, text.offline);
    await a.waitForTimeout(1_000);
    const before = await sql`
      select count(*)::int as n from records where id = ${offline.id}`;
    expect(before[0].n).toBe(0);
    await a.context().setOffline(false);
    const order = (x: string, y: string) =>
      first.id < offline.id ? [x, y] : [y, x];
    await expectRecords(b, order(text.first, text.offline));

    // Concurrent offline edits of the first record: B's is later, so it wins on both.
    await a.context().setOffline(true);
    await b.context().setOffline(true);
    await seal(a, text.fromA, first.id);
    await a.waitForTimeout(50);
    await seal(b, text.fromB, first.id);
    // A lands first, so B's push meets a stale base: a real conflict, merged on B.
    await a.context().setOffline(false);
    await expect
      .poll(
        async () =>
          (
            await sql`select version::int as version from records where id = ${first.id}`
          )[0].version,
        { timeout: 30_000 },
      )
      .toBe(2);
    await b.context().setOffline(false);
    await expectRecords(b, order(text.fromB, text.offline));
    await expectRecords(a, order(text.fromB, text.offline));

    // B deletes the offline record; A loses it too.
    await deleteRecord(b, offline.id);
    await expectRecords(b, [text.fromB]);
    await expectRecords(a, [text.fromB]);

    // The server holds padded ciphertext only, with the delete as a tombstone.
    const rows = await sql<
      { id: string; deleted: boolean; version: number; ct: Buffer }[]
    >`select id, deleted, version::int as version, ciphertext as ct from records
      where household_id = ${first.householdId}`;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const body = row.ct.length - OVERHEAD - row.ct[1];
      expect(body % 256, "padded to 256-byte blocks").toBe(0);
    }
    expect(rows.find((r) => r.id === offline.id)?.deleted).toBe(true);
    expect(rows.find((r) => r.id === first.id)?.version).toBe(3);

    await expectNoLeaks(run, sql, [
      ...Object.values(text),
      words.join(" "),
      wordsB.join(" "),
    ]);
  } finally {
    await sql.end();
    await run.close();
  }
});
