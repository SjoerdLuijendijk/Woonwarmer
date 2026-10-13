# WooCommerce sync

Status: the app pushes stoves to the WooCommerce shop (woonwarmer.nl). Changes made in the shop
(stock, price, attributes, status, new products) come back into the app only when a team member
uses "Alles uit webshop ophalen"; there is no automatic sync from the shop to the app.

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

## Importing the existing shop products

Rule: nothing in the shop changes without an explicit action by a team member. The import only
reads from the shop.

Admin → Webshop (`lib/woocommerce/import.ts`, `import-mapping.ts`) takes over published
products as stoves: one by its five-digit number ("Deze kachel importeren"), or all of them as the
second step of "Alles uit webshop ophalen":

- A stove keeps its five-digit shop SKU as its stove number (e.g. 26118), which is also on the
  stove itself. The database allows explicit numbers only in the five-digit range. Stoves added in
  the app get the highest five-digit number ever used plus one, so they continue the shop's
  numbering (migration `20260930233000_continue_shop_stove_numbers.sql`). A number that exists only
  in the shop and not yet in the app can still be handed out; the sync then refuses to touch that
  shop product (see Matching).
- The stove records its product (`shop_product_id`, `shop_listed`) but starts **unlinked**
  (`shop_sync_enabled = false`, migration `20260930190000_add_shop_sync_enabled.sql`): the sync
  skips it entirely. The inventory shows "Koppelen" next to its Webshop checkbox; linking
  (`linkStoveToShop`, after a confirmation) enables the sync and updates the product right away.
  Until then, selling it in the app does not take it offline in the shop.
  "Alles koppelen" in Admin → Webshop links all unlinked stoves after a confirmation, two per
  server action call (`lib/woocommerce/link.ts`). A stove whose shop update fails stays linked and
  shows "⚠ Opnieuw"; the run stops when a whole batch fails.
- Details are parsed from the shop's global and product attributes (Merk, Staat kachel, Type kachel,
  Aansluiting, Vermogen, Harthoogte achter, Rendement, Energielabel, Garantie, ...). Values that do
  not make sense are left empty. The shop name is stored in `product_name` for reference only; once
  linked, the product is renamed to brand + stove type.
- Photos are downloaded from the shop (a WordPress size of at most about 1600 px, JPEG, within the
  app's photo size limit) and stored in the app. Linking uploads them to the shop again as new
  images named `kachel-<number>-foto-<photo id>`; the old images stay in the media library.
- It runs in batches of four products per server action call; the settings page repeats the call
  until nothing is left. Existing stove numbers are skipped, so it can be run again safely.
- Fire bowls (category "Vuurschalen"), products without a five-digit SKU and out-of-stock products
  are skipped.

Once linked, the app owns the product like any other: linking replaces its attributes, categories
and images with the app's data.

## Field mapping (app → WooCommerce)

Every sync replaces the product's name, price, description, categories, attributes, images and
stock with the app's data. Edits made in WordPress are overwritten unless they were fetched into the
app first ("Alles uit webshop ophalen").

| App | WooCommerce product | Notes |
| --- | --- | --- |
| `number` | `sku` | Unique key for matching. |
| `brand` + `stove_type` | `name` | E.g. "Hwam Houtkachel"; without a type only the brand. `product_name` and `model` are no longer used. |
| `marketplace_ad`, else `description` | `description` | The stove's Marktplaats ad text when it has one, so the shop's GoedGeplaatst connector forwards it to Marktplaats; otherwise the optional free text. Plain text with line breaks. The product is synced again when the ad is regenerated or edited by hand in the ad dialog. |
| `price_cents` | `regular_price` | Incl. VAT, as a decimal string ("1250.00"). Assumes the shop enters prices incl. VAT. |
| `condition` + `stove_type` | `categories` | New: "Nieuwe kachels". Gereviseerd: "Gereviseerde kachels" plus "Houtkachels" or "Speksteenkachels". Matched by slug; a missing category is skipped. |
| `brand` | global attribute "Merk" (`pa_merk`) | Existing terms are matched ignoring case and spaces; a new brand is added as a term. |
| `condition` | global attribute "Staat kachel" (`pa_staat`) | Nieuw / Gereviseerd. |
| `stove_type` | global attribute "Type kachel" (`pa_type-kachel`) | Free text with suggestions. Known types are stored as a key (`wood`, `soapstone`, `pot`, `wood_central_heating`) and sent as their label; any other type is sent as typed and added as a new term (migration `20260930250000_free_stove_type.sql`). The import keeps an unknown shop type as text. |
| `flue_outlet` | global attribute "Aansluiting" (`pa_aansluiting`) | Bovenaansluiting, Achteraansluiting, or both. |
| `power_kw` | global attribute "Vermogen" (`pa_vermogen`) | Matches existing terms such as "8kW" or "6,5 kw"; otherwise adds e.g. "7,5 kW". |
| dimensions, `weight_kg`, `flue_diameter_mm`, `flue_center_height_cm`, yes/no fields, min/max power, efficiency, energy label, warranty, material | product attributes | Labels as in the app's Marktplaats ad details (`lib/stove-specs.ts`), e.g. "Harthoogte achter: 94 cm". Unknown values are left out. WooCommerce's own `dimensions` and `weight` are not used, because their units depend on shop settings. |
| photos | `images` | Sent as short-lived signed URLs that WordPress downloads once. Each image is named `kachel-<number>-foto-<photo id>`, so later syncs reuse it instead of uploading it again. |
| `stock_quantity` | `manage_stock: true`, `stock_quantity` | |
| `made_to_order` | `manage_stock: false`, `stock_status: "onbackorder"` | Always orderable. |

## State rules

| App state | WooCommerce |
| --- | --- |
| "Webshop" ticked | Product published with the app's stock. |
| "Webshop" unticked | Product set to draft (never deleted, so order history stays intact). |
| Sold out | The database unticks "Webshop", so the product becomes a draft with stock 0. |

## Known limitations

- Two syncs for the same stove can overlap (for example two quick edits); the last one to finish
  wins, which may briefly be the older data until the next change.
- Background syncs finish after the page has refreshed; a failure shows up on the next page load.

## Fetching everything from the shop by hand

Admin → Webshop → "Alles uit webshop ophalen" does two things after a confirmation, and only reads
from the shop:

1. Existing stoves (`lib/woocommerce/shop-refresh.ts`): every stove with a shop product gets the
   shop's stock, price, attributes and online status (not the title: the app names products after
   brand and stove type; not the description of a stove with a Marktplaats ad, because that
   description is the ad). Values the shop leaves empty keep the app's value; a stove at 0 becomes sold;
   "op bestelling" in the shop makes it made to order. It runs with the
   team member's own login and shows per stove what changed. Stoves with a pending shop error (⚠)
   are skipped, because the shop has not received their latest change yet; trashed or deleted
   products are skipped as well.
2. New products: the import below, in batches. A product counts as already in the app when a stove
   has its SKU as number or is linked to it (`shop_product_id`), so nothing is imported twice.
