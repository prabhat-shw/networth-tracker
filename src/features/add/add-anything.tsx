"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Bucket } from "@/domain/records/catalogue";
import {
  BUCKET_LABEL,
  BUCKETS,
  type KindOption,
  optionFor,
  optionsIn,
  searchKinds,
} from "./kinds";
import { type Editing, RecordForm } from "./record-form";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";
const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";

/**
 * "Add anything" (UX.md §3.5, §4): what is it (7 buckets or search) → which one → the common
 * form. A bottom sheet on mobile and a centred dialog from `sm` up, as a native `<dialog>`
 * so focus, Escape and the scrim come from the browser. With `editing`, it opens straight at
 * that record's form, with Delete.
 */
export function AddAnything({
  label = "Add",
  editing,
}: {
  label?: string;
  editing?: Editing;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [option, setOption] = useState<KindOption | null>(null);
  const [notice, setNotice] = useState("");
  const titleId = useId();
  const editOption = editing ? optionFor(String(editing.data.kind)) : undefined;
  const current = editOption ?? option;

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setBucket(null);
    setOption(null);
    setNotice("");
  };
  /** Save & add another goes back to the same bucket: most batches are same-type (UX §4.2). */
  const saved = (name: string, again: boolean) => {
    if (!again) return close();
    setNotice(`Saved ${name}`);
    setBucket(option?.bucket ?? null);
    setOption(null);
  };
  const title = editOption
    ? `Edit ${editOption.label}`
    : option
      ? option.label
      : bucket
        ? BUCKET_LABEL[bucket]
        : "What is it?";
  const back = editOption
    ? null
    : option
      ? () => setOption(null)
      : bucket
        ? () => setBucket(null)
        : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={editing ? "underline" : primary}
      >
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
            {notice && (
              <output className="text-sm text-neutral-600">{notice}</output>
            )}
            {current ? (
              <RecordForm
                key={current.kind}
                option={current}
                editing={editing}
                onSaved={saved}
              />
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
                    onClick={() => onPick(o)}
                    className="flex w-full justify-between rounded-md px-2 py-2 text-left hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                  >
                    {o.label}
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
