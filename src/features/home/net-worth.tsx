"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatINR } from "@/domain/money";
import {
  type AllLenses,
  allLenses,
  assetItem,
  type BalanceItem,
  liabilityItem,
  type NetWorth,
} from "@/domain/networth";
import type { AssetData } from "@/domain/records/asset";
import type { LiabilityData } from "@/domain/records/liability";
import type { MemberData } from "@/domain/records/member";
import type { Entry } from "@/domain/records/typed";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import {
  useAssets,
  useLiabilities,
  useMembers,
} from "@/features/sync/typed-records";

export interface NetWorthSummary {
  /** No asset or liability at all, readable or not: Home shows the first-run CTA. */
  empty: boolean;
  /** Records this build can't read; they count for nothing until it can. */
  unreadable: number;
  lenses: AllLenses;
  me: string;
  /** The other members with a name, for the lens toggle, by name. */
  others: { id: string; name: string }[];
}

/**
 * Every lens from the typed records (ADR-0055, ADR-0059). Members are the viewer plus
 * everyone with a profile: a member who never set a name has no lens yet, so their shares
 * count in Household only, the same as a former member's.
 */
export function summarize(
  assets: readonly Entry<AssetData>[],
  liabilities: readonly Entry<LiabilityData>[],
  profiles: ReadonlyMap<string, MemberData>,
  me: string,
): NetWorthSummary {
  const items: BalanceItem[] = [];
  let unreadable = 0;
  for (const e of assets)
    if (e.result.status === "ok") items.push(assetItem(e.result.value));
    else unreadable++;
  for (const e of liabilities)
    if (e.result.status === "ok") items.push(liabilityItem(e.result.value));
    else unreadable++;
  const others = [...profiles]
    .filter(([id]) => id !== me)
    .map(([id, p]) => ({ id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    empty: assets.length + liabilities.length === 0,
    unreadable,
    lenses: allLenses(items, [me, ...others.map((o) => o.id)]),
    me,
    others,
  };
}

export function useNetWorth(): NetWorthSummary {
  const me = useHouseholdSync()?.userId ?? "";
  const profiles = useMembers();
  const assets = useAssets();
  const liabilities = useLiabilities();
  return useMemo(
    () => summarize(assets, liabilities, profiles, me),
    [assets, liabilities, profiles, me],
  );
}

const ZERO: NetWorth = { assets: 0, liabilities: 0, net: 0 };

/**
 * The Home hero (UX.md §3.2) with the ownership lens (§2.1): Me · Household · each other
 * member. Switching only re-does the arithmetic, so it is instant; no data is fetched.
 */
export function NetWorthHero({ summary }: { summary: NetWorthSummary }) {
  const [lens, setLens] = useState<string>("household");
  const { lenses, me, others, unreadable } = summary;
  const options = [
    { id: me, label: "Me" },
    { id: "household", label: "Household" },
    ...others.map((o) => ({ id: o.id, label: o.name })),
  ];
  const figure =
    lens === "household"
      ? lenses.household
      : (lenses.byMember.get(lens) ?? ZERO);
  const heading =
    lens === "household"
      ? "Household net worth"
      : lens === me
        ? "Your net worth"
        : `${others.find((o) => o.id === lens)?.name ?? "Their"}'s net worth`;

  return (
    <section
      aria-label="Net worth"
      className="flex w-full flex-col items-center gap-3 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <fieldset
        aria-label="Whose net worth"
        className="m-0 flex border-0 max-w-full gap-1 overflow-x-auto rounded-md bg-neutral-100 p-1 text-sm dark:bg-neutral-900"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={lens === o.id}
            onClick={() => setLens(o.id)}
            className="shrink-0 rounded px-3 py-1 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-700"
          >
            {o.label}
          </button>
        ))}
      </fieldset>
      <h2 className="text-sm text-neutral-500">{heading}</h2>
      <p className="text-4xl font-semibold tabular-nums">
        {formatINR(figure.net)}
      </p>
      <p className="text-xs text-neutral-500 tabular-nums">
        Assets {formatINR(figure.assets)} · Liabilities{" "}
        {formatINR(figure.liabilities)}
      </p>
      {unreadable > 0 && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
          {unreadable === 1
            ? "1 record couldn't be read and isn't counted."
            : `${unreadable} records couldn't be read and aren't counted.`}{" "}
          <Link href="/accounts" className="underline">
            See Accounts
          </Link>
        </p>
      )}
    </section>
  );
}
