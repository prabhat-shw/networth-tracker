import { describe, expect, it } from "vitest";
import { risks } from "./protection";

const slots = (passphrase = false, recovery = false, passkeys = 0) => ({
  passphrase,
  recovery,
  passkeys,
});

describe("risks", () => {
  it("is empty once two methods and app lock hold", () => {
    expect(
      risks({ slots: slots(true, true), syncedPasskey: false, appLock: true }),
    ).toEqual([]);
  });

  it("accepts one synced passkey as enough", () => {
    expect(
      risks({
        slots: slots(false, false, 1),
        syncedPasskey: true,
        appLock: true,
      }),
    ).toEqual([]);
  });

  it("asks for a second method when the only one is not synced", () => {
    for (const s of [slots(true), slots(false, true), slots(false, false, 1)])
      expect(risks({ slots: s, syncedPasskey: false, appLock: true })).toEqual([
        "single-method",
      ]);
  });

  it("asks for the first method, not a second, when there is none", () => {
    expect(
      risks({ slots: slots(), syncedPasskey: false, appLock: false }),
    ).toEqual(["no-recovery", "app-lock-off"]);
  });

  it("flags app lock off on its own", () => {
    expect(
      risks({
        slots: slots(true, false, 2),
        syncedPasskey: false,
        appLock: false,
      }),
    ).toEqual(["app-lock-off"]);
  });
});
