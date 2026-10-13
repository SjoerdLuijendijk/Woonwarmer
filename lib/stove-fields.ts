import { parsePriceToCents } from "./price";
import {
  CONDITION_LABELS,
  DIMENSION_CM,
  EFFICIENCY_PERCENT,
  ENERGY_LABELS,
  FLUE_DIAMETER_MM,
  FLUE_OUTLET_LABELS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TEXT_LENGTH,
  POWER_KW,
  STOCK_QUANTITY,
  parseStoveType,
  SUPPLY_LABELS,
  WARRANTY_YEARS,
  WEIGHT_KG,
  type Condition,
  type EnergyLabel,
  type FlueOutlet,
  type StoveType,
} from "./stoves";

export type StoveFieldValues = {
  brand: string;
  shop_name: string | null;
  condition: Condition;
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  flue_outlet: FlueOutlet | null;
  flue_diameter_mm: number | null;
  price_cents: number;
  shop_listed: boolean;
  made_to_order: boolean;
  stove_type: StoveType | null;
  power_kw: number | null;
  min_power_kw: number | null;
  max_power_kw: number | null;
  weight_kg: number | null;
  flue_center_height_cm: number | null;
  external_air_supply: boolean | null;
  new_firebox: boolean | null;
  thermostat: boolean | null;
  efficiency_percent: number | null;
  energy_label: EnergyLabel | null;
  warranty_years: number | null;
  material: string | null;
  description: string | null;
};

type ParseResult = { ok: true; values: StoveFieldValues } | { ok: false; error: string };
type Range = { min: number; max: number };

// An optional field that was filled in with an invalid value.
const INVALID = Symbol("invalid");

function rawValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function readText(formData: FormData, name: string, maxLength = MAX_TEXT_LENGTH) {
  const value = rawValue(formData, name);
  return value.length > 0 && value.length <= maxLength ? value : null;
}

function readInteger(formData: FormData, name: string, range: Range) {
  const value = Number(rawValue(formData, name));
  return Number.isInteger(value) && value >= range.min && value <= range.max ? value : null;
}

function readChoice<T extends string>(formData: FormData, name: string, options: Record<T, string>) {
  const value = String(formData.get(name) ?? "");
  return Object.hasOwn(options, value) ? (value as T) : null;
}

// Optional fields: empty input is null, anything else must be valid.
function readOptionalText(formData: FormData, name: string, maxLength = MAX_TEXT_LENGTH) {
  const value = rawValue(formData, name);
  if (value.length === 0) return null;
  return value.length <= maxLength ? value : INVALID;
}

function readOptionalInteger(formData: FormData, name: string, range: Range) {
  if (rawValue(formData, name).length === 0) return null;
  return readInteger(formData, name, range) ?? INVALID;
}

function readOptionalChoiceKey<T extends string>(formData: FormData, name: string, options: Record<T, string>) {
  if (String(formData.get(name) ?? "").length === 0) return null;
  return readChoice(formData, name, options) ?? INVALID;
}

// Accepts Dutch ("5,5") and English ("5.5") decimals with at most one decimal place.
function readOptionalDecimal(formData: FormData, name: string, range: Range) {
  const value = rawValue(formData, name).replace(",", ".");
  if (value.length === 0) return null;
  if (!/^\d+(\.\d)?$/.test(value)) return INVALID;
  const number = Number(value);
  return number >= range.min && number <= range.max ? number : INVALID;
}

function readOptionalChoice<T extends string>(formData: FormData, name: string, options: readonly T[]) {
  const value = String(formData.get(name) ?? "");
  if (value.length === 0) return null;
  return (options as readonly string[]).includes(value) ? (value as T) : INVALID;
}

// Yes/no fields that can also be left unknown.
function readOptionalBoolean(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (value.length === 0) return null;
  return value === "yes" ? true : value === "no" ? false : INVALID;
}

