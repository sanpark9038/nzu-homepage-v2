// 일괄 입력 파서 — 채팅 접두어 제거 + 잡담 줄 폐기, "N 좌선수 [종족] vs 우선수 [종족] [맵]" 형식 지원
// 순수 함수라 UI와 분리해 둠 (테스트/재사용 용이)
import type { OverlayRace } from "./overlay-types";

export type ParsedRow = {
  leftPlayer: string;
  rightPlayer: string;
  map: string;
  leftRace?: OverlayRace;   // 입력에 종족이 명시된 경우에만
  rightRace?: OverlayRace;
};
export function parseBulk(
  text: string,
  myName: string,
  playerNames: string[],
  universityOf?: (token: string) => string | null,
  allowVsFormat = false,
): {
  rows: ParsedRow[]; detectedP1: boolean; detectedMaps: boolean; mapsOnly: boolean; vsFormat?: boolean;
  unrecognized?: string[]; // vs 형식에서 경기로 인식하지 못하고 건너뛴 줄(원문) — UI에서 짚어주기 위함
} | null {
  // 채팅 접두어 제거: 콜론 앞부분([2]. llllll id:) 통째로 버림, 남은 선두 [..]. 도 제거
  const stripPrefix = (l: string) => {
    const c = l.indexOf(":");
    let body = c >= 0 ? l.slice(c + 1) : l;
    body = body.replace(/^\s*\[[^\]]*\]\.?\s*/, "");
    return body.trim();
  };
  // 채팅 줄(콜론 포함)이 하나라도 있으면 그 줄들만 후보로 — 안내문/잡줄 제거
  const rawLines = text.split(/\r?\n/);
  const cells = rawLines.map(l => ({ hadColon: l.includes(":"), body: stripPrefix(l) })).filter(x => x.body);
  const anyColon = cells.some(x => x.hadColon);
  const lines = (anyColon ? cells.filter(x => x.hadColon) : cells).map(x => x.body);
  if (lines.length < 1) return null;

  const tokenize = (l: string) => l.split(/[,\t]+|\s+/).map(t => t.trim()).filter(Boolean);
  const toks = lines.map(tokenize);

  // ── "N [맵] 좌선수[종족] vs 우선수[종족] [맵]" 형식 (한 줄 = 한 경기) ──
  // vs가 들어간 줄이 하나라도 있으면 그 줄들만 경기로 파싱. 맨 앞 숫자(경기번호)는 무시.
  // 종족은 띄어쓰기("영희 P") / 붙여쓰기("영희P") 둘 다 인식.
  // 맵은 줄 끝("... 숙자 T 실") 또는 선수 앞("실 영희P vs ...") 어느 쪽에 와도 인식.
  // 단, 종족이 없으면 맵도 없는 것으로 본다 → 두 어절 이름을 맵으로 오인하지 않기 위함.
  if (allowVsFormat) {
    // "vs"를 구분자로 정규화 — 붙여쓰기·띄어쓰기·한글·종족글자·숫자 무엇이 붙어 있어도 독립 토큰이 되게 공백 삽입.
    // 단 하나의 예외: 양옆이 둘 다 영문 글자면 닉네임 내부(예: "SharpZvsBest")로 보고 건드리지 않는다.
    // 이 분기 안에서만 다시 토큰화 → 다른 경로(명단형)엔 영향 없음.
    const padVs = (l: string) => l.replace(/vs\.?/gi, (m, off: number, s: string) => {
      const before = s[off - 1] ?? " ";
      const after  = s[off + m.length] ?? " ";
      return (/[A-Za-z]/.test(before) && /[A-Za-z]/.test(after)) ? m : ` ${m} `;
    });
    const vsToks = lines.map(l => tokenize(padVs(l)));
    const RACE_RE   = /^[TPZ]$/i;
    const isVsTok   = (t: string) => /^vs\.?$/i.test(t);
    const isNumTok  = (t: string) => /^\d+$/.test(t);
    // 티어 표기 제외 — "티어" / "4티어" / "10티어" 같은 순위 접두어는 선수 이름이 아니므로 버림
    const isTierTok = (t: string) => /^\d*티어$/.test(t);
    const isRaceTok = (t: string) => RACE_RE.test(t);
    const asRace    = (t: string) => t.toUpperCase() as OverlayRace;
    // "영희P" → { name:"영희", race:"P" }. 앞 글자가 영문이면(예: "SharpZ") 닉네임으로 보고 분리하지 않음.
    const splitAttachedRace = (tok: string): { name: string; race: OverlayRace } | null => {
      if (tok.length < 2) return null;
      const last = tok[tok.length - 1];
      if (!RACE_RE.test(last)) return null;
      if (/[A-Za-z]/.test(tok[tok.length - 2])) return null;
      return { name: tok.slice(0, -1), race: asRace(last) };
    };

    const vsRows: ParsedRow[] = [];
    const unrecognized: string[] = [];                               // 경기로 못 만든 줄(원문) — UI에서 짚어줌
    let sawMap = false;
    for (let li = 0; li < vsToks.length; li++) {
      const ts = vsToks[li];
      const vsIdx = ts.findIndex(isVsTok);
      if (vsIdx < 1) { unrecognized.push(lines[li]); continue; }      // vs 없거나 앞에 좌선수가 없는 줄

      // 좌측: [경기번호] [티어] [맵] 이름[종족]
      const lt = ts.slice(0, vsIdx).filter(t => !isNumTok(t) && !isTierTok(t));
      let leftRace: OverlayRace | undefined;
      if (lt.length >= 2 && isRaceTok(lt[lt.length - 1])) {
        leftRace = asRace(lt.pop()!);                                 // "영희 P"
      } else if (lt.length) {
        const sp = splitAttachedRace(lt[lt.length - 1]);              // "영희P"
        if (sp) { leftRace = sp.race; lt[lt.length - 1] = sp.name; }
      }
      let leftPlayer: string;
      let frontMap = "";
      if (leftRace && lt.length >= 2) {                               // 종족이 있을 때만 앞 토큰을 맵으로
        leftPlayer = lt[lt.length - 1];
        frontMap   = lt.slice(0, -1).join(" ").trim();
      } else {
        leftPlayer = lt.join(" ").trim();
      }

      // 우측: [티어] 이름[종족] [맵...]
      const rt = ts.slice(vsIdx + 1).filter(t => !isTierTok(t));
      let rightRace: OverlayRace | undefined;
      let rightPlayer = "";
      let backMap = "";
      if (rt.length) {
        const sp = splitAttachedRace(rt[0]);                          // "숙자T"
        if (sp) {
          rightPlayer = sp.name;
          rightRace   = sp.race;
          backMap     = rt.slice(1).join(" ").trim();
        } else {
          const rIdx = rt.findIndex(isRaceTok);                       // "숙자 T 실"
          if (rIdx > 0) {
            rightRace   = asRace(rt[rIdx]);
            rightPlayer = rt.slice(0, rIdx).join(" ").trim();
            backMap     = rt.slice(rIdx + 1).join(" ").trim();
          } else {
            rightPlayer = rt.join(" ").trim();                        // 종족 없음 → 맵도 없음
          }
        }
      }

      const map = backMap || frontMap;
      if (!leftPlayer && !rightPlayer) { unrecognized.push(lines[li]); continue; }
      if (map) sawMap = true;
      vsRows.push({ leftPlayer, rightPlayer, map, leftRace, rightRace });
    }
    if (vsRows.length > 0) {
      return { rows: vsRows, detectedP1: true, detectedMaps: sawMap, mapsOnly: false, vsFormat: true, unrecognized };
    }
  }

  const norm = (s: string) => s.toLowerCase().replace(/\s/g, "");
  const namesN = new Set(playerNames.map(norm));
  const myN    = norm(myName);

  // 문장형 토큰: 5자 이상이거나, 3자 이상이면서 조사로 끝나는 토큰 (이름·맵은 보통 2~4자, 조사 없음)
  const PARTICLES = ["을", "를", "은", "는", "이", "가", "와", "과", "로", "으로", "에", "의", "도", "만",
    "에서", "에게", "한테", "까지", "부터", "라고", "처럼", "보다", "네요", "어요", "아요", "습니다", "니다", "세요", "해요", "하고", "하는", "였다", "했다"];
  const isSentenceTok = (t: string) => t.length >= 5 || (t.length >= 3 && PARTICLES.some(p => t.endsWith(p)));
  // 스팸 토큰: 같은 문자 4회 이상 반복 또는 숫자 5자 이상 (예: 11111111111)
  const isSpamTok = (t: string) => /^(.)\1{3,}$/.test(t) || /^\d{5,}$/.test(t);
  const dupCount  = (arr: string[]) => arr.length - new Set(arr.map(norm)).size;

  const stats = toks.map(ts => {
    const tn = ts.map(norm);
    const nameHits  = tn.filter(t => namesN.has(t)).length;
    const myHit     = !!myN && tn.some(t => t.includes(myN) || myN.includes(t));
    // 대학대전: 토큰(선수)의 소속 대학이 myName(선택한 대학)과 일치하는 개수 — 한 명이 아니라 여러 명으로 판단해 더 안정적
    const univHits  = universityOf
      ? ts.filter(t => { const u = universityOf(t); return !!u && norm(u) === myN; }).length
      : 0;
    const sentence  = ts.filter(isSentenceTok).length;
    const spamOnly  = ts.length > 0 && ts.every(isSpamTok);
    const dup       = dupCount(ts);
    return { nameHits, myHit, univHits, count: ts.length, sentence, spamOnly, dup };
  });

  // 스팸 줄 + 문장형(시스템 메시지) 줄 제외
  const allIdx = toks.map((_, i) => i);
  const kept   = allIdx.filter(i => !stats[i].spamOnly && !(stats[i].sentence >= 2 && stats[i].nameHits === 0));
  const usable = kept.length >= 1 ? kept : allIdx.filter(i => !stats[i].spamOnly);
  if (usable.length === 0) return null;

  // 한 줄만 있으면 = 맵 줄로 인식 (위너스 2세트: 맵만 붙여넣기) → 선수는 비우고 맵만 등록
  if (usable.length === 1) {
    const mapsOnly = toks[usable[0]];
    return {
      rows: mapsOnly.map(m => ({ leftPlayer: "", rightPlayer: "", map: m })),
      detectedP1: false, detectedMaps: true, mapsOnly: true,
    };
  }

  // 맵 줄 먼저 식별 (후보 3줄 이상일 때): 가장 긴 줄 / 중복 토큰 있는 줄 / 이름일치 적은 줄,
  // 길이가 모두 비슷하면 '마지막 줄'(보통 맵을 마지막에 붙여넣음)을 맵으로
  let mapIdx = -1;
  if (usable.length >= 3) {
    const sorted = [...usable].sort((a, b) => {
      if (toks[b].length !== toks[a].length) return toks[b].length - toks[a].length;
      if (stats[b].dup !== stats[a].dup) return stats[b].dup - stats[a].dup;
      return stats[a].nameHits - stats[b].nameHits;
    });
    const top = sorted[0], second = sorted[1];
    if (toks[top].length > toks[second].length || stats[top].dup > 0 || stats[top].nameHits < stats[second].nameHits) {
      mapIdx = top;
    } else {
      mapIdx = usable[usable.length - 1]; // 애매하면 마지막 줄 = 맵
    }
  }

  // 선수 줄: 맵 줄 제외, nameHits·myHit(또는 univHits) 우선 → 상위 2개
  const playerCands = usable.filter(i => i !== mapIdx);
  playerCands.sort((a, b) => {
    if (stats[b].nameHits !== stats[a].nameHits) return stats[b].nameHits - stats[a].nameHits;
    if (universityOf) {
      if (stats[b].univHits !== stats[a].univHits) return stats[b].univHits - stats[a].univHits;
    } else if ((stats[b].myHit ? 1 : 0) !== (stats[a].myHit ? 1 : 0)) {
      return (stats[b].myHit ? 1 : 0) - (stats[a].myHit ? 1 : 0);
    }
    if (stats[a].sentence !== stats[b].sentence) return stats[a].sentence - stats[b].sentence;
    return stats[b].count - stats[a].count;
  });
  const players = playerCands.slice(0, 2);
  if (players.length < 2) return null;

  // P1: 대학대전=대학 매칭 최다 줄, 프로리그=내 이름이 든 줄 (없으면 입력 순서상 먼저 나온 줄)
  let p1i = universityOf
    ? players.find(i => stats[i].univHits > 0)
    : players.find(i => stats[i].myHit);
  const detectedP1 = p1i !== undefined;
  if (p1i === undefined) p1i = Math.min(players[0], players[1]);
  const p2i = players.find(i => i !== p1i)!;

  const left  = toks[p1i];
  const right = toks[p2i];
  const mapsL = mapIdx >= 0 ? toks[mapIdx] : [];
  // 슬롯 수 = 선수/맵 중 더 많은 쪽 (예: 5vs5 + 맵 7개 → 7슬롯, 6·7경기는 맵만)
  const n = Math.max(left.length, right.length, mapsL.length);
  const rows: ParsedRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ leftPlayer: left[i] ?? "", rightPlayer: right[i] ?? "", map: mapsL[i] ?? "" });
  }
  return { rows, detectedP1, detectedMaps: mapIdx >= 0, mapsOnly: false };
}
