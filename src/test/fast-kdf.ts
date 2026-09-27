// Test-only (ADR-0028, #58). New passphrase wraps use the lowest Argon2id params the wire
// codec accepts (KDF_BOUNDS floor: 19 MiB, t=2) instead of ADR-0002's 64 MiB, t=3, so the
// suite stays fast. The code path is identical; only the numbers are smaller. Vaults made
// this way still decode, because the floor is inside the bounds.
// `crypto.test.ts` opts out with `vi.unmock`: it asserts the production params and runs the
// known-answer vectors.
import { vi } from "vitest";

vi.mock("@/crypto/kdf", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/crypto/kdf")>();
  const { KDF_BOUNDS } = await import("@/crypto/wire");
  const newKdfParams = (): import("@/crypto/kdf").KdfParams => ({
    ...real.newKdfParams(),
    memoryKiB: KDF_BOUNDS.memoryKiB.min,
    iterations: KDF_BOUNDS.iterations.min,
  });
  return {
    ...real,
    newKdfParams,
    // `deriveUnlockKey` defaults its params from kdf.ts's own binding, which a mock can't
    // reach, so the default is supplied here.
    deriveUnlockKey: (
      passphrase: string,
      params: import("@/crypto/kdf").KdfParams = newKdfParams(),
    ) => real.deriveUnlockKey(passphrase, params),
  };
});
