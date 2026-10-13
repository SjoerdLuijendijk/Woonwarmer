import type { StoveNote } from "./stove-notes";

export const PHOTOS_BUCKET = "stove-photos";

// Photos are resized to JPEG in the browser (lib/resize-photo.ts) before upload.
// Together they must stay below the Server Action body limit in next.config.ts
// (and Vercel's 4.5 MB request cap).
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTOS_PER_UPLOAD = 6;
export const MAX_TEXT_LENGTH = 100;

// "used" is called "Gereviseerd", as in the web shop.
export const CONDITION_LABELS = { new: "Nieuw", used: "Gereviseerd" } as const;
export const FLUE_OUTLET_LABELS = { top: "Boven", rear: "Achter", both: "Boven én achter" } as const;
// The WooCommerce shop's "Type kachel" attribute. These are suggestions: a stove can also have a
// type of its own, stored as the text itself (a known type is stored as its key).
export const STOVE_TYPE_LABELS = {
  soapstone: "Speksteenkachel",
  wood: "Houtkachel",
  pot: "Potkachel",
  wood_central_heating: "Hout cv kachel",
} as const;
export const ENERGY_LABELS = ["A++", "A+", "A", "B", "C", "D", "E", "F", "G"] as const;
// How a new stove is supplied: from stock, or ordered from the supplier once sold (no stock kept).
export const SUPPLY_LABELS = { stock: "Uit voorraad", order: "Op bestelling" } as const;
export type Condition = keyof typeof CONDITION_LABELS;
export type FlueOutlet = keyof typeof FLUE_OUTLET_LABELS;
export type StoveTypeKey = keyof typeof STOVE_TYPE_LABELS;
/** A key of STOVE_TYPE_LABELS, or a type of the stove's own as free text. */
export type StoveType = string;

export function isStoveTypeKey(value: string | null): value is StoveTypeKey {
  return value !== null && Object.hasOwn(STOVE_TYPE_LABELS, value);
}

export function stoveTypeLabel(value: StoveType | null) {
  return value === null ? null : isStoveTypeKey(value) ? STOVE_TYPE_LABELS[value] : value;
}

// Typed text becomes the key of a known type when it matches its label ("houtkachel" → "wood").
export function parseStoveType(text: string): StoveType | null {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return null;
  const known = (Object.keys(STOVE_TYPE_LABELS) as StoveTypeKey[]).find((key) => STOVE_TYPE_LABELS[key].toLowerCase() === value.toLowerCase());
  return known ?? value.slice(0, MAX_TEXT_LENGTH).trim();
}
export type EnergyLabel = (typeof ENERGY_LABELS)[number];

// Keep in sync with the check constraints in the stove specifications and web shop product fields migrations.
export const DIMENSION_CM = { min: 1, max: 500 } as const;
export const FLUE_DIAMETER_MM = { min: 50, max: 400 } as const;
export const POWER_KW = { min: 0.1, max: 99.9 } as const;
export const WEIGHT_KG = { min: 1, max: 2000 } as const;
export const EFFICIENCY_PERCENT = { min: 1, max: 100 } as const;
export const WARRANTY_YEARS = { min: 0, max: 50 } as const;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const COMMON_FLUE_DIAMETERS_MM = [100, 120, 125, 130, 150, 180, 200];
// Keep in sync with the stock quantity migration. Used stoves are always a single unit.
export const STOCK_QUANTITY = { min: 1, max: 10000 } as const;

// Sales channels a stove can be offered on. The database unticks them once a stove is sold out.
// Marktplaats and 2dehands are linked from WooCommerce itself, so the app no longer tracks them
// (the columns marketplace_listed and secondhand_listed remain unused in the database).
export const LISTING_CHANNELS = {
  shop: { column: "shop_listed", field: "shopListed", label: "Webshop", description: "Online zetten in de webshop", target: "online in de webshop" },
} as const;
export type ListingChannel = keyof typeof LISTING_CHANNELS;

export type StovePhoto = { id: number; url: string | null };
export type StoveInvoice = { id: number; number: string };

export type Stove = {
  number: number;
  brand: string;
  condition: Condition | null;
  heightCm: number | null;
  widthCm: number | null;
  depthCm: number | null;
  flueOutlet: FlueOutlet | null;
  flueDiameterMm: number | null;
  priceCents: number | null;
  stoveType: StoveType | null;
  powerKw: number | null;
  minPowerKw: number | null;
  maxPowerKw: number | null;
  weightKg: number | null;
  /** Height of the rear flue outlet's centre ("harthoogte achter"). */
  flueCenterHeightCm: number | null;
  externalAirSupply: boolean | null;
  newFirebox: boolean | null;
  thermostat: boolean | null;
  efficiencyPercent: number | null;
  energyLabel: EnergyLabel | null;
  warrantyYears: number | null;
  material: string | null;
  description: string | null;
  shopListed: boolean;
  /** Why the last web shop update failed; null when it succeeded or was not needed. */
  shopSyncError: string | null;
  /** False for stoves imported from the shop until a team member links them: the app then leaves the shop alone. */
  /** The linked WooCommerce product, once the stove has been in the shop. */
  shopProductId: number | null;
  /** New stove sold without stock; always available, stock is not tracked. */
  madeToOrder: boolean;
  /** Units in stock; 0 exactly when soldAt is set. */
  stockQuantity: number;
  soldAt: string | null;
  createdAt: string;
  photos: StovePhoto[];
  invoices: StoveInvoice[];
  /** Open sales notes: in negotiation, or sold but not yet done. */
  notes: StoveNote[];
};

/** A stove without its photos, invoices and notes. */
export type StoveDetails = Omit<Stove, "photos" | "invoices" | "notes">;
