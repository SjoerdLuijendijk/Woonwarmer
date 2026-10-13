"use client";

import { useState, useTransition } from "react";
import type { Company } from "../lib/invoice";
import { formatPriceInput } from "../lib/price";
import { saveCompanySettings } from "./invoice-actions";

const FIELDS: { name: keyof Company; label: string; required?: boolean; type?: string; inputMode?: "numeric" | "email" | "tel"; autoComplete?: string }[] = [
  { name: "name", label: "Bedrijfsnaam", required: true, autoComplete: "organization" },
  { name: "address", label: "Adres", required: true, autoComplete: "street-address" },
  { name: "postal_code", label: "Postcode", required: true, autoComplete: "postal-code" },
  { name: "city", label: "Plaats", required: true, autoComplete: "address-level2" },
  { name: "kvk_number", label: "KvK-nummer", required: true, inputMode: "numeric" },
  { name: "vat_number", label: "Btw-nummer", required: true },
  { name: "iban", label: "IBAN", required: true },
  { name: "email", label: "E-mail (optioneel)", type: "email", inputMode: "email", autoComplete: "email" },
  { name: "phone", label: "Telefoon (optioneel)", type: "tel", inputMode: "tel", autoComplete: "tel" },
];

export default function CompanySettingsForm({ company }: { company: Company | null }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await saveCompanySettings(formData);
      setMessage(result.ok ? { ok: true, text: "Bedrijfsgegevens opgeslagen." } : { ok: false, text: result.error });
    });
  }

  return (
    <>
      <p className="muted">Deze bedrijfsgegevens komen op elke nieuwe factuur. Bestaande facturen veranderen niet.</p>
      <form onSubmit={handleSubmit} className="form-stack">
        {FIELDS.map((field) => (
          <label key={field.name} className="stacked-label">
            <span>{field.label}</span>
            <input
              name={field.name}
              type={field.type ?? "text"}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete ?? "off"}
              required={field.required}
              defaultValue={company?.[field.name] ?? ""}
            />
          </label>
        ))}
        <label className="stacked-label">
          <span>Uurtarief montage excl. btw (€, optioneel)</span>
          <input
            name="hourly_rate_ex"
            inputMode="decimal"
            placeholder="bijv. 55"
            defaultValue={company?.hourly_rate_ex_cents != null ? formatPriceInput(company.hourly_rate_ex_cents) : ""}
          />
        </label>
        <label className="stacked-label">
          <span>Betaaltermijn (dagen)</span>
          <input name="payment_term_days" type="number" inputMode="numeric" min={0} max={365} step={1} required defaultValue={company?.payment_term_days ?? 14} />
        </label>
        <label className="stacked-label">
          <span>Voettekst onderaan de factuur (optioneel)</span>
          <textarea name="invoice_footer" rows={6} maxLength={2000} defaultValue={company?.invoice_footer ?? ""} />
        </label>
        {message && (
          <p className={message.ok ? "field-success" : "field-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>
        )}
        <button className="primary-button primary-button--large" type="submit" disabled={pending}>
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </form>
    </>
  );
}
