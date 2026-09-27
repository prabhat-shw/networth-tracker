"use client";

import { type FormEvent, useState } from "react";
import { recoveryKitPdf } from "./recovery-kit-pdf";

/** Two distinct word positions (0-based) to confirm, chosen once per kit. */
function pickTwo(): [number, number] {
  const [a, b] = crypto.getRandomValues(new Uint32Array(2));
  const first = a % 24;
  const second = (first + 1 + (b % 23)) % 24;
  return first < second ? [first, second] : [second, first];
}

const same = (typed: string, word: string) =>
  typed.trim().toLowerCase() === word;

/**
 * Step 2 of first run (UX.md §3.0 B2). The words are shown once. Download PDF and Print
 * only; no Copy, because clipboard managers sync to the cloud. Typing two requested words
 * is the confirmation; the parent uploads the vault only after `onConfirmed`.
 */
export function RecoveryKit({
  words,
  email,
  busy,
  onConfirmed,
}: {
  words: string[];
  email: string;
  busy: boolean;
  onConfirmed: () => void;
}) {
  const [ask] = useState(pickTwo);
  const [typed, setTyped] = useState(["", ""]);
  const ok = ask.every((pos, i) => same(typed[i], words[pos]));

  function download() {
    const pdf = recoveryKitPdf(
      words,
      email,
      new Date().toISOString().slice(0, 10),
    );
    const url = URL.createObjectURL(
      new Blob([pdf as BlobPart], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "networth-recovery-kit.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ok && !busy) onConfirmed();
  }

  return (
    <section className="flex w-full max-w-md flex-col gap-4">
      <h2 className="text-lg font-semibold">Save your recovery kit</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Anyone with these words can open your data. Keep them on paper,
        somewhere safe. They are the only way back in if you forget your
        passphrase.
      </p>

      <ol
        aria-label="Recovery words"
        className="columns-2 gap-x-6 rounded-md border border-neutral-300 p-4 font-mono sm:columns-3 dark:border-neutral-700"
      >
        {/* Columns fill top to bottom, so numbering runs down each column (2×12 or 3×8). */}
        {words.map((word, i) => (
          <li key={`${i}-${word}`} className="flex gap-2 py-0.5">
            <span className="w-6 text-right text-neutral-500">{i + 1}.</span>
            <span>{word}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-3 print:hidden">
        <button
          type="button"
          onClick={download}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700"
        >
          Print
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 print:hidden">
        <p className="text-sm">To check you have them, type these two words:</p>
        {ask.map((pos, i) => (
          <label key={pos} className="flex items-center gap-3 text-sm">
            <span className="w-16">Word {pos + 1}</span>
            <input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed[i]}
              onChange={(e) =>
                setTyped((t) => t.map((v, j) => (j === i ? e.target.value : v)))
              }
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 font-mono dark:border-neutral-700"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!ok || busy}
          className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </form>
    </section>
  );
}
