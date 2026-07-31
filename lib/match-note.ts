export type MatchNoteCategory = "mini" | "uni" | "tourney";

// 표기 흔들림(공백/대소문자) 흡수용 정규화
function normalizeNote(note: string | null | undefined): string {
  return String(note ?? "").toLowerCase().replace(/\s+/g, "");
}

/** 비고 원문 → 대회 분류. 해당 없으면 null */
export function classifyMatchNote(note: string | null | undefined): MatchNoteCategory | null {
  const text = normalizeNote(note);
  if (!text) return null;

  // 스크림 가드: "오염컵 스크림"이 아래 컵 규칙에 오탐되는 걸 막는다
  if (text.includes("스크림")) return null;

  // 미니대학대전은 대학대전 규칙이 먼저 흡수한다
  if (text.includes("대학대전")) return "uni";
  if (text.includes("미니대전")) return "mini";

  // 리그(K리그·프로리그)는 요구사항상 의도적으로 제외한다
  if (/컵|대회|jpl|워즈|\d+강|결승|예선|조별|토너먼트/.test(text)) return "tourney";

  return null;
}

/** 비고 원문 → 화면에 띄울 문자열. 노이즈/빈값이면 null */
export function getDisplayNote(note: string | null | undefined): string | null {
  const firstLine = String(note ?? "").split(/\r?\n/)[0].trim();
  if (firstLine.length <= 1) return null;
  // 기호·숫자만 남은 값(1, 3/2, 3/2(2), --1 …)은 표시 가치가 없다.
  // 완성형 음절/영문만 letter로 친다 — 낱자모만 있는 값(ㅇㅇ, ㄷㄱ, 1 ㅇㅇ)도 노이즈다
  if (!/[a-z가-힣]/i.test(firstLine)) return null;
  return firstLine;
}
