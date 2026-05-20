create extension if not exists pgcrypto;

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  content text not null check (char_length(content) <= 300),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  deleted_by text null
);

create index if not exists board_comments_post_visible_created_idx
  on public.board_comments (post_id, created_at)
  where deleted_at is null;

create index if not exists board_comments_author_recent_idx
  on public.board_comments (author_id, created_at desc);

alter table public.board_comments enable row level security;

grant select on table public.board_comments to anon, authenticated;
grant select, insert, update, delete on table public.board_comments to service_role;

create or replace function public.board_visible_comment_counts(post_ids uuid[])
returns table (post_id uuid, comment_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.post_id,
    count(*)::bigint as comment_count
  from public.board_comments c
  where c.deleted_at is null
    and c.post_id = any(post_ids)
  group by c.post_id
$$;

grant execute on function public.board_visible_comment_counts(uuid[]) to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'board_comments'
      and policyname = 'board_comments_public_read_visible'
  ) then
    create policy board_comments_public_read_visible
      on public.board_comments
      for select
      using (deleted_at is null);
  end if;
end
$$;

comment on table public.board_comments is
  'Public board comments MVP. Writes and soft deletes are performed through server API routes.';

notify pgrst, 'reload schema';
