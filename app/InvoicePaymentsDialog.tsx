"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { INVOICE_PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type InvoicePaymentMethod } from "../lib/invoice-payments";
import type { InvoiceSummary } from "../lib/invoice-queries";
import { formatPrice, formatPriceInput } from "../lib/price";
import { todayInNetherlands } from "../lib/today";
import { useDialog } from "./DialogProvider";
import { addInvoicePayment, deleteInvoicePayment, setInvoicePaid } from "./payment-actions";

const money = (cents: number) => formatPrice(cents, { alwaysCents: true });
const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (isoDate: string) => DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));
// The methods a team member records; "Webshop" only comes from the shop import.
const MANUAL_METHODS: InvoicePaymentMethod[] = ["bank", "pin", "cash"];

// The payments of one invoice: what was paid when and how, what is still open, a form to add a (part)
// payment, and the mark "Betaald" for an invoice that is settled otherwise. Rendered only while open;
// the list behind it refreshes after every change, which passes the new invoice in.
export default function InvoicePaymentsDialog({ invoice, onClose }: { invoice: InvoiceSummary; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  const [paidOn, setPaidOn] = useState(todayInNetherlands());
  const [amount, setAmount] = useState(openCents > 0 ? formatPriceInput(openCents) : "");
  const [method, setMethod] = useState<InvoicePaymentMethod>("bank");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm } = useDialog();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  // After a payment the open amount changes; suggest the new remainder.
  useEffect(() => {
    setAmount(openCents > 0 ? formatPriceInput(openCents) : "");
  }, [openCents]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Er ging iets mis.");
    });
  }

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      const result = await addInvoicePayment(invoice.id, { paidOn, amount, method, note });
      if (result.ok) setNote("");
      return result;
    });
  }

  async function handleDelete(paymentId: number, label: string) {
    const confirmed = await confirm({ title: `Betaling van ${label} verwijderen?`, confirmLabel: "Verwijderen", danger: true });
    if (confirmed) run(() => deleteInvoicePayment(paymentId));
  }

  const statusTone = invoice.status === "paid" ? "" : invoice.status === "partial" ? " status-pill--negotiating" : " status-pill--sold";

  return (
    <dialog ref={dialogRef} className="edit-dialog payments-dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="invoice-dialog-header">
        <div>
          <h2 id={titleId}>Betalingen factuur {invoice.number}</h2>
          <p className="dialog-subtitle">{invoice.customerName}</p>
        </div>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>

      <dl className="payments-summary">
        <div><dt>Factuurbedrag</dt><dd>{money(invoice.totalCents)}</dd></div>
        <div><dt>Betaald</dt><dd>{money(invoice.paidCents)}</dd></div>
        <div className="payments-open"><dt>Nog open</dt><dd>{invoice.status === "paid" ? money(0) : money(openCents)}</dd></div>
        <div>
          <dt>Status</dt>
          <dd><span className={`status-pill status-pill--compact payments-status${statusTone}`}>{PAYMENT_STATUS_LABELS[invoice.status]}</span></dd>
        </div>
      </dl>

      {invoice.payments.length > 0 ? (
        <ul className="payments-list">
          {invoice.payments.map((payment) => (
            <li key={payment.id}>
              <span className="payments-date">{formatDate(payment.paidOn)}</span>
              <span className="payments-method">
                {INVOICE_PAYMENT_METHOD_LABELS[payment.method]}
                {payment.note && <span className="muted"> · {payment.note}</span>}
              </span>
              <span className="payments-amount">{money(payment.amountCents)}</span>
              <button
                type="button"
                className="line-remove"
                onClick={() => handleDelete(payment.id, money(payment.amountCents))}
                disabled={pending}
                aria-label={`Betaling van ${money(payment.amountCents)} op ${formatDate(payment.paidOn)} verwijderen`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nog geen betalingen.</p>
      )}

      <form className="payments-form" onSubmit={handleAdd}>
        <h3>Betaling toevoegen</h3>
        <div className="payments-fields">
          <label className="stacked-label">
            <span>Datum</span>
            <input type="date" value={paidOn} max={todayInNetherlands()} onChange={(event) => setPaidOn(event.target.value)} required />
          </label>
          <label className="stacked-label">
            <span>Bedrag (€)</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label className="stacked-label">
            <span>Betaald via</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as InvoicePaymentMethod)}>
              {MANUAL_METHODS.map((key) => <option key={key} value={key}>{INVOICE_PAYMENT_METHOD_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="stacked-label payments-note">
            <span>Opmerking (optioneel)</span>
            <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="button-row">
          {invoice.markedPaid ? (
            <button type="button" className="secondary-button" onClick={() => run(() => setInvoicePaid(invoice.id, false))} disabled={pending}>
              Markering betaald weghalen
            </button>
          ) : (
            invoice.status !== "paid" && (
              <button type="button" className="secondary-button" onClick={() => run(() => setInvoicePaid(invoice.id, true))} disabled={pending}>
                Op betaald zetten
              </button>
            )
          )}
          <button type="submit" className="primary-button" disabled={pending}>
            {pending ? "Bezig…" : "Betaling toevoegen"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
