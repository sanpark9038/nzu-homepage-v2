// 종족 규칙 색상 + 선수 이름 → 종족 매칭 (관리자·방송 화면이 같은 규칙을 쓰도록 한 곳에 모음)
import type { OverlayRace } from "./overlay-types";

// 테란=파랑 · 저그=보라 · 프로토스=주황
export const RACE_COLORS: Record<OverlayRace, string> = {
  T: "#4A9EFF",
  Z: "#A855F7",
  P: "#FF9838",
};

// 종족 배지 배경 (같은 색 13% 알파)
export const RACE_BG: Record<OverlayRace, string> = {
  T: `${RACE_COLORS.T}22`,
  Z: `${RACE_COLORS.Z}22`,
  P: `${RACE_COLORS.P}22`,
};

export const RACES: OverlayRace[] = ["T", "P", "Z"];

export type RaceLookupPlayer = { name: string; nickname?: string | null; race: string };

// 선수 DB에서 이름/닉네임/"성 뗀 이름"으로 종족을 찾음.
// 한국 이름은 대개 성이 1글자라 끝 2글자가 실사용 호칭 (조일장 → 일장)
export function raceOfName(players: RaceLookupPlayer[], name: string): OverlayRace | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const hit = players.find((p) => {
    if (p.name === n || p.nickname === n) return true;
    const given = p.name.length >= 3 ? p.name.slice(-2) : p.name;
    return given === n;
  });
  return hit && (["T", "P", "Z"] as string[]).includes(hit.race) ? (hit.race as OverlayRace) : undefined;
}
