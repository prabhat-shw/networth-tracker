"use client";

/**
 * E2E-only record probe (ADR-0036, #79; real sync since #118). Compiled in only when
 * `NEXT_PUBLIC_E2E=1`: the page imports it behind that build-time constant, so production
 * builds contain none of it (the E2E workflow builds without the flag and asserts the marker
 * is absent).
 *
 * It drives the household's sync engine like a record screen will: "Seal" writes a text
 * record (a new one, or the one named in "Probe record"), "Delete" deletes the named one, and
 * "Open records" syncs now and lists what this device has decrypted. Everything goes through
 * `engine.write` + `sync` (codec, padding, Dexie, push, pull); keys stay in the key session.
 */
import { type FormEvent, useState } from "react";
import { useHouseholdSync, useRecords } from "@/features/sync/sync-provider";

export const PROBE_MARKER = "nwt-e2e-record-probe";
const TYPE = "e2e-probe";

const textOf = (data: unknown) =>
  typeof data === "object" && data !== null && "text" in data
    ? String(data.text)
    : "(not a probe record)";

export default function RecordProbe() {
  const sync = useHouseholdSync();
  const records = useRecords();
  const [sealed, setSealed] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  function sealText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const text = String(fields.get("text") ?? "");
    const id = String(fields.get("id") ?? "") || crypto.randomUUID();
    form.reset();
    if (!sync) return setError("sync not started");
    // Written locally first; the push happens in the background and may wait for online.
    run(async () => {
      const record = await sync.write(id, TYPE, { text });
      setSealed(
        JSON.stringify({
          id: record.id,
          householdId: sync.householdId,
          version: record.version,
        }),
      );
    });
  }

  function deleteRecord(form: HTMLFormElement | null) {
    const id = String(new FormData(form ?? undefined).get("id") ?? "");
    const current = sync?.records().find((r) => r.id === id);
    if (!sync || !current) return setError("unknown record");
    form?.reset();
    run(() => sync.write(id, TYPE, current.data, true));
  }

  function openAll() {
    if (!sync) return setError("sync not started");
    run(async () => {
      setShown(true);
      await sync.sync();
    });
  }

  const sorted = [...records]
    .filter((r) => r.type === TYPE)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  return (
    <section
      data-probe={PROBE_MARKER}
      aria-label="E2E record probe"
      className="flex w-full max-w-sm flex-col gap-2 border-t border-dashed pt-4 text-left text-xs"
    >
      <form onSubmit={sealText} className="flex flex-col gap-2">
        <input
          name="text"
          aria-label="Probe text"
          className="rounded border px-2 py-1"
        />
        <input
          name="id"
          aria-label="Probe record"
          placeholder="record id (blank = new)"
          className="rounded border px-2 py-1 font-mono"
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded border px-2 py-1">
            Seal
          </button>
          <button
            type="button"
            onClick={(e) => deleteRecord(e.currentTarget.form)}
            className="rounded border px-2 py-1"
          >
            Delete
          </button>
        </div>
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
      {shown && (
        <ul aria-label="Opened records">
          {sorted.map((r) => (
            <li key={r.id} data-id={r.id}>
              {textOf(r.data)}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
