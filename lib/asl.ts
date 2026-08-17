// ASL 시즌22 소개 — 공식 발표 실측(2026-08-07). DB를 읽지 않는 정적 데이터다.
//
// 날짜는 여기에 다시 적지 않는다. 달력이 이미 쓰고 있는 ASL_SCHEDULE에서 라벨로 찾아 온다 —
// 같은 날짜를 두 벌로 적으면 달력과 이 페이지가 조용히 어긋난다.
import { ASL_SCHEDULE } from "./jungman";

export type AslRace = "T" | "Z" | "P";

export type AslPlayer = { name: string; race: AslRace };
export type AslGroup = { name: string; date: string; players: AslPlayer[] };

/**
 * ASL_SCHEDULE 라벨 → 날짜. 모르는 라벨이면 던진다.
 * 조용히 넘어가면 라벨 오타가 빈 날짜로 화면에 남는다 — 빌드에서 바로 터지는 편이 낫다.
 */
export function aslScheduleDate(label: string): string {
  const found = ASL_SCHEDULE.find((item) => item.label === label);
  if (!found) throw new Error(`ASL_SCHEDULE에 "${label}" 라벨이 없다`);
  return found.date;
}

export const ASL_SEASON = "ASL 시즌22";
export const ASL_SEASON_EN = "ASL SEASON 22";

/** 개막 = 24강 A조. 날짜는 ASL_SCHEDULE 한 벌에서만 온다 */
export const ASL_OPENING_DATE = aslScheduleDate("ASL A조");
export const ASL_FINAL_DATE = aslScheduleDate("ASL 결승");
/** 전 경기 저녁 7시 생방송 */
export const ASL_MATCH_TIME = "19:00";
export const ASL_VENUE_NOTE = "프릭업 스튜디오 오프라인 진행 · 결승은 롯데월드 아이스링크(시각 미정)";

/** SOOP 공식 방송국 — 생방송은 여기서 튼다 */
export const ASL_STATION_URL = "https://www.sooplive.com/station/afstar1";

export const ASL_PRIZE_MAIN = "우승 3,000만원";
export const ASL_PRIZE_DETAIL = "준우승 1,000만원 · 3/4위 300만원";

/** 24강 조 편성 — 4인 1조 × 6개조 */
export const ASL_GROUPS: AslGroup[] = [
  {
    name: "A조",
    date: aslScheduleDate("ASL A조"),
    players: [
      { name: "유영진", race: "T" },
      { name: "배성흠", race: "Z" },
      { name: "김택용", race: "P" },
      { name: "김윤중", race: "P" },
    ],
  },
  {
    name: "B조",
    date: aslScheduleDate("ASL B조"),
    players: [
      { name: "조기석", race: "T" },
      { name: "김재현", race: "T" },
      { name: "김성대", race: "Z" },
      { name: "이영한", race: "Z" },
    ],
  },
  {
    name: "C조",
    date: aslScheduleDate("ASL C조"),
    players: [
      { name: "도재욱", race: "P" },
      { name: "정경두", race: "P" },
      { name: "이제동", race: "Z" },
      { name: "이영웅", race: "T" },
    ],
  },
  {
    name: "D조",
    date: aslScheduleDate("ASL D조"),
    players: [
      { name: "조일장", race: "Z" },
      { name: "김경모", race: "Z" },
      { name: "임홍규", race: "Z" },
      { name: "윤찬희", race: "T" },
    ],
  },
  {
    name: "E조",
    date: aslScheduleDate("ASL E조"),
    players: [
      { name: "김민철", race: "Z" },
      { name: "임진묵", race: "T" },
      { name: "정영재", race: "T" },
      // 공식 이미지 두 장이 어긋난다(24강 카드 Z vs 선수소개 테란 명단) — 선수소개·실제 종족(테란)을 따른다
      { name: "최호선", race: "T" },
    ],
  },
  {
    name: "F조",
    date: aslScheduleDate("ASL F조"),
    players: [
      { name: "변현제", race: "P" },
      { name: "김윤환", race: "Z" },
      { name: "김명운", race: "Z" },
      { name: "김정우", race: "Z" },
    ],
  },
];

