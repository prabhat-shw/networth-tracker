/**
 * Valuation on read (ADR-0064 §2, #169). Pure and integer-only. A priced holding is worth
 * `quantity × price × fx` from the device's universes. The figure is derived on every read
 * and never written back. When no price matches, the stored `value` is used instead and
 * labelled "manual value".
 */
import type { Paise } from "../money";
import {
  assetItem,
  type BalanceItem,
  liabilityItem,
  netWorthValue,
} from "../networth";
import type { AssetData } from "../records/asset";
import type { LiabilityData } from "../records/liability";
import { formatUnits } from "../units";
import { INR, isPrice, marketValue, toPriceUnits } from "./price";
import { fxRate, lookup, type Universe, type Universes } from "./universe";

/** A price is stale once its file was fetched over 36 h ago (UX.md §2.3). */
export const STALE_AFTER_MS = 36 * 3_600_000;

export type Valuation =
  | {
      source: "market";
      value: Paise;
      /** The trading day of the price, for the "as of" caption. */
      asOf: string;
      stale: boolean;
    }
  | {
      source: "manual";
      value: Paise;
      /** A kind a price could value, but none matched: shown as "manual value". */
      priceable: boolean;
    };

const manual = (
  data: AssetData | LiabilityData,
  priceable = true,
): Valuation => ({ source: "manual", value: netWorthValue(data), priceable });

const isStale = (now: Date, ...files: (Universe | undefined)[]) =>
  files.some(
    (u) => u && now.getTime() - Date.parse(u.fetchedAt) > STALE_AFTER_MS,
  );

/** The universe that priced a currency: none for INR, else FX. */
const fxFile = (universes: Universes, currency: string) =>
  currency === "INR" ? undefined : universes.fx;

/**
 * Rupees for `weightMg` of a metal at `perGram` (24k), prorated to `karat`/24 and rounded
 * half-up to the paisa once. Undefined past the safe-integer range.
 */
export function metalValue(
  weightMg: number,
  karat: number,
  perGram: string,
): Paise | undefined {
  if (!isPrice(perGram)) return undefined;
  // price in 10⁻¹² rupees per gram; paise = mg/1000 × k/24 × price × 100 / 10¹².
  const n = BigInt(weightMg) * BigInt(karat) * toPriceUnits(perGram);
  const d = BigInt(24) * BigInt(10) ** BigInt(13);
  const paise = (n * BigInt(2) + d) / (d * BigInt(2));
  return paise > BigInt(Number.MAX_SAFE_INTEGER) ? undefined : Number(paise);
}

function priced(
  data: Extract<AssetData, { instrument: unknown }>,
  universes: Universes,
  now: Date,
): Valuation {
  const quote = lookup(universes, data.instrument);
  if (!quote) return manual(data);
  const fx = fxRate(universes, quote.currency);
  if (!fx) return manual(data);
  try {
    return {
      source: "market",
      value: marketValue(data.quantity, quote.price, fx),
      asOf: quote.date,
      stale: isStale(
        now,
        universes[data.instrument.source],
        fxFile(universes, quote.currency),
      ),
    };
  } catch {
    return manual(data);
  }
}

/** What an asset is worth now: from a price when one matches, else its manual value. */
export function valuation(
  data: AssetData,
  universes: Universes,
  now: Date,
): Valuation {
  switch (data.kind) {
    case "mutualFund":
    case "stock":
    case "usStock":
    case "crypto":
    // `quantity` is the vested units; `unvested` never counts (UX §4.2).
    case "rsu":
      return priced(data, universes, now);
    case "foreignBank": {
      const fx = fxRate(universes, data.currency);
      if (!fx || data.currency === "INR") return manual(data);
      // balanceMinor is hundredths of the currency; units are 10⁻⁸.
      const units = formatUnits(BigInt(data.balanceMinor) * BigInt(1_000_000));
      try {
        return {
          source: "market",
          value: marketValue(units, fx, INR),
          asOf: universes.fx?.date ?? "",
          stale: isStale(now, universes.fx),
        };
      } catch {
        return manual(data);
      }
    }
    case "preciousMetal": {
      const metal = universes.metal;
      const code = data.metal === "gold" ? "gold999" : "silver999";
      if (!data.weightMg || !metal || !Object.hasOwn(metal.prices, code))
        return manual(data);
      // Silver is priced at 999 whatever its karat field says.
      const karat = data.metal === "gold" ? (data.karat ?? 24) : 24;
      const value = metalValue(data.weightMg, karat, metal.prices[code]);
      if (value === undefined) return manual(data);
      const asOf =
        metal.dates && Object.hasOwn(metal.dates, code)
          ? metal.dates[code]
          : metal.date;
      return { source: "market", value, asOf, stale: isStale(now, metal) };
    }
    default:
      return manual(data, false);
  }
}

/** Every record's net-worth item, valued: the input `netWorth()` / `allLenses()` expect. */
export function valuedItems(
  assets: readonly AssetData[],
  liabilities: readonly LiabilityData[],
  universes: Universes,
  now: Date,
): BalanceItem[] {
  return [
    ...assets.map((a) => ({
      ...assetItem(a),
      value: valuation(a, universes, now).value,
    })),
    ...liabilities.map(liabilityItem),
  ];
}

/** The oldest market price among `valuations`, and whether any is stale. */
export function priceSummary(valuations: readonly Valuation[]): {
  asOf?: string;
  stale: boolean;
} {
  let asOf: string | undefined;
  let stale = false;
  for (const v of valuations) {
    if (v.source !== "market") continue;
    if (asOf === undefined || v.asOf < asOf) asOf = v.asOf;
    stale ||= v.stale;
  }
  return { asOf, stale };
}
