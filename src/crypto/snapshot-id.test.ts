import { describe, expect, it } from "vitest";
import { FIRST_KID, type HouseholdKey } from "./household";
import { generateDataKey } from "./keys";
import { snapshotId, snapshotIdKey } from "./snapshot-id";

const UUID8 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function household(id = "hh"): Promise<HouseholdKey> {
  return { householdId: id, kid: FIRST_KID, key: await generateDataKey() };
}

/** A second device's copy of the same HDK, as unwrapping would give it. */
async function copy(hdk: HouseholdKey): Promise<HouseholdKey> {
  const raw = await crypto.subtle.exportKey("raw", hdk.key);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
  return { ...hdk, key };
}

describe("snapshotId", () => {
  it("is the same on every device with the household key", async () => {
    const hdk = await household();
    const a = await snapshotId(await snapshotIdKey(hdk), "2026-11-01");
    const b = await snapshotId(
      await snapshotIdKey(await copy(hdk)),
      "2026-11-01",
    );
    expect(a).toBe(b);
    expect(a).toMatch(UUID8);
  });

  it("differs per date and per household", async () => {
    const hdk = await household();
    const key = await snapshotIdKey(hdk);
    const day1 = await snapshotId(key, "2026-11-01");
    expect(await snapshotId(key, "2026-11-02")).not.toBe(day1);
    const other = await snapshotIdKey(await household());
    expect(await snapshotId(other, "2026-11-01")).not.toBe(day1);
    // Same key bytes under another household id: the HKDF salt still separates them.
    const moved = await snapshotIdKey({
      ...(await copy(hdk)),
      householdId: "h2",
    });
    expect(await snapshotId(moved, "2026-11-01")).not.toBe(day1);
  });

  it("derives a key that can't be exported or used to encrypt", async () => {
    const key = await snapshotIdKey(await household());
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(["sign"]);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("refuses anything but a date", async () => {
    const key = await snapshotIdKey(await household());
    await expect(snapshotId(key, "2026-11-01T00:00")).rejects.toThrow(
      RangeError,
    );
  });
});
