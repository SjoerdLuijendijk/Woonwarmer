"use client";

import { useState, useTransition } from "react";
import type { Invoice } from "../lib/invoice";
import type { InvoiceSummary } from "../lib/invoice-queries";
import { formatPrice } from "../lib/price";
import { onRowClick } from "../lib/row-click";
import { useDialog } from "./DialogProvider";
import { getInvoiceForPdf } from "./invoice-actions";
import InvoiceEditDialog from "./InvoiceEditDialog";
import { useInvoiceDownload } from "./useInvoiceDownload";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// All invoices, also those of stoves that have since been deleted, in the stock table layout. A row
// opens the invoice in a dialog where it can still be corrected.
export default function InvoiceList({ invoices }: { invoices: InvoiceSummary[] }) {
  const { download, pending: downloading } = useInvoiceDownload();
  const [opening, startOpening] = useTransition();
  const [editing, setEditing] = useState<{ id: number; invoice: Invoice } | null>(null);
  const { notify } = useDialog();
  const pending = downloading || opening;

  function open(id: number) {
    startOpening(async () => {
      const result = await getInvoiceForPdf(id);
      if (!result.ok) return notify(result.error);
      setEditing({ id, invoice: result.invoice });
    });
  }

  if (invoices.length === 0) {
    return <div className="notice"><p>Er zijn nog geen facturen.</p></div>;
  }
  return (
    <div className="table-wrap" aria-busy={pending}>
      {editing && <InvoiceEditDialog invoiceId={editing.id} invoice={editing.invoice} onClose={() => setEditing(null)} />}
      <table className="stove-table invoice-table">
        <thead>
          <tr>
            <th scope="col">Factuur</th>
            <th scope="col">Datum</th>
            <th scope="col">Klant</th>
            <th scope="col" className="cell-number">Kachel</th>
            <th scope="col" className="cell-numeric">Bedrag</th>
            <th scope="col" className="cell-actions"><span className="visually-hidden">PDF</span></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="clickable-row" onClick={onRowClick(() => open(invoice.id))}>
              <td data-label="Factuur" className="cell-number">
                <button type="button" className="text-button" onClick={() => open(invoice.id)} disabled={pending} aria-label={`Factuur ${invoice.number} openen`}>
                  {invoice.number}
                </button>
              </td>
              <td data-label="Datum" className="cell-nowrap">
                <time dateTime={invoice.issueDate}>{DATE_FORMAT.format(new Date(invoice.issueDate))}</time>
              </td>
              <td data-label="Klant">{invoice.customerName}</td>
              <td data-label="Kachel">{invoice.stoveNumber ?? "—"}</td>
              <td data-label="Bedrag" className="cell-numeric cell-nowrap">{formatPrice(invoice.totalCents, { alwaysCents: true })}</td>
              <td className="cell-actions">
                <button type="button" className="invoice-link" onClick={() => download(invoice.id)} disabled={pending} aria-label={`Factuur ${invoice.number} downloaden`}>
                  ↓ PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
