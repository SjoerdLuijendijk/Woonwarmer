"use client";

import { useId, useState } from "react";
import { formatPriceInput } from "../lib/price";
import {
  COMMON_FLUE_DIAMETERS_MM,
  CONDITION_LABELS,
  DIMENSION_CM,
  FLUE_DIAMETER_MM,
  FLUE_OUTLET_LABELS,
  LISTING_CHANNELS,
  MAX_TEXT_LENGTH,
  STOCK_QUANTITY,
  STOVE_TYPE_LABELS,
  stoveTypeLabel,
  SUPPLY_LABELS,
  type Stove,
} from "../lib/stoves";
import ChoiceGroup from "./ChoiceGroup";
import NumberField from "./NumberField";
import StoveSpecFields from "./StoveSpecFields";

const DIMENSION_FIELDS = [
  { name: "height", label: "Hoogte", key: "heightCm" },
  { name: "width", label: "Breedte", key: "widthCm" },
  { name: "depth", label: "Diepte", key: "depthCm" },
] as const;

type StoveFieldsProps = {
  brands: string[];
  /** Existing stove whose values prefill the fields (edit mode). */
  stove?: Stove;
};

// The stove detail fields shared by the add form and the edit dialog.
export default function StoveFields({ brands, stove }: StoveFieldsProps) {
  const id = useId();
  const [condition, setCondition] = useState<string | null>(stove?.condition ?? null);
  const [supply, setSupply] = useState<string | null>(stove ? (stove.madeToOrder ? "order" : "stock") : null);
  // Made-to-order stoves (such as the supplier's catalogue) may lack sizes and flue details.
  const detailsRequired = !(condition === "new" && supply === "order");

  function handleChoice(event: React.FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === "condition") setCondition(target.value);
    if (target.name === "supply") setSupply(target.value);
  }

  return (
    <>
      <fieldset className="form-section">
        <legend className="form-section-title">Kachel</legend>
        <label htmlFor={`${id}-brand`}>Merk</label>
        <input
          id={`${id}-brand`}
          name="brand"
          list={`${id}-brands`}
          maxLength={MAX_TEXT_LENGTH}
          required
          autoComplete="off"
          autoCapitalize="words"
          defaultValue={stove?.brand}
        />
        <datalist id={`${id}-brands`}>
          {brands.map((brand) => <option key={brand} value={brand} />)}
        </datalist>

        <label htmlFor={`${id}-shop-name`}>Productnaam <span className="muted">(optioneel)</span></label>
        <input
          id={`${id}-shop-name`}
          name="shopName"
          maxLength={MAX_TEXT_LENGTH}
          autoComplete="off"
          placeholder="Leeg: merk en type, bijv. Hwam Houtkachel"
          aria-describedby={`${id}-shop-name-hint`}
          defaultValue={stove?.shopName ?? undefined}
        />
        <p id={`${id}-shop-name-hint`} className="form-hint muted">De naam in de webshop.</p>

        {/* Pick a suggestion or type a type of your own. */}
        <label htmlFor={`${id}-stove-type`}>Type kachel <span className="muted">(optioneel)</span></label>
        <input
          id={`${id}-stove-type`}
          name="stoveType"
          list={`${id}-stove-types`}
          maxLength={MAX_TEXT_LENGTH}
          autoComplete="off"
          placeholder="Kies of typ, bijv. Houtkachel"
          defaultValue={stoveTypeLabel(stove?.stoveType ?? null) ?? undefined}
        />
        <datalist id={`${id}-stove-types`}>
          {Object.values(STOVE_TYPE_LABELS).map((label) => <option key={label} value={label} />)}
        </datalist>

        {/* display: contents keeps the form's spacing while following the condition and supply choices. */}
        <div className="field-contents" onChange={handleChoice}>
          <ChoiceGroup legend="Staat" name="condition" options={CONDITION_LABELS} defaultValue={stove?.condition} />

          {condition === "new" && (
            <ChoiceGroup legend="Levering" name="supply" options={SUPPLY_LABELS} defaultValue={stove ? (stove.madeToOrder ? "order" : "stock") : undefined} />
          )}

          {/* The stock is only set when adding; afterwards it changes one unit at a time in the inventory. */}
          {!stove && condition === "new" && supply === "stock" && (
            <>
              <label htmlFor={`${id}-quantity`}>Aantal op voorraad</label>
              <input
                id={`${id}-quantity`}
                name="quantity"
                type="number"
                inputMode="numeric"
                min={STOCK_QUANTITY.min}
                max={STOCK_QUANTITY.max}
                step={1}
                required
                defaultValue={1}
              />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section-title">Afmetingen en aansluiting</legend>
        <fieldset className="dimension-group">
          <legend>Afmetingen <span className="muted">(cm)</span></legend>
          <div className="dimension-fields">
            {DIMENSION_FIELDS.map(({ name, label, key }) => (
              <label key={name}>
                <span>{label}</span>
                <input
                  name={name}
                  type="number"
                  inputMode="numeric"
                  min={DIMENSION_CM.min}
                  max={DIMENSION_CM.max}
                  step={1}
                  required={detailsRequired}
                  defaultValue={stove?.[key] ?? undefined}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <ChoiceGroup legend="Rookafvoer" name="flueOutlet" options={FLUE_OUTLET_LABELS} defaultValue={stove?.flueOutlet} required={detailsRequired} />

        <label htmlFor={`${id}-flue-diameter`}>Maat afvoer <span className="muted">(Ø mm)</span></label>
        <input
          id={`${id}-flue-diameter`}
          name="flueDiameter"
          type="number"
          inputMode="numeric"
          list={`${id}-flue-diameters`}
          min={FLUE_DIAMETER_MM.min}
          max={FLUE_DIAMETER_MM.max}
          step={1}
          required={detailsRequired}
          defaultValue={stove?.flueDiameterMm ?? undefined}
        />
        <datalist id={`${id}-flue-diameters`}>
          {COMMON_FLUE_DIAMETERS_MM.map((diameter) => <option key={diameter} value={diameter} />)}
        </datalist>

        <NumberField
          name="flueCenterHeight"
          label="Hoogte hart achter"
          unit="cm"
          decimal
          min={DIMENSION_CM.min}
          max={DIMENSION_CM.max}
          defaultValue={stove?.flueCenterHeightCm}
        />
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section-title">Productgegevens</legend>
        <StoveSpecFields stove={stove} />
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section-title">Prijs en verkoop</legend>
        <label htmlFor={`${id}-price`}>Verkoopprijs <span className="muted">(€ incl. btw)</span></label>
        <input
          id={`${id}-price`}
          name="price"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="bijv. 1.250"
          required
          defaultValue={stove?.priceCents ? formatPriceInput(stove.priceCents) : undefined}
        />

        {Object.values(LISTING_CHANNELS).map(({ field, description }) => (
          <label key={field} className="checkbox-field">
            {/* Sold-out stoves cannot be listed; a disabled checkbox is not submitted, so it saves as off. */}
            <input type="checkbox" name={field} defaultChecked={stove?.[field] ?? false} disabled={Boolean(stove?.soldAt)} />
            <span>{description}</span>
          </label>
        ))}
        {stove?.soldAt && <p className="muted">Verkocht: wordt nergens aangeboden.</p>}
      </fieldset>
    </>
  );
}
