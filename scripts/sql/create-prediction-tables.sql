create extension if not exists pgcrypto;

create table if not exists public.prediction_matches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  match_type text not null default 'team'
    check (match_type in ('team', 'individual')),
  team_mode text not null default 'existing'
    check (team_mode in ('existing', 'direct')),
  team_a_code text not null,
  team_a_name text null,
  team_b_code text not null,
  team_b_name text null,
  team_a_player_ids text[] not null default '{}'::text[],
  team_b_player_ids text[] not null default '{}'::text[],
  entry_order_status text not null default 'unknown'
    check (entry_order_status in ('unknown', 'confirmed')),
  entry_matchups jsonb not null default '[]'::jsonb,
  start_at timestamptz not null,
  start_time_tbd boolean not null default false,
  close_at timestamptz not null,
  status text not null default 'open'
    check (status in ('draft', 'open', 'closed', 'archived')),
  result_team_code text null,
  result_published_at timestamptz null,
  display_order integer not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.prediction_matches
  add column if not exists team_a_player_ids text[] not null default '{}'::text[];

alter table public.prediction_matches
  add column if not exists team_b_player_ids text[] not null default '{}'::text[];

alter table public.prediction_matches
  add column if not exists match_type text not null default 'team';

alter table public.prediction_matches
  add column if not exists team_mode text not null default 'existing';

alter table public.prediction_matches
  add column if not exists team_a_name text null;

alter table public.prediction_matches
  add column if not exists team_b_name text null;

alter table public.prediction_matches
  add column if not exists entry_order_status text not null default 'unknown';

alter table public.prediction_matches
  add column if not exists entry_matchups jsonb not null default '[]'::jsonb;

alter table public.prediction_matches
  add column if not exists start_time_tbd boolean not null default false;

create table if not exists public.prediction_votes (
  id uuid primary key default gen_random_uuid(),
  voter_id text not null,
  match_id uuid not null references public.prediction_matches(id) on delete cascade,
  voter_provider text null,
  voter_provider_user_id text null,
  voter_display_name text null,
  voter_avatar_url text null,
  picked_team_code text null,
  picked_player_id text null,
  change_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (voter_id, match_id)
);

alter table public.prediction_votes
  add column if not exists voter_provider text null;

alter table public.prediction_votes
  add column if not exists voter_provider_user_id text null;

alter table public.prediction_votes
  add column if not exists voter_display_name text null;

alter table public.prediction_votes
  add column if not exists voter_avatar_url text null;

create index if not exists prediction_matches_order_idx
  on public.prediction_matches (archived_at, display_order, start_at);

create index if not exists prediction_votes_match_id_idx
  on public.prediction_votes (match_id);

alter table public.prediction_matches enable row level security;
alter table public.prediction_votes enable row level security;

create or replace function public.prediction_visible_vote_totals(match_ids uuid[] default null)
returns table (
  match_id uuid,
  picked_team_code text,
  picked_player_id text,
  vote_count bigint
)
language sql
stable
security invoker
as $$
  select
    v.match_id,
    v.picked_team_code,
    v.picked_player_id,
    count(*)::bigint as vote_count
  from public.prediction_votes v
  join public.prediction_matches m on m.id = v.match_id
  where m.archived_at is null
    and (match_ids is null or v.match_id = any(match_ids))
  group by v.match_id, v.picked_team_code, v.picked_player_id
  order by v.match_id, v.picked_team_code nulls last, v.picked_player_id nulls last;
$$;

grant execute on function public.prediction_visible_vote_totals(uuid[]) to anon, authenticated, service_role;

comment on table public.prediction_matches is
  'Tournament prediction matches managed by server-side admin APIs.';

comment on table public.prediction_votes is
  'Tournament prediction votes keyed by signed public auth session and written only through server route handlers.';
