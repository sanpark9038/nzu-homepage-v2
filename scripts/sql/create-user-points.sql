-- 사이트 포인트: 잔액 스냅샷(user_point_balances) + 원장(user_point_ledger).
-- 원장이 진실이고 잔액은 파생 캐시다. 모든 가감은 apply_user_point_change RPC 한 곳으로만 들어온다.
-- 멱등성은 unique (voter_id, reason, ref_id)가 담당한다:
--   출석 = ref_id 는 KST 날짜키(YYYY-MM-DD), 가입 보너스 = 'signup', 베팅 = match_id.
--
-- 실행: Supabase 대시보드 → SQL Editor 에서 이 파일 내용 실행

create table if not exists public.user_point_balances (
  voter_id text primary key,                  -- "provider:providerUserId" (예: soop:xxx) — 예측과 동일 키
  display_name text not null default '',      -- 표시용 캐시. 바뀔 수 있으므로 키로 쓰지 않는다
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_point_ledger (
  id uuid primary key default gen_random_uuid(),
  voter_id text not null,
  amount integer not null,                    -- 지급은 양수, 차감은 음수
  reason text not null check (reason in ('signup_bonus', 'attendance', 'bet_place', 'bet_refund', 'bet_payout')),
  ref_id text not null,                       -- 사유별 멱등 키
  created_at timestamptz not null default timezone('utc', now()),
  unique (voter_id, reason, ref_id)
);

create index if not exists user_point_ledger_voter_id_created_at_idx
  on public.user_point_ledger (voter_id, created_at desc);

create index if not exists user_point_balances_balance_idx
  on public.user_point_balances (balance desc);

-- 원장 기록 + 잔액 반영을 한 트랜잭션으로. 새 잔액을 돌려준다.
--   중복(이미 처리된 요청) → 'user_point_duplicate' 예외 (호출부가 "이미 처리됨"으로 구분)
--   잔액 부족 → balance >= 0 check 위반이 그대로 전파 (베팅 단계에서 사용)
create or replace function public.apply_user_point_change(
  p_voter_id text,
  p_display_name text,
  p_amount integer,
  p_reason text,
  p_ref_id text
) returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  begin
    insert into public.user_point_ledger (voter_id, amount, reason, ref_id)
    values (p_voter_id, p_amount, p_reason, p_ref_id);
  exception when unique_violation then
    raise exception 'user_point_duplicate';
  end;

  insert into public.user_point_balances (voter_id, display_name, balance, updated_at)
  values (p_voter_id, coalesce(p_display_name, ''), p_amount, timezone('utc', now()))
  on conflict (voter_id) do update
    set balance = user_point_balances.balance + excluded.balance,
        display_name = case
          when excluded.display_name <> '' then excluded.display_name
          else user_point_balances.display_name
        end,
        updated_at = timezone('utc', now())
  returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.apply_user_point_change(text, text, integer, text, text) from public;
grant execute on function public.apply_user_point_change(text, text, integer, text, text) to service_role;

-- 정책 없이 RLS만 켠다 = service role(서버) 전용. 클라이언트 직접 읽기/쓰기 차단.
alter table public.user_point_balances enable row level security;
alter table public.user_point_ledger enable row level security;

comment on table public.user_point_balances is '사이트 포인트 잔액 스냅샷 (원장에서 파생, service role 전용)';
comment on table public.user_point_ledger is '사이트 포인트 원장 — (voter_id, reason, ref_id) 유니크로 멱등 보장';
