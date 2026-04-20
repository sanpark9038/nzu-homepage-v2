-- Draft migration for identifier-based serving sync.
--
-- Do not apply this blindly.
-- First verify the current live Supabase schema and confirm there is no conflicting
-- unique/index contract already present on public.players or public.players_staging.
--
-- Intended goal:
-- - make the serving-sync durable key repo-visible
-- - collapse mix/non-mix entity variants onto the same serving identity bucket
-- - support a future move away from onConflict: 'name'

create or replace function public.compute_serving_identity_key(raw_eloboard_id text, raw_gender text)
returns text
language sql
immutable
as $$
  select
    case
      when coalesce(raw_eloboard_id, '') ~* '^eloboard:(male|female)(:mix)?:[0-9]+$' then
        lower(
          coalesce(nullif(raw_gender, ''), regexp_replace(raw_eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\1', 'i'))
          || ':' ||
          regexp_replace(raw_eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\3', 'i')
        )
      when coalesce(raw_eloboard_id, '') <> '' then
        'entity:' || lower(raw_eloboard_id)
      else
        null
    end
$$;

alter table if exists public.players
  add column if not exists serving_identity_key text;

update public.players
set serving_identity_key = public.compute_serving_identity_key(eloboard_id, gender)
where serving_identity_key is distinct from public.compute_serving_identity_key(eloboard_id, gender);

create unique index if not exists idx_players_serving_identity_key
  on public.players (serving_identity_key)
  where serving_identity_key is not null;

alter table if exists public.players_staging
  add column if not exists serving_identity_key text;

update public.players_staging
set serving_identity_key = public.compute_serving_identity_key(eloboard_id, gender)
where serving_identity_key is distinct from public.compute_serving_identity_key(eloboard_id, gender);

create unique index if not exists idx_players_staging_serving_identity_key
  on public.players_staging (serving_identity_key)
  where serving_identity_key is not null;

comment on function public.compute_serving_identity_key(text, text) is
  'Draft helper for serving-sync identity. Collapses mix/non-mix variants onto gender:wr_id when possible.';

comment on column public.players.serving_identity_key is
  'Draft durable serving-sync key. Verify live schema and backfill behavior before using for upsert/delete.';

comment on column public.players_staging.serving_identity_key is
  'Draft durable serving-sync key for staging. Verify live schema and backfill behavior before using for upsert/delete.';
