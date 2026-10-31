"use client";

import { GRANDFATHER_DATE, type Lot } from "@/domain/records/common";
import { formatUnits, isQuantity, sumUnits, toUnits } from "@/domain/units";
import { paiseToInput } from "./fields";
import { parseRupees, today } from "./kinds";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";

/** A lot as typed (#26, ADR-0063); `fmv` only counts for lots bought by 31 Jan 2018. */
export interface LotInput {
  quantity: string;
  cost: string;
  acquired: string;
  fmv: string;
}

export const lotsFromStored = (list: readonly Lot[]): LotInput[] =>
  list.map((l) => ({
    quantity: l.quantity,
    cost: paiseToInput(l.cost),
    acquired: l.acquired,
    fmv: l.fmv2018 === undefined ? "" : paiseToInput(l.fmv2018),
  }));

const grandfathered = (r: LotInput) =>
  r.acquired !== "" && r.acquired <= GRANDFATHER_DATE;

/**
 * The schema's shape. No rows is no field. An unreadable amount becomes -1 so the schema,
 * which decides Save, refuses it.
 */
export function lotsToStored(rows: readonly LotInput[]): Lot[] | undefined {
  if (rows.length === 0) return undefined;
  return rows.map((r) => {
    const fmv = grandfathered(r) && r.fmv.trim() !== "" ? r.fmv : undefined;
    return {
      quantity: r.quantity.trim(),
      cost: parseRupees(r.cost) ?? -1,
      acquired: r.acquired,
      ...(fmv === undefined ? {} : { fmv2018: parseRupees(fmv) ?? -1 }),
    };
  });
}

function summary(rows: readonly LotInput[], held: string | undefined) {
  const h = held?.trim() ?? "";
  if (!isQuantity(h)) return "Enter the units held first";
  const qs = rows.map((r) => ({ quantity: r.quantity.trim() }));
  if (!qs.every((q) => isQuantity(q.quantity)))
    return "Enter the units for each lot";
  const inLots = sumUnits(qs);
  return inLots === toUnits(h)
    ? "Lots add up to the units held"
    : `Lots hold ${formatUnits(inLots)} of ${formatUnits(toUnits(h))} units`;
}

/**
 * "Tax lots (optional)" (#26): each purchase with its units, cost and date, so M5 can show
 * gains after tax. Sells consume lots FIFO (`src/domain/lots.ts`). The first lot starts
 * with every unit held; the lots must add up to the units held before Save is on.
 */
export function Lots({
  held,
  rows,
  onChange,
}: {
  /** The holding's "Units held" as typed. */
  held: string | undefined;
  rows: readonly LotInput[];
  onChange: (next: LotInput[]) => void;
}) {
  const set = (i: number, patch: Partial<LotInput>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const input = (
    i: number,
    key: keyof LotInput,
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <label className="flex flex-col gap-1">
      {label}
      <input
        aria-label={`Lot ${i + 1} ${label.toLowerCase()}`}
        value={rows[i][key]}
        onChange={(e) => set(i, { [key]: e.target.value })}
        className={`${field} min-w-0`}
        {...extra}
      />
    </label>
  );

  return (
    <details open={rows.length > 0}>
      <summary className="cursor-pointer">Tax lots (optional)</summary>
      <fieldset className="mt-2 flex flex-col gap-3" aria-label="Tax lots">
        {rows.map((r, i) => (
          <div
            // Rows have no id of their own; position is stable between edits.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={i}
            className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4"
          >
            {input(i, "quantity", "Units", {
              inputMode: "decimal",
              "aria-invalid":
                r.quantity !== "" && !isQuantity(r.quantity.trim()),
            })}
            {input(i, "cost", "Cost ₹", {
              inputMode: "decimal",
              "aria-invalid": r.cost !== "" && parseRupees(r.cost) === null,
            })}
            {input(i, "acquired", "Bought on", { type: "date" })}
            {grandfathered(r) &&
              input(i, "fmv", "Value on 31 Jan 2018 ₹", {
                inputMode: "decimal",
                "aria-invalid": r.fmv !== "" && parseRupees(r.fmv) === null,
              })}
            <button
              type="button"
              aria-label={`Remove lot ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="justify-self-start"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...rows,
              {
                quantity: rows.length === 0 && held ? held.trim() : "",
                cost: "",
                acquired: today(),
                fmv: "",
              },
            ])
          }
          className="self-start"
        >
          + Add a lot
        </button>
        {rows.length > 0 && (
          <output className="text-neutral-600 dark:text-neutral-400">
            {summary(rows, held)}
          </output>
        )}
      </fieldset>
    </details>
  );
}
