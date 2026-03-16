-- players 테이블에 eloboard_id(wr_id) 컬럼 추가
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS eloboard_id TEXT;

-- 기존 sync_key 로직을 더 유니크하게 변경하기 위한 인덱스 조정 (필요 시)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_sync ON public.eloboard_matches(player_id, match_date, opponent_name, map, turn);
