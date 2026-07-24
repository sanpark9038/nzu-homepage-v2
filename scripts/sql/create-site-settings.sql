-- Site-wide key/value settings (e.g. hero_title for the homepage headline).

create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.site_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'site_settings'
      and policyname = 'site_settings_public_read'
  ) then
    create policy site_settings_public_read
      on public.site_settings
      for select
      using (true);
  end if;
end
$$;
