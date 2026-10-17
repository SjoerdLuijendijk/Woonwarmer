# 2026-10-17 08:50 – macbook-air

Branch: `feature/article-imports-in-admin`

## Done
- Article dialog shows the article photo (160 px) above the fields; it follows the web address
  field and hides when the address does not load.
- Every modal dialog closes on a click on its backdrop (`useBackdropClose`, wired in
  `DialogProvider`): it fires the dialog's cancel event, so it behaves exactly like Escape.
- New home page (`/`): quick actions (Kachel toevoegen, Nieuwe offerte, Nieuwe factuur) and tiles for
  today (appointments, to deliver, negotiations), the stock per kind and the invoices (still to be
  received, concepts). `invoiceOverview` (lib/invoice-overview.ts) is shared with the invoice list.
- Navigation split into real routes under `app/(app)/` with a shared layout: header groups Home,
  Voorraad, Verkoop and Beheer (`lib/navigation.ts`), the pages of the current group in a bar below
  the header, "Kachel toevoegen" as a header button, and an account menu with only sign-out.
  `AdminPanel`, `lib/admin-sections.ts` and the single `app/page.tsx` are gone. Old `/?tab=` links
  redirect from the home page (`legacyRedirect`).
- Server Actions now call `revalidatePath("/", "layout")` so every page and the header counts refresh.
- `requireTeamMember` is cached per request; pages use `memberClient()` and render nothing for
  non-members (the layout shows the no-access notice).
- The CSV and image imports are no longer on Aanbod → Losse artikelen, only under Beheer → Artikelen.
- Checked: `tsc`, production build (19 routes), static HTML copy of header and home in headless
  Chrome at desktop and 390 px. Not checked in the real app.

## Decisions
- User agreed to the four groups and the home page contents; the import change is part of this work.

## Open items
- Check on the Vercel preview: every page, old `?tab=` bookmarks, the quick actions on home,
  header counts after saving, Safari and a phone.
- Backdrop click discards unsaved edits in invoice and quote dialogs, like Escape already did; a
  "discard changes?" question is possible if wanted.
- Home loads all invoices to compute the open amount; fine for now, a database sum later if slow.
- Earlier open items from the 16 Oct log still apply.
