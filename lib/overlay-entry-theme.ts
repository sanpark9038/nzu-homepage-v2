// 대진표 색·표기 규칙 — 스코어보드 안의 가로 대진표와 풀캠용 세로 엔트리보드가
// 절대 어긋나면 안 되므로 한 곳에서만 관리한다. (종족색은 overlay-race.ts)

export const ET = {
  bg:        "rgba(12, 14, 21, 0.86)",   // 살짝 투명 + 헤더와 같은 색온도(푸른 기)로 톤 통일
  // 밝기 3단 위계 — 보드 헤더 > 세트 헤더 > 경기 행. 색을 더 넣지 않고 명도만으로 구분한다
  // (종족색 3개 + 승리 초록이 이미 있어서 포인트 색을 더 넣으면 선수 이름 종족색이 죽음)
  // 순수 회색은 "색을 안 정한 것"처럼 보여 칙칙함 → 같은 어두운 톤에 색온도(푸른 기)만 준다.
  // 색이 늘어나는 게 아니라 톤을 정한 것뿐이라 종족색(파랑/보라/주황)과 안 싸움.
  // 여기에 가로 그라디언트를 겹쳐 "위에서 조명이 떨어지는" 입체감(C).
  boardHeader: "radial-gradient(120% 160% at 50% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0) 60%), linear-gradient(180deg, rgba(30,38,58,0.94), rgba(16,20,34,0.94))",
  header:      "radial-gradient(120% 180% at 50% 0%, rgba(255,255,255,0.06), rgba(255,255,255,0) 62%), linear-gradient(180deg, rgba(26,31,46,0.90), rgba(18,21,32,0.90))",
  rowBoxDark:  "rgba(0, 0, 0, 0.22)",  // 경기 행 — 배경보다 어둡게 파서 헤더가 떠 보이게
  topHighlight: "inset 0 1px 0 rgba(255,255,255,0.10)", // 세트 헤더 윗면 하이라이트
  // 보드 헤더 — 윗면 헤어라인만. 아랫면 경계는 EDGE_LINE이 담당한다
  // (딱딱한 검은 선 + 흰 하이라이트가 겹쳐 선 2개로 보이던 걸 양끝 페이드 선 1개로 정리)
  boardEdge:   "inset 0 1px 0 rgba(255,255,255,0.16)",
  border:    "rgba(255, 255, 255, 0.16)",
  accent:    "rgba(225, 227, 232, 0.85)",
  aceBg:     "rgba(48, 40, 18, 0.86)",   // 에이스 — 본문과 같은 투명도의 따뜻한 어두운 톤
  aceBorder: "rgba(200, 160, 40, 0.60)",
  aceText:   "rgba(200, 160, 40, 0.9)",
  currentBorder: "rgba(255, 255, 255, 0.92)", // 진행 중 경기 강조 — 배경 대신 테두리만(정적)
  text:      "rgba(232, 233, 236, 0.90)",
  lostText:  "rgba(150, 152, 158, 0.55)", // 패자 이름 — 종족색을 흐리면 주황(P)이 갈색으로 보여서 중립 회색으로
  muted:     "rgba(180, 180, 186, 0.50)",
  mapText:   "rgba(214, 216, 222, 0.88)", // 맵 약자 — muted보다 밝게(방송에서 잘 보이게)
  win:       "rgba(120, 220, 150, 0.95)", // 세트 승리 배지
  winTint:   "rgba(120, 220, 150, 0.13)", // 이긴 세트 헤더의 그 쪽 배경 틴트
};

// 양 끝이 사라지는 구분선 — 상자 안에 선을 꽉 채우면 무거워 보임
export const EDGE_LINE = "linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.22) 18%, rgba(255,255,255,0.22) 82%, rgba(255,255,255,0))";
// 가운데가 가장 밝고 양 끝으로 갈수록 사라지는 선 — 세트 헤더 아래 강조용
export const CENTER_LINE = "linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.38) 50%, rgba(255,255,255,0))";


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
