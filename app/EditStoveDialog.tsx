"use client";

import { useRef, useState, useTransition } from "react";
import type { Stove } from "../lib/stoves";
import { updateStove } from "./actions";
import StoveFields from "./StoveFields";
import StovePhotoManager from "./StovePhotoManager";

export default function EditStoveDialog({ stove, brands }: { stove: Stove; brands: string[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    // Remount the form so it starts from the latest saved values.
    setFormKey((key) => key + 1);
    setError(null);
    dialogRef.current?.showModal();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateStove(stove.number, formData);
      if (result.ok) dialogRef.current?.close();
      else setError(result.error);
    });
  }

  const titleId = `edit-stove-${stove.number}`;
  return (
    <>
      <button type="button" className="icon-button" onClick={open} title="Bewerken" aria-label={`Kachel ${stove.number} bewerken`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <dialog ref={dialogRef} className="edit-dialog" aria-labelledby={titleId}>
        <form key={formKey} onSubmit={handleSubmit} className="form-stack">
          <h2 id={titleId}>Kachel {stove.number} bewerken</h2>
          {/* formKey is 0 until the dialog is opened: the photos are only loaded then. */}
          {formKey > 0 && <StovePhotoManager stoveNumber={stove.number} mainPhoto={stove.mainPhoto} />}
          <StoveFields brands={brands} stove={stove} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="button-row dialog-actions">
            <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()} disabled={pending}>
              Annuleren
            </button>
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? "Opslaan…" : "Wijzigingen opslaan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
