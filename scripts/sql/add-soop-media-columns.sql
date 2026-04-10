alter table if exists public.players
  add column if not exists channel_profile_image_url text,
  add column if not exists live_thumbnail_url text;

alter table if exists public.players_staging
  add column if not exists channel_profile_image_url text,
  add column if not exists live_thumbnail_url text;
