/**
 * AMFI's daily `NAVAll.txt` → the `amfi` universe (ADR-0064, #163). Pure: the server fetches
 * the whole public file and hands the text here.
 *
 * Data lines have eight `;`-separated fields: scheme code; growth/payout ISIN; reinvestment
 * ISIN; scheme name; plan; option; NAV; date (`30-Oct-2026`). Everything else (the header,
 * blank lines, fund-house and category headings) has fewer fields and is passed over. A data
 * line that doesn't read is skipped and counted, never fatal: one bad row must not cost the
 * household every other price.
 */
import { isPrice } from "./price";
import type { Universe } from "./universe";

const MONTHS: Readonly<Record<string, string>> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** `30-Oct-2026` → `2026-10-30`; anything else → undefined. */
function isoDate(s: string): string | undefined {
  const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(s);
  const month = m && Object.hasOwn(MONTHS, m[2]) ? MONTHS[m[2]] : undefined;
  return m && month ? `${m[3]}-${month}-${m[1]}` : undefined;
}

export interface AmfiResult {
  universe: Universe;
  /** Data lines that didn't read (bad code, NAV or date). */
  skipped: number;
}

/**
 * Parses the file. The universe's `date` is the date most schemes carry; a scheme priced on
 * another day (a liquid fund a day ahead, a wound-up fund years behind) keeps its own in
 * `dates`, so the app never shows an old NAV as today's. Throws `RangeError` when no line reads.
 */
export function parseAmfi(text: string, fetchedAt: string): AmfiResult {
  const prices: Record<string, string> = {};
  const names: Record<string, string> = {};
  const isins: Record<string, string> = {};
  const schemeDates: Record<string, string> = {};
  const counts = new Map<string, number>();
  let skipped = 0;

  for (const line of text.split(/\r?\n/)) {
    const f = line.split(";").map((x) => x.trim());
    if (f.length !== 8 || f[0] === "Scheme Code") continue;
    const [code, isin1, isin2, scheme, plan, option, nav, rawDate] = f;
    const date = isoDate(rawDate);
    if (!/^\d{1,12}$/.test(code) || !isPrice(nav) || !date || !scheme) {
      skipped++;
      continue;
    }
    prices[code] = nav;
    names[code] = [scheme, plan, option]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 200);
    for (const isin of [isin1, isin2]) if (ISIN.test(isin)) isins[isin] = code;
    schemeDates[code] = date;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  if (counts.size === 0) throw new RangeError("no NAVs in the file");
  let date = "";
  for (const [d, n] of counts)
    if (n > (counts.get(date) ?? 0) || (n === counts.get(date) && d > date))
      date = d;
  const dates: Record<string, string> = {};
  for (const [code, d] of Object.entries(schemeDates))
    if (d !== date) dates[code] = d;

  return {
    universe: {
      kind: "amfi",
      date,
      fetchedAt,
      source: "AMFI NAVAll.txt",
      currency: "INR",
      prices,
      names,
      isins,
      dates,
    },
    skipped,
  };
}
