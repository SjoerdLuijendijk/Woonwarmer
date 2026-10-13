"use client";

import { useState } from "react";
import { formatPrice } from "../lib/price";
import { formatDimensions, formatFlue, formatType, MISSING } from "../lib/stove-display";
import type { NoteStatus, StoveNote } from "../lib/stove-notes";
import { LISTING_CHANNELS, type ListingChannel, type Stove } from "../lib/stoves";
import DeleteStoveDialog from "./DeleteStoveDialog";
import EditStoveDialog from "./EditStoveDialog";
import InvoiceDialog from "./InvoiceDialog";
import MarketplaceAdDialog from "./MarketplaceAdDialog";
import PhotoCell from "./PhotoCell";
import ListingToggle from "./ListingToggle";
import ShopSyncStatus from "./ShopSyncStatus";
import StockControl from "./StockControl";
import SaleButton from "./SaleButton";
import StoveStatus, { isModelStove, pillNote } from "./StoveStatus";
import StoveInvoiceLinks from "./StoveInvoiceLinks";
import StoveNoteBadges from "./StoveNoteBadges";
import StoveNoteDialog from "./StoveNoteDialog";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

// On phones the row is a compact card; "cell-detail" cells only show once the card is expanded.
export default function StoveRow({ stove, brands }: { stove: Stove; brands: string[] }) {
  const [expanded, setExpanded] = useState(false);
  // The note dialog: an existing note or a new one, with the status it moves to.
  // Status undefined: a new note whose kind is chosen in the dialog ("Verkoop plaatsen").
  const [openNote, setOpenNote] = useState<{ note: StoveNote | null; status?: NoteStatus } | null>(null);
  const showNote = (note: StoveNote | null, status: NoteStatus) => setOpenNote({ note, status });
  const onPill = pillNote(stove);
  const rowClass = [stove.soldAt && "is-sold", expanded && "is-expanded"].filter(Boolean).join(" ");

  return (
    <tr className={rowClass || undefined}>
      <td data-label="Nr." className="cell-number">{stove.number}</td>
      <td data-label="Foto's" className="cell-photo"><PhotoCell stoveNumber={stove.number} photos={stove.photos} /></td>
      <td data-label="Merk" className="cell-brand">{stove.brand}</td>
      <td data-label="Type" className="cell-detail">{formatType(stove)}</td>
      <td data-label="H × B × D" className="cell-detail cell-nowrap cell-numeric">{formatDimensions(stove)}</td>
      <td data-label="Rookafvoer" className="cell-detail cell-nowrap">{formatFlue(stove)}</td>
      <td data-label="Prijs" className="cell-price cell-nowrap cell-numeric">{stove.priceCents ? formatPrice(stove.priceCents) : MISSING}</td>
      <td data-label="Voorraad" className="cell-detail cell-nowrap cell-stock">
        {stove.madeToOrder ? (
          <span className="muted">Op bestelling</span>
        ) : stove.condition === "new" ? (
          <StockControl stoveNumber={stove.number} quantity={stove.stockQuantity} />
        ) : (
          stove.stockQuantity
        )}
      </td>
      <td data-label="Status" className="cell-status cell-sold">
        {/* Notes of a new stove model are only listed under In onderhandeling and Af te leveren. */}
        {isModelStove(stove) ? (
          <SaleButton stove={stove} onPlaceSale={() => setOpenNote({ note: null })} />
        ) : (
          <>
            <StoveStatus stove={stove} onOpenNote={showNote} />
            <StoveNoteBadges stove={stove} notes={stove.notes.filter((note) => note !== onPill)} onOpenNote={showNote} />
          </>
        )}
        {openNote && <StoveNoteDialog stove={stove} note={openNote.note} status={openNote.status} onClose={() => setOpenNote(null)} />}
      </td>
      {(Object.keys(LISTING_CHANNELS) as ListingChannel[]).map((channel) => (
        <td key={channel} data-label={LISTING_CHANNELS[channel].label} className="cell-detail cell-status">
          <ListingToggle
            stoveNumber={stove.number}
            channel={channel}
            listed={stove[LISTING_CHANNELS[channel].field]}
            soldOut={Boolean(stove.soldAt)}
          />
          {channel === "shop" && stove.shopSyncError && <ShopSyncStatus stoveNumber={stove.number} error={stove.shopSyncError} />}
        </td>
      ))}
      <td data-label="Toegevoegd" className="cell-detail muted">
        <time dateTime={stove.createdAt}>{DATE_FORMAT.format(new Date(stove.createdAt))}</time>
      </td>
      {/* Each action has its own column so the icons line up from row to row. */}
      <td className="cell-detail cell-actions">
        <EditStoveDialog stove={stove} brands={brands} />
      </td>
      <td className="cell-detail cell-actions">
        <InvoiceDialog stove={stove} />
        <StoveInvoiceLinks invoices={stove.invoices} />
      </td>
      <td className="cell-detail cell-actions">
        <MarketplaceAdDialog stoveNumber={stove.number} />
      </td>
      <td className="cell-detail cell-actions">
        <DeleteStoveDialog stove={stove} />
      </td>
      <td className="cell-toggle">
        <button
          type="button"
          className="card-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={`Details van kachel ${stove.number} ${expanded ? "verbergen" : "tonen"}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
