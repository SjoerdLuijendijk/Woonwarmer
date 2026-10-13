import {
  DIMENSION_CM,
  EFFICIENCY_PERCENT,
  ENERGY_LABELS,
  FLUE_DIAMETER_MM,
  MAX_DESCRIPTION_LENGTH,
  MAX_TEXT_LENGTH,
  parseStoveType,
  POWER_KW,
  WEIGHT_KG,
  type EnergyLabel,
  type FlueOutlet,
  type StoveType,
} from "./stoves";

// The product export of HAVÉ Verwarming (a Magento catalogue export, one CSV). The browser reads the
// file and sends only the wanted products with the columns below; the server validates every value
// again with parseHaveProduct before it is stored. See docs/supplier-catalog.md.

export const HAVE_SUPPLIER = "HAVÉ Verwarming";
// Photos are downloaded from here only; image paths in the export are relative to it.
export const HAVE_MEDIA_URL = "https://www.haveverwarming.nl/media/catalog/product";
export const MAX_CATALOG_PHOTOS = 5;
export const MAX_CATALOG_PRICE_CENTS = 10_000_000;

// Only wood and bio-ethanol stoves that HAVÉ still sells (enabled, not being phased out).
const WANTED_FUELS = ["Hout", "Bio-ethanol"] as const;
const ENABLED = "1";
const PHASED_OUT = "Uitlopend";

export const HAVE_COLUMNS = [
  "sku",
  "name",
  "brand",
  "price",
  "fuel_category",
  "fire_type",
  "product_online",
  "product_label",
  "size_height",
  "size_width",
  "size_depth",
  "top_connection",
  "back_connection",
  "rookgas",
  "back_flue_hight",
  "output_min",
  "output_max",
  "weight",
  "external_air_supply",
  "thermostaat",
  "fire_efficiency",
  "energy_label",
  "material",
  "description",
  "dealer_product_description",
  "base_image",
  "additional_images",
  "hide_from_product_page",
] as const;
export type HaveRecord = Partial<Record<(typeof HAVE_COLUMNS)[number], string>>;

type Fuel = (typeof WANTED_FUELS)[number];

// The stove type per fuel and HAVÉ's "fire_type"; unknown placements get the fuel's first type.
const STOVE_TYPES: Record<Fuel, Record<string, string>> = {
  Hout: {
    Vrijstaand: "Houtkachel",
    Inbouw: "Inbouw houthaard",
    Inzet: "Inzet houthaard",
    Hangend: "Hangende houtkachel",
    Tuinhaard: "Tuinhaard",
  },
  "Bio-ethanol": {
    Vrijstaand: "Bio-ethanol haard",
    Inbouw: "Inbouw bio-ethanol haard",
    Inzet: "Inzet bio-ethanol haard",
    Hangend: "Hangende bio-ethanol haard",
    Tuinhaard: "Bio-ethanol tuinhaard",
  },
};

/** The stove columns a catalogue product fills; the import never touches the others. */
export type CatalogStoveValues = {
  brand: string;
  shop_name: string;
  stove_type: StoveType | null;
  price_cents: number;
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  flue_outlet: FlueOutlet | null;
  flue_diameter_mm: number | null;
  flue_center_height_cm: number | null;
  min_power_kw: number | null;
  max_power_kw: number | null;
  weight_kg: number | null;
  external_air_supply: boolean | null;
  thermostat: boolean | null;
  efficiency_percent: number | null;
  energy_label: EnergyLabel | null;
  material: string | null;
  description: string | null;
};

export type CatalogProduct = { sku: string; values: CatalogStoveValues; imagePaths: string[] };

const text = (record: HaveRecord, column: keyof HaveRecord) => (record[column] ?? "").trim();

function isFuel(value: string): value is Fuel {
  return (WANTED_FUELS as readonly string[]).includes(value);
}

export function isWantedHaveProduct(record: HaveRecord) {
  // Rows without a name are per-store translations of the product above them.
  return (
    text(record, "name").length > 0 &&
    isFuel(text(record, "fuel_category")) &&
    text(record, "product_online") === ENABLED &&
    text(record, "product_label") !== PHASED_OUT
  );
}

// Keeps the wanted products, with only the columns the import uses.
export function selectHaveProducts(records: Record<string, string>[]): HaveRecord[] {
  return records
    .map((record) => Object.fromEntries(HAVE_COLUMNS.map((column) => [column, record[column] ?? ""])) as HaveRecord)
    .filter(isWantedHaveProduct);
}

// "55,5", "106.000000", "82%": a plain number, otherwise null (">80" and "5,4 per brander" are not).
function readNumber(value: string) {
  const match = /^(\d+(?:[.,]\d+)?)\s*%?$/.exec(value.trim());
  return match ? Number(match[1].replace(",", ".")) : null;
}

function inRange(value: number | null, range: { min: number; max: number }) {
  return value !== null && value >= range.min && value <= range.max ? value : null;
}

const toInteger = (value: number | null) => (value === null ? null : Math.round(value));
const toTenth = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

function readYesNo(value: string) {
  const lower = value.trim().toLowerCase();
  return lower === "ja" ? true : lower === "nee" ? false : null;
}

function readFlueOutlet(record: HaveRecord): FlueOutlet | null {
  const top = readYesNo(text(record, "top_connection")) === true;
  const rear = readYesNo(text(record, "back_connection")) === true;
  return top && rear ? "both" : top ? "top" : rear ? "rear" : null;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  });
}

