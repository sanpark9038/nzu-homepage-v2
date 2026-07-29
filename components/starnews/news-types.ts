// STARNEWS — 방송용 뉴스 오버레이 상태 스키마.
// 대회 기간에만 쓰는 일회성 시스템. components/starnews/* + app/overlay/news/* +
// app/api/overlay/news/* 를 통째로 지우면 흔적 없이 제거된다.
//
// 저장 위치: 기존 overlay_state 테이블의 "별도 행" (overlay_key = "news:" + 숲ID).
// 스코어보드 관리자와 같은 행을 쓰면 전체 상태 자동저장이 서로를 덮어쓰는 경합이
// 생기므로 행을 분리했다. 송출 조회는 이 행의 view_token으로 기존
// GET /api/overlay/state?key= 를 그대로 쓴다 (view_token은 테이블 전체에서 유일).

// 위젯별 위치·크기 — 관리자에서 숫자로 조정 (스코어보드 OverlayPanelLayout과 같은 개념).
// x/y는 1920×1080 캔버스 좌상단 기준 px, scale은 배율(1 = 100%). 앵커는 각 위젯의 좌상단.
export type NewsWidgetLayout = { x: number; y: number; scale: number };

export type NewsTicker = {
  visible: boolean;
  label: string;      // 바 왼쪽 분류 태그 (예: "속보")
  items: string[];    // 교대로 표시되는 문구들
  secPerItem: number; // 문구 하나가 떠 있는 시간(초) — 지나면 다음 문구로 교체
  y: number;          // 화면 하단에서의 여백(px)
  scale: number;      // 배율
};

export type NewsBanner = {
  visible: boolean;
  tag: string;        // 프로그램 태그 블록 (예: "속보", 프로그램명)
  headline: string;   // 큰 문구 한 줄
  subline: string;    // 보조 문구 (비우면 미표시)
  layout: NewsWidgetLayout;
};

export type NewsLowerThird = {
  visible: boolean;
  tag: string;          // 상단 소분류 (예: "인터뷰")
  name: string;         // 선수명
  affiliation: string;  // 소속(대학)
  note: string;         // 한 줄 설명 (티어·전적 등)
  layout: NewsWidgetLayout;
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

export type NewsCard = { visible: boolean; table: NewsTable; layout: NewsWidgetLayout };
export type NewsFullscreen = { visible: boolean; table: NewsTable }; // 전면은 항상 안전 여백 꽉 채움 — 위치 조정 없음

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

// 기본 배치 — YTN식 하단 자막 구성: 티커(최하단) 위에 배너(메인 자막바), 그 위에 로워서드.
// 관리자에서 X/Y/배율로 자유 조정 가능하므로 이 값들은 시작점일 뿐이다.
export function defaultNewsState(): NewsState {
  return {
    ticker: { visible: false, label: "속보", items: [], secPerItem: 8, y: 54, scale: 1 },
    banner: { visible: false, tag: "속보", headline: "", subline: "", layout: { x: 96, y: 836, scale: 1 } },
    lowerThird: { visible: false, tag: "", name: "", affiliation: "", note: "", layout: { x: 96, y: 620, scale: 1 } },
    card: { visible: false, table: defaultNewsTable(), layout: { x: 1344, y: 200, scale: 1 } },
    fullscreen: { visible: false, table: defaultNewsTable() },
  };
}

// 저장돼 있던 JSON에 필드가 빠져 있어도 기본값으로 메워 렌더가 죽지 않게 한다
// (구버전 저장분: pxPerSec·layout 없음 → 기본값으로 대체)
export function normalizeNewsState(raw: unknown): NewsState {
  const d = defaultNewsState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<NewsState>;
  const layoutOf = (saved: Partial<NewsWidgetLayout> | undefined, def: NewsWidgetLayout): NewsWidgetLayout => ({
    x: saved?.x ?? def.x,
    y: saved?.y ?? def.y,
    scale: saved?.scale ?? def.scale,
  });
  return {
    ticker: { ...d.ticker, ...r.ticker },
    banner: { ...d.banner, ...r.banner, layout: layoutOf(r.banner?.layout, d.banner.layout) },
    lowerThird: { ...d.lowerThird, ...r.lowerThird, layout: layoutOf(r.lowerThird?.layout, d.lowerThird.layout) },
    card: {
      visible: r.card?.visible ?? false,
      table: { ...defaultNewsTable(), ...r.card?.table },
      layout: layoutOf(r.card?.layout, d.card.layout),
    },
    fullscreen: { visible: r.fullscreen?.visible ?? false, table: { ...defaultNewsTable(), ...r.fullscreen?.table } },
  };
}
