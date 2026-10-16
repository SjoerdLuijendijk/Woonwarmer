import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { invoiceTotals, lineTotalCents, MARGIN_SCHEME_NOTE, type Company, type Invoice, type InvoiceLine } from "./invoice";
import { LOGO_PATHS, LOGO_VIEWBOX } from "./logo-paths";
import type { Quote } from "./quote";

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const RIGHT = PAGE_WIDTH - MARGIN;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.45, 0.41, 0.38);
const ACCENT = rgb(0.71, 0.27, 0.17);
const LOGO_DARK = rgb(0.36, 0.17, 0.09);
const LINE = rgb(0.85, 0.85, 0.85);
const SIZE = 9.5;
const LEADING = 13.5;

// The right-hand column (seller, document details, quantity) and the price column next to it.
const COLUMN_X = 350;
const VALUE_X = 448;

const AMOUNT_FORMAT = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatAmount(cents: number) {
  return AMOUNT_FORMAT.format(cents / 100);
}

// "12 oktober 2026".
function formatDate(isoDate: string) {
  return DATE_FORMAT.format(new Date(`${isoDate}T12:00:00Z`));
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Fonts = { regular: PDFFont; bold: PDFFont };

// The standard PDF fonts only cover WinAnsi; replace anything else instead of failing.
function safeText(font: PDFFont, value: string) {
  let result = "";
  for (const char of value.replace(/[  ]/g, " ")) {
    try {
      font.encodeText(char);
      result += char;
    } catch {
      result += "?";
    }
  }
  return result;
}

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of safeText(font, value).split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type TextOptions = { size?: number; bold?: boolean; color?: typeof INK; align?: "left" | "right" | "center" };

class Writer {
  page: PDFPage;
  y = PAGE_HEIGHT - MARGIN;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
    private draft: boolean,
    /** Lowest y the content may reach; the footer sits below it. */
    readonly bottom: number,
  ) {
    this.page = this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    if (this.draft) {
      this.page.drawText("CONCEPT", {
        x: 120,
        y: 280,
        size: 110,
        font: this.fonts.bold,
        color: rgb(0.93, 0.9, 0.88),
        rotate: degrees(35),
      });
    }
    return this.page;
  }

  text(value: string, x: number, options: TextOptions = {}) {
    const { size = SIZE, bold = false, color = INK, align = "left" } = options;
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const clean = safeText(font, value);
    const width = font.widthOfTextAtSize(clean, size);
    const drawX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    this.page.drawText(clean, { x: drawX, y: this.y, size, font, color });
  }

  line(from: number, to: number, y: number, thickness = 0.5, color = LINE) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });
  }
}

/** What a document (invoice or quote) shows; the layout is shared. */
type PdfDocument = {
  title: string;
  heading: string;
  /** "CONCEPT" watermark. */
  draft: boolean;
  seller: Company;
  details: [string, string][];
  customerLines: (string | null)[];
  lines: InvoiceLine[];
  /** Text below the totals, paragraph by paragraph. */
  closing: string[];
  /** Small print centred at the bottom of every page. */
  footer: string | null;
};

// The logo in the brand colours: house and "WOON" in the accent colour, "WARMER" (the lowest
// shapes) dark. Returns its height.
function drawLogo(page: PDFPage, x: number, top: number) {
  const height = 78;
  const scale = height / LOGO_VIEWBOX.height;
  for (const path of LOGO_PATHS) {
    const startY = Number(/^M[\d.-]+,([\d.-]+)/.exec(path)?.[1] ?? 0);
    page.drawSvgPath(path, { x, y: top, scale, color: startY >= 780 ? LOGO_DARK : ACCENT, borderWidth: 0 });
  }
  return height;
}

function footerLines(fonts: Fonts, footer: string | null) {
  if (!footer?.trim()) return [];
  return footer
    .trim()
    .split("\n")
    .flatMap((paragraph) => wrap(fonts.regular, paragraph, 9, RIGHT - MARGIN));
}

const LINE_IMAGE_SIZE = 34;
const LINE_IMAGE_GAP = 8;
const IMAGE_TIMEOUT_MS = 8000;

// The line photos, fetched once per URL. A photo that cannot be loaded or is not a JPEG or PNG is left
// out, so the document (and its preview) is always made.
async function embedLineImages(doc: PDFDocument, lines: InvoiceLine[]) {
  const urls = [...new Set(lines.map((line) => line.image_url).filter((url): url is string => Boolean(url)))];
  const images = new Map<string, PDFImage>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes[0] === 0xff && bytes[1] === 0xd8) images.set(url, await doc.embedJpg(bytes));
        else if (bytes[0] === 0x89 && bytes[1] === 0x50) images.set(url, await doc.embedPng(bytes));
      } catch {
        // Left out: no photo for this line.
      }
    }),
  );
  return images;
}

