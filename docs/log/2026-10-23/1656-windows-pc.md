# 2026-10-23 16:56 – windows-pc

Branch: `feature/plain-home`

## Done
- Home page (`/`) is now four large buttons only: Kachel toevoegen, Nieuwe offerte, Nieuwe factuur
  and Voorraad bekijken. All tiles with figures (appointments, stock counts, amount to be received,
  concepts) are gone, so a customer looking at the screen sees no internal data. `HomeTile` removed.
- Checked: `tsc`, production build, static HTML copy of the home page in headless Chrome at desktop
  and 390 px. Not checked in the real app.

## Decisions
- User found the home page ugly and too revealing for customers; chose a plain home with buttons
  only over opening the app on the stock list.

## Open items
- The header still shows counts next to Agenda, Af te leveren and In onderhandeling; hide them too if
  customers should not see those either.
- Earlier open items from the 17 Oct log still apply.
