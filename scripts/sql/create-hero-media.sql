-- Hero media table for homepage fullscreen image/video background.
-- Storage bucket to create separately in Supabase dashboard:
--   bucket name: hero-media
--   public: true

create extension if not exists pgcrypto;

create table if not exists public.hero_media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  type text not null check (type in ('image', 'video')),
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists hero_media_single_active_idx
  on public.hero_media ((is_active))
  where is_active = true;

alter table public.hero_media enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'hero_media'
      and policyname = 'hero_media_public_read'
  ) then
    create policy hero_media_public_read
      on public.hero_media
      for select
      using (true);
  end if;
end
$$;
