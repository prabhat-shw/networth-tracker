"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Bucket } from "@/domain/records/catalogue";
import { InvalidRecordError } from "@/domain/records/typed";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import { useMembers, useRecordWriter } from "@/features/sync/typed-records";
import {
  BUCKET_LABEL,
  BUCKETS,
  type KindOption,
  optionsIn,
  parseRupees,
  searchKinds,
  today,
} from "./kinds";
import { OwnedBy, remainder, type Share } from "./owned-by";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";
const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";

/**
 * "Add anything" (UX.md §3.5, §4): what is it (7 buckets or search) → which one → the common
 * form. A bottom sheet on mobile and a centred dialog from `sm` up, as a native `<dialog>`
 * so focus, Escape and the scrim come from the browser.
 */
export function AddAnything({ label = "Add" }: { label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [option, setOption] = useState<KindOption | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setBucket(null);
    setOption(null);
  };
  const title = option
    ? option.label
    : bucket
      ? BUCKET_LABEL[bucket]
      : "What is it?";
  const back = option
    ? () => setOption(null)
    : bucket
      ? () => setBucket(null)
      : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={close}
        className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-xl bg-white p-4 text-neutral-900 backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-xl dark:bg-neutral-900 dark:text-neutral-100"
      >
        {open && (
          <div className="flex flex-col gap-4">
            <header className="flex items-center gap-2">
              {back && (
                <button type="button" onClick={back} aria-label="Back">
                  ←
                </button>
              )}
              <h2 id={titleId} className="flex-1 text-lg font-semibold">
                {title}
              </h2>
              <button type="button" onClick={close} aria-label="Close">
                ✕
              </button>
            </header>
            {option ? (
              <CommonForm option={option} onSaved={close} />
            ) : bucket ? (
              <KindList options={optionsIn(bucket)} onPick={setOption} />
            ) : (
              <Picker onBucket={setBucket} onPick={setOption} />
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

function Picker({
  onBucket,
  onPick,
}: {
  onBucket: (b: Bucket) => void;
  onPick: (o: KindOption) => void;
}) {
  const [query, setQuery] = useState("");
  const found = searchKinds(query);
  return (
    <>
      <input
        type="search"
        aria-label="Search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={field}
      />
      {query.trim() &&
        (found.length > 0 ? (
          <KindList options={found} onPick={onPick} />
        ) : (
          <p className="text-sm text-neutral-500">
            No match — browse categories below
          </p>
        ))}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUCKETS.map((b) => (
          <li key={b}>
            <button
              type="button"
              onClick={() => onBucket(b)}
              className="h-full w-full rounded-lg border border-neutral-200 p-3 text-left text-sm font-medium dark:border-neutral-800"
            >
              {BUCKET_LABEL[b]}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Kinds to pick from; Lending & Loans splits into "Owed to me" and "I owe" (UX §4.1). */
function KindList({
  options,
  onPick,
}: {
  options: readonly KindOption[];
  onPick: (o: KindOption) => void;
}) {
  const groups: [string | null, KindOption[]][] = options.some(
    (o) => o.type === "liability",
  )
    ? [
        ["Owed to me", options.filter((o) => o.type === "asset")],
        ["I owe", options.filter((o) => o.type === "liability")],
      ]
    : [[null, [...options]]];
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([heading, list]) =>
        list.length === 0 ? null : (
          <section key={heading ?? "all"} aria-label={heading ?? undefined}>
            {heading && (
              <h3 className="mb-1 text-xs font-medium uppercase text-neutral-500">
                {heading}
              </h3>
            )}
            <ul className="flex flex-col">
              {list.map((o) => (
                <li key={o.kind}>
                  <button
                    type="button"
                    disabled={!o.defaults}
                    onClick={() => onPick(o)}
                    className="flex w-full justify-between rounded-md px-2 py-2 text-left hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                  >
                    {o.label}
                    {!o.defaults && (
                      <span className="text-xs text-neutral-500">
                        coming soon
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

/** The six-field skeleton (UX §4.2). Per-kind fields and Tag to goal come in #136. */
function CommonForm({
  option,
  onSaved,
}: {
  option: KindOption;
  onSaved: () => void;
}) {
  const sync = useHouseholdSync();
  const profiles = useMembers();
  const { save } = useRecordWriter();
  const me = sync?.userId ?? "";
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [shares, setShares] = useState<Share[]>([
    { memberId: me, input: "100", bps: 10_000 },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const paise = parseRupees(value);
  const valid = name.trim() !== "" && paise !== null && remainder(shares) === 0;
  const people = [...profiles].map(([memberId, p]) => ({
    memberId,
    name: p.name,
  }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || paise === null) return;
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => {
      const v = String(form.get(key) ?? "").trim();
      return v ? v : undefined;
    };
    const data = {
      kind: option.kind,
      name: name.trim(),
      value: paise,
      institution: optional("institution"),
      asOf: String(form.get("asOf")),
      notes: optional("notes"),
      owners: shares.map((s) => ({
        memberId: s.memberId,
        shareBps: s.bps ?? 0,
      })),
      includeInNetWorth: true,
      tags: [],
      allocations: [],
      ...option.defaults,
    };
    setBusy(true);
    setError("");
    try {
      // The kind's fields are checked at runtime by prepareWrite, not by the compiler here.
      await save(option.type, data as never);
      onSaved();
    } catch (e) {
      setError(
        e instanceof InvalidRecordError
          ? "Some details aren't valid. Check the fields above."
          : "Couldn't save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        Name
        <input
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        Institution (optional)
        <input name="institution" maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        {option.type === "liability" ? "Outstanding ₹" : "Current value ₹"}
        <input
          name="value"
          inputMode="decimal"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={value !== "" && paise === null}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        As of
        <input
          name="asOf"
          type="date"
          required
          defaultValue={today()}
          className={field}
        />
      </label>
      <OwnedBy me={me} people={people} shares={shares} onChange={setShares} />
      <details>
        <summary className="cursor-pointer">Notes (optional)</summary>
        <textarea
          name="notes"
          aria-label="Notes"
          maxLength={2000}
          className={`${field} mt-1 w-full`}
        />
      </details>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={!valid || busy} className={primary}>
        Save
      </button>
    </form>
  );
}
