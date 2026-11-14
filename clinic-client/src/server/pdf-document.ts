import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = 547;
const TOP = 790;
const BOTTOM = 64;
const CONTENT_WIDTH = RIGHT - LEFT;

export type PdfRow = {
  cells: string[];
};

export type PdfDocumentInput = {
  title: string;
  logoDataUrl?: string | null;
  heading: string[];
  columns?: string[];
  columnWidths?: number[];
  rows?: PdfRow[];
  summary: string[];
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of source.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= width) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const character of word) {
      const trial = chunk + character;
      if (chunk && font.widthOfTextAtSize(trial, size) > width) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = trial;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildPdf(input: PdfDocumentInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let y = TOP;

  async function drawLogo() {
    if (!input.logoDataUrl || !/^data:image\/(?:png|jpeg);base64,/i.test(input.logoDataUrl)) return;
    try {
      const encoded = input.logoDataUrl.slice(input.logoDataUrl.indexOf(",") + 1);
      const bytes = Buffer.from(encoded, "base64");
      const image = input.logoDataUrl.toLowerCase().startsWith("data:image/png") ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      const scale = Math.min(72 / image.width, 40 / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: LEFT, y: y - height, width, height });
      y -= height + 12;
    } catch {
      // A stored logo that cannot be decoded must not block the financial document.
    }
  }

  function newPage(repeatTable: boolean) {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = TOP;
    page.drawText(input.title, { x: LEFT, y, size: 12, font: bold, color: rgb(0.08, 0.16, 0.16) });
    y -= 16;
    const continued = input.heading.slice(0, 2).join("  ·  ");
    for (const line of wrap(continued, font, 9, CONTENT_WIDTH)) {
      page.drawText(line, { x: LEFT, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
      y -= 12;
    }
    y -= 8;
    if (repeatTable && input.columns && input.columnWidths) drawColumns(input.columns, true);
  }

  function ensure(height: number, repeatTable: boolean) {
    if (y - height < BOTTOM) newPage(repeatTable);
  }

  function drawColumns(values: string[], header: boolean) {
    const widths = input.columnWidths ?? [];
    let x = LEFT;
    let rowHeight = 14;
    const wrapped = values.map((value, index) => wrap(value, header ? bold : font, 9, Math.max(20, (widths[index] ?? 80) - 6)));
    rowHeight = Math.max(...wrapped.map((lines) => lines.length * 11)) + 6;
    ensure(rowHeight, false);
    wrapped.forEach((lines, index) => {
      let lineY = y;
      for (const line of lines) {
        page.drawText(line, { x: x + 2, y: lineY, size: 9, font: header ? bold : font, color: rgb(0.1, 0.1, 0.1) });
        lineY -= 11;
      }
      x += widths[index] ?? 80;
    });
    y -= rowHeight;
  }

  await drawLogo();
  page.drawText(input.title, { x: LEFT, y, size: 16, font: bold, color: rgb(0.08, 0.16, 0.16) });
  y -= 22;
  for (const line of input.heading) {
    for (const wrapped of wrap(line, font, 10, CONTENT_WIDTH)) {
      ensure(14, false);
      page.drawText(wrapped, { x: LEFT, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    }
  }
  y -= 8;

  if (input.columns && input.columnWidths && input.rows) {
    drawColumns(input.columns, true);
    for (const row of input.rows) {
      const widths = input.columnWidths;
      const wrapped = row.cells.map((value, index) => wrap(value, font, 9, Math.max(20, (widths[index] ?? 80) - 6)));
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length * 11)) + 6;
      if (y - rowHeight < BOTTOM) {
        newPage(true);
      }
      let x = LEFT;
      wrapped.forEach((lines, index) => {
        let lineY = y;
        for (const line of lines) {
          page.drawText(line, { x: x + 2, y: lineY, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
          lineY -= 11;
        }
        x += widths[index] ?? 80;
      });
      y -= rowHeight;
    }
  }

  y -= 10;
  const summaryLines = input.summary.flatMap((line) => wrap(line, font, 10, CONTENT_WIDTH));
  const summaryHeight = summaryLines.length * 14 + 8;
  if (y - summaryHeight < BOTTOM) newPage(false);
  for (const line of summaryLines) {
    page.drawText(line, { x: LEFT, y, size: 10, font: line.startsWith("Total") || line.startsWith("Outstanding") || line.startsWith("Customer credit") ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  }

  const total = pages.length;
  pages.forEach((current, index) => {
    current.drawText(`Page ${index + 1} of ${total}`, { x: LEFT, y: 36, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
  });
  return document.save({ useObjectStreams: false });
}
