import { CONDITION_LABELS, FLUE_OUTLET_LABELS, stoveTypeLabel, type StoveDetails } from "./stoves";

export type StoveSpecKey =
  | "condition"
  | "stoveType"
  | "power"
  | "dimensions"
  | "weight"
  | "flueOutlet"
  | "flueDiameter"
  | "flueCenterHeight"
  | "externalAirSupply"
  | "newFirebox"
  | "thermostat"
  | "minPower"
  | "maxPower"
  | "efficiency"
  | "energyLabel"
  | "warranty"
  | "material";

/** A filled-in product detail with the label the web shop uses. */
export type StoveSpec = { key: StoveSpecKey; label: string; value: string };

const DECIMAL = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

function yesNo(value: boolean | null) {
  return value === null ? null : value ? "Ja" : "Nee";
}

function withUnit(value: number | null, unit: string) {
  return value === null ? null : `${DECIMAL.format(value)} ${unit}`;
}

// The web shop name: the product name when the stove has one (catalogue products), otherwise the
// brand plus the stove type ("Hwam Houtkachel"), or only the brand.
export function stoveProductName(stove: Pick<StoveDetails, "brand" | "stoveType" | "shopName">) {
  return stove.shopName ?? [stove.brand, stoveTypeLabel(stove.stoveType)].filter(Boolean).join(" ");
}

// The stove's product details in display order, leaving out what is not filled in.
export function stoveSpecs(stove: StoveDetails): StoveSpec[] {
  const { heightCm, widthCm, depthCm } = stove;
  const specs: [StoveSpecKey, string, string | null][] = [
    ["condition", "Staat kachel", stove.condition && CONDITION_LABELS[stove.condition]],
    ["stoveType", "Type kachel", stoveTypeLabel(stove.stoveType)],
    ["power", "Vermogen", withUnit(stove.powerKw, "kW")],
    ["dimensions", "Afmetingen (h × b × d)", heightCm && widthCm && depthCm ? `${heightCm} × ${widthCm} × ${depthCm} cm` : null],
    ["weight", "Gewicht", withUnit(stove.weightKg, "kg")],
    ["flueOutlet", "Aansluiting", stove.flueOutlet && FLUE_OUTLET_LABELS[stove.flueOutlet]],
    ["flueDiameter", "Diameter pijp", stove.flueDiameterMm === null ? null : `Ø${stove.flueDiameterMm} mm`],
    ["flueCenterHeight", "Harthoogte achter", withUnit(stove.flueCenterHeightCm, "cm")],
    ["externalAirSupply", "Externe luchttoevoer", yesNo(stove.externalAirSupply)],
    ["newFirebox", "Nieuw binnenwerk", yesNo(stove.newFirebox)],
    ["thermostat", "Thermostaat", yesNo(stove.thermostat)],
    ["minPower", "Minimaal vermogen", withUnit(stove.minPowerKw, "kW")],
    ["maxPower", "Maximaal vermogen", withUnit(stove.maxPowerKw, "kW")],
    ["efficiency", "Rendement", stove.efficiencyPercent === null ? null : `${DECIMAL.format(stove.efficiencyPercent)}%`],
    ["energyLabel", "Energielabel", stove.energyLabel],
    ["warranty", "Garantie", stove.warrantyYears === null ? null : `${stove.warrantyYears} jaar`],
    ["material", "Materiaal", stove.material],
  ];
  return specs.flatMap(([key, label, value]) => (value ? [{ key, label, value }] : []));
}
