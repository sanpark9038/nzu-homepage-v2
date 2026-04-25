create extension if not exists pgcrypto;

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  author_name text not null,
  author_provider text null,
  author_provider_user_id text null,
  category varchar null default null,
  image_url text null,
  video_url text null,
  download_url text null,
  published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.board_posts add column if not exists image_url text null;
alter table public.board_posts add column if not exists video_url text null;
alter table public.board_posts add column if not exists download_url text null;
alter table public.board_posts add column if not exists category varchar null default null;

create index if not exists board_posts_created_at_idx
  on public.board_posts (created_at desc);

alter table public.board_posts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'board_posts'
      and policyname = 'board_posts_public_read'
  ) then
    create policy board_posts_public_read
      on public.board_posts
      for select
      using (published = true);
  end if;
end
$$;

comment on table public.board_posts is
  'Public board MVP posts. author_provider fields are reserved for future provider-agnostic login wiring.';
