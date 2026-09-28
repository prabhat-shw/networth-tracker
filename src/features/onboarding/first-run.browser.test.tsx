// First run in a real browser (UX.md §3.0 B, ADR-0025, #53). Uses the real Argon2id and
// WebCrypto, and the real HTTP client with `fetch` intercepted, so the assertions about
// what leaves the device are about the actual requests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { unwrapHouseholdKey } from "@/crypto/household";
import { randomBytes } from "@/crypto/kdf";
import { newPrfSalt } from "@/crypto/vault-passkey";
import { decodeVault, fromBase64url } from "@/crypto/wire";
import { PASSKEY_HINT_KEY } from "@/features/auth/auth-client";
import { createKeySession } from "@/features/lock/key-session";
import { FAST_UNLOCK_KEY, type PrfApi } from "@/features/lock/passkey-prf";
import { FirstRun, type FirstRunApi, httpFirstRunApi } from "./first-run";
import { recoveryKitPdf } from "./recovery-kit-pdf";

const PASSPHRASE = "correct horse battery staple";

type Sent = { method: string; url: string; body: string | null };

/** Intercepts `fetch` with a tiny fake server; records every request. */
function fakeServer({ invited = false, failVaultOnce = false } = {}) {
  const sent: Sent[] = [];
  let failVault = failVaultOnce;
  vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    sent.push({ method, url, body: init?.body ? String(init.body) : null });
    if (url.endsWith("/api/identity/vault")) {
      if (failVault) {
        failVault = false;
        return new Response(null, { status: 503 });
      }
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/api/households") && method === "GET")
      return Response.json({ households: [], invited });
    if (url.endsWith("/api/households"))
      return Response.json({}, { status: 201 });
    return new Response(null, { status: 404 });
  });
  return sent;
}

const api: FirstRunApi = {
  ...httpFirstRunApi,
  addPasskey: vi.fn(async () => true),
};

/** A passkey that gives no PRF output unless `withPrf`. No real WebAuthn in headless Chrome. */
const fakePrf = (withPrf = false): PrfApi => ({
  available: async () => true,
  unlock: async () => null,
  enrol: async () =>
    withPrf
      ? {
          credentialId: randomBytes(32),
          prfSalt: newPrfSalt(),
          prfOutput: randomBytes(32),
        }
      : null,
});

async function start(over: Partial<FirstRunApi> = {}, prf = fakePrf()) {
  const keys = createKeySession();
  const onDone = vi.fn();
  const screen = await render(
    <FirstRun
      email="asha@example.com"
      api={{ ...api, ...over }}
      keys={keys}
      prf={prf}
      onDone={onDone}
    />,
  );
  await screen.getByLabelText("Passphrase").fill(PASSPHRASE);
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect
    .element(screen.getByText("Save your recovery kit"), { timeout: 15_000 })
    .toBeVisible();
  const words = Array.from(
    screen
      .getByRole("list", { name: "Recovery words" })
      .element()
      .querySelectorAll("li"),
    (li) => li.lastElementChild?.textContent ?? "",
  );
  return { screen, keys, onDone, words };
}

