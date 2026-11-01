"use client";

import { useState } from "react";
import { formatINR } from "@/domain/money";
import { BUCKETS, type Bucket } from "@/domain/records/catalogue";
import type { SnapshotData } from "@/domain/records/snapshot";
import { byMember, dayChange, lensNet } from "@/domain/timeline";
import { BUCKET_LABEL } from "@/features/add/kinds";

/**
 * Bucket → chart slot (UX.md §6.3). Snapshots hold buckets, not the Foreign section, so
 * Lending & Loans takes slot 5 instead of sharing violet with Insurance.
 */
export const BUCKET_SLOT: Readonly<Record<Bucket, number>> = {
  cashBank: 1,
  deposits: 2,
  investments: 3,
  retirement: 4,
  property: 6,
  insurance: 7,
  lendingLoans: 5,
};

const pill =
  "rounded px-3 py-1 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-700";

function Swatch({ slot }: { slot: number }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-sm"
      style={{ background: `var(--chart-${slot})` }}
    />
  );
}

/**
 * The latest point's composition, by asset type (Household buckets) or by member. Amounts
 * are plain text beside a swatch; the colour never carries the number (UX.md §6.3).
 */
export function Breakdown({
  point,
  nameOf,
}: {
  point: SnapshotData;
  nameOf: (id: string) => string;
}) {
  const [view, setView] = useState<"type" | "member">("type");
  const rows =
    view === "type"
      ? BUCKETS.filter((b) => (point.buckets[b] ?? 0) > 0).map((b) => ({
          key: b,
          label: BUCKET_LABEL[b],
          amount: point.buckets[b] ?? 0,
          slot: BUCKET_SLOT[b],
        }))
      : byMember(point).map((m, i) => ({
          key: m.id,
          label: nameOf(m.id),
          amount: m.net,
          slot: (i % 7) + 1,
        }));
  return (
    <section aria-label="Breakdown" className="flex flex-col gap-2">
      <fieldset
        aria-label="Break down by"
        className="m-0 flex gap-1 self-start rounded-md border-0 bg-neutral-100 p-1 text-sm dark:bg-neutral-900"
      >
        <button
          type="button"
          aria-pressed={view === "type"}
          onClick={() => setView("type")}
          className={pill}
        >
          By asset type
        </button>
        <button
          type="button"
          aria-pressed={view === "member"}
          onClick={() => setView("member")}
          className={pill}
        >
          By member
        </button>
      </fieldset>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing to break down yet.</p>
      ) : (
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <Swatch slot={r.slot} />
              <span className="flex-1">{r.label}</span>
              <span className="tabular-nums">{formatINR(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {view === "type" && point.household.liabilities > 0 && (
        <p className="text-xs text-neutral-500 tabular-nums">
          Less loans and debts {formatINR(point.household.liabilities)}
        </p>
      )}
    </section>
  );
}

/** The chart's series as a plain table (UX.md §3.3, §8): the same numbers, no chart needed. */
export function SeriesTable({
  points,
  series,
  nameOf,
}: {
  points: readonly SnapshotData[];
  series: readonly string[];
  nameOf: (id: string) => string;
}) {
  const lens = series[0];
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">View as table</summary>
      <table aria-label="Net worth by date" className="mt-2 w-full">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <th className="py-1">Date</th>
            {series.map((s) => (
              <th key={s} className="py-1 text-right">
                {nameOf(s)}
              </th>
            ))}
            <th className="py-1 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const change = dayChange(points, i, lens);
            return (
              <tr key={p.date} className="tabular-nums">
                <td className="py-1">{p.date}</td>
                {series.map((s) => (
                  <td key={s} className="py-1 text-right">
                    {formatINR(lensNet(p, s))}
                  </td>
                ))}
                <td className="py-1 text-right">
                  {change === undefined
                    ? "–"
                    : `${change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}${formatINR(change)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
