import { type UniversityInfo } from "../types";

export const UNIVERSITY_MAP: Record<string, UniversityInfo> = {
  KU: { name: "케이대", stars: 2 },
  JSA: { name: "JSA", stars: 2 },
  C9: { name: "씨나인", stars: 1 },
  CALM: { name: "캄몬스타즈", stars: 1 },
  SSU: { name: "수술대" },
  BGM: { name: "BGM" },
  MBU: { name: "엠비대" },
  "B.A": { name: "흑카데미" },
  "N.C.S": { name: "뉴캣슬" },
  WFU: { name: "와플대" },
  HM: { name: "HM" },
  DM: { name: "DM" },
  SSG: { name: "신세계" },
  FA: { name: "무소속" },
};

export type UniversityKey = keyof typeof UNIVERSITY_MAP;

export const UNIVERSITY_ALIAS_MAP: Record<string, UniversityKey> = {
  KU: "KU",
  "K.U": "KU",
  케이대: "KU",
  JSA: "JSA",
  C9: "C9",
  씨나인: "C9",
  CALM: "CALM",
  calm: "CALM",
  TSUCALM: "CALM",
  츠캄: "CALM",
  츠캄몬스타즈: "CALM",
  "캄몬스타즈": "CALM",
  SSU: "SSU",
  수술대: "SSU",
  BGM: "BGM",
  MBU: "MBU",
  엠비대: "MBU",
  "B.A": "B.A",
  BA: "B.A",
  BLACK: "B.A",
  흑카데미: "B.A",
  블랙아카데미: "B.A",
  NCS: "N.C.S",
  뉴캣슬: "N.C.S",
  "N.C.S": "N.C.S",
  뉴캐슬: "N.C.S",
  WFU: "WFU",
  와플대: "WFU",
  HM: "HM",
  DM: "DM",
  SSG: "SSG",
  신세계: "SSG",
  FA: "FA",
  무소속: "FA",
  연합팀: "FA",
  늪지대: "FA",
  고정없음: "FA",
  무팀: "FA",
  개인: "FA",
};

function sanitizeUniversityToken(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[.\-_/()[\]]+/g, "");
}

export function normalizeUniversityKey(univ: string | null | undefined): UniversityKey | null {
  const raw = String(univ || "").trim();
  if (!raw) return null;

  const directMatch = UNIVERSITY_ALIAS_MAP[raw];
  if (directMatch) return directMatch;

  const normalized = sanitizeUniversityToken(raw);
  if (!normalized) return null;

  for (const [alias, code] of Object.entries(UNIVERSITY_ALIAS_MAP)) {
    if (sanitizeUniversityToken(alias) === normalized) {
      return code;
    }
  }

  return null;
}

export type HiddenUniversityEntry = {
  code?: string | null;
  name?: string | null;
  aliases?: string[] | null;
};

// 숨김 팀(해체 등)은 팀 탭에서만 사라질 뿐, 서빙 players.university에는 이름이 그대로 남는다.
// 표시 단계에서 무소속(FA)으로 내려 죽은 팀 라벨이 선수 카드에 새어나오지 않게 한다.
// 규칙이 "현재 소속 = 숨김 팀"에만 걸리므로, 이동이 승인돼 university가 새 팀으로 바뀌는
// 순간 자동으로 벗어난다 — 승인된 진실이 항상 이긴다.
export function applyHiddenUniversityFallback<T extends { university?: string | null }>(
  players: T[],
  hiddenUniversities: HiddenUniversityEntry[]
): T[] {
  // 서빙 university는 applyPlayerServingMetadata 이후 보통 코드("C9")지만,
  // 별칭 표에 없는 팀은 원본 이름이 그대로 남으므로 코드·이름·별칭을 모두 받는다.
  const hiddenKeys = new Set(
    hiddenUniversities
      .flatMap((entry) => [entry.code, entry.name, ...(entry.aliases ?? [])])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  if (hiddenKeys.size === 0) return players;

  return players.map((player) =>
    hiddenKeys.has(String(player.university || "").trim()) ? { ...player, university: "FA" } : player
  );
}

export function getUniversityInfo(univ: string | null | undefined): UniversityInfo {
  const raw = String(univ || "").trim();
  const normalizedKey = normalizeUniversityKey(raw);
  if (normalizedKey) return UNIVERSITY_MAP[normalizedKey];
  return { name: raw || "무소속" };
}

export function getUniversityLabel(univ: string | null | undefined) {
  return getUniversityInfo(univ).name;
}