/** 전 대회 4강 진출자 — 24강을 건너뛰고 16강 직행 */
export const ASL_SEEDS: AslPlayer[] = [
  { name: "박상현", race: "Z" },
  { name: "신상문", race: "T" },
  { name: "이재호", race: "T" },
  { name: "장윤철", race: "P" },
];

/** 조지명식 — 24강이 끝난 뒤 16강 조를 짠다 */
export const ASL_DRAW_DATE = aslScheduleDate("ASL 조지명식");

/** 라운드별 진행 방식 */
export const ASL_ROUNDS: { round: string; format: string }[] = [
  { round: "24강", format: "4인 1조 × 6개조 듀얼 토너먼트 · 전 경기 단판" },
  { round: "16강", format: "4인 1조 × 4개조 듀얼 · 첫 매치 단판, 승자전·패자전·최종전 3전 2선승" },
  { round: "8강", format: "5전 3선승 싱글 토너먼트" },
  { round: "4강", format: "7전 4선승" },
  { round: "결승", format: "7전 4선승" },
];

export const ASL_ROUND_NOTE = "16강 4일차에 8강 조추첨식 진행";

/** 24강 듀얼 진행 순서와 맵 배정. 승자전·패자전/최종전은 양 선수가 1개씩 밴 후 남은 맵. */
export const ASL_RO24_STAGES: { stage: string; ban: boolean; maps: string[] }[] = [
  { stage: "1·2경기", ban: false, maps: ["녹아웃"] },
  { stage: "승자전·패자전", ban: true, maps: ["애티튜드SE", "컬러리스 페이트", "오디세이RE"] },
  { stage: "최종전", ban: true, maps: ["옥타곤SE", "아이올로스", "백룸"] },
];

/** 사용 맵 7개. fresh = 이번 시즌 신규 */
export const ASL_MAPS: { name: string; fresh: boolean }[] = [
  { name: "녹아웃", fresh: false },
  { name: "애티튜드SE", fresh: false },
  { name: "옥타곤SE", fresh: false },
  { name: "컬러리스 페이트", fresh: true },
  { name: "아이올로스", fresh: true },
  { name: "오디세이RE", fresh: true },
  { name: "백룸", fresh: true },
];

const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SEOUL_MD = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "2026-08-17" → "8/17(월)". ko-KR은 "8. 17. (월)"로 뱉어서 조각을 직접 조립한다. */
export function formatAslDate(date: string): string {
  const parts = SEOUL_MD.formatToParts(new Date(`${date}T00:00:00+09:00`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** 개막까지 남은 날. 서버 시각이 UTC라도 한국 날짜를 기준으로 센다(jungmanDaysToFinal과 같은 규칙). */
export function aslDaysToOpening(): number {
  const todayKST = SEOUL_YMD.format(new Date());
  return Math.round((Date.parse(ASL_OPENING_DATE) - Date.parse(todayKST)) / 86_400_000);
}

/**
 * 오늘(KST) 포함 가장 가까운 방송. 결승(10/17)까지 다 들어 있다 — 결승이 지나면 null이 정상이다.
 * ASL_SCHEDULE은 날짜 오름차순으로 적혀 있다.
 */
export function aslNextBroadcast(): { date: string; label: string } | null {
  const todayKST = SEOUL_YMD.format(new Date());
  return ASL_SCHEDULE.find((item) => item.date >= todayKST) ?? null;
}

/** ASL_SCHEDULE 라벨("ASL A조") → 24강 조. 조지명식처럼 조가 없는 라벨이면 null이다. */
export function aslGroupByLabel(label: string): AslGroup | null {
  return ASL_GROUPS.find((group) => `ASL ${group.name}` === label) ?? null;
}
