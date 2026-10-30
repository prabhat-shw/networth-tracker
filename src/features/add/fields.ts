/**
 * Kind-specific fields as data (UX.md §4.2, ADR-0057; the table is `field-specs.ts`): one
 * renderer draws them all, and `readFields` / `fieldInputs` convert between what the form
 * holds (strings and booleans) and the record's typed fields. Amounts, rates and grams
 * are parsed from strings, never through floats.
 */
import type { Paise } from "@/domain/money";
import { bpsToPercent, parsePercent, parseRupees } from "./kinds";

export type Option = readonly [value: string | number, label: string];

export type FieldSpec = { key: string; label: string } & (
  | { input: "select"; options: readonly Option[] }
  | { input: "switch" }
  | {
      input: "text" | "date" | "rupees" | "percent" | "units" | "int" | "grams";
      optional?: boolean;
    }
  | { input: "instrument"; sources: readonly Option[]; codeLabel: string }
);

/** What the form holds per field: strings for inputs, booleans for switches. */
export type FieldInputs = Record<string, string | boolean>;

/** "12.5" grams → 12 500 mg, by string arithmetic. */
function parseGrams(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(input.trim());
  return m ? Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0")) : null;
}

const parsers: Record<string, (s: string) => unknown> = {
  text: (s) => s,
  date: (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null),
  rupees: parseRupees,
  percent: parsePercent,
  units: (s) => (/^\d+(\.\d+)?$/.test(s) ? s : null),
  int: (s) => (/^\d{1,4}$/.test(s) ? Number(s) : null),
  grams: parseGrams,
};

/** Paise (or any 2-decimal minor units) back to an input string: 1500050 → "15000.5". */
export const paiseToInput = (p: Paise) =>
  `${Math.floor(p / 100)}${
    p % 100
      ? `.${String(p % 100)
          .padStart(2, "0")
          .replace(/0$/, "")}`
      : ""
  }`;

const formatters: Record<string, (v: unknown) => string> = {
  rupees: (v) => paiseToInput(v as number),
  percent: (v) => bpsToPercent(v as number),
  int: (v) => String(v),
  grams: (v) => String((v as number) / 1000),
};

export interface ReadFields {
  /** The typed fields; a blank optional field is `undefined`, so a merge clears it. */
  data: Record<string, unknown>;
  /** Labels of fields that are filled in but can't be read. */
  unreadable: string[];
}

export function readFields(
  specs: readonly FieldSpec[],
  inputs: FieldInputs,
): ReadFields {
  const data: Record<string, unknown> = {};
  const unreadable: string[] = [];
  for (const spec of specs) {
    const raw = inputs[spec.key];
    if (spec.input === "switch") data[spec.key] = raw === true;
    else if (spec.input === "select")
      data[spec.key] = spec.options.find((o) => String(o[0]) === raw)?.[0];
    else if (spec.input === "instrument") {
      const code = String(inputs["instrument.code"] ?? "").trim();
      data.instrument = code
        ? { source: inputs["instrument.source"], code }
        : undefined;
    } else {
      const s = String(raw ?? "").trim();
      if (!s) data[spec.key] = undefined;
      else {
        const v = parsers[spec.input]?.(s) ?? null;
        if (v === null) unreadable.push(spec.label);
        data[spec.key] = v ?? undefined;
      }
    }
  }
  return { data, unreadable };
}

/** The form's starting inputs: from a stored record when editing, else the defaults. */
export function fieldInputs(
  specs: readonly FieldSpec[],
  data: Record<string, unknown> = {},
): FieldInputs {
  const out: FieldInputs = {};
  for (const spec of specs) {
    const v = data[spec.key];
    if (spec.input === "switch") out[spec.key] = v === true;
    else if (spec.input === "select")
      out[spec.key] = String(v ?? spec.options[0]?.[0] ?? "");
    else if (spec.input === "instrument") {
      const i = v as { source?: string; code?: string } | undefined;
      out["instrument.source"] = String(i?.source ?? spec.sources[0]?.[0]);
      out["instrument.code"] = i?.code ?? "";
    } else if (v === undefined) out[spec.key] = "";
    else out[spec.key] = formatters[spec.input]?.(v) ?? String(v);
  }
  return out;
}
