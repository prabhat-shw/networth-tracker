"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { FULL_BPS } from "@/domain/records/common";
import {
  DEFAULT_INFLATION_BPS,
  GOAL_KINDS,
  type GoalData,
  type GoalKind,
  goalData,
} from "@/domain/records/goal";
import { InvalidRecordError } from "@/domain/records/typed";
import { paiseToInput } from "@/features/add/fields";
import { bpsToPercent, parsePercent, parseRupees } from "@/features/add/kinds";
import { OwnedBy, type Share } from "@/features/add/owned-by";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import { useMembers, useRecordWriter } from "@/features/sync/typed-records";
import { DEFAULT_RETURN_BPS, GOAL_KIND_LABEL } from "./goal-kinds";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";
const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";
const secondary =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-neutral-700";

/**
 * Add or edit a goal (#139, ADR-0060) in the same native `<dialog>` as Add anything. The
 * target is in today's rupees; inflation starts at the kind's default (PLAN.md §1.1) and
 * changes with the kind until the member edits it. Earmarking happens on the account.
 */
export function GoalDialog({
  label = "Add a goal",
  editing,
}: {
  label?: string;
  editing?: { id: string; data: GoalData };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={editing ? "text-left font-medium underline" : primary}
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
              <h2 id={titleId} className="flex-1 text-lg font-semibold">
                {editing ? "Edit goal" : "New goal"}
              </h2>
              <button type="button" onClick={close} aria-label="Close">
                ✕
              </button>
            </header>
            <GoalForm editing={editing} onDone={close} />
          </div>
        )}
      </dialog>
    </>
  );
}

function GoalForm({
  editing,
  onDone,
}: {
  editing?: { id: string; data: GoalData };
  onDone: () => void;
}) {
  const me = useHouseholdSync()?.userId ?? "";
  const profiles = useMembers();
  const { save, remove } = useRecordWriter();
  const stored = editing?.data;
  const [kind, setKind] = useState<GoalKind>(stored?.kind ?? "custom");
  const [name, setName] = useState(stored?.name ?? "");
  const [target, setTarget] = useState(
    stored ? paiseToInput(stored.targetAmount) : "",
  );
  const [targetDate, setTargetDate] = useState(stored?.targetDate ?? "");
  const [priority, setPriority] = useState(stored?.priority ?? 3);
  const [inflation, setInflation] = useState(
    bpsToPercent(stored?.inflationBps ?? DEFAULT_INFLATION_BPS[kind]),
  );
  const [inflationTouched, setInflationTouched] = useState(!!stored);
  const [expected, setExpected] = useState(
    bpsToPercent(stored?.expectedReturnBps ?? DEFAULT_RETURN_BPS),
  );
  const [notes, setNotes] = useState(stored?.notes ?? "");
  const [shares, setShares] = useState<Share[]>(() =>
    stored
      ? stored.owners.map((o) => ({
          ...o,
          input: bpsToPercent(o.shareBps),
          bps: o.shareBps,
        }))
      : [{ memberId: me, input: "100", bps: FULL_BPS }],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const pickKind = (next: GoalKind) => {
    setKind(next);
    if (!inflationTouched)
      setInflation(bpsToPercent(DEFAULT_INFLATION_BPS[next]));
  };

  const parsed = goalData.safeParse({
    ...stored,
    kind,
    name: name.trim(),
    targetAmount: parseRupees(target) ?? undefined,
    targetDate: targetDate || undefined,
    inflationBps: parsePercent(inflation) ?? undefined,
    expectedReturnBps: parsePercent(expected) ?? undefined,
    priority,
    owners: shares.map((s) => ({ memberId: s.memberId, shareBps: s.bps ?? 0 })),
    notes: notes.trim() || undefined,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) return;
    setBusy(true);
    setError("");
    try {
      await save("goal", parsed.data, editing?.id);
      onDone();
    } catch (e) {
      setError(
        e instanceof InvalidRecordError
          ? "Some details aren't valid. Check the fields above."
          : "Couldn't save. Try again.",
      );
      setBusy(false);
    }
  }

  async function del() {
    if (!editing) return;
    setBusy(true);
    try {
      // Accounts keep their earmarks; a claim on a deleted goal reads as Unallocated (ADR-0053).
      await remove(editing.id);
      onDone();
    } catch {
      setError("Couldn't delete. Try again.");
      setBusy(false);
    }
  }

  const input = (
    label: string,
    v: string,
    set: (s: string) => void,
    extra = {},
  ) => (
    <label className="flex flex-col gap-1">
      {label}
      <input
        value={v}
        onChange={(e) => set(e.target.value)}
        className={field}
        {...extra}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        Kind
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => pickKind(e.target.value as GoalKind)}
          className={field}
        >
          {GOAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {GOAL_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {input("Name", name, setName, { maxLength: 80, required: true })}
      {input("Target ₹ (today's money)", target, setTarget, {
        inputMode: "decimal",
        required: true,
        "aria-invalid": target !== "" && parseRupees(target) === null,
      })}
      {input("Target date", targetDate, setTargetDate, {
        type: "date",
        required: true,
      })}
      <label className="flex flex-col gap-1">
        Priority
        <select
          aria-label="Priority"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className={field}
        >
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              {p === 1 ? "1 (most important)" : p}
            </option>
          ))}
        </select>
      </label>
      <OwnedBy
        me={me}
        people={[...profiles].map(([memberId, p]) => ({
          memberId,
          name: p.name,
        }))}
        shares={shares}
        onChange={setShares}
      />
      <details>
        <summary className="cursor-pointer">Assumptions</summary>
        <div className="mt-2 flex gap-2">
          {input(
            "Inflation %",
            inflation,
            (s) => {
              setInflationTouched(true);
              setInflation(s);
            },
            { inputMode: "decimal" },
          )}
          {input("Expected return %", expected, setExpected, {
            inputMode: "decimal",
          })}
        </div>
      </details>
      <details open={notes !== ""}>
        <summary className="cursor-pointer">Notes (optional)</summary>
        <textarea
          aria-label="Notes"
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${field} mt-1 w-full`}
        />
      </details>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!parsed.success || busy}
          className={primary}
        >
          Save
        </button>
        {editing &&
          (confirming ? (
            <button
              type="button"
              onClick={del}
              disabled={busy}
              className={`${secondary} text-red-600`}
            >
              Yes, delete for everyone
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`${secondary} text-red-600`}
            >
              Delete
            </button>
          ))}
      </div>
    </form>
  );
}
