// Restore with the recovery kit from the unlock screen (UX.md §3.0 D, #54), with real
// Argon2id, WebCrypto and BIP-39, and `fetch` intercepted to see what leaves the device.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DecryptError } from "@/crypto/aead";
import {
  createIdentity,
  type IdentityVault,
  unlockWithPassphrase,
} from "@/crypto/vault";
import { decodeVault } from "@/crypto/wire";
import { createKeySession } from "./key-session";
import { kitProblem } from "./restore-with-kit";
import { UnlockScreen } from "./unlock-screen";

const OLD = "original pass phrase";
const NEW = "brand new pass phrase";

let vault: IdentityVault;
let code: string;
let otherCode: string;

beforeAll(async () => {
  const mine = await createIdentity(OLD);
  vault = mine.vault;
  code = mine.recoveryCode;
  otherCode = (await createIdentity("someone else entirely")).recoveryCode;
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Same entropy bits, different checksum bits: always a checksum failure. */
function breakChecksum(words: string[]): string[] {
  const last = wordlist.indexOf(words[23]);
  const swapped = (last & ~0xff) | ((last + 1) & 0xff);
  return [...words.slice(0, 23), wordlist[swapped]];
}

function fakeServer({ failOnce = false } = {}) {
  const bodies: string[] = [];
  let fail = failOnce;
  vi.spyOn(window, "fetch").mockImplementation(async (_input, init) => {
    if (init?.body) bodies.push(String(init.body));
    if (fail) {
      fail = false;
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 204 });
  });
  return bodies;
}

async function openRestore() {
  const session = createKeySession();
  const onVaultChanged = vi.fn();
  const screen = await render(
    <UnlockScreen
      email="asha@example.com"
      vault={vault}
      session={session}
      onVaultChanged={onVaultChanged}
    />,
  );
  await screen
    .getByRole("button", { name: "Use recovery kit instead" })
    .click();
  return { screen, session, onVaultChanged };
}

type Screen = Awaited<ReturnType<typeof openRestore>>["screen"];

async function enterKit(screen: Screen, kit: string) {
  await screen.getByLabelText("Recovery kit words").fill(kit);
  await screen.getByRole("button", { name: "Restore" }).click();
}

async function setPassphrase(screen: Screen) {
  await screen.getByLabelText("New passphrase").fill(NEW);
  await screen.getByRole("button", { name: "Save and unlock" }).click();
}

describe("kitProblem", () => {
  it("names what's wrong with the typing, and accepts a messy but valid kit", async () => {
    const words = code.split(" ");
    expect(await kitProblem(words.slice(0, 23).join(" "))).toBe(
      "Your kit has 24 words; this has 23.",
    );
    const typo = [...words];
    typo[2] = "notaword";
    expect(await kitProblem(typo.join(" "))).toBe(
      "Word 3 isn't in the recovery list.",
    );
    expect(await kitProblem(breakChecksum(words).join(" "))).toMatch(
      /One of the words is wrong/,
    );
    const messy = `  ${words.slice(0, 12).join("  ").toUpperCase()}\n${words.slice(12).join("\t")} `;
    expect(await kitProblem(messy)).toBeNull();
  });
});

describe("restore from the unlock screen (#54 acceptance)", () => {
  it("re-wraps under a new passphrase, uploads only the vault, and unlocks", async () => {
    const bodies = fakeServer();
    const { screen, session, onVaultChanged } = await openRestore();
    await enterKit(screen, code.toUpperCase().replace(/ /g, "\n"));
    await expect
      .element(screen.getByText(/Your recovery kit still works afterwards/))
      .toBeVisible();
    await setPassphrase(screen);
    await vi.waitFor(() => expect(onVaultChanged).toHaveBeenCalledOnce(), {
      timeout: 15_000,
    });

    const next: IdentityVault = onVaultChanged.mock.calls[0][0];
    expect(session.state().status).toBe("unlocked");
    expect(next.publicKey).toEqual(vault.publicKey); // same identity, new wrap
    await expect(unlockWithPassphrase(next, NEW)).resolves.toBeTruthy();
    await expect(unlockWithPassphrase(next, OLD)).rejects.toBeInstanceOf(
      DecryptError,
    );

    expect(bodies).toHaveLength(1);
    expect(decodeVault(JSON.parse(bodies[0]))).toEqual(next);
    expect(bodies[0]).not.toContain(NEW);
    expect(bodies[0]).not.toContain(code);
    const stored =
      JSON.stringify({ ...localStorage }) +
      JSON.stringify({ ...sessionStorage });
    for (const word of code.split(" ")) expect(stored).not.toContain(word);
    expect(await indexedDB.databases()).toEqual([]);
  }, 30_000);

  it("names a mistyped word and stays on the words step", async () => {
    fakeServer();
    const { screen } = await openRestore();
    const typo = code.split(" ");
    typo[13] = "zzzz";
    await enterKit(screen, typo.join(" "));
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Word 14 isn't in the recovery list.");
    await expect
      .element(screen.getByLabelText("Recovery kit words"))
      .toBeVisible();
  });

  it("says so when a valid kit belongs to another account", async () => {
    const bodies = fakeServer();
    const { screen, session } = await openRestore();
    await enterKit(screen, otherCode);
    await setPassphrase(screen);
    await expect
      .element(screen.getByRole("alert"), { timeout: 15_000 })
      .toHaveTextContent("This kit doesn't match your account.");
    expect(session.state().status).toBe("locked");
    expect(bodies).toEqual([]);
  }, 30_000);

  it("keeps the restored vault and retries when the upload fails", async () => {
    const bodies = fakeServer({ failOnce: true });
    const { screen, onVaultChanged } = await openRestore();
    await enterKit(screen, code);
    await setPassphrase(screen);
    await expect
      .element(screen.getByRole("alert"), { timeout: 15_000 })
      .toMatchTextContent("Couldn't save your new passphrase");
    await screen.getByRole("button", { name: "Save and unlock" }).click();
    await vi.waitFor(() => expect(onVaultChanged).toHaveBeenCalledOnce());
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]); // the same re-wrapped vault, not a second restore
  }, 30_000);

  it("goes back to the passphrase", async () => {
    const { screen } = await openRestore();
    await screen
      .getByRole("button", { name: "Use passphrase instead" })
      .click();
    await expect.element(screen.getByLabelText("Passphrase")).toBeVisible();
  });
});
