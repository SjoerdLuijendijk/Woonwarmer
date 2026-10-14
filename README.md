# Woonwarmer stove inventory

Web app for registering stoves: take photos, enter the brand and details, and the app assigns the next
stove number in the web shop's five-digit numbering (26119, 26120, ...; migration
`20260930233000_continue_shop_stove_numbers.sql`). Stoves registered before that keep their six-digit
number (100001, ...). The inventory screen lists all stoves with photos, a search bar
and a one-click "sold" status.

Built with Next.js (App Router) and Supabase (Auth, Postgres, Storage).

## Local development

1. `npm install`
2. Link the existing Vercel project (`vercel link`) and pull the Development variables:
   `vercel env pull .env.local --environment=development`. The required names are in `.env.example`.
3. `npm run dev` and open http://localhost:3000

## Environments

Production runs on https://bouwstream.nl (branch `main`), staging on https://staging.bouwstream.nl
(branch `staging`). See `docs/environments.md` for the branch workflow and the shared database.
Work sessions from all computers are recorded in `docs/log/` (see `docs/log/README.md`).

## Supabase setup

1. Apply the migrations in `supabase/migrations` to the project.
2. Auth → Providers → Email: keep e-mail/password enabled, disable "Allow new users to sign up"
   and set a minimum password length of at least 12 characters.

## Access control

Users sign in with e-mail and password. There is no self sign-up and no password reset in the
app yet. Adding a team member takes two steps:

1. Auth → Users → "Add user" → "Create new user" with their e-mail address and a password,
   with "Auto Confirm User" enabled.
2. In the SQL editor: `insert into public.team_members (email) values ('name@example.com');`
   (lowercase e-mail).

Row Level Security on `stoves`, `stove_photos` and the private `stove-photos` storage bucket
allows access only to signed-in users whose e-mail is in `team_members`. After creation the stove
number stays fixed; team members can edit the other details. Photos are served through
short-lived signed URLs.

## Product details

Besides the required details (brand, condition, dimensions, flue outlet and diameter, price;
dimensions and flue details are optional for made-to-order stoves) a stove has an optional
product name ("Productnaam", the web shop name) and optional product details that the web shop shows: stove type, power
(kW), weight, rear flue centre height, external air supply, new firebox, thermostat, and under
"Meer productgegevens" minimum/maximum power, efficiency, energy label, warranty, material and a
description. The flue outlet can be top, rear or both.
"Type kachel" is free text with suggestions (Houtkachel, Speksteenkachel, ...); a known type is
stored as a key, anything else as typed. The web shop name is the product name when filled in,
otherwise the brand plus the stove type ("Hwam Houtkachel"), or only the brand when no type is chosen. The model is no longer entered (migration `20260930240000_optional_stove_model.sql`).

## Stock

The inventory has three tabs: used, new and made to order ("Op bestelling"). A used stove is a
single unit. A new stove model from stock has one stove number with a stock quantity (set when
adding it), corrected with "−" / "+" in the "Voorraad" column. Taking its last unit (by "−" or a sale) asks
whether to archive it or keep it available made to order. A made-to-order stove is a new
model sold without stock and ordered from the supplier once sold: it keeps no stock and never
sells out. The database keeps `sold_at` and `stock_quantity` consistent: a stove
is sold exactly when its stock is 0. Stock changes go through `adjust_stove_stock()`, one unit at a
time, so concurrent sales cannot overwrite each other.

## Sales notes

A note records a negotiation or sale of a stove: buyer, pickup or delivery with date and a time per
quarter of an hour, sale
price, payment (open, deposit or paid; cash, pin or bank) and further agreements. Only the status is
required. A new stove model has no status of its own (its stock shows availability) but a green
"Verkoop plaatsen" button, which opens the dialog with the choice "1 verkocht" or "In
onderhandeling"; its notes are only listed under In onderhandeling and Af te leveren. The status
pill of a used stove opens a list (Te koop, In onderhandeling, Verkocht, Afgeleverd); choosing negotiating or sold opens the note dialog for the details, the others apply
straight away. Selling a new stove takes one unit from its stock. A sale is either delivered (or picked up) straight away, which closes the note
at once, or still to be delivered: those stoves are listed with their agreements under "Af te
leveren" in the account menu until they are marked "Afgeleverd". Selling straight away without any
details only lowers the stock. Other open notes show
as labels with their own status list; the account menu has "In onderhandeling" with the negotiations and
closed notes (stoves to deliver are only under "Af te leveren"). "Agenda" in the account menu lists
the appointments of open notes per day from today on, with open appointments whose day has passed
on top; the menu shows how many are planned for today.

The status flows from "In onderhandeling" to "Af te leveren" (sold) or "Geannuleerd", and from
"Af te leveren" to "Afgeleverd" or "Geannuleerd". The `stove_notes` trigger enforces this and takes one unit from the
stock when a note becomes sold, in the same statement. Cancelling a sale asks whether the stove is
back in stock. Done and cancelled notes contain personal data and are deleted one year after closing
when the notes list is opened (migration `20261001120000_create_stove_notes.sql`).

## Web shop

Each stove has a "Webshop" checkbox (`shop_listed`) for the WooCommerce web shop, off by default.
When a stove sells out the database unticks it, and it cannot be ticked while it is sold out.
Changes to a stove are pushed to the WooCommerce shop in the background. The app is the only source
of the shop; nothing comes back from it. Configuration and field mapping: `docs/woocommerce-sync.md`.

Marktplaats and 2dehands are linked from WooCommerce itself and are not part of the app. The
former columns `marketplace_listed` and `secondhand_listed` are no longer used.

## Deleting stoves

