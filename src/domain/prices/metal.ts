/**
 * IBJA's rates page → the `metal` universe (ADR-0064, #165). Pure: the server fetches the
 * public page (ibjarates.com) and hands the HTML here.
 *
 * The page's "Previous Dates Rate" tables hold one row per day for the AM and PM sessions,
 * with cells tagged `data-label="Gold 999"` (rupees per 10 g) and `data-label="Silver 999"`
 * (rupees per kg). The universe keeps the latest day's closing (PM) rate, or that day's AM
 * rate if PM isn't out yet, as rupees per gram: `gold999` and `silver999`. Other karats are
 * prorated on read (`karat/24`). This is the most fragile parser: a changed page throws, the
 * universe goes stale, and the manual value stays.
 */
import { isPrice, ratio } from "./price";
import type { FeedResult } from "./universe";

const METALS = [
  {
    code: "gold999",
    label: "Gold 999",
    per: "10",
    name: "Gold 999 (per gram)",
  },
  {
    code: "silver999",
    label: "Silver 999",
    per: "1000",
    name: "Silver 999 (per gram)",
  },
] as const;

interface Row {
  date: string;
  session: "AM" | "PM";
  cells: Record<string, string>;
}

function rows(html: string): Row[] {
  const out: Row[] = [];
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const head = tr.match(
      /data-label="(AM|PM)"[^>]*>\s*<strong>(\d{2})\/(\d{2})\/(\d{4})<\/strong>/,
    );
    if (!head) continue;
    const cells: Record<string, string> = {};
    for (const [, label, value] of tr.matchAll(
      /data-label="([^"]+)"[^>]*>\s*([\d.]+)\s*</g,
    ))
      cells[label] = value;
    out.push({
      date: `${head[4]}-${head[3]}-${head[2]}`,
      session: head[1] as Row["session"],
      cells,
    });
  }
  return out;
}

/** Parses the rates page. Throws `RangeError` when no day has both rates. */
export function parseIbja(html: string, fetchedAt: string): FeedResult {
  const usable = rows(html).filter((r) =>
    METALS.every((m) => isPrice(r.cells[m.label] ?? "")),
  );
  const pick = usable.reduce<Row | undefined>((best, r) => {
    if (!best || r.date > best.date) return r;
    if (r.date === best.date && r.session === "PM") return r;
    return best;
  }, undefined);
  if (!pick) throw new RangeError("no gold and silver rates on the page");

  const prices: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const m of METALS) {
    prices[m.code] = ratio(pick.cells[m.label], m.per);
    names[m.code] = m.name;
  }
  return {
    universe: {
      kind: "metal",
      date: pick.date,
      fetchedAt,
      source: `IBJA ${pick.session}`,
      currency: "INR",
      prices,
      names,
    },
    skipped: 0,
  };
}
