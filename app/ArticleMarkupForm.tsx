"use client";

import { useId, useState, useTransition } from "react";
import { saveArticleMarkup } from "./article-actions";

const formatPct = (value: number) => String(value).replace(".", ",");

// Instellingen → Opslag losse artikelen: every article without a sale price of its own is sold at its
// purchase price plus this markup.
export default function ArticleMarkupForm({ markupPct }: { markupPct: number }) {
  const id = useId();
  const [value, setValue] = useState(formatPct(markupPct));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const example = 100 + (Number(value.replace(",", ".")) || 0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveArticleMarkup(value);
      setMessage(result.ok ? { ok: true, text: "Opgeslagen; de prijzen van de artikelen zijn bijgewerkt." } : { ok: false, text: result.error });
    });
  }

  return (
    <>
      <p className="muted">
        Losse artikelen zonder eigen verkoopprijs krijgen hun inkoopprijs plus deze opslag als verkoopprijs, op offertes, facturen en
        in de artikellijst. Een verkoopprijs die bij een artikel zelf is ingevuld, gaat altijd voor.
      </p>
      <form onSubmit={handleSubmit} className="form-stack">
        <label htmlFor={`${id}-markup`}>Opslag op inkoopprijs</label>
        <span className="markup-input">
          <input
            id={`${id}-markup`}
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setMessage(null);
            }}
            aria-describedby={`${id}-hint`}
          />
          <span aria-hidden="true">%</span>
        </span>
        <p id={`${id}-hint`} className="muted">
          Bijvoorbeeld: inkoop € 100 → verkoop € {formatPct(example)} excl. btw.
        </p>
        {message && <p className={message.ok ? "field-success" : "field-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
        <div className="button-row">
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </form>
    </>
  );
}
