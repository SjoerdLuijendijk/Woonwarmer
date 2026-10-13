# Supplier catalogue import (HAVÉ Verwarming)

Instellingen → Catalogus importeren reads the product export (CSV) of HAVÉ Verwarming and stores
the wanted products as new, made-to-order stoves ("Op bestelling"). They then reach the web shop
like any other stove (`docs/woocommerce-sync.md`). Migration: `20261013170000_add_stove_shop_name_and_supplier.sql`.

## The export

A Magento catalogue export: comma-separated, quoted fields with line breaks, one row per product
plus extra rows per store view (those have no name and are skipped). HAVÉ calls it a one-off export:
prices and products are not updated by themselves. Import a newer export to bring them up to date.
Prices are HAVÉ's consumer prices including VAT ("Adviesprijs incl. BTW" on haveverwarming.nl).

## Selection

Only rows with a name, `fuel_category` "Hout" or "Bio-ethanol", `product_online` = 1 (enabled) and a
`product_label` other than "Uitlopend". The rules live in `lib/have-catalog.ts`; the server applies
them again, so the browser cannot import other rows. On 2026-10-13 this selected 426 of 1,234 products.

## How it runs

- The browser reads the file (`lib/csv.ts`), keeps the wanted rows and only the columns in
  `HAVE_COLUMNS`, and sends them one product per Server Action call, one after the other
  (`app/CatalogImport.tsx`, `app/catalog-actions.ts`). The page must stay open; stopping and starting
  again is safe.
- The server validates every value (`parseHaveProduct`) and stores the stove with the team member's
  client (`lib/catalog-import.ts`), so RLS and the column grants apply.
- The stove is matched on `supplier` + `supplier_sku` (HAVÉ's `sku`, sometimes several codes joined
  with `|`). A new product is inserted as condition new, made to order, with "Webshop" ticked when
  the import's checkbox is on. A known product gets its name, price, details and description
  updated; its photos, web shop choice and supply are left alone.
- Photos: the main photo and the gallery, without what HAVÉ hides on its product page (line
  drawings) and YouTube stills, at most 5. They are only downloaded from `HAVE_MEDIA_URL` with paths
  of a fixed form, checked to be images by sharp, and stored as JPEG (max. 1600 px) like the app's
  own photos. A known product only gets photos when it has none.
- Afterwards the web shop product is synced; the call waits for it, so the shop gets one product
  at a time. Failures and warnings are listed on the page.

## Field mapping (export → stove)

| Export | Stove | Notes |
| --- | --- | --- |
| `name` | `shop_name` | The web shop name. |
| `brand` | `brand` | |
| `price` | `price_cents` | Incl. VAT. Expired special prices are ignored. |
| `fuel_category` + `fire_type` | `stove_type` | Vrijstaand hout → Houtkachel (`wood`); otherwise e.g. "Inbouw houthaard", "Hangende bio-ethanol haard". |
| `size_height`, `size_width`, `size_depth` | dimensions | cm, rounded. |
| `top_connection`, `back_connection` | `flue_outlet` | "ja" counts as yes. |
| `rookgas` | `flue_diameter_mm` | The first size ("130/200 millimeter" → 130). |
| `back_flue_hight` | `flue_center_height_cm` | |
| `output_min`, `output_max` | `min_power_kw`, `max_power_kw` | `power_kw` stays empty: the export has no nominal power. |
| `weight`, `fire_efficiency`, `energy_label`, `material`, `external_air_supply`, `thermostaat` | matching fields | Values that are not plain numbers or Ja/Nee are left empty. |
| `dealer_product_description`, else `description` | `description` | HTML turned into plain text; links keep only their text, as they point into HAVÉ's site. Paragraphs about HAVÉ's "Experience Center" or "kenniscentrum" are dropped with a short heading above them (5 products in the 2026-10-13 export). |

## Descriptions and ads

The web shop description is the Marktplaats ad when a stove has one, otherwise its description.
Catalogue products start without an ad, and editing them does not generate one in the background
(`refreshStoredAd`), so the shop shows HAVÉ's text. Opening "Advertentie" for such a stove generates
an ad, which from then on replaces HAVÉ's text in the shop.

## Known limitations

- Products HAVÉ drops or marks "Uitlopend" later stay in the app; remove them by hand.
- A few texts still refer to HAVÉ's own options ("zie extra's"); check new products now and then.
