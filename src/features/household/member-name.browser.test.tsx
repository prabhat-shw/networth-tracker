// Member profiles (#132, ADR-0054): the name prompt writes an encrypted `member` record.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { MemberName } from "./member-name";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

/** An in-memory sync: writes land in `records` and notify, like the real handle. */
function fakeSync(initial: PlainRecord[] = []) {
  let records = initial;
  const listeners = new Set<() => void>();
  const sync: HouseholdSync = {
    householdId: "h",
    userId: ASHA,
    records: () => records,
    async write(id, type, data, deleted = false, schemaVersion = 1) {
      const prev = records.find((r) => r.id === id);
      const record: PlainRecord = {
        id,
        version: (prev?.version ?? 0) + 1,
        deleted,
        type,
        schemaVersion,
        data,
        modifiedAt: new Date().toISOString(),
        modifiedBy: ASHA,
      };
      records = [...records.filter((r) => r.id !== id), record];
      for (const l of listeners) l();
      return record;
    },
    status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
    sync: async () => ({}) as never,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    stop() {},
  };
  return { sync, all: () => records };
}

const mount = (sync: HouseholdSync) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      <MemberName />
    </SyncProvider>,
  );

describe("MemberName", () => {
  it("asks for a name, then saves it as this member's profile", async () => {
    const { sync, all } = fakeSync();
    const screen = await mount(sync);
    await screen
      .getByLabelText("What should your household call you?")
      .fill("  Asha ");
    await screen.getByRole("button", { name: "Save" }).click();
    await expect
      .element(screen.getByText("Asha", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Change" }))
      .toBeVisible();
    expect(all()).toHaveLength(1);
    expect(all()[0]).toMatchObject({
      type: "member",
      schemaVersion: 1,
      data: { memberId: ASHA, name: "Asha" },
    });
  });

  it("renames in place rather than adding a second profile", async () => {
    const { sync, all } = fakeSync();
    await sync.write("p1", "member", { memberId: ASHA, name: "Asha" });
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Change" }).click();
    await screen
      .getByLabelText("What should your household call you?")
      .fill("Asha R");
    await screen.getByRole("button", { name: "Save" }).click();
    await expect.element(screen.getByText("Asha R")).toBeVisible();
    expect(all().map((r) => [r.id, r.version])).toEqual([["p1", 2]]);
  });
});
