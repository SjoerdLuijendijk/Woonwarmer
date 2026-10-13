# 2026-10-13 16:10 – macbook-air

Branch: `feature/invoice-like-woocommerce`

## Done
- Invoices now continue the numbering used before the app: one continuous series from 298
  (no year prefix). The test invoice 2026-0001 was deleted by the user first.
- Invoice PDF follows the layout of the previous WooCommerce invoices (logo top left, seller top
  right, black table header, total between black rules, centred small print at the bottom).
- New "Voettekst" under Bedrijfsgegevens, filled with the previous invoices' margin scheme and
  warranty text; it is copied onto each invoice.
- Margin scheme lines: used stoves default to "Marge" (no VAT, with "Bijzondere regeling – gebruikte
  goederen" on the invoice), new and made-to-order stoves to 21%. Also on quotes.
- Lines can be negative, for a stove taken in part exchange ("Inruilkachel").

## Decisions
- User: used stove → margin scheme, new stove → 21% VAT. A stove without condition counts as used.
- Order number/date of the old invoices left out (the app has no orders); due date and stove number kept.
- Payment sentence below the totals removed, as on the previous invoices; Helvetica instead of Open Sans.

## Open items
- Not tested in the app; check a draft invoice preview, never create a test invoice (numbers are real).
- Amounts show as "€ -100,00" (old invoices: "-€ 100,00").

## Manual steps and migrations
- `20261013200000_continuous_invoice_numbers.sql`: applied by the user.
- `20261013210000_margin_scheme_lines.sql`: handed over; must be applied before this code is live.
