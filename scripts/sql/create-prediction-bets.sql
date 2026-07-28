-- 승부예측 포인트 베팅.
-- 포인트의 진실은 user_point_ledger(apply_user_point_change) 한 곳이고, 이 테이블은
-- "누가 어느 팀에 얼마를 걸었는지"와 정산 상태만 들고 있는 장부다.
-- 멱등 키는 원장 쪽 unique (voter_id, reason, ref_id) 가 담당한다 — 베팅은 ref_id = match_id.
--
-- 실행: Supabase 대시보드 → SQL Editor 에서 이 파일 내용 실행

create table if not exists public.prediction_bets (
  id uuid primary key default gen_random_uuid(),
  voter_id text not null,                     -- "provider:providerUserId" — 예측/포인트와 동일 키
  match_id uuid not null references public.prediction_matches(id) on delete cascade,
  team_code text not null,
  stake integer not null check (stake > 0),
  status text not null default 'placed'
    check (status in ('placed', 'won', 'lost', 'refunded')),
  payout integer null,                        -- 정산 후 지급액 (원금 포함). 미정산이면 null
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (voter_id, match_id)                 -- 경기당 한 번. 스테이크 추가/변경은 MVP 범위 밖
);

create index if not exists prediction_bets_match_id_idx
  on public.prediction_bets (match_id);

-- 파리뮤추얼 배당 계산용 풀 집계. 미정산(placed) 베팅만 센다.
create or replace function public.prediction_bet_pools(match_ids uuid[] default null)
returns table (
  match_id uuid,
  team_code text,
  total_stake bigint,
  bet_count bigint
)
language sql
stable
security invoker
as $$
  select
    b.match_id,
    b.team_code,
    sum(b.stake)::bigint as total_stake,
    count(*)::bigint as bet_count
  from public.prediction_bets b
  join public.prediction_matches m on m.id = b.match_id
  where b.status = 'placed'
    and m.archived_at is null
    and (match_ids is null or b.match_id = any(match_ids))
  group by b.match_id, b.team_code
  order by b.match_id, b.team_code;
$$;

grant execute on function public.prediction_bet_pools(uuid[]) to anon, authenticated, service_role;

-- 정책 없이 RLS만 켠다 = service role(서버) 전용. 클라이언트가 남의 베팅을 읽지 못한다.
alter table public.prediction_bets enable row level security;

comment on table public.prediction_bets is
  '승부예측 포인트 베팅 — 포인트 이동은 user_point_ledger가 진실, 여기는 베팅 내역/정산 상태만';