The bin icon in the inventory deletes a stove with its photos. Its invoices are kept: they only
record the stove number (migration `20260930230000_keep_invoices_of_deleted_stoves.sql`). The
dialog offers to move its web shop product to the WordPress trash as well; if that fails, nothing is
deleted.

## Invoices

Each stove has a "Factuur" button that opens a dialog for customer details and invoice lines
(unit prices incl. VAT, 21 %, 9 %, 0 % or "Marge" per line) with a live draft PDF preview. Used
stoves are sold under the margin scheme ("Marge": no VAT on the invoice, with the legally required
note "Bijzondere regeling – gebruikte goederen"); new and made-to-order stoves get 21 %. A stove
taken in part exchange is a line with a negative price (migration `20261013210000_margin_scheme_lines.sql`). "Factuur maken"
calls the `create_invoice()` database function, which stores the invoice and its lines in one
transaction and assigns the next number of one continuous series that carries on from the
invoices made before the app (298, 299, ...; migration `20261013200000_continuous_invoice_numbers.sql`).
The seller details from Admin → Bedrijfsgegevens, including the small print at the bottom of the
invoice ("Voettekst"), are copied onto the invoice.

An invoice for a stove can take the sold units from its stock in the same transaction: the units on
the lines that came from the stove (its stove line, or its quote line), stored as
`invoices.stock_deducted` (migration `20261014150000_invoice_lowers_stock.sql`). The dialog offers
this with a tick box, off by default when a sale placed with "Verkocht" is still to be delivered,
because that sale already took a unit. Made-to-order and sold-out stoves are not changed; at stock 0
the stove is sold, unlisted and taken offline in the web shop.

Invoices cannot be changed or deleted after creation; corrections need a credit invoice. PDFs are
generated in the browser with `pdf-lib` and can be downloaded again from the inventory or from
Facturen, which lists all invoices, including those of deleted stoves. "+ Losse factuur" on that
page makes an invoice without a stove (migration `20261001170000_allow_invoices_without_stove.sql`).

## Quotes and articles

Account menu → Offertes lists the quotes (O2026-0001, ...; own numbering per year). A quote has a
customer (only the name is required), lines, a validity date (30 days by default) and an optional
note, with a live PDF preview. Lines come from a stove on offer, an article, or are typed by hand;
"Opslaan in artikelen" adds a typed line to the article list. Quotes stay editable and have a status
(Concept, Verstuurd, Geaccepteerd, Afgewezen); an accepted quote offers "Factuur maken", which opens
a concept invoice with its customer and lines. `save_quote()` stores a quote with its lines in one
transaction.

Instellingen → Artikelen holds the parts (flue pipes, roof outlets, accessories). "CSV importeren"
reads the supplier CSV (`;`-separated; columns such as categorie, artikelnaam, diameter_mm, sku,
verkoopprijs_ex_btw, btw_pct). The SKU is the key: an article with the same SKU is updated, empty
cells keep the stored value, and rows without a SKU or with a SKU that occurs twice in the file are
skipped and reported. Article prices are excluding VAT; quote lines use prices including VAT. PDFs
show the logo top left (`lib/logo-paths.ts`, generated from `public/woonwarmer-logo.svg`).
Migration: `20261001190000_create_articles_and_quotes.sql`.

Instellingen → Catalogus importeren imports the product export (CSV) of HAVÉ Verwarming as
made-to-order stoves; see `docs/supplier-catalog.md`. Migration: `20261013170000_add_stove_shop_name_and_supplier.sql`.

"＋ Montage" in the quote and invoice dialogs adds a line "Montage (per uur)" at the hourly rate set
under Bedrijfsgegevens (excluding VAT, stored as `company_settings.hourly_rate_ex_cents`; migration
`20261001210000_add_hourly_rate.sql`); the number of hours is the line's quantity.

## Marktplaats ad text

When a stove is added or edited, the Server Action schedules an OpenAI call with Next.js `after()`
(Responses API via `fetch`) and stores the resulting Dutch Marktplaats ad in `stoves.marketplace_ad`,
so saving never waits for it. On desktop the "Advertentie" button (hidden on phones) shows the stored
text; if it is missing (older stoves, or a failed background call) it is generated on demand.
"Opnieuw" generates and stores a new version. The text can be edited and saved by hand
(`marketplace_ad_edited`); a manual text is never overwritten automatically. If the stove is edited
afterwards, `marketplace_ad_outdated` is set and the dialog asks to check the text.

There is no automatic sync with Marktplaats or 2dehands: posting and updating through their API
requires a Marktplaats Pro (business) account and a certified API partner. Ads are copied from the
app and updated by hand on both sites.

The prompt is editable under Admin → Advertentie (`ad_settings`, team members only); the
built-in default in `lib/ad-prompt.ts` is used until it is saved. Fixed guard rules (use only the
given facts, plain text) are always appended in `lib/marketplace-ad.ts`. Changing the prompt or the
company details does not regenerate existing ads.

Only stove facts and the company details are sent to OpenAI, never customer data; requests use
`store: false`. Requires `OPENAI_API_KEY` (server-only, in Vercel). `OPENAI_MODEL` is optional and
overrides the default model. Generated text can contain mistakes; check it before posting.

## Photos

Photos are resized in the browser to JPEG (max. 1600 px) before upload. The server accepts
JPEG only, max. 1.5 MB per photo and 4 MB per upload (Server Action / Vercel request limit).

The server also stores a small copy of each photo (max. 320 px, made with `sharp`) next to it as
`<stove number>/<uuid>-thumb.jpg` (`lib/photo-thumbnails.ts`). The stock table and the photo grid
show these thumbnails; the full photo loads only in the photo viewer. Photos stored before
thumbnails existed get one in the background while the stock page is open, a few per call
(`lib/thumbnail-backfill.ts`); until then the full photo is shown. Deleting a photo or a stove
removes its thumbnails too.
