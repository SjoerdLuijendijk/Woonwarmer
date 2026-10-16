"use client";

import { useId, useState, useTransition } from "react";
import { saveArticleMarkup } from "./article-actions";

const formatPct = (value: number) => String(value).replace(".", ",");

// Artikelen → "Opslag op inkoopprijs": articles without a sale price of their own are sold at their
// purchase price plus this markup.
export default function ArticleMarkupForm({ markupPct }: { markupPct: number }) {
  const inputId = useId();
  const [value, setValue] = useState(formatPct(markupPct));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveArticleMarkup(value);
      setMessage(result.ok ? { ok: true, text: "Opgeslagen; de prijzen zijn bijgewerkt." } : { ok: false, text: result.error });
    });
  }

  return (
    <form className="markup-form" onSubmit={handleSubmit}>
      <label htmlFor={inputId}>Opslag op inkoopprijs</label>
      <span className="markup-input">
        <input id={inputId} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-describedby={`${inputId}-hint`} />
        <span aria-hidden="true">%</span>
      </span>
      <button type="submit" className="secondary-button toolbar-button" disabled={pending}>
        {pending ? "Opslaan…" : "Opslaan"}
      </button>
      <span id={`${inputId}-hint`} className="muted markup-hint">
        Voor artikelen zonder eigen verkoopprijs, bijv. inkoop € 100 → verkoop € {formatPct(100 + (Number(value.replace(",", ".")) || 0))} excl. btw.
      </span>
      {message && <span className={message.ok ? "field-success" : "field-error"} role={message.ok ? "status" : "alert"}>{message.text}</span>}
    </form>
  );
}
