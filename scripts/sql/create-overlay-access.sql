-- 오버레이 관리자(/overlay/admin) 사용 신청·승인.
-- 등록 선수(players.soop_id 매칭)는 자동 통과, 그 외(스트리머 본인·매니저)는
-- 신청 → 관리자가 /admin에서 승인해야 사용 가능. (승인 목록 = 예외 허용 목록)
--
-- 실행: Supabase 대시보드 → SQL Editor 에서 이 파일 내용 실행

create table if not exists public.overlay_access (
  provider_user_id text primary key,          -- 숲 로그인 ID (세션에서 옴 — 위조 불가)
  display_name text not null,                 -- 숲 표시 이름 (신청 시점)
  role text not null check (role in ('streamer', 'manager')),
  target text not null,                       -- 본인이면 방송 채널명, 매니저면 담당 스트리머
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz
);

-- 주인장(ddoongcar)은 선수 등록이 없으므로 미리 승인해 둔다 (셀프 신청 생략)
insert into public.overlay_access (provider_user_id, display_name, role, target, status, approved_at)
values ('ddoongcar', '호사가', 'streamer', '호사가', 'approved', timezone('utc', now()))
on conflict (provider_user_id) do nothing;
