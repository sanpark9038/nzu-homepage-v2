create table if not exists public.roster_admin_corrections (
  entity_id text primary key,
  name text null,
  wr_id bigint null,
  team_code text null,
  team_name text null,
  tier text null,
  race text null,
  manual_lock boolean not null default false,
  manual_mode text null check (manual_mode in ('temporary', 'fixed')),
  note text null,
  excluded boolean not null default false,
  exclusion_reason text null,
  resume_requested_at timestamptz null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists roster_admin_corrections_wr_id_idx
  on public.roster_admin_corrections (wr_id);

create index if not exists roster_admin_corrections_updated_at_idx
  on public.roster_admin_corrections (updated_at desc);
