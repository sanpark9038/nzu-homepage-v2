-- eloboard_matches 테이블에 gender 컬럼 추가
ALTER TABLE public.eloboard_matches ADD COLUMN IF NOT EXISTS gender text;

-- players 테이블에 gender 컬럼 추가
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS gender text;

-- 기존 데이터 정리를 위한 truncate (선택 사항)
-- TRUNCATE TABLE public.eloboard_matches;
