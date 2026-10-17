"use client";

import { useState, useTransition } from "react";
import type { Invoice } from "../lib/invoice";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "../lib/invoice-payments";
import { invoiceOverview } from "../lib/invoice-overview";
import type { InvoiceSummary } from "../lib/invoice-queries";
import { formatPrice } from "../lib/price";
import { onRowClick } from "../lib/row-click";
import { useDialog } from "./DialogProvider";
import { getInvoiceForPdf } from "./invoice-actions";
import InvoiceEditDialog from "./InvoiceEditDialog";
import InvoicePaymentsDialog from "./InvoicePaymentsDialog";
import { useInvoiceDownload } from "./useInvoiceDownload";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const money = (cents: number) => formatPrice(cents, { alwaysCents: true });
const STATUS_TONES: Record<PaymentStatus, string> = { paid: "", partial: " status-pill--negotiating", open: " status-pill--sold" };

type Filter = "all" | "draft" | "open";

// All invoices of the app and the web shop, also those of stoves that have since been deleted, in the
// stock table layout. A row opens an app invoice to correct it (a web shop invoice opens its payments);
// the status opens the payments.
export default function InvoiceList({ invoices }: { invoices: InvoiceSummary[] }) {
  const { download, pending: downloading } = useInvoiceDownload();
  const [opening, startOpening] = useTransition();
  const [editing, setEditing] = useState<{ id: number; invoice: Invoice } | null>(null);
  const [paymentsId, setPaymentsId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const { notify } = useDialog();
  const pending = downloading || opening;
  // Looked up on every render, so the dialog shows the payments as refreshed after a change.
  const paymentsInvoice = invoices.find(({ id }) => id === paymentsId) ?? null;
  const { drafts, unpaid, openCents } = invoiceOverview(invoices);
  const shown = filter === "open" ? unpaid : filter === "draft" ? drafts : invoices;

  const label = (invoice: InvoiceSummary) => (invoice.number ? `Factuur ${invoice.number}` : "Conceptfactuur");

  function open(invoice: InvoiceSummary) {
    if (invoice.source === "webshop") return setPaymentsId(invoice.id);
    startOpening(async () => {
      const result = await getInvoiceForPdf(invoice.id);
      if (!result.ok) return notify(result.error);
      setEditing({ id: invoice.id, invoice: result.invoice });
    });
  }

  if (invoices.length === 0) {
    return <div className="notice"><p>Er zijn nog geen facturen.</p></div>;
  }
  return (
    <>
      <div className="invoice-filter">
        <div className="kind-tabs" role="group" aria-label="Welke facturen">
          <button type="button" className="kind-tab" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            Alle <span>{invoices.length}</span>
          </button>
          <button type="button" className="kind-tab" aria-pressed={filter === "draft"} onClick={() => setFilter("draft")}>
            Concepten <span>{drafts.length}</span>
          </button>
          <button type="button" className="kind-tab" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>
            Openstaand <span>{unpaid.length}</span>
          </button>
        </div>
        <p className="invoice-open-total">
          Nog te ontvangen: <strong>{money(openCents)}</strong>
        </p>
      </div>
      {shown.length === 0 ? (
        <div className="notice"><p>{filter === "draft" ? "Er zijn geen concepten." : "Alle facturen zijn betaald."}</p></div>
      ) : (
        <div className="table-wrap" aria-busy={pending}>
          {editing && <InvoiceEditDialog invoiceId={editing.id} invoice={editing.invoice} onClose={() => setEditing(null)} />}
          {paymentsInvoice && <InvoicePaymentsDialog invoice={paymentsInvoice} onClose={() => setPaymentsId(null)} />}
          <table className="stove-table invoice-table">
            <thead>
              <tr>
                <th scope="col">Factuur</th>
                <th scope="col">Datum</th>
                <th scope="col">Klant</th>
                <th scope="col" className="cell-number">Kachel</th>
                <th scope="col" className="cell-numeric">Bedrag</th>
                <th scope="col">Status</th>
                <th scope="col" className="cell-actions"><span className="visually-hidden">PDF</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((invoice) => (
                <tr key={invoice.id} className="clickable-row" onClick={onRowClick(() => open(invoice))}>
                  <td data-label="Factuur" className="cell-number cell-nowrap">
                    <button type="button" className="text-button" onClick={() => open(invoice)} disabled={pending} aria-label={`${label(invoice)} openen`}>
                      {invoice.number ?? <span className="draft-badge">Concept</span>}
                    </button>
                    {invoice.source === "webshop" && <span className="source-badge">Webshop</span>}
                  </td>
                  <td data-label="Datum" className="cell-nowrap">
                    <time dateTime={invoice.issueDate}>{DATE_FORMAT.format(new Date(invoice.issueDate))}</time>
                  </td>
                  <td data-label="Klant">{invoice.customerName}</td>
                  <td data-label="Kachel">{invoice.stoveNumber ?? "—"}</td>
                  <td data-label="Bedrag" className="cell-numeric cell-nowrap">{money(invoice.totalCents)}</td>
                  <td data-label="Status" className="cell-nowrap">
                    {invoice.draft ? (
                      <button type="button" className="status-pill status-pill--compact status-pill--cancelled" onClick={() => open(invoice)} aria-label={`${label(invoice)} openen`}>
                        Concept
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`status-pill status-pill--compact${STATUS_TONES[invoice.status]}`}
                        onClick={() => setPaymentsId(invoice.id)}
                        aria-label={`Betalingen ${label(invoice).toLowerCase()}: ${PAYMENT_STATUS_LABELS[invoice.status]}`}
                      >
                        {PAYMENT_STATUS_LABELS[invoice.status]}
                        {invoice.status === "partial" && <span className="pill-detail"> · {money(invoice.totalCents - invoice.paidCents)} open</span>}
                      </button>
                    )}
                  </td>
                  <td className="cell-actions">
                    {invoice.source === "app" && (
                      <button type="button" className="invoice-link" onClick={() => download(invoice.id)} disabled={pending} aria-label={`${label(invoice)} downloaden`}>
                        ↓ PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
