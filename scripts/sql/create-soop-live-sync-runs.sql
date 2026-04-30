-- SOOP live sync run log and retention helper.
-- Apply this in Supabase SQL Editor before enabling the cron job.

create table if not exists public.soop_live_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'error')),
  source text,
  players_total integer not null default 0,
  live_count integer not null default 0,
  offline_count integer not null default 0,
  changed_count integer not null default 0,
  unresolved_count integer not null default 0,
  page_limit integer,
  pages_scanned integer,
  error_message text,
  details jsonb not null default '{}'::jsonb
);

alter table public.soop_live_sync_runs enable row level security;

revoke all on table public.soop_live_sync_runs from public;
revoke all on table public.soop_live_sync_runs from anon;
revoke all on table public.soop_live_sync_runs from authenticated;
grant all on table public.soop_live_sync_runs to service_role;

create index if not exists soop_live_sync_runs_started_at_idx
  on public.soop_live_sync_runs (started_at desc);

create index if not exists soop_live_sync_runs_status_idx
  on public.soop_live_sync_runs (status);

delete from public.soop_live_sync_runs
where started_at < now() - interval '3 days';

delete from public.soop_live_sync_runs
where id in (
  select id
  from (
    select
      id,
      row_number() over (order by started_at desc) as run_rank
    from public.soop_live_sync_runs
  ) ranked
  where ranked.run_rank > 300
);

-- Cron setup example:
-- 1. Store project URL, anon key, and SOOP sync secret in Supabase Vault.
-- 2. Enable pg_net and pg_cron if they are not already enabled.
-- 3. Schedule the Edge Function. Keep secrets in Vault, not in this file.
--
-- select cron.schedule(
--   'soop-live-sync-every-10-minutes',
--   '*/10 * * * *',
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/soop-live-sync',
--     headers := jsonb_build_object(
--       'content-type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
--       'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'soop_sync_secret')
--     ),
--     body := jsonb_build_object('source', 'supabase-cron')
--   ) as request_id;
--   $$
-- );