// Validates the untrusted stove form fields shared by creating and editing a stove.
export function parseStoveFields(formData: FormData): ParseResult {
  const brand = readText(formData, "brand");
  const shopName = readOptionalText(formData, "shopName");
  const condition = readChoice(formData, "condition", CONDITION_LABELS);
  const supply = readChoice(formData, "supply", SUPPLY_LABELS);
  // Made-to-order stoves (such as the supplier's catalogue) may lack sizes and flue details.
  const madeToOrder = condition === "new" && supply === "order";
  const height = madeToOrder ? readOptionalInteger(formData, "height", DIMENSION_CM) : readInteger(formData, "height", DIMENSION_CM);
  const width = madeToOrder ? readOptionalInteger(formData, "width", DIMENSION_CM) : readInteger(formData, "width", DIMENSION_CM);
  const depth = madeToOrder ? readOptionalInteger(formData, "depth", DIMENSION_CM) : readInteger(formData, "depth", DIMENSION_CM);
  const flueOutlet = madeToOrder ? readOptionalChoiceKey(formData, "flueOutlet", FLUE_OUTLET_LABELS) : readChoice(formData, "flueOutlet", FLUE_OUTLET_LABELS);
  const flueDiameter = madeToOrder
    ? readOptionalInteger(formData, "flueDiameter", FLUE_DIAMETER_MM)
    : readInteger(formData, "flueDiameter", FLUE_DIAMETER_MM);
  const price = parsePriceToCents(String(formData.get("price") ?? ""));

  if (!brand) return { ok: false, error: "Vul het merk in." };
  if (shopName === INVALID) return { ok: false, error: `De productnaam mag maximaal ${MAX_TEXT_LENGTH} tekens zijn.` };
  if (!condition) return { ok: false, error: "Kies nieuw of gereviseerd." };
  if (condition === "new" && !supply) return { ok: false, error: "Kies uit voorraad of op bestelling." };
  if (height === INVALID || width === INVALID || depth === INVALID || (!madeToOrder && (!height || !width || !depth))) {
    return { ok: false, error: `Vul hoogte, breedte en diepte in hele centimeters in (${DIMENSION_CM.min}–${DIMENSION_CM.max}).` };
  }
  if (flueOutlet === INVALID || (!madeToOrder && !flueOutlet)) return { ok: false, error: "Kies of de rookafvoer boven, achter of allebei zit." };
  if (flueDiameter === INVALID || (!madeToOrder && !flueDiameter)) {
    return { ok: false, error: `Vul de maat van de afvoer in millimeters in (${FLUE_DIAMETER_MM.min}–${FLUE_DIAMETER_MM.max}).` };
  }
  if (!price) return { ok: false, error: "Vul een geldige verkoopprijs in, bijvoorbeeld 1.250 of 1250,50." };

  const stoveTypeText = readOptionalText(formData, "stoveType");
  const stoveType = stoveTypeText === INVALID ? INVALID : stoveTypeText === null ? null : parseStoveType(stoveTypeText);
  const power = readOptionalDecimal(formData, "power", POWER_KW);
  const minPower = readOptionalDecimal(formData, "minPower", POWER_KW);
  const maxPower = readOptionalDecimal(formData, "maxPower", POWER_KW);
  const weight = readOptionalInteger(formData, "weight", WEIGHT_KG);
  const flueCenterHeight = readOptionalDecimal(formData, "flueCenterHeight", DIMENSION_CM);
  const externalAirSupply = readOptionalBoolean(formData, "externalAirSupply");
  const newFirebox = readOptionalBoolean(formData, "newFirebox");
  const thermostat = readOptionalBoolean(formData, "thermostat");
  const efficiency = readOptionalDecimal(formData, "efficiency", EFFICIENCY_PERCENT);
  const energyLabel = readOptionalChoice(formData, "energyLabel", ENERGY_LABELS);
  const warranty = readOptionalInteger(formData, "warranty", WARRANTY_YEARS);
  const material = readOptionalText(formData, "material");
  const description = readOptionalText(formData, "description", MAX_DESCRIPTION_LENGTH);

  if (stoveType === INVALID) return { ok: false, error: `Het type kachel mag maximaal ${MAX_TEXT_LENGTH} tekens zijn.` };
  if (power === INVALID || minPower === INVALID || maxPower === INVALID) {
    return { ok: false, error: `Vul het vermogen in kW in, bijvoorbeeld 8 of 5,5 (${POWER_KW.min}–${POWER_KW.max}).` };
  }
  if (minPower !== null && maxPower !== null && minPower > maxPower) {
    return { ok: false, error: "Het minimale vermogen mag niet hoger zijn dan het maximale vermogen." };
  }
  if (weight === INVALID) return { ok: false, error: `Vul het gewicht in hele kilo's in (${WEIGHT_KG.min}–${WEIGHT_KG.max}).` };
  if (flueCenterHeight === INVALID) {
    return { ok: false, error: `Vul de hoogte hart achter in cm in, bijvoorbeeld 94 of 89,5 (${DIMENSION_CM.min}–${DIMENSION_CM.max}).` };
  }
  if (externalAirSupply === INVALID || newFirebox === INVALID || thermostat === INVALID) {
    return { ok: false, error: "Kies ja, nee of niet ingevuld." };
  }
  if (efficiency === INVALID) return { ok: false, error: "Vul het rendement in procenten in, bijvoorbeeld 78 of 80,5." };
  if (energyLabel === INVALID) return { ok: false, error: "Kies een geldig energielabel." };
  if (warranty === INVALID) return { ok: false, error: `Vul de garantie in hele jaren in (${WARRANTY_YEARS.min}–${WARRANTY_YEARS.max}).` };
  if (material === INVALID) return { ok: false, error: `Het materiaal mag maximaal ${MAX_TEXT_LENGTH} tekens zijn.` };
  if (description === INVALID) return { ok: false, error: `De beschrijving mag maximaal ${MAX_DESCRIPTION_LENGTH} tekens zijn.` };

  return {
    ok: true,
    values: {
      brand,
      shop_name: shopName,
      condition,
      height_cm: height,
      width_cm: width,
      depth_cm: depth,
      flue_outlet: flueOutlet,
      flue_diameter_mm: flueDiameter,
      price_cents: price,
      // An unticked (or disabled) checkbox is left out of the form data.
      shop_listed: formData.get("shopListed") === "on",
      // Only new stoves can be made to order.
      made_to_order: madeToOrder,
      stove_type: stoveType,
      power_kw: power,
      min_power_kw: minPower,
      max_power_kw: maxPower,
      weight_kg: weight,
      flue_center_height_cm: flueCenterHeight,
      external_air_supply: externalAirSupply,
      new_firebox: newFirebox,
      thermostat,
      efficiency_percent: efficiency,
      energy_label: energyLabel,
      warranty_years: warranty,
      material,
      description,
    },
  };
}

// The initial stock of a new stove from stock. Only those can have more than one unit; the stock is
// changed afterwards one unit at a time, so it is not part of the editable fields.
export function parseStockQuantity(formData: FormData, values: StoveFieldValues): { ok: true; value: number } | { ok: false; error: string } {
  if (values.condition === "used" || values.made_to_order) return { ok: true, value: 1 };
  const quantity = readInteger(formData, "quantity", STOCK_QUANTITY);
  if (!quantity) return { ok: false, error: `Vul het aantal op voorraad in (${STOCK_QUANTITY.min}–${STOCK_QUANTITY.max}).` };
  return { ok: true, value: quantity };
}
