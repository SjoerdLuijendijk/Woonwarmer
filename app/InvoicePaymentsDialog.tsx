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

  const settled = invoice.status === "paid";

  return (
    <dialog ref={dialogRef} className="edit-dialog payments-dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="invoice-dialog-header">
        <div>
          <h2 id={titleId}>Factuur {invoice.number}</h2>
          <p className="dialog-subtitle">{invoice.customerName}</p>
        </div>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>

      {/* What is still open first: that is what this dialog is about. */}
      <div className={`payments-summary${settled ? " is-paid" : ""}`}>
        <div className="payments-open">
          <span className="payments-open-label">{settled ? "Betaald" : "Nog open"}</span>
          <strong>{money(settled ? invoice.totalCents : openCents)}</strong>
          <span className={`status-pill status-pill--compact payments-status${statusTone}`}>{PAYMENT_STATUS_LABELS[invoice.status]}</span>
        </div>
        <dl className="payments-figures">
          <div><dt>Factuurbedrag</dt><dd>{money(invoice.totalCents)}</dd></div>
          <div><dt>Ontvangen</dt><dd>{money(invoice.paidCents)}</dd></div>
        </dl>
      </div>

      {!settled && (
        <button type="button" className="paid-button" onClick={() => run(() => setInvoicePaid(invoice.id, true))} disabled={pending}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
          Op betaald zetten
        </button>
      )}
      {invoice.markedPaid && (
        <p className="payments-marked muted">
          Met de hand op betaald gezet.{" "}
          <button type="button" className="text-button" onClick={() => run(() => setInvoicePaid(invoice.id, false))} disabled={pending}>
            Ongedaan maken
          </button>
        </p>
      )}

      <section className="payments-section" aria-label="Betalingen">
        <h3>Betalingen</h3>
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
          <p className="muted payments-empty">Nog geen betalingen ontvangen.</p>
        )}
      </section>

      <form className="payments-form" onSubmit={handleAdd}>
        <h3>{settled ? "Betaling toevoegen" : "Deelbetaling toevoegen"}</h3>
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
            <span>Via</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as InvoicePaymentMethod)}>
              {MANUAL_METHODS.map((key) => <option key={key} value={key}>{INVOICE_PAYMENT_METHOD_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="stacked-label payments-note">
            <span>Opmerking (optioneel)</span>
            <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button type="submit" className="secondary-button payments-add" disabled={pending}>
            {pending ? "Bezig…" : "＋ Toevoegen"}
          </button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </form>
    </dialog>
  );
}
