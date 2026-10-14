"use client";

import { useState } from "react";
import type { StovePhoto } from "../lib/stoves";
import PhotoViewer from "./PhotoViewer";
import { useStovePhotos } from "./useStovePhotos";

type PhotoCellProps = { stoveNumber: number; mainPhoto: StovePhoto | null; photoCount: number };

// The inventory shows only the main photo; the others are loaded when the viewer opens. Photos are
// managed in the edit dialog.
export default function PhotoCell({ stoveNumber, mainPhoto, photoCount }: PhotoCellProps) {
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  if (!mainPhoto) {
    return (
      <span className="thumb thumb-empty" title="Geen foto">
        <span className="visually-hidden">Geen foto</span>
      </span>
    );
  }

  return (
    <span className="thumb">
      {mainPhoto.url ? (
        <button
          type="button"
          className="thumb-open"
          onClick={() => setViewIndex(0)}
          aria-label={photoCount > 1 ? `${photoCount} foto's bekijken` : "Foto bekijken"}
        >
          <img src={mainPhoto.thumbUrl ?? mainPhoto.url} alt="" loading="lazy" decoding="async" />
        </button>
      ) : (
        <span className="thumb-missing" aria-label="Foto niet beschikbaar">?</span>
      )}
      {viewIndex !== null && (
        <AllPhotosViewer stoveNumber={stoveNumber} mainPhoto={mainPhoto} index={viewIndex} onIndexChange={setViewIndex} />
      )}
    </span>
  );
}

type AllPhotosViewerProps = {
  stoveNumber: number;
  mainPhoto: StovePhoto;
  index: number;
  onIndexChange: (index: number | null) => void;
};

// Mounted only while open: shows the main photo straight away and the others once loaded.
function AllPhotosViewer({ stoveNumber, mainPhoto, index, onIndexChange }: AllPhotosViewerProps) {
  const { photos } = useStovePhotos(stoveNumber, mainPhoto);
  return <PhotoViewer stoveNumber={stoveNumber} photos={photos} index={index} onIndexChange={onIndexChange} />;
}
