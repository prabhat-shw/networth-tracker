"use client";

/**
 * E2E-only record probe (ADR-0036, #79). Compiled in only when `NEXT_PUBLIC_E2E=1`: the
 * page imports it behind that build-time constant, so production builds contain none of it
 * (the E2E workflow builds without the flag and asserts the marker is absent).
 *
 * Until M2 brings record push, it stands in for the client half of a record round trip:
 * "Seal" encrypts a text under the household key exactly as records will be (AES-256-GCM,
 * AAD `id|version`, envelope kid) and shows the envelope for the spec to insert; "Open"
 * pulls through the real `GET …/records` and decrypts. Keys stay in the key session.
 */
import { type FormEvent, useState } from "react";
import { open, recordAad, seal } from "@/crypto/aead";
import { fromBase64url, toBase64url } from "@/crypto/wire";
import { keySession } from "@/features/lock/key-session";

export const PROBE_MARKER = "nwt-e2e-record-probe";

export default function RecordProbe() {
  const [sealed, setSealed] = useState("");
  const [opened, setOpened] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  async function sealText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    form.reset();
    const hk = keySession.householdKey();
    if (!hk) return setError("locked");
    const id = crypto.randomUUID();
    const ciphertext = await seal(
      hk.key,
      new TextEncoder().encode(text),
      recordAad(id, 1),
      hk.kid,
    );
    setSealed(
      JSON.stringify({
        id,
        householdId: hk.householdId,
        version: 1,
        ciphertext: toBase64url(ciphertext),
      }),
    );
  }

  async function openAll() {
    setError("");
    const hk = keySession.householdKey();
    if (!hk) return setError("locked");
    const res = await fetch(`/api/households/${hk.householdId}/records`, {
      cache: "no-store",
    });
    if (!res.ok) return setError(`records: ${res.status}`);
    const { records } = (await res.json()) as {
      records: { id: string; version: number; ciphertext: string }[];
    };
    const out: string[] = [];
    for (const r of records) {
      try {
        const plain = await open(
          hk.key,
          fromBase64url(r.ciphertext),
          recordAad(r.id, r.version),
        );
        out.push(new TextDecoder().decode(plain));
      } catch {
        out.push("(cannot decrypt)");
      }
    }
    setOpened(out);
  }

  return (
    <section
      data-probe={PROBE_MARKER}
      aria-label="E2E record probe"
      className="flex w-full max-w-sm flex-col gap-2 border-t border-dashed pt-4 text-left text-xs"
    >
      <form onSubmit={sealText} className="flex gap-2">
        <input
          name="text"
          aria-label="Probe text"
          className="flex-1 rounded border px-2 py-1"
        />
        <button type="submit" className="rounded border px-2 py-1">
          Seal
        </button>
      </form>
      <output aria-label="Sealed record" className="break-all font-mono">
        {sealed}
      </output>
      <button
        type="button"
        onClick={openAll}
        className="rounded border px-2 py-1"
      >
        Open records
      </button>
      {opened && (
        <ul aria-label="Opened records">
          {opened.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: display-only list, never reordered.
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
