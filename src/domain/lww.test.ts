import { describe, expect, it } from "vitest";
import { compareStamps, mergeLww } from "./lww";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";

const write = (modifiedAt: string, modifiedBy: string, deleted = false) => ({
  modifiedAt,
  modifiedBy,
  deleted,
});

describe("mergeLww", () => {
  it("keeps the later write, from either side", () => {
    const early = write("2026-10-12T10:00:00.000Z", BALA);
    const late = write("2026-10-12T10:00:00.001Z", ASHA);
    expect(mergeLww(early, late)).toBe(late);
    expect(mergeLww(late, early)).toBe(late);
  });

  it("breaks a clock tie by modifiedBy, the same way on every device", () => {
    const a = write("2026-10-12T10:00:00.000Z", ASHA);
    const b = write("2026-10-12T10:00:00.000Z", BALA);
    expect(mergeLww(a, b)).toBe(b);
    expect(mergeLww(b, a)).toBe(b);
  });

  it("keeps local for an identical stamp", () => {
    const local = write("2026-10-12T10:00:00.000Z", ASHA);
    const remote = { ...local };
    expect(mergeLww(local, remote)).toBe(local);
    expect(compareStamps(local, remote)).toBe(0);
  });

  it("lets a later delete beat an edit, and a later edit revive a delete", () => {
    const edit = write("2026-10-12T10:00:00.000Z", ASHA);
    const del = write("2026-10-12T11:00:00.000Z", BALA, true);
    expect(mergeLww(edit, del).deleted).toBe(true);
    const revive = write("2026-10-12T12:00:00.000Z", ASHA);
    expect(mergeLww(del, revive).deleted).toBe(false);
  });

  it("is commutative and associative over many writes", () => {
    const writes = [
      write("2026-10-12T09:00:00.000Z", BALA),
      write("2026-10-12T10:00:00.000Z", ASHA, true),
      write("2026-10-12T10:00:00.000Z", BALA),
      write("2026-10-11T23:59:59.999Z", ASHA),
    ];
    const winners = [
      writes,
      [...writes].reverse(),
      [writes[2], writes[0], writes[3], writes[1]],
    ].map((order) => order.reduce((acc, w) => mergeLww(acc, w)));
    for (const w of winners) expect(w).toBe(writes[2]);
  });
});
