"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatINR } from "@/domain/money";
import {
  type AllLenses,
  allLenses,
  assetItem,
  type BalanceItem,
  liabilityItem,
  type NetWorth,
} from "@/domain/networth";
import { priceSummary, type Valuation } from "@/domain/prices/valuation";
import type { AssetData } from "@/domain/records/asset";
import type { LiabilityData } from "@/domain/records/liability";
import type { MemberData } from "@/domain/records/member";
import type { Entry } from "@/domain/records/typed";
import { LensBar, useLens } from "@/features/lens/lens-bar";
import { PriceCaption } from "@/features/prices/price-caption";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import {
  useAssets,
  useLiabilities,
  useMembers,
  useValuations,
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
  /** The oldest market price behind the figure, and whether any is stale. */
  prices: { asOf?: string; stale: boolean };
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
  valuations: ReadonlyMap<string, Valuation> = new Map(),
): NetWorthSummary {
  const items: BalanceItem[] = [];
  let unreadable = 0;
  for (const e of assets)
    if (e.result.status === "ok") {
      const item = assetItem(e.result.value);
      const v = valuations.get(e.id);
      items.push(v ? { ...item, value: v.value } : item);
    } else unreadable++;
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
    prices: priceSummary([...valuations.values()]),
  };
}

export function useNetWorth(): NetWorthSummary {
  const me = useHouseholdSync()?.userId ?? "";
  const profiles = useMembers();
  const assets = useAssets();
  const liabilities = useLiabilities();
  const valuations = useValuations();
  return useMemo(
    () => summarize(assets, liabilities, profiles, me, valuations),
    [assets, liabilities, profiles, me, valuations],
  );
}

const ZERO: NetWorth = { assets: 0, liabilities: 0, net: 0 };

/**
 * The Home hero (UX.md §3.2) with the ownership lens (§2.1): Me · Household · each other
 * member. The lens is the device-wide choice (ADR-0071 §1), shared with Accounts and Goals.
 */
export function NetWorthHero({ summary }: { summary: NetWorthSummary }) {
  const { id: lens } = useLens();
  const { lenses, me, others, unreadable } = summary;
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
      <LensBar />
      <h2 className="text-sm text-neutral-500">{heading}</h2>
      <p className="text-4xl font-semibold tabular-nums">
        {formatINR(figure.net)}
      </p>
      <p className="text-xs text-neutral-500 tabular-nums">
        Assets {formatINR(figure.assets)} · Liabilities{" "}
        {formatINR(figure.liabilities)}
      </p>
      <Link href="/networth" className="text-sm underline">
        See it over time
      </Link>
      {summary.prices.asOf && (
        <PriceCaption
          asOf={summary.prices.asOf}
          stale={summary.prices.stale}
          prefix="Prices "
        />
      )}
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
