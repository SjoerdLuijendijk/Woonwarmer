"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "../lib/price";
import { kindOf, MISSING } from "../lib/stove-display";
import { sortStoves } from "../lib/stove-sort";
import { stoveSpecs, type StoveSpecKey } from "../lib/stove-specs";
import type { Stove } from "../lib/stoves";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
const PRINT_SORT = { key: "brand", direction: "asc" } as const;

// Detail columns in print order with short headings; the section already says new or used.
const SPEC_COLUMNS: [StoveSpecKey, string][] = [
  ["stoveType", "Type"],
  ["power", "Vermogen"],
  ["minPower", "Min."],
  ["maxPower", "Max."],
  ["dimensions", "H × B × D"],
  ["weight", "Gewicht"],
  ["flueOutlet", "Aansluiting"],
  ["flueDiameter", "Ø pijp"],
  ["flueCenterHeight", "Harthoogte"],
  ["externalAirSupply", "Ext. lucht"],
  ["newFirebox", "Nieuw binnenwerk"],
  ["thermostat", "Thermostaat"],
  ["efficiency", "Rendement"],
  ["energyLabel", "Label"],
  ["warranty", "Garantie"],
  ["material", "Materiaal"],
];

function StockSection({ title, stoves }: { title: string; stoves: Stove[] }) {
  const rows = stoves.map((stove) => ({ stove, specs: new Map(stoveSpecs(stove).map((spec) => [spec.key, spec.value])) }));
  // Only columns that at least one stove has filled in.
  const columns = SPEC_COLUMNS.filter(([key]) => rows.some(({ specs }) => specs.has(key)));
  const showStock = stoves.some((stove) => stove.stockQuantity > 1);
  return (
    <section className="print-section">
      <h2>{title}</h2>
      {stoves.length === 0 ? (
        <p>Geen kachels op voorraad.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Nr.</th>
              <th scope="col">Kachel</th>
              {columns.map(([key, heading]) => <th key={key} scope="col">{heading}</th>)}
              {showStock && <th scope="col" className="cell-numeric">Aantal</th>}
              <th scope="col" className="cell-numeric">Prijs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stove, specs }) => (
              <tr key={stove.number}>
                <td>{stove.number}</td>
                <td>{stove.shopName ?? stove.brand}</td>
                {columns.map(([key]) => <td key={key}>{specs.get(key) ?? MISSING}</td>)}
                {showStock && <td className="cell-numeric">{stove.stockQuantity}</td>}
                <td className="cell-numeric cell-nowrap">{stove.priceCents ? formatPrice(stove.priceCents) : MISSING}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Only visible when printing: all stoves in stock (not sold, not made to order), new and used apart.
export default function StockPrintList({ stoves }: { stoves: Stove[] }) {
  // Set in the browser only, so server and browser render alike; refreshed when printing (also via Ctrl+P).
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setPrintedAt(new Date());
    update();
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);

  const inStock = sortStoves(stoves.filter((stove) => !stove.soldAt), PRINT_SORT);

  return (
    <div className="print-stock">
      <header>
        <h1>Voorraad kachels</h1>
        {printedAt && <p>{DATE_FORMAT.format(printedAt)}</p>}
      </header>
      <StockSection title="Nieuw" stoves={inStock.filter((stove) => kindOf(stove) === "new")} />
      <StockSection title="Gereviseerd" stoves={inStock.filter((stove) => kindOf(stove) === "used")} />
    </div>
  );
}
