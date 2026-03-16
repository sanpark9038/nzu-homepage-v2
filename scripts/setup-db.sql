-- 1. eloboard_matches 테이블 생성
CREATE TABLE IF NOT EXISTS public.eloboard_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_key TEXT UNIQUE NOT NULL, -- player_id + date + opponent + map + turn 기반 해시
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    match_date DATE NOT NULL,
    opponent_name TEXT NOT NULL,
    opponent_race CHAR(1) CHECK (opponent_race IN ('P', 'T', 'Z')), -- DB 레벨 제약 조건
    map TEXT NOT NULL,
    result_raw TEXT NOT NULL, -- 원본 보존
    is_win BOOLEAN NOT NULL DEFAULT false,
    turn TEXT,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. sync_logs 테이블 생성
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sync_at TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL, -- 'SUCCESS' | 'FAIL'
    new_records INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error_msg TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 검색 최적화를 위한 인덱스 설정
CREATE INDEX IF NOT EXISTS idx_matches_player_date ON public.eloboard_matches(player_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_is_win ON public.eloboard_matches(is_win);
CREATE INDEX IF NOT EXISTS idx_matches_sync_key ON public.eloboard_matches(sync_key);
