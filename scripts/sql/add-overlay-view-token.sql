-- 오버레이 공개 조회용 랜덤 토큰.
-- 기존엔 스코어보드/대진표 URL의 key가 숲 ID여서, ID만 알면 남의 대진표(라인업)를
-- 경기 전에 훔쳐볼 수 있었음 → 추측 불가능한 토큰으로 분리.
-- 로그인(자기 데이터 연결)은 계속 overlay_key(숲 ID), 공개 URL만 view_token 사용.
--
-- 실행: Supabase 대시보드 → SQL Editor 에서 이 파일 내용 실행

alter table public.overlay_state
  add column if not exists view_token text;

-- 토큰 조회가 공개 GET의 유일한 경로이므로 유니크 + 인덱스
create unique index if not exists overlay_state_view_token_key
  on public.overlay_state (view_token);
