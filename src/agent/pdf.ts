// ─────────────────────────────────────────────────────────────
// STATEMENT → PDF
// A tiny PDF writer (no library): built-in Helvetica, text + lines.
// Money stays as exact text, totals are added in cents with BigInt.
// ─────────────────────────────────────────────────────────────
import { formatAmount } from "./format.js";

export type StatementRow = { txn_date: string; description: string; amount: string };
export type Statement = { customerName: string; month: string; rows: StatementRow[] };

const PAGE_W = 595; // A4, in points
const PAGE_H = 842;
const LEFT = 50;
const RIGHT = 545;
const ROW_H = 22;
const ROWS_PER_PAGE = 24;

const NAVY = "0.039 0.141 0.388";
const GOLD = "0.788 0.635 0.153";
const MUTED = "0.392 0.439 0.541";
const BORDER = "0.886 0.910 0.949";
const SOFT = "0.953 0.965 0.984";
const TEXT = "0.059 0.106 0.200";
const RED = "0.725 0.110 0.110";
const GREEN = "0.082 0.502 0.239";

// "2026-09" → "September 2026"
function monthLabel(month: string): string {
  const [year, mm] = month.split("-");
  const name = new Date(Date.UTC(Number(year), Number(mm) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${name} ${year}`;
}

// "-4500.00" → -450000n (cents), no floating point
function toCents(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [whole = "0", cents = "0"] = amount.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(cents.padEnd(2, "0").slice(0, 2));
  return negative ? -value : value;
}

// -450000n → "-4500.00"
function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

// Helvetica character widths (per 1000), for the characters in amounts
const WIDTHS: Record<string, number> = { " ": 278, ",": 278, ".": 278, "-": 333, P: 667, K: 667, R: 722 };
function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += WIDTHS[ch] ?? (bold ? 611 : 556);
  return (units * size) / 1000;
}

// Only plain ASCII is safe with the built-in fonts; escape ( ) and \
function pdfText(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, (c) => `\\${c}`);
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

// ── Drawing helpers: each returns PDF content operators ──
const text = (x: number, y: number, value: string, size: number, color = TEXT, bold = false) =>
  `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y} Td (${pdfText(value)}) Tj ET`;
const textRight = (x: number, y: number, value: string, size: number, color = TEXT, bold = false) =>
  text(x - textWidth(value, size, bold), y, value, size, color, bold);
const box = (x: number, y: number, w: number, h: number, color: string) => `${color} rg ${x} ${y} ${w} ${h} re f`;
const line = (y: number) => `${BORDER} RG 0.6 w ${LEFT} ${y} m ${RIGHT} ${y} l S`;

function drawPage(statement: Statement, rows: StatementRow[], pageNo: number, pageCount: number, generated: string, isLast: boolean): string {
  const ops: string[] = [];

  // Header bar
  ops.push(box(0, PAGE_H - 90, PAGE_W, 90, NAVY));
  ops.push(box(0, PAGE_H - 93, PAGE_W, 3, GOLD));
  ops.push(text(LEFT, PAGE_H - 50, "Account Statement", 22, "1 1 1", true));
  ops.push(text(LEFT, PAGE_H - 70, "Payments Support", 10, "0.910 0.780 0.400"));

  // Customer + period
  let y = PAGE_H - 130;
  ops.push(text(LEFT, y, "CUSTOMER", 8, MUTED, true));
  ops.push(text(300, y, "STATEMENT PERIOD", 8, MUTED, true));
  y -= 16;
  ops.push(text(LEFT, y, statement.customerName, 13, TEXT, true));
  ops.push(text(300, y, monthLabel(statement.month), 13, TEXT, true));
  y -= 16;
  ops.push(text(LEFT, y, `Generated ${generated}`, 9, MUTED));

  // Table header
  y -= 34;
  ops.push(box(LEFT, y - 7, RIGHT - LEFT, ROW_H, SOFT));
  ops.push(text(LEFT + 8, y, "DATE", 8, MUTED, true));
  ops.push(text(LEFT + 90, y, "DESCRIPTION", 8, MUTED, true));
  ops.push(text(LEFT + 330, y, "TYPE", 8, MUTED, true));
  ops.push(textRight(RIGHT - 8, y, "AMOUNT", 8, MUTED, true));

  // Rows
  for (const row of rows) {
    y -= ROW_H;
    const money = formatAmount(row.amount);
    ops.push(text(LEFT + 8, y, row.txn_date, 10));
    ops.push(text(LEFT + 90, y, shorten(row.description, 42), 10));
    ops.push(text(LEFT + 330, y, money.type, 9, money.type === "DEBIT" ? RED : GREEN, true));
    ops.push(textRight(RIGHT - 8, y, money.amount, 10));
    ops.push(line(y - 8));
  }

  // Totals (last page only)
  if (isLast) {
    let credits = 0n;
    let debits = 0n;
    for (const row of statement.rows) {
      const cents = toCents(row.amount);
      if (cents < 0n) debits += cents;
      else credits += cents;
    }
    const net = formatAmount(fromCents(credits + debits));
    const totals: [string, string, boolean][] = [
      ["Total credits", formatAmount(fromCents(credits)).amount, false],
      ["Total debits", formatAmount(fromCents(debits)).amount, false],
      [`Net (${net.type})`, net.amount, true],
    ];
    y -= 12;
    for (const [label, amount, bold] of totals) {
      y -= 18;
      ops.push(text(LEFT + 330, y, label, 10, bold ? TEXT : MUTED, bold));
      ops.push(textRight(RIGHT - 8, y, amount, 10, TEXT, bold));
    }
  }

  // Footer
  ops.push(line(50));
  ops.push(text(LEFT, 36, "This statement was generated automatically from your account records.", 8, MUTED));
  ops.push(textRight(RIGHT, 36, `Page ${pageNo} of ${pageCount}`, 8, MUTED));

  return ops.join("\n");
}

export function statementPdf(statement: Statement): Buffer {
  const generated = new Date().toISOString().slice(0, 10);

  // Split rows into pages (always at least one page)
  const pages: StatementRow[][] = [];
  for (let i = 0; i < statement.rows.length; i += ROWS_PER_PAGE) pages.push(statement.rows.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  // PDF objects: 1 catalog, 2 page list, 3-4 fonts, then (page, content) per page
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((rows, i) => {
    const pageId = pageIds[i]!;
    const content = drawPage(statement, rows, i + 1, pages.length, generated, i === pages.length - 1);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  // Write the file + the cross-reference table (byte offsets of each object)
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}
