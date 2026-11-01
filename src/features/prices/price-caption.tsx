import type { Valuation } from "@/domain/prices/valuation";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** `2026-09-08` → `8 Sep`, read as a calendar date (no time zone can shift it). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim();
}

/**
 * The per-instrument price caption (UX.md §2.3): `as of 8 Sep`, or, once the file is over
 * 36 h old, `⚠ price stale · as of 5 Sep` in the warning tone (text and icon, never colour
 * alone). Never a "live" figure.
 */
export function PriceCaption({
  asOf,
  stale,
  prefix = "",
}: {
  asOf: string;
  stale: boolean;
  prefix?: string;
}) {
  return stale ? (
    <span className="text-xs text-amber-700 dark:text-amber-300">
      ⚠ {prefix ? `${prefix.trim().toLowerCase()} ` : "price "}stale · as of{" "}
      {shortDate(asOf)}
    </span>
  ) : (
    <span className="text-xs text-neutral-500">
      {prefix}as of {shortDate(asOf)}
    </span>
  );
}

/**
 * A holding's caption: its price date; "manual value" (with the date it was entered) for a
 * priceable holding no price matched; otherwise just the entered date.
 */
export function ValuationCaption({
  v,
  enteredOn,
}: {
  v: Valuation | undefined;
  enteredOn?: string;
}) {
  if (v?.source === "market")
    return <PriceCaption asOf={v.asOf} stale={v.stale} />;
  const on = enteredOn ? shortDate(enteredOn) : "";
  const text = v?.priceable
    ? on
      ? `manual value · ${on}`
      : "manual value"
    : on;
  return <span className="text-xs text-neutral-500">{text}</span>;
}

/** Whether a row needs a caption on a phone, where the As-of column is hidden. */
export const showsCaption = (v: Valuation | undefined) =>
  v?.source === "market" || (v?.source === "manual" && v.priceable);
