import { MAX_INVOICE_LINES, VAT_RATES } from "../lib/invoice";
import { draftVatPatch, draftVatValue, emptyLine, montageLine, type DraftLine } from "../lib/invoice-draft";

type InvoiceLinesEditorProps = {
  lines: DraftLine[];
  invalid: number[];
  onChange: (lines: DraftLine[]) => void;
  /** Quotes: typed lines can be saved in the article list. */
  allowSaveAsArticle?: boolean;
  /** Extra controls next to "Regel toevoegen", such as picking a stove or article. */
  children?: React.ReactNode;
  /** Hourly rate excluding VAT for "＋ Montage": null when not set (the price stays empty), undefined while loading. */
  hourlyRateExCents?: number | null;
};

export default function InvoiceLinesEditor({ lines, invalid, onChange, allowSaveAsArticle, children, hourlyRateExCents }: InvoiceLinesEditorProps) {
  const full = lines.length >= MAX_INVOICE_LINES;
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <fieldset className="invoice-section">
      <legend>Regels</legend>
      <ul className="invoice-lines">
        {lines.map((line, index) => (
          <li key={line.key} className={invalid.includes(index) ? "invoice-line is-invalid" : "invoice-line"}>
            <label className="stacked-label line-description">
              <span>Omschrijving</span>
              <input value={line.description} maxLength={200} onChange={(event) => update(line.key, { description: event.target.value })} />
            </label>
            <label className="stacked-label line-quantity">
              <span>Aantal</span>
              <input value={line.quantity} inputMode="numeric" onChange={(event) => update(line.key, { quantity: event.target.value })} />
            </label>
            <label className="stacked-label line-price">
              <span>Prijs incl. btw</span>
              <input value={line.price} inputMode="text" placeholder="bijv. 250 of -100" onChange={(event) => update(line.key, { price: event.target.value })} />
            </label>
            <label className="stacked-label line-vat">
              <span>Btw</span>
              <select value={draftVatValue(line)} onChange={(event) => update(line.key, draftVatPatch(event.target.value))}>
                {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                <option value="margin">Marge</option>
              </select>
            </label>
            <button
              type="button"
              className="line-remove"
              onClick={() => onChange(lines.filter((other) => other.key !== line.key))}
              disabled={lines.length === 1}
              aria-label={`Regel ${index + 1} verwijderen`}
            >
              ×
            </button>
            {allowSaveAsArticle && !line.articleId && !line.stoveNumber && (
              <label className="line-save">
                <input type="checkbox" checked={line.saveAsArticle ?? false} onChange={(event) => update(line.key, { saveAsArticle: event.target.checked })} />
                Opslaan in artikelen
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="line-actions">
        {children}
        <button type="button" className="secondary-button" onClick={() => onChange([...lines, montageLine(hourlyRateExCents)])} disabled={full}>
          ＋ Montage
        </button>
        <button type="button" className="secondary-button" onClick={() => onChange([...lines, emptyLine()])} disabled={full}>
          ＋ Losse regel
        </button>
      </div>
      <p className="form-hint muted">Gebruikte kachels vallen onder de margeregeling (btw „Marge”), nieuwe onder 21%. Een inruilkachel vul je in met een minbedrag, bijv. -100.</p>
      {hourlyRateExCents === null && <p className="form-hint muted">Stel het uurtarief voor montage in bij Instellingen → Bedrijfsgegevens; dan vult ＋ Montage de prijs vanzelf in.</p>}
    </fieldset>
  );
}
