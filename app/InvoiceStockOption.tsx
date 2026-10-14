"use client";

import type { InvoiceStock } from "../lib/invoice-queries";

type InvoiceStockOptionProps = {
  stoveNumber: number;
  /** Null while loading, or when the stove no longer exists. */
  stock: InvoiceStock | null;
  /** Units on the invoice lines of this stove. */
  units: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** Units the invoice takes from the stock of its stove: none when the option does not apply or is off. */
export function stockDeduction(stock: InvoiceStock | null, units: number, checked: boolean) {
  return stock && !stock.madeToOrder && stock.quantity > 0 && checked ? units : 0;
}

// Whether the final invoice also takes the sold stove from the stock. Off by default when a sale placed
// with "Verkocht" is still to be delivered, because that sale already took a unit.
export default function InvoiceStockOption({ stoveNumber, stock, units, checked, onChange }: InvoiceStockOptionProps) {
  if (!stock) return null;

  let message: string | null = null;
  if (stock.madeToOrder) message = "Kachel op bestelling: de voorraad verandert niet.";
  else if (stock.quantity === 0) message = `Kachel ${stoveNumber} staat al op verkocht: de voorraad verandert niet.`;
  else if (units === 0) message = `Er staat geen regel van kachel ${stoveNumber} op de factuur: de voorraad verandert niet.`;
  if (message) return <p className="invoice-stock muted">{message}</p>;

  const sales = stock.openSales === 1 ? "1 verkoop" : `${stock.openSales} verkopen`;
  return (
    <div className="invoice-stock">
      {stock.openSales > 0 && (
        <p className="ad-warning">
          Voor deze kachel staat al {sales} op &ldquo;Af te leveren&rdquo;; daarmee ging de voorraad al omlaag. Zet het vinkje
          alleen aan als deze factuur over een andere verkoop gaat.
        </p>
      )}
      <label className="checkbox-field">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>
          {units} van de voorraad afhalen (nu {stock.quantity} op voorraad)
        </span>
      </label>
      {checked && units > stock.quantity && (
        <p className="field-error" role="alert">Er {stock.quantity === 1 ? "staat" : "staan"} maar {stock.quantity} op voorraad.</p>
      )}
    </div>
  );
}
