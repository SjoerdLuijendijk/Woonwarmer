# 2026-10-23 16:56 – windows-pc

Branches: `feature/plain-home`, `chore/session-log-goedgeplaatst`

## Done
- Home page (`/`) is now four large buttons only: Kachel toevoegen, Nieuwe offerte, Nieuwe factuur
  and Voorraad bekijken. All tiles with figures (appointments, stock counts, amount to be received,
  concepts) are gone, so a customer looking at the screen sees no internal data. `HomeTile` removed.
- Checked: `tsc`, production build, static HTML copy of the home page in headless Chrome at desktop
  and 390 px. Not checked in the real app.

- Released the plain home page to staging and production (the user pushed; the auto mode classifier
  blocked the push from the session). GitHub moved the repository to
  `SjoerdLuijendijk/Woonwarmer`; the remote URL on this PC now points there.
- Investigated why the Marktplaats ad of Apollo Speksteenkachel (SKU 26125, WooCommerce draft, stock 0)
  stayed online. The app behaves as designed: a sold or unticked stove becomes a draft with stock 0.
  The GoedGeplaatst connector feed only holds published products with stock (on 14 Oct the 426
  made-to-order products on backorder were left out), so the product drops out of the feed. The ad no
  longer showed in the GoedGeplaatst portal (search "apollo") while still online on Marktplaats.
- GoedGeplaatst REST API (docs.goedgeplaatst.nl/api/rest/v1/site/): `DELETE /publish/` queues removal
  from a portal (marktplaats, tweedehands); `DELETE /ads/` and status `archive` do not unpublish from
  any portal; `POST /publish/` on a published ad updates it (no duplicate); `/status/` shows per portal
  whether the ad is online; ads carry `source` (e.g. woocommerce) and `externalAdId`. The docs do not
  say what the feed import does with products that leave the feed.

## Decisions
- User found the home page ugly and too revealing for customers; chose a plain home with buttons
  only over opening the app on the stock list.

- Deleting the product or the stove is no fix: it also drops out of the feed and loses order history.
- User: wait and see whether Marktplaats follows by itself now that the ad is gone from GoedGeplaatst.

## Open items
- Check whether the Apollo 26125 ad has left Marktplaats; rule out that it simply expired (~31 days).
  If it is still online, end it in Mijn Marktplaats. Repeat the check with the next sold stove.
- If Marktplaats does not follow: ask GoedGeplaatst (api-support@goedgeplaatst.nl) whether the
  WooCommerce import unpublishes ads of products that leave the feed, whether the plugin can send
  stock 0 / draft products, and how a returning product is matched to its old ad. Fallback: the app
  calls the GoedGeplaatst API itself (unpublish on sold/unticked, publish on relist); needs an API key
  and user ID, and possibly partner status.
- Untested: whether a published product with stock 0 ("uitverkocht") stays in the feed and makes
  GoedGeplaatst take the ad offline.
- The header still shows counts next to Agenda, Af te leveren and In onderhandeling; hide them too if
  customers should not see those either.
- Earlier open items from the 17 Oct log still apply.
