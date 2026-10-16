"use client";

import type { StoveInvoice } from "../lib/stoves";
import { useInvoiceDownload } from "./useInvoiceDownload";

// Download links for invoices that were already made for this stove.
export default function StoveInvoiceLinks({ invoices }: { invoices: StoveInvoice[] }) {
  const { download, pending } = useInvoiceDownload();

  if (invoices.length === 0) return null;
  return (
    <span className="invoice-links" aria-busy={pending}>
      {invoices.map((invoice) => (
        <button key={invoice.id} type="button" className="invoice-link" onClick={() => download(invoice.id)} disabled={pending} title="Factuur downloaden">
          ↓ {invoice.number ?? "Concept"}
        </button>
      ))}
    </span>
  );
}
