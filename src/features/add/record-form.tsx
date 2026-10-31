"use client";

import { type FormEvent, useState } from "react";
import { assetData } from "@/domain/records/asset";
import { type Allocation, FULL_BPS } from "@/domain/records/common";
import { liabilityData } from "@/domain/records/liability";
import { InvalidRecordError } from "@/domain/records/typed";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import {
  useGoals,
  useMembers,
  useRecordWriter,
} from "@/features/sync/typed-records";
import { KIND_BASE, KIND_FIELDS } from "./field-specs";
import { fieldInputs, paiseToInput, readFields } from "./fields";
import { GoalTags, type Tag } from "./goal-tags";
import { KindFields } from "./kind-fields";
import {
  bpsToPercent,
  type KindOption,
  parsePercent,
  parseRupees,
  today,
} from "./kinds";
import {
  fromStored,
  type NomineeInput,
  Nominees,
  type StoredNominee,
  toStored,
} from "./nominees";
import { OwnedBy, type Share } from "./owned-by";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";
const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";
const secondary =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-neutral-700";

export interface Editing {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Step 3 (UX §4.2): the common skeleton with the kind's own fields below Value. Editing
 * starts from the stored record and overlays the form, so fields the form doesn't show
 * (nominees, linked records, fixed earmarks) survive. The schema decides whether Save is on.
 */
export function RecordForm({
  option,
  editing,
  onSaved,
}: {
  option: KindOption;
  editing?: Editing;
  /** `again`: Save & add another was pressed. */
  onSaved: (name: string, again: boolean) => void;
}) {
  const sync = useHouseholdSync();
  const profiles = useMembers();
  const goals = useGoals().flatMap((g) =>
    g.result.status === "ok" ? [{ id: g.id, name: g.result.value.name }] : [],
  );
  const { save, remove } = useRecordWriter();
  const me = sync?.userId ?? "";
  const stored = editing?.data ?? {};
  const specs = KIND_FIELDS[option.kind];
  const str = (k: string) =>
    typeof stored[k] === "string" ? (stored[k] as string) : "";

  const [name, setName] = useState(str("name"));
  const [institution, setInstitution] = useState(str("institution"));
  const [value, setValue] = useState(
    typeof stored.value === "number" ? paiseToInput(stored.value) : "",
  );
  const [asOf, setAsOf] = useState(str("asOf") || today());
  const [notes, setNotes] = useState(str("notes"));
  const [shares, setShares] = useState<Share[]>(() => {
    const owners = stored.owners as
      | { memberId: string; shareBps: number }[]
      | undefined;
    return owners
      ? owners.map((o) => ({
          ...o,
          input: bpsToPercent(o.shareBps),
          bps: o.shareBps,
        }))
      : [{ memberId: me, input: "100", bps: FULL_BPS }];
  });
  const storedAllocations =
    (stored.allocations as Allocation[] | undefined) ?? [];
  const [tags, setTags] = useState<Tag[]>(() =>
    storedAllocations.flatMap((a) =>
      a.mode === "percent"
        ? [{ goalId: a.goalId, input: bpsToPercent(a.bps) }]
        : [],
    ),
  );
  const [nominees, setNominees] = useState<NomineeInput[]>(() =>
    fromStored((stored.nominees as StoredNominee[] | undefined) ?? []),
  );
  const [inputs, setInputs] = useState(() => fieldInputs(specs, stored));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const people = [...profiles].map(([memberId, p]) => ({
    memberId,
    name: p.name,
  }));
  const goalIds = new Set(goals.map((g) => g.id));
  const kindFields = readFields(specs, inputs);
  const paise = parseRupees(value);
  const allocations: Allocation[] = [
    // Fixed earmarks are edited in M5; dangling ones are dropped here (ADR-0053).
    ...storedAllocations.filter(
      (a) => a.mode === "fixed" && goalIds.has(a.goalId),
    ),
    ...tags.map((t) => ({
      goalId: t.goalId,
      mode: "percent" as const,
      bps: parsePercent(t.input) ?? 0,
    })),
  ];
  const data: Record<string, unknown> = {
    includeInNetWorth: true,
    tags: [],
    ...KIND_BASE[option.kind],
    ...stored,
    ...kindFields.data,
    kind: option.kind,
    name: name.trim(),
    institution: institution.trim() || undefined,
    value: paise ?? undefined,
    asOf,
    notes: notes.trim() || undefined,
    owners: shares.map((s) => ({ memberId: s.memberId, shareBps: s.bps ?? 0 })),
    allocations,
    // Nominees are an asset's (#25); a liability keeps whatever it stored.
    ...(option.type === "asset" ? { nominees: toStored(nominees) } : {}),
  };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  const parsed = (
    option.type === "asset" ? assetData : liabilityData
  ).safeParse(data);
  const issue = parsed.success ? undefined : parsed.error.issues[0];
  const hint = kindFields.unreadable[0]
    ? `Check ${kindFields.unreadable[0]}`
    : issue?.code === "custom"
      ? issue.message
      : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) return;
    const again =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "again";
    setBusy(true);
    setError("");
    try {
      // The kind's fields were checked against its schema above; prepareWrite checks again.
      await save(option.type, parsed.data as never, editing?.id);
      onSaved(name.trim(), again);
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

  async function del() {
    if (!editing) return;
    setBusy(true);
    try {
      await remove(editing.id);
      onSaved(name.trim(), false);
    } catch {
      setError("Couldn't delete. Try again.");
      setBusy(false);
    }
  }

  const text = (
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
      {text("Name", name, setName, { maxLength: 80, required: true })}
      {text("Institution (optional)", institution, setInstitution, {
        maxLength: 80,
      })}
      {text(
        option.type === "liability" ? "Outstanding ₹" : "Current value ₹",
        value,
        setValue,
        {
          inputMode: "decimal",
          required: true,
          "aria-invalid": value !== "" && paise === null,
        },
      )}
      <KindFields specs={specs} inputs={inputs} onChange={setInputs} />
      {text("As of", asOf, setAsOf, { type: "date", required: true })}
      <OwnedBy me={me} people={people} shares={shares} onChange={setShares} />
      <GoalTags goals={goals} tags={tags} onChange={setTags} />
      {option.type === "asset" && (
        <Nominees
          me={me}
          people={people}
          rows={nominees}
          onChange={setNominees}
        />
      )}
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
      {hint && <p className="text-amber-700 dark:text-amber-300">{hint}</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          value="done"
          disabled={!parsed.success || busy}
          className={primary}
        >
          Save
        </button>
        {!editing && (
          <button
            type="submit"
            value="again"
            disabled={!parsed.success || busy}
            className={secondary}
          >
            Save &amp; add another
          </button>
        )}
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
