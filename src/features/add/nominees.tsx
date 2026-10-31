"use client";

import { useId } from "react";
import { FULL_BPS } from "@/domain/records/common";
import { bpsToPercent, parsePercent } from "./kinds";
import { type Person, ShareChip } from "./owned-by";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";

/** A nominee row as typed: a member by id, or anyone else by name (#25). */
export interface NomineeInput {
  memberId?: string;
  name: string;
  input: string;
  bps: number | null;
}

export type StoredNominee =
  | { kind: "member"; memberId: string; shareBps: number }
  | { kind: "person"; name: string; shareBps: number };

export const fromStored = (list: readonly StoredNominee[]): NomineeInput[] =>
  list.map((n) => ({
    memberId: n.kind === "member" ? n.memberId : undefined,
    name: n.kind === "person" ? n.name : "",
    input: bpsToPercent(n.shareBps),
    bps: n.shareBps,
  }));

/** The schema's shape; an empty list is no field at all, as the schema wants. */
export const toStored = (
  rows: readonly NomineeInput[],
): StoredNominee[] | undefined =>
  rows.length === 0
    ? undefined
    : rows.map((r) =>
        r.memberId
          ? { kind: "member", memberId: r.memberId, shareBps: r.bps ?? 0 }
          : { kind: "person", name: r.name.trim(), shareBps: r.bps ?? 0 },
      );

/** Equal shares again after a row is added or removed; the odd basis points go first. */
function resplit(rows: readonly NomineeInput[]): NomineeInput[] {
  const base = Math.floor(FULL_BPS / rows.length);
  return rows.map((r, i) => {
    const bps = base + (i < FULL_BPS - base * rows.length ? 1 : 0);
    return { ...r, input: bpsToPercent(bps), bps };
  });
}

/**
 * "Nominees (optional)" (#25, ADR-0061): who receives this asset, each a household member or
 * a named person, with shares that add up to 100%. Shares re-split evenly on add and remove.
 */
export function Nominees({
  me,
  people,
  rows,
  onChange,
}: {
  me: string;
  people: readonly Person[];
  rows: readonly NomineeInput[];
  onChange: (next: NomineeInput[]) => void;
}) {
  const chipId = useId();
  const everyone = [
    me,
    ...people.map((p) => p.memberId).filter((m) => m !== me),
  ];
  const nameOf = (memberId: string) =>
    memberId === me
      ? "Me"
      : (people.find((p) => p.memberId === memberId)?.name ?? "Former member");
  const label = (r: NomineeInput, i: number) =>
    r.memberId ? nameOf(r.memberId) : r.name.trim() || `Nominee ${i + 1}`;
  const unused = everyone.filter((m) => !rows.some((r) => r.memberId === m));
  const set = (i: number, patch: Partial<NomineeInput>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  let left: number | null = FULL_BPS;
  for (const r of rows) left = left === null || !r.bps ? null : left - r.bps;

  return (
    <details open={rows.length > 0}>
      <summary className="cursor-pointer">Nominees (optional)</summary>
      <fieldset
        className="mt-2 flex flex-col gap-2"
        aria-label="Nominees"
        aria-describedby={rows.length > 0 ? chipId : undefined}
      >
        {rows.map((r, i) => (
          <div
            // Rows have no id of their own; position is stable between edits.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={i}
            className="flex items-center gap-2"
          >
            {r.memberId ? (
              <span className="flex-1">{nameOf(r.memberId)}</span>
            ) : (
              <input
                aria-label={`Nominee ${i + 1} name`}
                placeholder="Name"
                maxLength={80}
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                className={`${field} min-w-0 flex-1`}
              />
            )}
            <input
              aria-label={`Share for ${label(r, i)}`}
              inputMode="decimal"
              value={r.input}
              onChange={(e) =>
                set(i, {
                  input: e.target.value,
                  bps: parsePercent(e.target.value),
                })
              }
              className={`${field} w-16 text-right`}
            />
            %
            <button
              type="button"
              aria-label={`Remove ${label(r, i)}`}
              onClick={() =>
                onChange(
                  rows.length > 1
                    ? resplit(rows.filter((_, j) => j !== i))
                    : [],
                )
              }
            >
              ✕
            </button>
          </div>
        ))}
        <select
          aria-label="Add a nominee"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const row = { name: "", input: "", bps: null };
            onChange(
              resplit([
                ...rows,
                v === "person" ? row : { ...row, memberId: v },
              ]),
            );
          }}
          className={field}
        >
          <option value="">+ Add a nominee</option>
          {unused.map((m) => (
            <option key={m} value={m}>
              {nameOf(m)}
            </option>
          ))}
          <option value="person">Someone else…</option>
        </select>
        {rows.length > 0 && (
          <ShareChip
            id={chipId}
            left={left}
            unread="Enter a share for each nominee"
          />
        )}
      </fieldset>
    </details>
  );
}
