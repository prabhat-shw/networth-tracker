"use client";

import { useId, useState } from "react";
import { formatINR, type Paise } from "@/domain/money";
import { marketValue } from "@/domain/prices/price";
import { type InstrumentSource, searchUniverse } from "@/domain/prices/search";
import { fxRate, lookup } from "@/domain/prices/universe";
import { isQuantity } from "@/domain/units";
import { shortDate } from "@/features/prices/price-caption";
import { useUniverses } from "@/features/sync/sync-provider";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";

const showPrice = (price: string, currency: string) =>
  currency === "INR" ? `₹${price}` : `${currency} ${price}`;

/**
 * The scheme / ticker field (#170): type a name or code and pick from the universes already
 * on the device. Nothing is fetched, so the search never names a holding (ADR-0005). A
 * picked or typed code that matches shows today's price and can fill the value from the
 * units; an unmatched code is still saved, valued by the manual value.
 */
export function InstrumentPicker({
  sources,
  label,
  source,
  code,
  quantity,
  onChange,
  onFill,
}: {
  sources: readonly InstrumentSource[];
  label: string;
  source: InstrumentSource;
  code: string;
  quantity: string;
  onChange: (source: InstrumentSource, code: string) => void;
  onFill: (value: Paise) => void;
}) {
  const universes = useUniverses();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const matches = open ? searchUniverse(universes, sources, code) : [];

  const quote = code.trim()
    ? lookup(universes, { source, code: code.trim() })
    : undefined;
  const fx = quote ? fxRate(universes, quote.currency) : undefined;
  const worth = (price: string, rate: string | undefined) => {
    if (!rate || !isQuantity(quantity)) return undefined;
    try {
      return marketValue(quantity, price, rate);
    } catch {
      return undefined;
    }
  };
  const value = quote ? worth(quote.price, fx) : undefined;

  function pick(m: {
    source: InstrumentSource;
    code: string;
    price: string;
    currency: string;
  }) {
    onChange(m.source, m.code);
    setOpen(false);
    const v = worth(m.price, fxRate(universes, m.currency));
    if (v !== undefined) onFill(v);
  }

  const downloaded = sources.some((s) => universes[s]);
  return (
    <div className="flex flex-1 flex-col gap-1">
      <label className="flex flex-col gap-1">
        {label}
        <input
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={downloaded ? "Search by name or code" : undefined}
          value={code}
          onChange={(e) => {
            onChange(source, e.target.value);
            setOpen(true);
          }}
          maxLength={32}
          className={field}
        />
      </label>
      {matches.length > 0 && (
        <ul
          id={listId}
          aria-label={`${label} matches`}
          className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800"
        >
          {matches.map((m) => (
            <li key={`${m.source}:${m.code}`}>
              <button
                type="button"
                onClick={() => pick(m)}
                className="flex w-full justify-between gap-2 px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <span>
                  {m.name ?? m.code}
                  {m.name && (
                    <span className="block text-xs text-neutral-500">
                      {m.code}
                      {sources.length > 1 ? ` · ${m.source.toUpperCase()}` : ""}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-neutral-500">
                  {showPrice(m.price, m.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {quote ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>
            Today {showPrice(quote.price, quote.currency)} per unit · as of{" "}
            {shortDate(quote.date)}
          </span>
          {value !== undefined && (
            <button
              type="button"
              onClick={() => onFill(value)}
              className="underline"
            >
              Use {formatINR(value)} as the value
            </button>
          )}
        </p>
      ) : (
        code.trim() !== "" &&
        matches.length === 0 && (
          <p className="text-xs text-neutral-500">
            {downloaded
              ? "No price found for this code. The value you enter is used (manual value)."
              : "Prices aren't downloaded yet. The value you enter is used."}
          </p>
        )
      )}
    </div>
  );
}