/** Types the two requested words (optionally wrong) into the confirm fields. */
async function confirmKit(
  screen: Awaited<ReturnType<typeof render>>,
  words: string[],
  wrong = false,
) {
  for (const field of await screen.getByLabelText(/^Word \d+$/).all()) {
    const label = field.element().closest("label")?.textContent ?? "";
    const n = Number(/Word (\d+)/.exec(label)?.[1]);
    await field.fill(wrong ? "zzzz" : ` ${words[n - 1].toUpperCase()} `);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("first run", () => {
  it("creates keys, uploads only after the kit is confirmed, then a household (#53 acceptance)", async () => {
    const sent = fakeServer();
    const { screen, keys, onDone, words } = await start();
    expect(words).toHaveLength(24);
    expect(sent).toEqual([]); // nothing leaves the device before the kit is confirmed

    await confirmKit(screen, words);
    await screen.getByRole("button", { name: "Done" }).click();
    await screen.getByRole("button", { name: "Not now" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(onDone.mock.calls[0][0].waitingToJoin).toBe(false);

    expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual([
      "PUT /api/identity/vault",
      "GET /api/households",
      "POST /api/households",
    ]);
    const vault = decodeVault(JSON.parse(sent[0].body ?? ""));
    const { id, wrappedHdk } = JSON.parse(sent[2].body ?? "");

    // The session is unlocked with the new identity, holding the household key it wrapped.
    expect(keys.state().status).toBe("unlocked");
    const identity = keys.identity();
    if (!identity) throw new Error("no identity");
    const back = await unwrapHouseholdKey(
      identity,
      id,
      fromBase64url(wrappedHdk),
    );
    expect(back.household.householdId).toBe(keys.householdKey()?.householdId);
    expect(vault.publicKey).toEqual(
      new Uint8Array(await crypto.subtle.exportKey("raw", identity.publicKey)),
    );

    // No secret in any request, in storage, or in IndexedDB.
    const everything = sent.map((r) => r.body ?? "").join("\n");
    expect(everything).not.toContain(PASSPHRASE);
    expect(everything).not.toContain(words.join(" "));
    const stored =
      JSON.stringify({ ...localStorage }) +
      JSON.stringify({ ...sessionStorage });
    for (const word of words) expect(stored).not.toContain(word);
    expect(await indexedDB.databases()).toEqual([]);
  }, 30_000);

  it("keeps Done disabled until both words match", async () => {
    fakeServer();
    const { screen, words } = await start();
    await confirmKit(screen, words, true);
    await expect
      .element(screen.getByRole("button", { name: "Done" }))
      .toBeDisabled();
    await confirmKit(screen, words);
    await expect
      .element(screen.getByRole("button", { name: "Done" }))
      .toBeEnabled();
  }, 30_000);

  it("waits to join instead of creating a household when invited", async () => {
    const sent = fakeServer({ invited: true });
    const { screen, onDone, words } = await start();
    await confirmKit(screen, words);
    await screen.getByRole("button", { name: "Done" }).click();
    await screen.getByRole("button", { name: "Not now" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(onDone.mock.calls[0][0].waitingToJoin).toBe(true);
    expect(sent.some((r) => r.method === "POST")).toBe(false);
  }, 30_000);

  it("shows a retryable error when the upload fails, keeping the kit", async () => {
    fakeServer({ failVaultOnce: true });
    const { screen, onDone, words } = await start();
    await confirmKit(screen, words);
    await screen.getByRole("button", { name: "Done" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("Couldn't save");
    await expect
      .element(
        screen
          .getByRole("list", { name: "Recovery words" })
          .getByRole("listitem")
          .first(),
      )
      .toHaveTextContent(`1.${words[0]}`);
    await screen.getByRole("button", { name: "Done" }).click();
    await screen.getByRole("button", { name: "Not now" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  }, 30_000);

  it("remembers a registered passkey so sign-in offers it next time", async () => {
    fakeServer();
    const { screen, onDone, words } = await start();
    await confirmKit(screen, words);
    await screen.getByRole("button", { name: "Done" }).click();
    await screen.getByRole("button", { name: "Add passkey" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(localStorage.getItem(PASSKEY_HINT_KEY)).toBe("1");
    // No PRF from this passkey: sign-in only; the vault stays v1 and the offer stays open.
    expect(onDone.mock.calls[0][0].vault.passkeys).toEqual([]);
    expect(localStorage.getItem(FAST_UNLOCK_KEY)).toBeNull();
  }, 30_000);

  it("turns a PRF passkey into a fast-unlock slot and uploads the vault", async () => {
    const sent = fakeServer();
    const { screen, onDone, words } = await start({}, fakePrf(true));
    await confirmKit(screen, words);
    await screen.getByRole("button", { name: "Done" }).click();
    await screen.getByRole("button", { name: "Add passkey" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const puts = sent.filter((r) => r.method === "PUT");
    expect(puts).toHaveLength(2);
    const uploaded = decodeVault(JSON.parse(puts[1].body ?? ""));
    expect(uploaded.passkeys).toHaveLength(1);
    expect(onDone.mock.calls[0][0].vault).toEqual(uploaded);
    expect(localStorage.getItem(FAST_UNLOCK_KEY)).toBe("enrolled");
  }, 30_000);
});

describe("recovery kit PDF", () => {
  const words = Array.from({ length: 24 }, (_, i) => `word${i}`);

  it("is a well-formed one-page PDF holding every word", () => {
    const text = new TextDecoder().decode(
      recoveryKitPdf(words, "a(b)@example.com", "2026-09-27"),
    );
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    for (const [i, w] of words.entries())
      expect(text).toContain(`${i + 1}. ${w})`);
    expect(text).toContain("a\\(b\\)@example.com");

    // The cross-reference table points at the right bytes.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map(
      (m) => Number(m[1]),
    );
    expect(offsets).toHaveLength(6);
    for (const [i, at] of offsets.entries())
      expect(text.slice(at, at + 8)).toBe(`${i + 1} 0 obj\n`);
    const length = Number(/\/Length (\d+)/.exec(text)?.[1]);
    const stream = /stream\n([\s\S]*)\nendstream/.exec(text)?.[1] ?? "";
    expect(stream.length).toBe(length);
  });

  it("refuses anything but 24 words", () => {
    expect(() =>
      recoveryKitPdf(words.slice(1), "a@b.c", "2026-09-27"),
    ).toThrow();
  });
});
