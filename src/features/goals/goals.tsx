"use client";

import { type EarmarkSource, earmarks } from "@/domain/earmarks";
import { formatINR } from "@/domain/money";
import { netWorthValue } from "@/domain/networth";
import type { AssetData } from "@/domain/records/asset";
import type { GoalData } from "@/domain/records/goal";
import type { LiabilityData } from "@/domain/records/liability";
import type { Entry } from "@/domain/records/typed";
import {
  useAssets,
  useGoals,
  useLiabilities,
} from "@/features/sync/typed-records";
import { GoalDialog } from "./goal-form";
import { GOAL_KIND_LABEL } from "./goal-kinds";

function sources(
  side: EarmarkSource["side"],
  list: readonly Entry<AssetData | LiabilityData>[],
): EarmarkSource[] {
  return list.flatMap((e) =>
    e.result.status === "ok"
      ? [
          {
            side,
            value: netWorthValue(e.result.value),
            includeInNetWorth: e.result.value.includeInNetWorth,
            allocations: e.result.value.allocations,
            owners: e.result.value.owners,
          },
        ]
      : [],
  );
}

const card =
  "flex flex-col gap-1 rounded-lg border p-4 text-left text-sm border-neutral-200 dark:border-neutral-800";

/**
 * Goals (UX.md §3.6, ADR-0060), household view: each goal with what accounts earmark to it,
 * then Unallocated as a dashed, goal-shaped card so it reads as "not yet a goal". Status,
 * progress maths and the allocation editor are M5; earmarks are set on each account.
 */
export function Goals() {
  const goals = useGoals();
  const assets = useAssets();
  const liabilities = useLiabilities();

  const readable: { id: string; data: GoalData }[] = [];
  let unreadable = 0;
  for (const g of goals)
    if (g.result.status === "ok")
      readable.push({ id: g.id, data: g.result.value });
    else unreadable++;
  readable.sort(
    (a, b) =>
      a.data.priority - b.data.priority ||
      a.data.targetDate.localeCompare(b.data.targetDate),
  );

  const all = [
    ...sources("asset", assets),
    ...sources("liability", liabilities),
  ];
  const { byGoal, unallocated } = earmarks(
    all,
    new Set(readable.map((g) => g.id)),
  );
  const earmarked = [...byGoal.values()].reduce((t, p) => t + p, 0);
  const hasNetWorth = all.some((s) => s.includeInNetWorth);

  return (
    <section aria-label="Goals" className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {formatINR(earmarked)} earmarked of{" "}
          {formatINR(earmarked + unallocated)} net worth
        </p>
        <GoalDialog />
      </div>
      {unreadable > 0 && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {unreadable === 1
            ? "1 goal couldn't be read."
            : `${unreadable} goals couldn't be read.`}
        </p>
      )}
      {readable.length === 0 && (
        <p className="text-sm">
          No goals yet. Money you haven't earmarked shows as Unallocated.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-3">
        {readable.map(({ id, data }) => (
          <li key={id} className={card}>
            <GoalDialog label={data.name} editing={{ id, data }} />
            <span className="text-xs text-neutral-500">
              {GOAL_KIND_LABEL[data.kind]} · priority {data.priority}
            </span>
            <span className="tabular-nums">
              {formatINR(byGoal.get(id) ?? 0)} of {formatINR(data.targetAmount)}{" "}
              ({data.targetDate.slice(0, 4)})
            </span>
          </li>
        ))}
        {(hasNetWorth || readable.length > 0) && (
          <li
            aria-label="Unallocated"
            className={`${card} border-dashed text-neutral-600 dark:text-neutral-400`}
          >
            <span className="font-medium">Unallocated</span>
            <span className="tabular-nums">{formatINR(unallocated)}</span>
            <span className="text-xs">
              Not earmarked yet. Tag an account to a goal from Accounts.
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