async function renderDocument(input: PdfDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const { title, seller } = input;
  doc.setTitle(title);
  doc.setAuthor(seller.name);

  const footer = footerLines(fonts, input.footer);
  const footerTop = MARGIN - 10 + footer.length * 13;
  const w = new Writer(doc, fonts, input.draft, (footer.length ? footerTop + 12 : MARGIN) + 20);

  // Header: logo top left, seller top right.
  const top = PAGE_HEIGHT - MARGIN + 10;
  const logoHeight = drawLogo(w.page, MARGIN + 4, top);
  w.y = top - 8;
  w.text(seller.name, COLUMN_X, { bold: true });
  w.y -= LEADING;
  for (const line of [seller.address, `${seller.postal_code} ${seller.city}`]) {
    w.text(line, COLUMN_X);
    w.y -= LEADING;
  }
  w.line(COLUMN_X, COLUMN_X + 125, w.y + 4, 0.75, INK);
  w.y -= LEADING + 4;
  const contactLines = [`IBAN: ${seller.iban}`, `BTW nummer: ${seller.vat_number}`, `KVK: ${seller.kvk_number}`, seller.email, seller.phone];
  for (const line of contactLines) {
    if (!line) continue;
    w.text(line, COLUMN_X);
    w.y -= LEADING;
  }
  w.y = Math.min(w.y, top - logoHeight) - 34;

  // Title, then the customer on the left and the document details on the right.
  w.text(input.heading, MARGIN, { size: 16, bold: true });
  w.y -= 34;
  const blockTop = w.y;
  for (const line of input.customerLines) {
    if (!line?.trim()) continue;
    w.text(line, MARGIN);
    w.y -= LEADING;
  }
  const customerEnd = w.y;
  w.y = blockTop;
  for (const [label, value] of input.details) {
    w.text(`${label}:`, COLUMN_X);
    w.text(value, VALUE_X);
    w.y -= LEADING;
  }
  w.y = Math.min(w.y, customerEnd) - 30;

  // With both margin scheme and VAT lines, the margin scheme lines are marked.
  const totals = invoiceTotals(input.lines);
  const markMargin = totals.hasMarginScheme && totals.groups.length > 0;
  const marginNote = markMargin ? `Regels met (marge): ${MARGIN_SCHEME_NOTE}; hierover geen btw.` : `${MARGIN_SCHEME_NOTE}.`;

  // Lines table with a black header bar, repeated on every page.
  const tableHeader = () => {
    w.page.drawRectangle({ x: MARGIN, y: w.y - 7, width: RIGHT - MARGIN, height: 21, color: INK });
    w.text("Product", MARGIN + 3, { bold: true, color: rgb(1, 1, 1) });
    w.text("Hoeveelheid", COLUMN_X, { bold: true, color: rgb(1, 1, 1) });
    w.text("Prijs", VALUE_X, { bold: true, color: rgb(1, 1, 1) });
    w.y -= 26;
  };
  tableHeader();

  // With photos, every product line leaves room for one in front of its description.
  const images = await embedLineImages(doc, input.lines);
  const textX = MARGIN + 3 + (images.size > 0 ? LINE_IMAGE_SIZE + LINE_IMAGE_GAP : 0);

  for (const line of input.lines) {
    const description = markMargin && line.margin_scheme ? `${line.description} (marge)` : line.description;
    const descriptionLines = wrap(fonts.regular, description, SIZE, COLUMN_X - textX - 16);
    const image = line.image_url ? images.get(line.image_url) : undefined;
    const rowHeight = Math.max(descriptionLines.length * LEADING + 10, image ? LINE_IMAGE_SIZE + 10 : 0);
    if (w.y - rowHeight < w.bottom) {
      w.newPage();
      tableHeader();
    }
    const rowTop = w.y;
    if (image) {
      // Scaled to fit the square, centred in it, its top level with the row's top.
      const scale = Math.min(LINE_IMAGE_SIZE / image.width, LINE_IMAGE_SIZE / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const boxTop = rowTop + LEADING - 6;
      w.page.drawImage(image, {
        x: MARGIN + 3 + (LINE_IMAGE_SIZE - width) / 2,
        y: boxTop - LINE_IMAGE_SIZE + (LINE_IMAGE_SIZE - height) / 2,
        width,
        height,
      });
    }
    w.text(String(line.quantity), COLUMN_X);
    w.text(formatAmount(lineTotalCents(line)), VALUE_X);
    for (const text of descriptionLines) {
      w.text(text, textX);
      w.y -= LEADING;
    }
    w.y = rowTop - rowHeight;
    w.line(MARGIN, RIGHT, w.y + LEADING - 2);
  }
  w.y -= 8;

  // Totals in the right-hand columns: subtotals, VAT per rate, and the total between black rules.
  if (w.y - (totals.groups.length + 3) * 24 < w.bottom) w.newPage();
  const totalRow = (label: string, amount: number, last = false) => {
    const labelLines = wrap(fonts.bold, label, SIZE, VALUE_X - COLUMN_X - 8);
    const rowTop = w.y;
    w.text(formatAmount(amount), VALUE_X, { bold: last });
    for (const text of labelLines) {
      w.text(text, COLUMN_X, { bold: true });
      w.y -= LEADING;
    }
    w.y = rowTop - labelLines.length * LEADING - 10;
    if (!last) w.line(COLUMN_X - 4, RIGHT, w.y + LEADING - 2);
  };
  if (!markMargin && totals.hasMarginScheme) totalRow("Subtotaal", totals.marginCents);
  if (markMargin) totalRow("Marge (geen btw)", totals.marginCents);
  if (totals.groups.length) totalRow("Subtotaal excl. btw", totals.exclCents);
  for (const group of totals.groups) totalRow(`Btw ${group.rate}%`, group.vatCents);
  w.line(COLUMN_X - 4, RIGHT, w.y + LEADING - 1, 1.2, INK);
  totalRow("Totaal", totals.inclCents, true);
  w.line(COLUMN_X - 4, RIGHT, w.y + LEADING - 1, 1.2, INK);

  // Closing text, paragraph by paragraph.
  w.y -= 24;
  for (const paragraph of [...(totals.hasMarginScheme ? [marginNote] : []), ...input.closing]) {
    for (const text of paragraph.split("\n").flatMap((part) => wrap(fonts.regular, part, SIZE, RIGHT - MARGIN))) {
      if (w.y - LEADING < w.bottom) w.newPage();
      w.text(text, MARGIN);
      w.y -= LEADING;
    }
    w.y -= 8;
  }

  // Footer and (with more than one page) page numbers, once the page count is known.
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    if (footer.length) {
      page.drawLine({ start: { x: MARGIN, y: footerTop + 12 }, end: { x: RIGHT, y: footerTop + 12 }, thickness: 0.5, color: MUTED });
      footer.forEach((text, lineIndex) => {
        const x = PAGE_WIDTH / 2 - fonts.regular.widthOfTextAtSize(text, 9) / 2;
        page.drawText(text, { x, y: footerTop - lineIndex * 13, size: 9, font: fonts.regular, color: INK });
      });
    }
    if (pages.length > 1) {
      const label = safeText(fonts.regular, `${title} · pagina ${index + 1} van ${pages.length}`);
      page.drawText(label, { x: RIGHT - fonts.regular.widthOfTextAtSize(label, 8), y: MARGIN - 28, size: 8, font: fonts.regular, color: MUTED });
    }
  });

  return doc.save();
}

