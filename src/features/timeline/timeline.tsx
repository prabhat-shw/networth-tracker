"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR } from "@/domain/money";
import { buildSnapshot, istDate } from "@/domain/records/snapshot";
import {
  inRange,
  lensNet,
  RANGES,
  type Range,
  timelineSeries,
} from "@/domain/timeline";
import { LensBar, useLens } from "@/features/lens/lens-bar";
import { useUniverses } from "@/features/sync/sync-provider";
import { useTypedRecords } from "@/features/sync/typed-records";
import { Breakdown, SeriesTable } from "./breakdown";

/** Light-mode slot hexes (UX.md §6.3), used when the CSS tokens can't be read. */
const SLOT_HEX = [
  "",
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
];

/**
 * A chart slot's colour from the `--chart-N` token (dark mode included). SVG presentation
 * attributes don't take `var()`, so the value is resolved here.
 */
function slotColour(slot: number): string {
  const css =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement)
          .getPropertyValue(`--chart-${slot}`)
          .trim();
  return css || SLOT_HEX[slot] || SLOT_HEX[1];
}

/** Axis dates: day and month for short ranges, month and year once a range spans years. */
function tickLabel(range: Range) {
  const long = range === "1Y" || range === "All";
  return (t: number) =>
    new Date(t).toLocaleDateString("en-IN", {
      timeZone: "UTC",
      ...(long
        ? { month: "short", year: "2-digit" }
        : { day: "numeric", month: "short" }),
    });
}

/** Line slots: the lens, then the first and second compared lens (UX.md §6.3). */
const LINE_SLOTS = [1, 2, 7];
const MAX_SERIES = 3;

const pill =
  "rounded px-3 py-1 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-700";

/** Today's figure and every snapshot, oldest first (ADR-0071 §2). */
function useSeries() {
  const typed = useTypedRecords();
  const universes = useUniverses();
  return useMemo(() => {
    const ok = <T,>(list: { result: { status: string; value?: T } }[]) =>
      list.flatMap((e) =>
        e.result.status === "ok" ? [e.result.value as T] : [],
      );
    const members = [...typed.profiles.keys()];
    const live =
      typed.asset.length + typed.liability.length > 0
        ? buildSnapshot(
            ok(typed.asset),
            ok(typed.liability),
            universes,
            members,
            new Date(),
          )
        : undefined;
    const stamped = typed.snapshot.flatMap((e) =>
      e.result.status === "ok"
        ? [{ modifiedAt: e.modifiedAt, data: e.result.value }]
        : [],
    );
    return { series: timelineSeries(stamped, live), typed };
  }, [typed, universes]);
}

/**
 * Net worth over time (UX.md §3.3): range pills, the lens's line plus up to two compared
 * lenses, a crosshair tooltip, the latest composition, and the same series as a table.
 */
export function Timeline() {
  const today = istDate(new Date());
  const { series, typed } = useSeries();
  const { id: lens, options } = useLens();
  const [range, setRange] = useState<Range>("1Y");
  const [compare, setCompare] = useState<string[]>([]);

  const nameOf = (id: string) =>
    id === "former"
      ? "Former members"
      : (options.find((o) => o.id === id)?.label ?? "Former member");
  const shown = [lens, ...compare.filter((c) => c !== lens)].slice(
    0,
    MAX_SERIES,
  );
  const points = inRange(series, range, today);
  const data = points.map((p) => ({
    // Time-proportional x: a year's gap is wider than a month's.
    t: Date.parse(`${p.date}T00:00:00Z`),
    ...Object.fromEntries(shown.map((s) => [s, lensNet(p, s)])),
  }));
  const tint = typed.profiles.get(lens)?.colour ?? LINE_SLOTS[0];
  const colourOf = (i: number) => slotColour(i === 0 ? tint : LINE_SLOTS[i]);
  const latest = series.at(-1);

  const toggle = (id: string) =>
    setCompare((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
    );

  return (
    <section
      aria-label="Net worth over time"
      className="flex w-full flex-col gap-4"
    >
      <LensBar />
      <fieldset
        aria-label="Range"
        className="m-0 flex gap-1 self-start rounded-md border-0 bg-neutral-100 p-1 text-sm dark:bg-neutral-900"
      >
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={pill}
          >
            {r}
          </button>
        ))}
      </fieldset>
      {points.length < 2 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm dark:border-neutral-700">
          Your timeline starts once you've had two check-ins.
        </p>
      ) : (
        <>
          <figure
            aria-label="Net worth chart"
            className="m-0 w-full"
            style={{ height: 288 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 72, bottom: 0, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={tickLabel(range)}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v: number) => formatINR(v, { compact: true })}
                  width={72}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(v, name) => [
                    formatINR(Number(v)),
                    nameOf(String(name)),
                  ]}
                  labelFormatter={(t) =>
                    new Date(Number(t)).toISOString().slice(0, 10)
                  }
                />
                {shown.map((s, i) => (
                  <Line
                    key={s}
                    dataKey={s}
                    name={s}
                    stroke={colourOf(i)}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    label={(p: {
                      index?: number;
                      x?: number | string;
                      y?: number | string;
                    }) =>
                      p.index === data.length - 1 ? (
                        <text
                          key={s}
                          x={Number(p.x ?? 0) + 6}
                          y={Number(p.y ?? 0)}
                          fontSize={12}
                          fill={colourOf(i)}
                          dominantBaseline="middle"
                        >
                          {nameOf(s)}
                        </text>
                      ) : (
                        <g key={`${s}-${p.index}`} />
                      )
                    }
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </figure>
          <fieldset
            aria-label="Compare members"
            className="m-0 flex flex-wrap gap-3 border-0 p-0 text-sm"
          >
            <legend className="mb-1 text-xs text-neutral-500">
              Compare with
            </legend>
            {options
              .filter((o) => o.id !== lens)
              .map((o) => {
                const on = compare.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && shown.length >= MAX_SERIES}
                      onChange={() => toggle(o.id)}
                    />
                    {o.label}
                  </label>
                );
              })}
          </fieldset>
          <SeriesTable points={points} series={shown} nameOf={nameOf} />
        </>
      )}
      {latest && <Breakdown point={latest} nameOf={nameOf} />}
    </section>
  );
}
