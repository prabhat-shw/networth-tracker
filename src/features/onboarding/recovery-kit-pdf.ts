/**
 * The recovery kit as a one-page PDF, written by hand (ADR-0025, #53): the 24 words are the
 * most sensitive thing this app ever shows, so no third-party code touches them and nothing
 * leaves the device. PDF 1.4, A4, the two standard fonts every reader has (no embedding).
 */

const A4 = { w: 595, h: 842 } as const;
const MARGIN = 72;
const COLUMNS = 3;
const ROWS = 8;

type Font = "F1" | "F2"; // Helvetica, Courier
type Line = { font: Font; size: number; x: number; y: number; text: string };

/** PDF string literal: escape the delimiters; anything outside printable ASCII becomes "?". */
function pdfString(text: string): string {
  return `(${text.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "?")})`;
}

function layout(words: string[], email: string, created: string): Line[] {
  const body = (y: number, text: string, size = 11): Line => ({
    font: "F1",
    size,
    x: MARGIN,
    y,
    text,
  });
  const colWidth = (A4.w - 2 * MARGIN) / COLUMNS;
  const grid = words.map(
    (word, i): Line => ({
      font: "F2",
      size: 14,
      // Numbered down each column, as on screen.
      x: MARGIN + Math.floor(i / ROWS) * colWidth,
      y: 620 - (i % ROWS) * 30,
      text: `${String(i + 1).padStart(2, " ")}. ${word}`,
    }),
  );
  return [
    body(A4.h - MARGIN, "NetWorth recovery kit", 22),
    body(A4.h - MARGIN - 26, `For ${email} - created ${created}`),
    body(
      700,
      "Anyone with these words can open your data. Keep them on paper, somewhere safe.",
    ),
    body(684, "They are the only way back in if you forget your passphrase."),
    ...grid,
    body(
      360,
      'To use them: on the unlock screen, choose "Use recovery kit instead".',
    ),
    body(
      344,
      "Do not store this file in email or cloud storage. Print it, then delete it.",
    ),
  ];
}

export function recoveryKitPdf(
  words: string[],
  email: string,
  created: string,
): Uint8Array {
  if (words.length !== COLUMNS * ROWS) throw new Error("expected 24 words");
  const content = layout(words, email, created)
    .map(
      (l) =>
        `BT /${l.font} ${l.size} Tf ${l.x.toFixed(0)} ${l.y} Td ${pdfString(l.text)} Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  // Everything is ASCII, so string offsets are byte offsets.
  let out = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
