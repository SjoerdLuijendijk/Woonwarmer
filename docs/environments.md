# Environments and branch workflow

## Environments

| Environment | Git branch | URL | Vercel environment |
| --- | --- | --- | --- |
| Production | `main` | https://bouwstream.nl (`www` redirects to it) | Production |
| Staging | `staging` | https://staging.bouwstream.nl | Preview |
| Feature previews | `feature/*`, `fix/*` | Generated `*.vercel.app` preview URL | Preview |
| Local | any | http://localhost:3000 | Development |

Functions run in Vercel's `dub1` (Dublin) region, set in `vercel.json`, next to the Supabase
database in `eu-west-1` (Ireland). Every page makes several sequential Supabase calls, so keep
both in the same region; update `regions` when the database moves.

All environments currently share **one Supabase project**. Consequences:

- Data changed on staging or in a preview (stoves, photos, sold status, invoices) is changed in production too.
- Invoices use the real invoice number sequence; do not create test invoices on staging.
- A migration applies to production the moment it is run. Every migration must work with both the
  old and the new code (for example: add a nullable or defaulted column first; remove or rename only
  after the code that used it is live).

The Supabase variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) must be enabled for the
Production, Preview and Development environments in Vercel.

Vercel Deployment Protection is set to Standard Protection (`all_except_custom_domains`): generated
preview URLs require a Vercel login with access to the project. Whether `staging.bouwstream.nl`
is protected as well must be checked by opening it in a private browser window; either way the
app's own login still applies.

## Branch workflow

`main` is always what runs in production. Nobody commits directly to `main` or `staging`.

1. Start new work from `staging`:
   `git switch staging && git pull && git switch -c feature/<short-name>`
2. Commit and push the feature branch. Vercel builds a preview for it.
3. If the change needs a migration, apply it to the Supabase project first (it must be backward
   compatible, see above).
4. Merge the feature branch into `staging` and push. Test on https://staging.bouwstream.nl.
5. Release: fast-forward `main` to `staging` and push. Vercel deploys production.
   `git switch main && git pull && git merge --ff-only staging && git push`
6. Delete the merged feature branch locally and on GitHub.

Urgent production fix: branch `fix/<short-name>` from `main`, merge it into `main` after review,
then merge `main` back into `staging` so the fix is not lost.

## Moving to another domain or database

- Domain: add the new domain (and staging subdomain, linked to the `staging` branch) in Vercel →
  Settings → Domains, set the DNS records Vercel shows at the new provider, and update the Supabase
  Auth Site URL.
- Database: create the new Supabase project, apply all files in `supabase/migrations` in order,
  migrate the data and storage objects, recreate the team users and `team_members` rows, then
  replace the Supabase variables in Vercel and redeploy.
- A separate staging database can be added at that point by giving the Preview and Development
  environments their own Supabase variables; no code changes are needed.
