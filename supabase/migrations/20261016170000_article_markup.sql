-- The markup on the purchase price that gives an article its sale price when it has none of its own
-- (Artikelen → Opslag op inkoopprijs). A single row; only team members can read and change it.
-- Backward compatible: a new table that the production code does not use yet.

create table public.article_settings (
  id boolean primary key default true check (id),
  markup_pct numeric(6, 2) not null default 40 check (markup_pct between 0 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.article_settings (id, markup_pct) values (true, 40);

alter table public.article_settings enable row level security;
revoke all on public.article_settings from anon, authenticated;
grant select, update (markup_pct, updated_at) on public.article_settings to authenticated;

create policy "article_settings select" on public.article_settings for select to authenticated
  using ((select public.is_team_member()));
create policy "article_settings update" on public.article_settings for update to authenticated
  using ((select public.is_team_member()))
  with check ((select public.is_team_member()));
