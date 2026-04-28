-- Follow-up migration for PostgREST/Supabase upsert compatibility.
--
-- The first serving identity migration created partial unique indexes:
--   where serving_identity_key is not null
--
-- PostgreSQL can enforce those, but PostgREST upsert with
-- onConflict=serving_identity_key requires a matching non-partial unique
-- index/constraint. PostgreSQL unique indexes already allow multiple NULLs,
-- so a non-partial unique index is compatible with nullable keys.

drop index if exists public.idx_players_serving_identity_key;
drop index if exists public.idx_players_staging_serving_identity_key;

create unique index idx_players_serving_identity_key
  on public.players (serving_identity_key);

create unique index idx_players_staging_serving_identity_key
  on public.players_staging (serving_identity_key);
