"use client";

import { useState, useTransition } from "react";
import type { StovePhoto } from "../lib/stoves";
import { photosToFormData } from "../lib/photo-form-data";
import { addStovePhotos, deleteStovePhoto } from "./actions";
import { useDialog } from "./DialogProvider";
import PhotoPickerButton from "./PhotoPickerButton";
import PhotoViewer from "./PhotoViewer";

// Adds and deletes the photos of an existing stove; each change is saved straight away.
export default function StovePhotoManager({ stoveNumber, photos }: { stoveNumber: number; photos: StovePhoto[] }) {
  const [pending, startTransition] = useTransition();
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const { confirm, notify } = useDialog();

  function upload(blobs: Blob[]) {
    startTransition(async () => {
      const result = await addStovePhotos(stoveNumber, photosToFormData(blobs));
      if (!result.ok) await notify(result.error);
    });
  }

  // Resolves true when the photo was deleted.
  async function remove(photoId: number) {
    const confirmed = await confirm({ title: "Foto verwijderen?", message: "Dit kan niet ongedaan worden gemaakt.", confirmLabel: "Verwijderen", danger: true });
    if (!confirmed) return false;
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await deleteStovePhoto(photoId);
        if (!result.ok) await notify(result.error);
        resolve(result.ok);
      });
    });
  }

  // After deleting from the viewer, stay on the photo that took its place, or close when none are left.
  async function removeFromViewer(index: number) {
    if (!(await remove(photos[index].id))) return;
    const remaining = photos.length - 1;
    setViewIndex(remaining === 0 ? null : Math.min(index, remaining - 1));
  }

  return (
    <fieldset className="form-section photo-field" aria-busy={pending}>
      <legend className="form-section-title">Foto&apos;s</legend>
      <p className="muted form-hint">Foto&apos;s toevoegen en verwijderen wordt direct opgeslagen.</p>
      {photos.length > 0 && (
        <ul className="photo-previews">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              {photo.url ? (
                <button type="button" className="thumb-open" onClick={() => setViewIndex(index)} aria-label={`Foto ${index + 1} bekijken`}>
                  <img src={photo.thumbUrl ?? photo.url} alt="" loading="lazy" decoding="async" />
                </button>
              ) : (
                <span className="thumb-missing" aria-label="Foto niet beschikbaar">?</span>
              )}
              <button type="button" className="remove-photo" onClick={() => remove(photo.id)} disabled={pending} aria-label={`Foto ${index + 1} verwijderen`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <PhotoPickerButton label={pending ? "Bezig…" : "Foto's toevoegen"} onPhotos={upload} disabled={pending} />
      <PhotoViewer stoveNumber={stoveNumber} photos={photos} index={viewIndex} onIndexChange={setViewIndex} onDelete={removeFromViewer} deleting={pending} />
    </fieldset>
  );
}
