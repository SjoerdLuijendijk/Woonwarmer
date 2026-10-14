# WooCommerce sync

Status: the app is the only source of the WooCommerce shop (woonwarmer.nl). It pushes every stove to
the shop and never reads stove data back. Products that no stove in the app owns should not be
online (the one-off reset below took them offline once). Do not add or edit stove products in WordPress:
the next sync overwrites them.

## Configuration

Server-only Vercel environment variables (never `NEXT_PUBLIC_*`):

| Variable | Value |
| --- | --- |
| `WOOCOMMERCE_URL` | The shop's address, e.g. `https://woonwarmer.nl` (HTTPS only). |
| `WOOCOMMERCE_CONSUMER_KEY` | REST API consumer key (`ck_...`). |
| `WOOCOMMERCE_CONSUMER_SECRET` | REST API consumer secret (`cs_...`). |

Create the key in WordPress → WooCommerce → Settings → Advanced → REST API with permission
"Read/Write", linked to a dedicated shop-manager user rather than an administrator where possible.
Without these variables the sync is off; a listed stove then shows "De webshopkoppeling is nog niet
ingesteld." in the inventory.

All environments share one database, so any environment with the variables writes to the live
shop with the same data. Set them for Production and Preview (staging); leave them out of
Development unless testing the sync on purpose.

## How it works

- Code: `lib/woocommerce/` (`client.ts` HTTP and errors, `taxonomy.ts` attributes, terms and
  categories, `product.ts` the product payload, `sync.ts` the sync of one stove).
- Every server action that changes a stove (add, edit, stock, "Webshop" checkbox, photos) schedules
  `syncStoveToShop` with `after()`, so saving never waits for the shop. Adding or editing a stove
  (and making it to order) first regenerates the Marktplaats ad and only then syncs, so the product
  reaches the shop with its ad text in one go; if the ad cannot be made, it syncs with the previous
  text. It runs with the signed-in team member's Supabase client, so RLS applies as usual.
- The outcome is stored on the stove: `shop_product_id`, `shop_synced_at` and `shop_sync_error`
  (migration `20260930150000_add_shop_sync_status.sql`). A failure shows "⚠ Opnieuw" next to the
  Webshop checkbox; clicking it runs the sync again right away (`retryShopSync`).
- A stove that was never listed and has no shop product is skipped without calling the shop.
- Only the product's status, key, stock and error code are logged, never request or response bodies.

## Matching

The stove number is the product SKU. The product is found by the stored
`shop_product_id`, else by SKU; otherwise it is created. Products the app creates or updates carry
the meta field `woonwarmer_stove_number`. A product found by a five-digit SKU alone is only used when
it carries that field with the same number; otherwise it belongs to another shop product and the sync
(or deletion) stops with "Nummer … is in de webshop al in gebruik door een ander product." Six-digit
SKUs were only ever created by the app and are accepted without it. If two syncs race to create it,
WooCommerce rejects the duplicate SKU and the second sync updates the first one's product.
A product in the WordPress trash counts as deleted: it is not updated (which would restore it), and
ticking "Webshop" again creates a new product. WooCommerce does not count trashed products when
checking SKUs; should a shop reject the SKU anyway, the sync reports `product_invalid_sku` until the
trashed product is deleted permanently.

## History: imported shop products

Until 2026-10-13 the app could import the shop's products as stoves (keeping their five-digit SKU as
stove number), link them one by one, and fetch shop changes back ("Alles uit webshop ophalen"). All
of that was removed when the app became the only source. Imported stoves keep their
`shop_product_id`; `shop_sync_enabled` (migration `20260930190000_add_shop_sync_enabled.sql`) is no
longer read and can be dropped in a later migration once no deployed code selects it.

## One-off reset (2026-10-13)

After the ad prompt changed, a temporary Admin → Webshop page regenerated every ad, synced every
stove, and set published shop products that no stove owned to draft. It was run once and removed;
see the git history of `lib/woocommerce/shop-reset.ts` if something similar is needed again.

## Field mapping (app → WooCommerce)

Every sync replaces the product's name, price, description, categories, attributes, images and
stock with the app's data. Edits made in WordPress are overwritten.

