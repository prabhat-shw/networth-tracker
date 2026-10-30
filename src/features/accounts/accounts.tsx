"use client";

import { useState } from "react";
import { formatINR } from "@/domain/money";
import type { AssetData } from "@/domain/records/asset";
import {
  ASSET_PLACEMENT,
  LIABILITY_PLACEMENT,
  SECTIONS,
  type Section,
} from "@/domain/records/catalogue";
import type { ReadResult } from "@/domain/records/evolution";
import type { LiabilityData } from "@/domain/records/liability";
import { FORMER_MEMBER } from "@/domain/records/member";
import { AddAnything } from "@/features/add/add-anything";
import { optionFor } from "@/features/add/kinds";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import {
  useAssets,
  useLiabilities,
  useMembers,
  useRecordWriter,
} from "@/features/sync/typed-records";
import { ownershipBadge, taggedPercent } from "./badge";

export const SECTION_LABEL: Readonly<Record<Section, string>> = {
  cashBank: "Cash & Bank",
  deposits: "Deposits",
  investments: "Investments",
  retirement: "Retirement & Small Savings",
  foreign: "Foreign",
  property: "Property & Valuables",
  insurance: "Insurance",
  lending: "Lending",
  loans: "Loans & Debts",
};

type Data = AssetData | LiabilityData;
interface Row {
  id: string;
  side: "asset" | "liability";
  data: Data;
}

const sectionOf = (r: Row): Section =>
  r.side === "asset"
    ? ASSET_PLACEMENT[(r.data as AssetData).kind].section
    : LIABILITY_PLACEMENT[(r.data as LiabilityData).kind].section;

const cell = "px-2 py-2 align-top";
const wide = `${cell} hidden sm:table-cell`;

/**
 * Accounts (UX.md §3.4): every asset and liability, one section per schema category. Empty
 * sections stay visible so the taxonomy is learnable; a record this build can't read is its
 * own error row and never hides the rest. Tapping a name opens its edit form (#136).
 */
export function Accounts() {
  const me = useHouseholdSync()?.userId ?? "";
  const profiles = useMembers();
  const assets = useAssets();
  const liabilities = useLiabilities();
  const [query, setQuery] = useState("");

  const rows: Row[] = [];
  const broken: { id: string; result: ReadResult<unknown> }[] = [];
  for (const [side, list] of [
    ["asset", assets],
    ["liability", liabilities],
  ] as const)
    for (const e of list) {
      if (e.result.status === "ok")
        rows.push({ id: e.id, side, data: e.result.value });
      else broken.push(e);
    }

  if (rows.length === 0 && broken.length === 0)
    return (
      <section
        aria-label="Accounts"
        className="flex flex-col items-center gap-3 rounded-lg border border-neutral-200 p-6 text-center dark:border-neutral-800"
      >
        <p className="font-medium">Nothing added yet</p>
        <AddAnything label="Add your first account" />
      </section>
    );

  const nameOf = (id: string) => profiles.get(id)?.name ?? FORMER_MEMBER;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (r: Row) => {
    const hay =
      `${r.data.name} ${r.data.institution ?? ""} ${optionFor(r.data.kind)?.label ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const shown = rows.filter(matches);

  return (
    <section aria-label="Accounts" className="flex w-full flex-col gap-4">
      <div className="flex gap-2">
        <input
          type="search"
          aria-label="Search accounts"
          placeholder="Search accounts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700"
        />
        <AddAnything />
      </div>
      {broken.length > 0 && <BrokenRows entries={broken} />}
      {words.length > 0 && shown.length === 0 && (
        <p className="text-sm text-neutral-500">No accounts match.</p>
      )}
      {SECTIONS.map((section) => {
        const list = shown.filter((r) => sectionOf(r) === section);
        if (words.length > 0 && list.length === 0) return null;
        const total = list.reduce((t, r) => t + r.data.value, 0);
        return (
          <details key={section} open className="group">
            <summary className="flex cursor-pointer justify-between border-b border-neutral-200 py-1 text-sm font-semibold dark:border-neutral-800">
              <span>
                <span>{SECTION_LABEL[section]}</span>{" "}
                <span className="font-normal text-neutral-500">
                  {list.length}
                </span>
              </span>
              {list.length > 0 && <span>{formatINR(total)}</span>}
            </summary>
            {list.length === 0 ? (
              <p className="py-2 text-sm text-neutral-500">Nothing here yet</p>
            ) : (
              <table
                aria-label={SECTION_LABEL[section]}
                className="w-full text-sm"
              >
                <thead className="sr-only sm:not-sr-only">
                  <tr className="text-left text-xs text-neutral-500">
                    <th className={cell}>Name</th>
                    <th className={wide}>Institution</th>
                    <th className={`${cell} text-right`}>Value</th>
                    <th className={wide}>Tagged</th>
                    <th className={wide}>As of</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const badge = ownershipBadge(r.data.owners, me, nameOf);
                    const tagged = taggedPercent(
                      r.data.allocations,
                      r.data.value,
                    );
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-neutral-100 dark:border-neutral-900"
                      >
                        <td className={cell}>
                          <AddAnything
                            label={r.data.name}
                            editing={{
                              id: r.id,
                              data: r.data as unknown as Record<
                                string,
                                unknown
                              >,
                            }}
                          />
                          {badge && (
                            <span className="block text-xs text-neutral-500">
                              {badge}
                            </span>
                          )}
                        </td>
                        <td className={wide}>{r.data.institution}</td>
                        <td className={`${cell} text-right tabular-nums`}>
                          {formatINR(r.data.value)}
                        </td>
                        <td className={wide}>
                          {tagged > 0 ? `${tagged}% tagged` : ""}
                        </td>
                        <td className={wide}>{r.data.asOf}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </details>
        );
      })}
    </section>
  );
}

/** One placeholder per unreadable record (UX §3.4 error row): say why, offer Remove. */
function BrokenRows({
  entries,
}: {
  entries: readonly { id: string; result: ReadResult<unknown> }[];
}) {
  const { remove } = useRecordWriter();
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between gap-2 rounded-md border border-red-400 px-3 py-2 text-sm"
        >
          <span>
            {e.result.status === "too-new"
              ? "Needs a newer app version"
              : "Couldn't load this record"}
          </span>
          {e.result.status !== "too-new" &&
            (confirming === e.id ? (
              <button
                type="button"
                onClick={() => remove(e.id)}
                className="text-red-600 underline"
              >
                Yes, remove it
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(e.id)}
                className="underline"
              >
                Remove
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}
