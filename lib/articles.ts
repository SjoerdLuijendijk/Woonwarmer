import { isVatRate, type VatRate } from "./invoice";
import { MAX_PRICE_CENTS, parsePriceToCents } from "./price";

// Articles: parts such as flue pipes, roof outlets and accessories (table articles). Prices are
// excluding VAT, as in the supplier CSV; quotes and invoices use prices including VAT.
export type Article = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  /** Millimetres; an adapter has two sizes, such as "120>130". */
  diameterMm: string | null;
  lengthMm: number | null;
  color: string | null;
  material: string | null;
  wallType: string | null;
  unit: string | null;
  purchasePriceExCents: number | null;
  salePriceExCents: number | null;
  vatRate: VatRate;
  stockQuantity: number | null;
  ean: string | null;
  imageUrl: string | null;
  supplier: string | null;
  /** Purchase price plus the markup from Artikelen; used when the article has no sale price of its own. */
  markupSalePriceExCents: number | null;
};

export type ArticleInput = Omit<Article, "id" | "markupSalePriceExCents">;

export const DEFAULT_MARKUP_PCT = 40;
export const MAX_MARKUP_PCT = 1000;

export const ARTICLE_COLUMNS =
  "id, sku, name, category, brand, diameter_mm, length_mm, color, material, wall_type, unit, purchase_price_ex_cents, sale_price_ex_cents, vat_rate, stock_quantity, ean, image_url, supplier";

export type ArticleRow = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  diameter_mm: string | null;
  length_mm: number | null;
  color: string | null;
  material: string | null;
  wall_type: string | null;
  unit: string | null;
  purchase_price_ex_cents: number | null;
  sale_price_ex_cents: number | null;
  vat_rate: VatRate;
  stock_quantity: number | null;
  ean: string | null;
  image_url: string | null;
  supplier: string | null;
};

export function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    brand: row.brand,
    diameterMm: row.diameter_mm,
    lengthMm: row.length_mm,
    color: row.color,
    material: row.material,
    wallType: row.wall_type,
    unit: row.unit,
    purchasePriceExCents: row.purchase_price_ex_cents,
    salePriceExCents: row.sale_price_ex_cents,
    vatRate: row.vat_rate,
    stockQuantity: row.stock_quantity,
    ean: row.ean,
    imageUrl: row.image_url,
    supplier: row.supplier,
    markupSalePriceExCents: null,
  };
}

/** The sale price excluding VAT that the markup gives a purchase price. */
export function markupPriceExCents(purchasePriceExCents: number | null, markupPct: number) {
  return purchasePriceExCents === null ? null : Math.round((purchasePriceExCents * (100 + markupPct)) / 100);
}

/** The article's own sale price excluding VAT, otherwise the one from the markup. */
export function salePriceExCents(article: Pick<Article, "salePriceExCents"> & Partial<Pick<Article, "markupSalePriceExCents">>) {
  return article.salePriceExCents ?? article.markupSalePriceExCents ?? null;
}

export function toArticleRow(article: ArticleInput) {
  return {
    sku: article.sku,
    name: article.name,
    category: article.category,
    brand: article.brand,
    diameter_mm: article.diameterMm,
    length_mm: article.lengthMm,
    color: article.color,
    material: article.material,
    wall_type: article.wallType,
    unit: article.unit,
    purchase_price_ex_cents: article.purchasePriceExCents,
    sale_price_ex_cents: article.salePriceExCents,
    vat_rate: article.vatRate,
    stock_quantity: article.stockQuantity,
    ean: article.ean,
    image_url: article.imageUrl,
    supplier: article.supplier,
  };
}

/** The sale price including VAT, for quote and invoice lines. */
export function salePriceInclCents(article: Pick<Article, "salePriceExCents" | "vatRate"> & Partial<Pick<Article, "markupSalePriceExCents">>) {
  const ex = salePriceExCents(article);
  return ex === null ? null : Math.round((ex * (100 + article.vatRate)) / 100);
}

