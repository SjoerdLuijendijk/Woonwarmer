"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ROUTES } from "../lib/navigation";
import { MAX_PHOTOS_PER_UPLOAD } from "../lib/stoves";
import { photosToFormData } from "../lib/photo-form-data";
import { addStove } from "./actions";
import PhotoPickerButton from "./PhotoPickerButton";
import StoveFields from "./StoveFields";

type Photo = { blob: Blob; previewUrl: string };

export default function AddStoveForm({ brands }: { brands: string[] }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ number: number; warning?: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  // Release the preview URLs of photos still shown when leaving the page.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);

  function addPhotos(blobs: Blob[]) {
    setError(null);
    setPhotos((current) => {
      const room = MAX_PHOTOS_PER_UPLOAD - current.length;
      if (blobs.length > room) setError(`Maximaal ${MAX_PHOTOS_PER_UPLOAD} foto's per kachel bij het toevoegen.`);
      return [...current, ...blobs.slice(0, Math.max(room, 0)).map((blob) => ({ blob, previewUrl: URL.createObjectURL(blob) }))];
    });
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].previewUrl);
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = photosToFormData(photos.map((photo) => photo.blob), new FormData(event.currentTarget));
    setError(null);
    startTransition(async () => {
      const result = await addStove(formData);
      if (result.ok) {
        setSaved({ number: result.number, warning: result.warning });
        photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        setPhotos([]);
        setFormKey((key) => key + 1);
      } else {
        setError(result.error);
      }
    });
  }

  if (saved) {
    return (
      <section className="panel saved-panel" role="status" aria-labelledby="saved-title">
        <p className="muted" id="saved-title">Kachel opgeslagen met nummer</p>
        <p className="stove-number-big">{saved.number}</p>
        <p className="muted">Zet dit nummer op de kachel.</p>
        {saved.warning && <p className="field-error">{saved.warning}</p>}
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => setSaved(null)}>Nog een kachel toevoegen</button>
          <Link className="secondary-button" href={ROUTES.stock}>Naar voorraad</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel--form" aria-labelledby="add-title">
      <h1 id="add-title">Kachel toevoegen</h1>
      <p className="muted">Het kachelnummer wordt automatisch gemaakt bij het opslaan.</p>

      <form key={formKey} onSubmit={handleSubmit} className="form-stack">
        <fieldset className="form-section photo-field">
          <legend className="form-section-title">Foto&apos;s</legend>
          {photos.length > 0 && (
            <ul className="photo-previews">
              {photos.map((photo, index) => (
                <li key={photo.previewUrl}>
                  <img src={photo.previewUrl} alt={`Foto ${index + 1}`} />
                  <button type="button" className="remove-photo" onClick={() => removePhoto(index)} aria-label={`Foto ${index + 1} verwijderen`}>×</button>
                </li>
              ))}
            </ul>
          )}
          <PhotoPickerButton
            className="photo-add-button"
            onPhotos={addPhotos}
            disabled={pending}
            label={
              <>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <span className="photo-add-text">
                  <strong>Foto&apos;s toevoegen</strong>
                  <small>Maak een foto of kies uit je galerij</small>
                </span>
              </>
            }
          />
        </fieldset>

        <StoveFields brands={brands} />

        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--large" type="submit" disabled={pending}>
          {pending ? "Opslaan…" : "Kachel opslaan"}
        </button>
      </form>
    </section>
  );
}
