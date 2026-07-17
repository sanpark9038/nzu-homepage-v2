export type OverlayRace = "T" | "P" | "Z";
export type OverlayMode = "team" | "individual";
export type OverlayResult = "left" | "right" | null;

export type OverlaySide = {
  teamName: string;
  playerName: string;
  race: OverlayRace;
  startingPoint: string;
  startingColor: string;
};

export type OverlayEntryRow = {
  id: string;
  leftPlayer: string;
  map: string;
  rightPlayer: string;
  result: OverlayResult;
  leftRace?: OverlayRace;   // DB 자동 인식 실패 시 수동 지정(미등록 게스트 등)
  rightRace?: OverlayRace;
};

export type OverlaySet = {
  id: string;
  title: string;
  isAce: boolean;
  winnersMode?: boolean; // true=위너스(승자 잔류), false/undefined=고정 대진
  currentMatch: number | null;
  leftPool: string[];
  rightPool: string[];
  entries: OverlayEntryRow[];
};

export type OverlayPanelLayout = {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
};

export type OverlayFavorite = {
  id: string;
  name: string;
  race: OverlayRace;
  team?: "left" | "right" | null;
};

// 경기 방식: proleague=프로리그, university=대전 및 CK(단판), mini=미니대전(3세트+슈에), free=자유방식
export type OverlayMatchFormat = "proleague" | "university" | "mini" | "free";
// 대전 및 CK 단판 판수: bo7=7판4선, bo9=9판5선
export type OverlayUniversityFormat = "bo7" | "bo9";

export type OverlayState = {
  mode: OverlayMode;
  title: string;
  left: OverlaySide;
  right: OverlaySide;
  sets: OverlaySet[];
  activeSetId: string | null;
  maps: string[];
  scoreboardLayout: OverlayPanelLayout;
  entryLayout: OverlayPanelLayout;
  favorites: OverlayFavorite[];
  matchFormat: OverlayMatchFormat;
  universityFormat: OverlayUniversityFormat;
};

// 경기 방식별 기본 세트 구조 (엔트리는 비워두고 SetEditor가 defaultSlots로 채움)
export function buildDefaultSets(mf: OverlayMatchFormat): OverlaySet[] {
  switch (mf) {
    case "proleague":
      return [
        defaultOverlaySet("프로리그 7/4", false),
        { ...defaultOverlaySet("위너스리그 9/5", false), winnersMode: true },
        defaultOverlaySet("에이스", true),
      ];
    case "mini":
      // 세트 번호는 옆에 1SET/슈에로 따로 표시되므로 타이틀엔 방식명만 (중복 방지)
      return [
        defaultOverlaySet("미니대전", false),
        defaultOverlaySet("미니대전", false),
        defaultOverlaySet("미니대전", true),
      ];
    case "free":
      return [defaultOverlaySet("", false)];
    case "university":
    default:
      return [defaultOverlaySet("대전 및 CK", false)];
  }
}

// 경기 방식별 방송 타이틀 기본값
export function defaultBroadcastTitle(mf: OverlayMatchFormat): string {
  switch (mf) {
    case "proleague": return "프로리그 7/4";
    case "mini": return "미니대전";
    case "free": return "";
    case "university":
    default: return "대전 및 CK";
  }
}

// 경기 방식별 기본 스코어보드 모드 (대전 및 CK·미니대전=팀명표시, 나머지=선수만)
export function defaultModeFor(mf: OverlayMatchFormat): OverlayMode {
  return mf === "university" || mf === "mini" ? "team" : "individual";
}

// ── 세트/미니대전 승패 계산 ──────────────────────────────────────────
// 한 세트에서 이기는 데 필요한 경기 수 (N판 → 과반). 5판→3, 1판(슈에)→1
export function setWinTarget(set: OverlaySet): number {
  return Math.floor(set.entries.length / 2) + 1;
}

// 한 세트의 승자 (과반 달성 시). 아직이면 null
export function setWinnerOf(set: OverlaySet): OverlayResult {
  const target = setWinTarget(set);
  const left = set.entries.filter((e) => e.result === "left").length;
  const right = set.entries.filter((e) => e.result === "right").length;
  if (left >= target) return "left";
  if (right >= target) return "right";
  return null;
}

// 세트 스코어 (세트를 몇 개 이겼나). 슈에 포함 전체 집계
export function setScoreOf(sets: OverlaySet[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const s of sets) {
    const w = setWinnerOf(s);
    if (w === "left") left += 1;
    else if (w === "right") right += 1;
  }
  return { left, right };
}

// 미니대전 슈에 필요 여부: 1·2세트가 1:1로 갈리면 true, 한쪽이 2:0이면 false, 아직 미정이면 null
export function miniAceNeeded(sets: OverlaySet[]): boolean | null {
  const nonAce = sets.filter((s) => !s.isAce);
  if (nonAce.length < 2) return null;
  const winners = nonAce.map(setWinnerOf);
  if (winners.some((w) => w === null)) return null;
  const leftWins = winners.filter((w) => w === "left").length;
  return leftWins === 1; // 1:1 → 슈에 필요
}

export function defaultOverlaySide(side: "left" | "right" = "left"): OverlaySide {
  return {
    teamName: "",
    playerName: "",
    race: "T",
    startingPoint: "",
    startingColor: side === "left" ? "#e0524a" : "#4a7fe0",
  };
}

export function defaultOverlaySet(title = "", isAce = false): OverlaySet {
  return {
    id: Math.random().toString(36).slice(2, 9),
    title,
    isAce,
    currentMatch: null,
    leftPool: [],
    rightPool: [],
    entries: [],
  };
}

export function defaultOverlayState(): OverlayState {
  return {
    mode: "team",
    title: "",
    left: defaultOverlaySide("left"),
    right: defaultOverlaySide("right"),
    sets: [],
    activeSetId: null,
    maps: [],
    scoreboardLayout: { x: 0, y: 373, scale: 0.54, visible: true },
    entryLayout: { x: 330, y: 770, scale: 1, visible: true },
    favorites: [],
    matchFormat: "proleague",
    universityFormat: "bo7",
  };
}
