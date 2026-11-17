# 2026-11-17 07:30 – windows-pc

Branch: `feature/delete-sent-invoices`

## Done
- Sent invoices of the app can be deleted, not only concepts: "Verwijderen" in the invoice dialog,
  after a confirmation. Lines and payments go with it. New database function `delete_invoice()`;
  the action `deleteInvoice` replaces `deleteDraftInvoice`.
- When the invoice took units from the stock, the confirmation offers to put them back (the web
  shop is synced afterwards). The stove's listings (shop, Marktplaats, 2dehands) are not ticked again.
- Checked: `tsc`, production build, and `delete_invoice()` on the real database inside a transaction
  that was rolled back: refused without login, last number freed, older number leaves the counter,
  draft deleted, payments gone, stock put back, web shop invoice refused. Counter and invoices were
  unchanged afterwards. The button and dialogs were not clicked through in the app.
- Merged into `staging` and pushed. Not released to production.

## Decisions
- User asked to be able to delete invoices "also when confirmed". Chosen by the agent and accepted
  by the user: deleting the invoice with the last number frees the number (no gap); deleting an
  older one leaves a gap. Web shop invoices stay undeletable (the import would bring them back).

## Open items
- User to click through the delete flow on staging (only on an invoice that may really go, staging
  shares the production database), then release to production.

## Manual steps and migrations
- `20261117100000_delete_sent_invoices.sql` applied to Supabase on 2026-11-17 with
  `supabase db query --remote` (not recorded in `supabase_migrations.schema_migrations`, like the
  other recent migrations).
