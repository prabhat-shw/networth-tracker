"use client";

import type { Paise } from "@/domain/money";
import type { InstrumentSource } from "@/domain/prices/search";
import type { FieldInputs, FieldSpec } from "./fields";
import { InstrumentPicker } from "./instrument-picker";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";

const inputProps: Record<
  string,
  { type?: string; inputMode?: "decimal" | "numeric" }
> = {
  text: {},
  date: { type: "date" },
  rupees: { inputMode: "decimal" },
  percent: { inputMode: "decimal" },
  units: { inputMode: "decimal" },
  int: { inputMode: "numeric" },
  grams: { inputMode: "decimal" },
};

/** The kind-specific fields (UX §4.2), drawn from their specs, between Value and As of. */
export function KindFields({
  specs,
  inputs,
  onChange,
  onFillValue,
}: {
  specs: readonly FieldSpec[];
  inputs: FieldInputs;
  onChange: (next: FieldInputs) => void;
  /** The instrument picker's "use today's value" (#170). */
  onFillValue?: (value: Paise) => void;
}) {
  const set = (key: string, v: string | boolean) =>
    onChange({ ...inputs, [key]: v });
  return (
    <>
      {specs.map((spec) => {
        if (spec.input === "switch")
          return (
            <label key={spec.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={inputs[spec.key] === true}
                onChange={(e) => set(spec.key, e.target.checked)}
              />
              {spec.label}
            </label>
          );
        if (spec.input === "select")
          return (
            <label key={spec.key} className="flex flex-col gap-1">
              {spec.label}
              <select
                aria-label={spec.label}
                value={String(inputs[spec.key] ?? "")}
                onChange={(e) => set(spec.key, e.target.value)}
                className={field}
              >
                {spec.options.map(([v, l]) => (
                  <option key={String(v)} value={String(v)}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          );
        if (spec.input === "instrument")
          return (
            <div key={spec.key} className="flex gap-2">
              {spec.sources.length > 1 && (
                <label className="flex flex-col gap-1">
                  Exchange
                  <select
                    aria-label="Exchange"
                    value={String(inputs["instrument.source"] ?? "")}
                    onChange={(e) => set("instrument.source", e.target.value)}
                    className={field}
                  >
                    {spec.sources.map(([v, l]) => (
                      <option key={String(v)} value={String(v)}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <InstrumentPicker
                sources={spec.sources.map(([v]) => v as InstrumentSource)}
                label={spec.codeLabel}
                source={
                  String(
                    inputs["instrument.source"] ?? spec.sources[0]?.[0],
                  ) as InstrumentSource
                }
                code={String(inputs["instrument.code"] ?? "")}
                quantity={String(inputs.quantity ?? "")}
                onChange={(source, code) =>
                  onChange({
                    ...inputs,
                    "instrument.source": source,
                    "instrument.code": code,
                  })
                }
                onFill={(v) => onFillValue?.(v)}
              />
            </div>
          );
        return (
          <label key={spec.key} className="flex flex-col gap-1">
            {spec.optional ? `${spec.label} (optional)` : spec.label}
            <input
              {...inputProps[spec.input]}
              value={String(inputs[spec.key] ?? "")}
              onChange={(e) => set(spec.key, e.target.value)}
              className={field}
            />
          </label>
        );
      })}
    </>
  );
}