| App | WooCommerce product | Notes |
| --- | --- | --- |
| `number` | `sku` | Unique key for matching. |
| `shop_name`, else `brand` + `stove_type` | `name` | The optional "Productnaam" (filled for catalogue products, e.g. "Dovre Sense 303"); otherwise e.g. "Hwam Houtkachel", or only the brand without a type. `model` and `product_name` (former shop titles of imported stoves) are no longer used. |
| `marketplace_ad`, else `description` | `description` | Catalogue products start without an ad, so the supplier's text is used until someone opens their ad (see `docs/supplier-catalog.md`). The stove's Marktplaats ad text when it has one, so the shop's GoedGeplaatst connector forwards it to Marktplaats; otherwise the optional free text. Plain text with line breaks. The product is synced again when the ad is regenerated or edited by hand in the ad dialog. |
| `price_cents` | `regular_price` | Incl. VAT, as a decimal string ("1250.00"). Assumes the shop enters prices incl. VAT. |
| `condition` + `stove_type` | `categories` | New: "Nieuwe kachels". Gereviseerd: "Gereviseerde kachels" plus "Houtkachels" or "Speksteenkachels". Matched by slug; a missing category is skipped. |
| `brand` | global attribute "Merk" (`pa_merk`) | Existing terms are matched ignoring case and spaces; a new brand is added as a term. |
| `condition` | global attribute "Staat kachel" (`pa_staat`) | Nieuw / Gereviseerd. |
| `stove_type` | global attribute "Type kachel" (`pa_type-kachel`) | Free text with suggestions. Known types are stored as a key (`wood`, `soapstone`, `pot`, `wood_central_heating`) and sent as their label; any other type is sent as typed and added as a new term (migration `20260930250000_free_stove_type.sql`). |
| `flue_outlet` | global attribute "Aansluiting" (`pa_aansluiting`) | Bovenaansluiting, Achteraansluiting, or both. |
| `power_kw` | global attribute "Vermogen" (`pa_vermogen`) | Matches existing terms such as "8kW" or "6,5 kw"; otherwise adds e.g. "7,5 kW". |
| dimensions, `weight_kg`, `flue_diameter_mm`, `flue_center_height_cm`, yes/no fields, min/max power, efficiency, energy label, warranty, material | product attributes | Labels as in the app's Marktplaats ad details (`lib/stove-specs.ts`), e.g. "Harthoogte achter: 94 cm". Unknown values are left out. WooCommerce's own `dimensions` and `weight` are not used, because their units depend on shop settings. |
| photos | `images` | Sent as short-lived signed URLs that WordPress downloads once. Each image is named `kachel-<number>-foto-<photo id>`, so later syncs reuse it instead of uploading it again. |
| `stock_quantity` | `manage_stock: true`, `stock_quantity` | |
| `made_to_order` | `manage_stock: true`, `stock_quantity: 1`, `backorders: "notify"` | Always orderable. One unit in stock because GoedGeplaatst only forwards products with stock to Marktplaats; a shop order turns it into a backorder until the nightly restock below. |

## Nightly restock of made-to-order stoves

A sold made-to-order stove drops to stock 0 ("on backorder") and GoedGeplaatst stops forwarding it to
Marktplaats. Every night at 04:00 UTC (`vercel.json`, Production only) Vercel Cron calls
`/api/cron/restock-shop`, which asks WooCommerce for published products on backorder that carry the
app marker and sets only their stock fields back (`manage_stock`, `stock_quantity: 1`, `backorders`)
through `products/batch`, 25 at a time. Only made-to-order products allow backorders, and stoves
unticked in the app are drafts, so stoves the shop really holds and unlisted stoves are never touched.
The app database is not used. Admin → Catalogus importeren → "Webshop bijwerken" runs the same thing
right away.

The route needs `CRON_SECRET` in Vercel (Production); without it every call is refused. The proxy
skips `/api/cron/` so the route is not redirected to the login page.

## State rules

| App state | WooCommerce |
| --- | --- |
| "Webshop" ticked | Product published with the app's stock. |
| "Webshop" unticked | Product set to draft (never deleted, so order history stays intact). |
| Sold out | The database unticks "Webshop", so the product becomes a draft with stock 0. |

## Shop orders lower the app stock

WooCommerce lowers a product's stock when an order is placed and restores it on a cancellation or
refund. Two WooCommerce webhooks (WordPress → WooCommerce → Settings → Advanced → Webhooks), topics
"Order created" and "Order updated", status Active, API version v3, delivery URL
`https://bouwstream.nl/api/webhooks/woocommerce`, with the secret from `WOOCOMMERCE_WEBHOOK_SECRET`,
call `app/api/webhooks/woocommerce/route.ts`. It checks the signature, reads the current shop stock of
every stove in the order and copies it to the app (`lib/woocommerce/order-stock.ts`); repeated
deliveries are harmless. Made-to-order stoves are skipped. At stock 0 the database marks the stove
sold and unlists it, and the following sync takes the shop product offline (draft), as when a stove is
sold in the app. A cancelled order restores the stock but does not list the stove again; tick it.

The webhook has no signed-in user, so it uses the Supabase secret key (`SUPABASE_SECRET_KEY`, Production
only, `lib/supabase/admin.ts`). Nothing else may use that client. Errors are logged and answered with
200, because WooCommerce does not retry and disables a webhook after repeated failures.

## Known limitations

- Two syncs for the same stove can overlap (for example two quick edits); the last one to finish
  wins, which may briefly be the older data until the next change.
- Background syncs finish after the page has refreshed; a failure shows up on the next page load.
