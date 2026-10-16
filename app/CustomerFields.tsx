import type { DraftCustomer } from "../lib/invoice-draft";

// span: columns out of 12 (wide form); spanNarrow: on a phone.
const FIELDS: { name: keyof DraftCustomer; label: string; required?: boolean; type?: string; autoComplete: string; span: number; spanNarrow: number }[] = [
  { name: "name", label: "Naam", required: true, autoComplete: "name", span: 12, spanNarrow: 12 },
  { name: "address", label: "Adres", required: true, autoComplete: "street-address", span: 5, spanNarrow: 12 },
  { name: "postal_code", label: "Postcode", required: true, autoComplete: "postal-code", span: 3, spanNarrow: 5 },
  { name: "city", label: "Plaats", required: true, autoComplete: "address-level2", span: 4, spanNarrow: 7 },
  { name: "email", label: "E-mail", type: "email", autoComplete: "email", span: 7, spanNarrow: 12 },
  { name: "phone", label: "Telefoon", type: "tel", autoComplete: "tel", span: 5, spanNarrow: 12 },
];

type CustomerFieldsProps = {
  customer: DraftCustomer;
  onChange: (customer: DraftCustomer) => void;
  /** Quotes only need a name; the address is optional. */
  addressOptional?: boolean;
};

export default function CustomerFields({ customer, onChange, addressOptional }: CustomerFieldsProps) {
  return (
    <fieldset className="invoice-section">
      <legend>Klant</legend>
      <div className="customer-fields">
        {FIELDS.map((field) => {
          const required = field.required && (!addressOptional || field.name === "name");
          return (
            <label
              key={field.name}
              className="stacked-label"
              style={{ "--span": field.span, "--span-narrow": field.spanNarrow } as React.CSSProperties}
            >
              <span>{field.label}{required ? "" : <span className="label-optional"> (optioneel)</span>}</span>
              <input
                name={`customer-${field.name}`}
                type={field.type ?? "text"}
                autoComplete={field.autoComplete}
                required={required}
                maxLength={field.name === "email" ? 320 : 200}
                value={customer[field.name]}
                onChange={(event) => onChange({ ...customer, [field.name]: event.target.value })}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
