import type { invoiceTotals } from "../lib/invoice";
import { formatPrice } from "../lib/price";

const amount = (cents: number) => formatPrice(cents, { alwaysCents: true });

// Running totals below the lines of the invoice and quote dialogs. Margin scheme lines carry no VAT.
export default function InvoiceTotalsSummary({ totals }: { totals: ReturnType<typeof invoiceTotals> }) {
  const hasVatLines = totals.groups.length > 0;
  return (
    <dl className="invoice-totals">
      {totals.hasMarginScheme && <div><dt>Marge (geen btw)</dt><dd>{amount(totals.marginCents)}</dd></div>}
      {(hasVatLines || !totals.hasMarginScheme) && (
        <>
          <div><dt>Excl. btw</dt><dd>{amount(totals.exclCents)}</dd></div>
          <div><dt>Btw</dt><dd>{amount(totals.vatCents)}</dd></div>
        </>
      )}
      <div className="invoice-total"><dt>Totaal</dt><dd>{amount(totals.inclCents)}</dd></div>
    </dl>
  );
}
