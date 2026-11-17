# 2026-11-17 07:30 – windows-pc

Branch: `feature/delete-sent-invoices`

## Done
- Sent invoices of the app can be deleted, not only concepts: "Verwijderen" in the invoice dialog,
  after a confirmation. Lines and payments go with it. New database function `delete_invoice()`;
  the action `deleteInvoice` replaces `deleteDraftInvoice`.
- When the invoice took units from the stock, the confirmation offers to put them back (the web
  shop is synced afterwards). The stove's listings (shop, Marktplaats, 2dehands) are not ticked again.
- Checked: `tsc` and a production build. The migration has not been run anywhere, so the database
  function and the delete flow are untested against a real database.

## Decisions
- User asked to be able to delete invoices "also when confirmed". Chosen by the agent, not yet
  confirmed by the user: deleting the invoice with the last number frees the number (no gap);
  deleting an older one leaves a gap. Web shop invoices stay undeletable (the import would bring
  them back).

## Open items
- User to confirm the choices above, apply the migration, then test on staging and release.
- Not yet committed or pushed.

## Manual steps and migrations
- `20261117100000_delete_sent_invoices.sql` added, not applied to Supabase. Apply it before this
  code goes live: the new code also deletes concepts through `delete_invoice()`.
