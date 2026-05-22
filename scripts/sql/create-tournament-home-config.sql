create table if not exists public.tournament_home_config (
  id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tournament_home_config enable row level security;

grant select, insert, update on table public.tournament_home_config to service_role;

comment on table public.tournament_home_config is
  'Persistent public tournament team composition managed from the admin tournament page.';

notify pgrst, 'reload schema';