/** "Dubbelwandige pijp zwart Ø150 mm, 500 mm" */
export function articleDescription(article: Pick<Article, "name" | "diameterMm" | "lengthMm">) {
  // Adapters already name their sizes ("Verloopstuk 120 naar 130 mm").
  const diameter = article.diameterMm && !article.name.includes(article.diameterMm.split(/[>/-]/)[0]) ? `Ø${article.diameterMm.replace(">", "/")} mm` : null;
  const sizes = [diameter, article.lengthMm && `${article.lengthMm} mm`].filter(Boolean).join(", ");
  return (sizes ? `${article.name} ${sizes}` : article.name).slice(0, 200);
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Text fields with their maximum length, in CSV and form order.
const TEXT_FIELDS = {
  sku: 100,
  name: 200,
  category: 100,
  brand: 100,
  color: 100,
  material: 100,
  wallType: 100,
  unit: 40,
  ean: 40,
  imageUrl: 1000,
  supplier: 200,
} as const;
type TextField = keyof typeof TEXT_FIELDS;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseWholeNumber(value: string, max: number): number | null | undefined {
  if (value === "") return null;
  if (!/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return number >= 0 && number <= max ? number : undefined;
}

function parseMoney(value: string): number | null | undefined {
  if (value === "") return null;
  const cents = parsePriceToCents(value, { allowZero: true });
  return cents !== null && cents <= MAX_PRICE_CENTS ? cents : undefined;
}

/** Raw values by field name, from the article form or a CSV row. Empty strings mean "not filled in". */
export type RawArticle = Partial<Record<TextField | "diameterMm" | "lengthMm" | "purchasePriceEx" | "salePriceEx" | "vatRate" | "stockQuantity", string>>;

// Validates untrusted article values. Only the name is required.
export function parseArticle(raw: RawArticle): Result<ArticleInput> {
  const texts = {} as Record<TextField, string | null>;
  for (const [field, max] of Object.entries(TEXT_FIELDS) as [TextField, number][]) {
    const value = cleanText(raw[field]);
    if (value.length > max) return { ok: false, error: `Het veld ${field} is te lang.` };
    texts[field] = value || null;
  }
  if (!texts.name) return { ok: false, error: "Vul een naam in." };
  if (texts.imageUrl && !/^https?:\/\//.test(texts.imageUrl)) return { ok: false, error: "De afbeelding moet een webadres (https://…) zijn." };

  const diameterMm = cleanText(raw.diameterMm).replace(/s/g, "") || null;
  if (diameterMm !== null && !/^[0-9]{1,4}([>/-][0-9]{1,4})?$/.test(diameterMm)) {
    return { ok: false, error: "Vul de diameter in millimeters in, bijvoorbeeld 150 of 120>130." };
  }
  const lengthMm = parseWholeNumber(cleanText(raw.lengthMm), 100000);
  const stockQuantity = parseWholeNumber(cleanText(raw.stockQuantity), 1000000);
  if (lengthMm === undefined || lengthMm === 0) return { ok: false, error: "Vul de lengte in hele millimeters in." };
  if (stockQuantity === undefined) return { ok: false, error: "Vul de voorraad als heel getal in." };

  const purchasePriceExCents = parseMoney(cleanText(raw.purchasePriceEx));
  const salePriceExCents = parseMoney(cleanText(raw.salePriceEx));
  if (purchasePriceExCents === undefined || salePriceExCents === undefined) return { ok: false, error: "Vul prijzen in als bijvoorbeeld 89 of 89,50." };

  const vatText = cleanText(raw.vatRate).replace("%", "");
  const vatRate = vatText === "" ? 21 : Number(vatText);
  if (!isVatRate(vatRate)) return { ok: false, error: "Het btw-tarief is 21, 9 of 0." };

  return {
    ok: true,
    value: { ...texts, name: texts.name, diameterMm, lengthMm, stockQuantity, purchasePriceExCents, salePriceExCents, vatRate },
  };
}

// CSV columns of the supplier file and the article field each one fills.
const CSV_COLUMNS: Record<string, keyof RawArticle> = {
  categorie: "category",
  artikelnaam: "name",
  merk: "brand",
  diameter_mm: "diameterMm",
  lengte_mm: "lengthMm",
  kleur: "color",
  materiaal: "material",
  wandtype: "wallType",
  eenheid: "unit",
  inkoopprijs_ex_btw: "purchasePriceEx",
  verkoopprijs_ex_btw: "salePriceEx",
  btw_pct: "vatRate",
  voorraad: "stockQuantity",
  ean: "ean",
  sku: "sku",
  afbeelding_url: "imageUrl",
  leverancier: "supplier",
};
export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

// Splits one CSV line on the separator, honouring double quotes.
function splitCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

export type CsvRow = { line: number; raw: RawArticle };

// Reads the supplier CSV (";" or "," separated, first line holds the column names).
export function readArticleCsv(text: string): Result<CsvRow[]> {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0] ?? "";
  const separator = header.includes(";") ? ";" : ",";
  const columns = splitCsvLine(header, separator).map((name) => CSV_COLUMNS[name.trim().toLowerCase()]);
  if (!columns.includes("name")) return { ok: false, error: "De kolom artikelnaam ontbreekt in de eerste regel van het bestand." };

  const rows: CsvRow[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    if (line.trim() === "") continue;
    const raw: RawArticle = {};
    splitCsvLine(line, separator).forEach((value, column) => {
      const field = columns[column];
      if (field) raw[field] = value;
    });
    rows.push({ line: index + 2, raw });
  }
  if (rows.length > MAX_CSV_ROWS) return { ok: false, error: `Het bestand heeft meer dan ${MAX_CSV_ROWS} regels.` };
  return { ok: true, value: rows };
}

const firstNumber = (value: string | null) => (value === null ? Infinity : Number.parseInt(value, 10));

/** By category, then name, then diameter and length as numbers (130 before 1000). */
export function compareArticles(a: Article, b: Article) {
  return (
    (a.category ?? "\uffff").localeCompare(b.category ?? "\uffff", "nl") ||
    a.name.localeCompare(b.name, "nl") ||
    firstNumber(a.diameterMm) - firstNumber(b.diameterMm) ||
    (a.lengthMm ?? Infinity) - (b.lengthMm ?? Infinity) ||
    a.id - b.id
  );
}

export type ArticleGroup = { key: string; category: string | null; articles: Article[] };

/** Consecutive articles of the same category as one group; expects articles sorted by category. */
export function groupArticles(articles: Article[]): ArticleGroup[] {
  const groups: ArticleGroup[] = [];
  for (const article of articles) {
    const last = groups.at(-1);
    if (last && last.category === article.category) last.articles.push(article);
    else groups.push({ key: article.category ?? "", category: article.category, articles: [article] });
  }
  return groups;
}