// HAVÉ's HTML description as plain text with blank lines between paragraphs (WooCommerce turns them
// into paragraphs again). Links keep their text only, as they point into HAVÉ's own site. Angle
// brackets are dropped so the text can never become markup in the shop.
export function htmlToText(html: string) {
  const plain = decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|section|h[1-6]|ul|ol)\s*>/gi, "\n\n")
      .replace(/<[^>]*>/g, ""),
  ).replace(/[<>]/g, "");
  return plain
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Paragraphs about HAVÉ's own showroom ("Experience Center") or knowledge base do not apply to
// Woonwarmer; they go, together with a short heading right above them.
const SUPPLIER_ONLY = /experience center|kenniscentrum/i;
const isHeading = (paragraph: string) => paragraph.length <= 60 && !paragraph.includes("\n") && !/[.!:,]$/.test(paragraph);

function withoutSupplierParagraphs(value: string) {
  const kept: string[] = [];
  for (const paragraph of value.split("\n\n")) {
    if (!SUPPLIER_ONLY.test(paragraph)) kept.push(paragraph);
    else if (kept.length > 0 && isHeading(kept[kept.length - 1])) kept.pop();
  }
  return kept.join("\n\n");
}

// Cut at the last paragraph that still fits.
function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const paragraphEnd = cut.lastIndexOf("\n\n");
  return (paragraphEnd > 0 ? cut.slice(0, paragraphEnd) : cut).trim();
}

const IMAGE_PATH = /^\/[a-z0-9_-]\/[a-z0-9_-]\/[a-z0-9._-]+\.(?:jpe?g|png|webp)$/i;

// The main photo first, then the gallery, without what HAVÉ hides on its product page (line
// drawings) and YouTube stills ("hqdefault"). Only paths of this exact form are ever downloaded.
export function haveImagePaths(record: HaveRecord) {
  const hidden = new Set(text(record, "hide_from_product_page").split(","));
  const candidates = [text(record, "base_image"), ...text(record, "additional_images").split(",")].map((path) => path.trim());
  const paths: string[] = [];
  for (const path of candidates) {
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    if (!IMAGE_PATH.test(path) || hidden.has(path) || fileName.startsWith("hqdefault") || paths.includes(path)) continue;
    paths.push(path);
    if (paths.length === MAX_CATALOG_PHOTOS) break;
  }
  return paths;
}

export function isHaveImagePath(path: string) {
  return IMAGE_PATH.test(path);
}

type Result = { ok: true; product: CatalogProduct } | { ok: false; error: string };

// Validates one product from the browser. Required: article number, name, brand and a price; every
// other detail that is missing or not understood is left empty.
export function parseHaveProduct(record: HaveRecord): Result {
  const sku = text(record, "sku");
  const name = text(record, "name");
  const brand = text(record, "brand");
  const fuel = text(record, "fuel_category");
  const price = readNumber(text(record, "price"));
  const priceCents = price === null ? null : Math.round(price * 100);

  if (!sku || sku.length > MAX_TEXT_LENGTH) return { ok: false, error: "Ongeldig artikelnummer." };
  if (!name || name.length > MAX_TEXT_LENGTH) return { ok: false, error: "Ongeldige productnaam." };
  if (!brand || brand.length > MAX_TEXT_LENGTH) return { ok: false, error: "Merk ontbreekt." };
  if (!isWantedHaveProduct(record) || !isFuel(fuel)) return { ok: false, error: "Valt buiten de selectie (hout of bio-ethanol, leverbaar)." };
  if (!priceCents || priceCents > MAX_CATALOG_PRICE_CENTS) return { ok: false, error: "Prijs ontbreekt." };

  let minPower = toTenth(inRange(readNumber(text(record, "output_min")), POWER_KW));
  let maxPower = toTenth(inRange(readNumber(text(record, "output_max")), POWER_KW));
  if (minPower !== null && maxPower !== null && minPower > maxPower) minPower = maxPower = null;

  const energyLabel = text(record, "energy_label");
  const material = text(record, "material")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  const description = withoutSupplierParagraphs(htmlToText(text(record, "dealer_product_description") || text(record, "description")));
  const typeLabel = STOVE_TYPES[fuel][text(record, "fire_type")] ?? Object.values(STOVE_TYPES[fuel])[0];

  return {
    ok: true,
    product: {
      sku,
      imagePaths: haveImagePaths(record),
      values: {
        brand,
        shop_name: name,
        stove_type: parseStoveType(typeLabel),
        price_cents: priceCents,
        height_cm: inRange(toInteger(readNumber(text(record, "size_height"))), DIMENSION_CM),
        width_cm: inRange(toInteger(readNumber(text(record, "size_width"))), DIMENSION_CM),
        depth_cm: inRange(toInteger(readNumber(text(record, "size_depth"))), DIMENSION_CM),
        flue_outlet: readFlueOutlet(record),
        // "150 millimeter", or "130/200 millimeter" for a concentric flue: the first size.
        flue_diameter_mm: inRange(Number(/^\d+/.exec(text(record, "rookgas"))?.[0] ?? NaN) || null, FLUE_DIAMETER_MM),
        flue_center_height_cm: toTenth(inRange(readNumber(text(record, "back_flue_hight")), DIMENSION_CM)),
        min_power_kw: minPower,
        max_power_kw: maxPower,
        weight_kg: inRange(toInteger(readNumber(text(record, "weight"))), WEIGHT_KG),
        external_air_supply: readYesNo(text(record, "external_air_supply")),
        thermostat: readYesNo(text(record, "thermostaat")),
        efficiency_percent: toTenth(inRange(readNumber(text(record, "fire_efficiency")), EFFICIENCY_PERCENT)),
        energy_label: (ENERGY_LABELS as readonly string[]).includes(energyLabel) ? (energyLabel as EnergyLabel) : null,
        material: material && material.length <= MAX_TEXT_LENGTH ? material : null,
        description: description ? limitText(description, MAX_DESCRIPTION_LENGTH) : null,
      },
    },
  };
}
