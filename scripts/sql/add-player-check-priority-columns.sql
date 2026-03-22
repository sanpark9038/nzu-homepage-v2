alter table public.players
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_match_at timestamptz,
  add column if not exists last_changed_at timestamptz,
  add column if not exists check_priority text,
  add column if not exists check_interval_days integer;

alter table public.players_staging
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_match_at timestamptz,
  add column if not exists last_changed_at timestamptz,
  add column if not exists check_priority text,
  add column if not exists check_interval_days integer;