export async function createInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const draft = invoice.number === null;
  const dueDate = addDays(invoice.issueDate, invoice.seller.payment_term_days);
  const { customer, seller } = invoice;
  return renderDocument({
    title: draft ? draftName(invoice) : `Factuur ${invoice.number}`,
    heading: draft ? "CONCEPTFACTUUR" : "FACTUUR",
    draft,
    seller,
    details: [
      ["Factuurnummer", invoice.number ?? "wordt toegekend"],
      ["Factuurdatum", formatDate(invoice.issueDate)],
      ["Vervaldatum", formatDate(dueDate)],
      ...(invoice.stoveNumber === null ? [] : [["Kachelnummer", String(invoice.stoveNumber)] as [string, string]]),
    ],
    customerLines: [customer.name, customer.address, `${customer.postal_code} ${customer.city}`, customer.email, customer.phone],
    lines: invoice.lines,
    closing: [],
    footer: seller.invoice_footer ?? null,
  });
}

export async function createQuotePdf(quote: Quote, seller: Company): Promise<Uint8Array> {
  const { customer } = quote;
  return renderDocument({
    title: quote.number ? `Offerte ${quote.number}` : "Conceptofferte",
    heading: "OFFERTE",
    draft: quote.number === null,
    seller,
    details: [
      ["Offertenummer", quote.number ?? "wordt toegekend"],
      ["Datum", formatDate(quote.issueDate)],
      ["Geldig tot", formatDate(quote.validUntil)],
    ],
    customerLines: [customer.name, customer.address, [customer.postalCode, customer.city].filter(Boolean).join(" "), customer.email, customer.phone],
    lines: quote.lines,
    closing: [
      ...(quote.notes ? [quote.notes] : []),
      `Deze offerte is geldig tot en met ${formatDate(quote.validUntil)}. Alle prijzen zijn inclusief btw.`,
    ],
    footer: null,
  });
}

function draftName(invoice: Invoice) {
  return invoice.stoveNumber === null ? "Conceptfactuur" : `Conceptfactuur kachel ${invoice.stoveNumber}`;
}

export function invoiceFileName(invoice: Invoice) {
  return invoice.number ? `Factuur ${invoice.number}.pdf` : `${draftName(invoice)}.pdf`;
}

export function quoteFileName(quote: Pick<Quote, "number">) {
  return quote.number ? `Offerte ${quote.number}.pdf` : "Conceptofferte.pdf";
}
