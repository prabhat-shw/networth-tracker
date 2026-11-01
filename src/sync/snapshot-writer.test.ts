import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_KID, type HouseholdKey } from "@/crypto/household";
import { generateDataKey } from "@/crypto/keys";
import type { PlainRecord } from "@/crypto/record-codec";
import { createSnapshotWriter } from "./snapshot-writer";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";

const cash: PlainRecord = {
  id: "1a000000-0000-4000-8000-000000000001",
  version: 1,
  deleted: false,
  type: "asset",
  schemaVersion: 1,
  data: {
    kind: "cash",
    name: "Cash",
    value: 5_000_00,
    owners: [{ memberId: ASHA, shareBps: 10_000 }],
    includeInNetWorth: true,
    tags: [],
    asOf: "2026-10-30",
    allocations: [],
  },
  modifiedAt: "2026-10-30T00:00:00.000Z",
  modifiedBy: ASHA,
};

let hdk: HouseholdKey;
beforeEach(async () => {
  hdk = { householdId: "hh", kid: FIRST_KID, key: await generateDataKey() };
});

function writer(
  userId: string,
  initial: PlainRecord[],
  at = { iso: "2026-11-01T06:00:00.000Z" },
) {
  let records = initial;
  const write = vi.fn(async (id: string, type: string, data: unknown) => {
    records = [...records, { ...cash, id, type, data, modifiedBy: userId }];
  });
  const w = createSnapshotWriter({
    userId,
    hdk: () => hdk,
    records: () => records,
    universes: async () => ({}),
    write,
    now: () => new Date(at.iso),
  });
  return { w, write, records: () => records, at };
}

describe("snapshot writer", () => {
  it("writes once a day, under an id every device derives alike", async () => {
    const a = writer(ASHA, [cash]);
    expect(await a.w.maybeWrite()).toBe("written");
    expect(await a.w.maybeWrite()).toBe("exists");
    expect(a.write).toHaveBeenCalledTimes(1);
    const [id, type, data, deleted, version] = a.write.mock
      .calls[0] as unknown[];
    expect({ type, deleted, version }).toEqual({
      type: "snapshot",
      deleted: false,
      version: 1,
    });
    expect(data).toMatchObject({
      date: "2026-11-01",
      household: { assets: 5_000_00, liabilities: 0, net: 5_000_00 },
    });

    // Another device that already pulled it doesn't write a second one.
    const b = writer(BALA, a.records());
    expect(await b.w.maybeWrite()).toBe("exists");
    // One that hasn't writes the same id: last-write-wins merges the two.
    const c = writer(BALA, [cash]);
    await c.w.maybeWrite();
    expect(c.write.mock.calls[0]?.[0]).toBe(id);
  });

  it("writes again the next IST day", async () => {
    const a = writer(ASHA, [cash]);
    await a.w.maybeWrite();
    a.at.iso = "2026-11-01T18:30:00.000Z"; // midnight IST
    expect(await a.w.maybeWrite()).toBe("written");
    const ids = a.write.mock.calls.map((c) => c[0]);
    expect(new Set(ids).size).toBe(2);
  });

  it("skips an empty household and a locked session", async () => {
    expect(await writer(ASHA, []).w.maybeWrite()).toBe("skipped");
    const locked = createSnapshotWriter({
      userId: ASHA,
      hdk: () => null,
      records: () => [cash],
      universes: async () => ({}),
      write: vi.fn(),
    });
    expect(await locked.maybeWrite()).toBe("skipped");
  });

  it("shares a run in flight", async () => {
    const a = writer(ASHA, [cash]);
    await Promise.all([a.w.maybeWrite(), a.w.maybeWrite()]);
    expect(a.write).toHaveBeenCalledTimes(1);
  });
});
