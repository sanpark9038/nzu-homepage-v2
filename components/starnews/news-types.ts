// STARNEWS — 방송용 뉴스 오버레이 상태 스키마.
// 대회 기간에만 쓰는 일회성 시스템. components/starnews/* + app/overlay/news/* +
// app/api/overlay/news/* 를 통째로 지우면 흔적 없이 제거된다.
//
// 저장 위치: 기존 overlay_state 테이블의 "별도 행" (overlay_key = "news:" + 숲ID).
// 스코어보드 관리자와 같은 행을 쓰면 전체 상태 자동저장이 서로를 덮어쓰는 경합이
// 생기므로 행을 분리했다. 송출 조회는 이 행의 view_token으로 기존
// GET /api/overlay/state?key= 를 그대로 쓴다 (view_token은 테이블 전체에서 유일).

export type NewsTicker = {
  visible: boolean;
  label: string;      // 바 왼쪽 고정 라벨 (예: "속보")
  items: string[];    // 흘러가는 문구들 — " /// " 구분자로 이어붙여 순환
  pxPerSec: number;   // 흐르는 속도 (px/초)
};

export type NewsBanner = {
  visible: boolean;
  tag: string;        // 작은 분류 태그 (예: "BREAKING")
  headline: string;   // 큰 문구 한 줄
  subline: string;    // 보조 문구 (비우면 미표시)
};

export type NewsLowerThird = {
  visible: boolean;
  tag: string;          // 상단 소분류 (예: "인터뷰")
  name: string;         // 선수명
  affiliation: string;  // 소속(대학)
  note: string;         // 한 줄 설명 (티어·전적 등)
};

// 자료 카드·전면 화면이 공유하는 유연한 표 모델.
// 순위표든 상대전적이든 대진표든 "제목 + 열 + 행"으로 표현한다.
export type NewsTable = {
  title: string;
  subtitle: string;
  columns: string[];        // 열 머리글 (비우면 머리글 행 미표시)
  rows: string[][];         // 각 행의 셀 텍스트
  highlightRows: number[];  // 강조할 행 인덱스 (0-base)
};

export type NewsCard = { visible: boolean; table: NewsTable };
export type NewsFullscreen = { visible: boolean; table: NewsTable };

export type NewsState = {
  ticker: NewsTicker;
  banner: NewsBanner;
  lowerThird: NewsLowerThird;
  card: NewsCard;
  fullscreen: NewsFullscreen;
};

// news 행의 overlay_state.data 컬럼 형태
export type NewsRowState = { news: NewsState };

export function defaultNewsTable(): NewsTable {
  return { title: "", subtitle: "", columns: [], rows: [], highlightRows: [] };
}

export function defaultNewsState(): NewsState {
  return {
    ticker: { visible: false, label: "속보", items: [], pxPerSec: 120 },
    banner: { visible: false, tag: "BREAKING", headline: "", subline: "" },
    lowerThird: { visible: false, tag: "", name: "", affiliation: "", note: "" },
    card: { visible: false, table: defaultNewsTable() },
    fullscreen: { visible: false, table: defaultNewsTable() },
  };
}

// 저장돼 있던 JSON에 필드가 빠져 있어도 기본값으로 메워 렌더가 죽지 않게 한다
export function normalizeNewsState(raw: unknown): NewsState {
  const d = defaultNewsState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<NewsState>;
  return {
    ticker: { ...d.ticker, ...r.ticker },
    banner: { ...d.banner, ...r.banner },
    lowerThird: { ...d.lowerThird, ...r.lowerThird },
    card: { visible: r.card?.visible ?? false, table: { ...defaultNewsTable(), ...r.card?.table } },
    fullscreen: { visible: r.fullscreen?.visible ?? false, table: { ...defaultNewsTable(), ...r.fullscreen?.table } },
  };
}
