import { type UniversityInfo } from "../types";

export const UNIVERSITY_MAP: Record<string, UniversityInfo> = {
  KU: { name: "케이대", stars: 2 },
  JSA: { name: "JSA", stars: 2 },
  C9: { name: "씨나인", stars: 1 },
  TSUCALM: { name: "츠캄몬스타즈", stars: 1 },
  YB: { name: "YB", stars: 1 },
  SSU: { name: "수술대" },
  BGM: { name: "BGM" },
  MBU: { name: "엠비대" },
  "B.A": { name: "흑카데미" },
  "N.C.S": { name: "뉴캣슬" },
  WFU: { name: "와플대" },
  HM: { name: "HM" },
  FA: { name: "무소속" },
};

export type UniversityKey = keyof typeof UNIVERSITY_MAP;

const UNIVERSITY_ALIAS_MAP: Record<string, UniversityKey> = {
  KU: "KU",
  "케이대": "KU",
  JSA: "JSA",
  C9: "C9",
  "씨나인": "C9",
  TSUCALM: "TSUCALM",
  "츠캄": "TSUCALM",
  "츠캄몬스타즈": "TSUCALM",
  YB: "YB",
  SSU: "SSU",
  "수술대": "SSU",
  BGM: "BGM",
  MBU: "MBU",
  "엠비대": "MBU",
  "B.A": "B.A",
  BA: "B.A",
  BLACK: "B.A",
  "흑카데미": "B.A",
  "N.C.S": "N.C.S",
  NCS: "N.C.S",
  "뉴캣슬": "N.C.S",
  WFU: "WFU",
  "와플대": "WFU",
  HM: "HM",
  FA: "FA",
  "무소속": "FA",
  "미소속": "FA",
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

export function getUniversityInfo(univ: string | null | undefined): UniversityInfo {
  const raw = String(univ || "").trim();
  const normalizedKey = normalizeUniversityKey(raw);
  if (normalizedKey) return UNIVERSITY_MAP[normalizedKey];
  return { name: raw || "무소속" };
}

export function getUniversityLabel(univ: string | null | undefined) {
  return getUniversityInfo(univ).name;
}
