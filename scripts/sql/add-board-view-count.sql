alter table public.board_posts add column if not exists view_count integer not null default 0;

create or replace function public.increment_board_post_view(post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.board_posts
  set view_count = view_count + 1
  where id = post_id and published = true;
$$;

revoke all on function public.increment_board_post_view(uuid) from public, anon, authenticated;
