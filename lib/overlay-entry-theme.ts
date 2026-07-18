// 대진표 색·표기 규칙 — 스코어보드 안의 가로 대진표와 풀캠용 세로 엔트리보드가
// 절대 어긋나면 안 되므로 한 곳에서만 관리한다. (종족색은 overlay-race.ts)

export const ET = {
  // 구조물(헤더·라벨·선·테두리)은 "아이스블루 크롬" 한 색으로 통일 — 무채색 회색만 쌓으면
  // 전부 진흙처럼 뭉쳐 칙칙해짐(2026-07-18 사용자 피드백). 아이스블루는 명도·채도가
  // 종족색(진파랑 T/보라 Z/주황 P)과 달라 선수 이름과 안 싸우고, 골드는 에이스 전용으로 남긴다.
  bg:        "rgba(10, 12, 20, 0.90)",
  // 밝기 3단 위계는 유지 — 보드 헤더 > 세트 헤더 > 경기 행. 채도를 올려 위계가 또렷하게.
  boardHeader: "linear-gradient(180deg, rgba(49,62,102,0.97), rgba(24,30,52,0.97))",
  header:      "linear-gradient(180deg, rgba(35,44,74,0.94), rgba(21,26,45,0.94))",
  rowBoxDark:  "rgba(0, 0, 0, 0.30)",  // 경기 행 — 더 깊게 파서 헤더와의 대비를 키움
  topHighlight: "inset 0 1px 0 rgba(165,195,255,0.18)", // 세트 헤더 윗면 하이라이트 — 크롬 톤
  // 보드 헤더 — 윗면 헤어라인만. 아랫면 경계는 EDGE_LINE이 담당한다
  boardEdge:   "inset 0 1px 0 rgba(175,205,255,0.26)",
  border:    "rgba(150, 175, 230, 0.30)",
  accent:    "rgba(168, 205, 255, 0.95)",  // 세트 라벨·현재 경기 번호 — 크롬 포인트
  aceBg:     "rgba(56, 45, 18, 0.90)",   // 에이스 — 따뜻한 어두운 톤(골드는 에이스만의 색)
  aceBorder: "rgba(220, 175, 60, 0.65)",
  aceText:   "rgba(255, 205, 95, 0.95)",
  currentBorder: "rgba(255, 255, 255, 0.92)", // 진행 중 경기 강조 — 배경 대신 테두리만(정적)
  text:      "rgba(240, 242, 248, 0.96)",
  lostText:  "rgba(150, 152, 158, 0.55)", // 패자 이름 — 종족색을 흐리면 주황(P)이 갈색으로 보여서 중립 회색으로
  muted:     "rgba(185, 190, 205, 0.55)",
  mapText:   "rgba(220, 226, 238, 0.90)", // 맵 약자 — muted보다 밝게(방송에서 잘 보이게)
  win:       "rgba(120, 220, 150, 0.95)", // 세트 승리 배지 — 세트 승패는 이 배지 하나로만 말한다
  // 획득 세트 수 칩 — 크롬 톤의 테두리/배경 (엔트리보드·스코어보드가 같이 씀)
  chipBg:     "rgba(120, 160, 255, 0.12)",
  chipBorder: "rgba(168, 205, 255, 0.50)",
};

// 양 끝이 사라지는 구분선 — 상자 안에 선을 꽉 채우면 무거워 보임 (크롬 톤)
export const EDGE_LINE = "linear-gradient(to right, rgba(170,200,255,0), rgba(170,200,255,0.30) 18%, rgba(170,200,255,0.30) 82%, rgba(170,200,255,0))";
// 가운데가 가장 밝고 양 끝으로 갈수록 사라지는 선 — 세트 헤더 아래 강조용
export const CENTER_LINE = "linear-gradient(to right, rgba(180,210,255,0), rgba(180,210,255,0.48) 50%, rgba(180,210,255,0))";


// 방송 화면엔 맵을 두 글자로 줄여 표기 (녹아웃 → 녹아)
export function mapAbbr(name: string) {
  return name.slice(0, 2);
}

export const NAME_MAX_CHARS = 6; // 이름 칸은 6글자까지 늘어나고 그 이상은 …

// 글자 폭(em) — 한글은 1em, 영문·숫자는 그 절반쯤.
const emWidth = (s: string) =>
  [...s].reduce((w, c) => w + (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c) ? 1 : 0.58), 0);

// 이름 칸 폭(px) — 주어진 이름들 중 가장 긴 것에 맞추되 6글자 상한.
// flex:1 + width:max-content 조합은 브라우저 intrinsic 계산이 이름 길이를 제대로 안 반영해
// 카드가 안 늘어났음. 추측에 기대지 않고 직접 계산한다.
export function nameColWidth(names: string[], fontPx: number, minEm = 2) {
  const longest = names.reduce((m, n) => Math.max(m, emWidth(n)), minEm);
  return Math.round(Math.min(longest, NAME_MAX_CHARS) * fontPx) + 6;
}
