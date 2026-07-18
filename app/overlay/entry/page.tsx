"use client";

// 풀캠 등 "스코어보드가 없는 장면"용 대진표 전용 오버레이.
// 스코어보드 안의 가로 대진표와 목적이 다르다 — 여기선 전체 판세를 보여주므로
//   · 세로로 모든 세트를 쌓고
//   · 아직 시작 안 한 세트·빈 행도 그대로 노출한다.
// 관리자의 대진표 X/Y/크기/표시 슬라이더는 의도적으로 무시한다.
// (게임 장면에서 대진표를 숨겨도 이 화면은 남아야 하므로.)
// 크기: 보드가 브라우저 소스 안에 최대로 들어차게 확대(contain) → OBS에서 소스를 줄이는 게 곧 크기 조절.
// 소스는 1920×1080 권장(크게 렌더해서 줄이면 항상 선명), 남는 부분은 투명.
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { setScoreOf, setWinnerOf, type OverlayEntryRow, type OverlayRace, type OverlayResult, type OverlaySet } from "@/lib/overlay-types";
import { RACE_COLORS } from "@/lib/overlay-race";
import { ET, EDGE_LINE, CENTER_LINE, mapAbbr } from "@/lib/overlay-entry-theme";
import { useOverlayLive } from "@/lib/use-overlay-live";

const BOARD_W = 430;

// 열 치수 — 헤더와 경기 행이 같은 값을 써야 세로로 정렬됨 (한 곳에서만 관리)
const IDX_W   = 18; // 경기 번호 칸
const RACE_W  = 21; // 종족 태그
const MAP_W   = 38; // 맵 약자
const ROW_GAP = 9;  // 선수명 ↔ 종족 태그 간격
const MAP_GAP = 6;  // 맵 양옆 추가 여백 — 가운데가 덜 뭉치게 맵만 더 벌림
const MID_W   = RACE_W + MAP_W + RACE_W + ROW_GAP * 2 + MAP_GAP * 2; // 종족|맵|종족 = 헤더 점수 자리

function EntryBoardInner() {
  const searchParams = useSearchParams();
  const overlayKey   = searchParams.get("key") ?? "";
  const { state, raceOf } = useOverlayLive(overlayKey);

  const { left, right, sets, activeSetId, matchFormat } = state;
  const isMini = matchFormat === "mini";
  // 대전 및 CK는 단판이라 세트 개념이 없음 → "1SET" 라벨을 숨긴다 (스코어보드와 같은 규칙)
  const showSetLabel = matchFormat !== "university";
  const hasBoard = !!overlayKey && sets.length > 0;

  // 소스 크기가 뭐든 대진표 전체가 안에 들어오게 — 가로·세로 중 먼저 닿는 쪽에 맞춰 확대(contain).
  // 가로에만 맞추면 1920×1080 소스에서 세로가 잘림. 높이는 세트 수에 따라 변해서 실측(ResizeObserver).
  // calc(100vw/430px) 나눗셈은 OBS 내장 브라우저(구형 Chromium)가 못 읽어서 JS로 계산.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(
      window.innerWidth / BOARD_W,
      window.innerHeight / Math.max(el.offsetHeight, 1),
    ));
    update();
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { window.removeEventListener("resize", update); ro.disconnect(); };
  }, [hasBoard]);

  if (!hasBoard) return null;

  // 맨 위 헤더 칩 — 세트가 여럿이면 "획득 세트 수", 단판이면 세트 수가 무의미하므로 "경기 스코어"
  const headScore = showSetLabel
    ? setScoreOf(sets)
    : {
        left:  sets[0].entries.filter(e => e.result === "left").length,
        right: sets[0].entries.filter(e => e.result === "right").length,
      };

  return (
    <div ref={boardRef} style={{
      position: "absolute", top: 0, left: 0,
      // 첫 프레임은 실측 전(scale=0) — 원본 크기로 그려두고 숨겼다가 측정 후 노출
      visibility: scale ? "visible" : "hidden",
      transform: `scale(${scale || 1})`,
      transformOrigin: "left top",
      width: `${BOARD_W}px`,
      fontFamily: "'Pretendard Variable','Pretendard','Malgun Gothic',sans-serif",
      background: ET.bg,
      border: `1px solid ${ET.border}`,
      borderRadius: "12px",
      overflow: "hidden",
      // 바깥 그림자 없음 — OBS 투명 배경 위에 그림자가 떠 보여서 지저분함
    }}>
      {/* 전체 헤더 — 팀명 + 점수. 아래 경기 행과 같은 열 구조로 맞춘다
          (번호칸 자리 · 좌팀=좌선수열 · 점수=종족/맵 가운데 · 우팀=우선수열)
          가로 여백도 경기 행과 동일: 행의 margin 6 + padding 10 = 16 */}
      <div style={{
        background: ET.boardHeader,
        boxShadow: ET.boardEdge,
        display: "flex", alignItems: "center", gap: `${ROW_GAP}px`,
        padding: "7px 16px",
      }}>
        <span style={{ width: `${IDX_W}px`, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "22px", fontWeight: 800, color: ET.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>
          {left.teamName || "좌팀"}
        </span>
        <div style={{ width: `${MID_W}px`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <SetScoreChip won={headScore.left} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: ET.muted, lineHeight: 1 }}>vs</span>
          <SetScoreChip won={headScore.right} />
        </div>
        <span style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "22px", fontWeight: 800, color: ET.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>
          {right.teamName || "우팀"}
        </span>
      </div>
      {/* 보드 헤더 ↔ 첫 세트 헤더 — 세트 사이와 같은 양끝 페이드 선.
          모든 세트 헤더가 EDGE_LINE 아래에 오게 되어 규칙이 하나로 통일됨 */}
      <div style={{ height: "1px", background: EDGE_LINE }} />

      {sets.map((set, i) => (
        <SetBlock
          key={set.id}
          set={set}
          label={showSetLabel ? setLabelOf(set, sets, isMini) : ""}
          // 단판(대전 및 CK)은 세트 헤더가 맨 위 헤더와 같은 점수를 반복할 뿐이라 숨긴다
          showHeader={showSetLabel}
          isActive={set.id === activeSetId}
          isLast={i === sets.length - 1}
          raceOf={raceOf}
        />
      ))}
    </div>
  );
}

// useSearchParams()는 Suspense 경계가 필요(빌드 프리렌더 CSR bailout) — 오버레이는 어차피 클라 전용
export default function EntryBoardOverlayPage() {
  return <Suspense fallback={null}><EntryBoardInner /></Suspense>;
}

// 세트 이름 — 원래 순번 기준(숨겨진 세트가 있어도 번호가 밀리지 않게)
function setLabelOf(set: OverlaySet, all: OverlaySet[], mini: boolean) {
  if (set.isAce) return mini ? "슈에" : "에이스";
  return `${all.findIndex(s => s.id === set.id) + 1}SET`;
}

function SetBlock({ set, label, showHeader, isActive, isLast, raceOf }: {
  set: OverlaySet; label: string; showHeader: boolean; isActive: boolean; isLast: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const l = set.entries.filter(e => e.result === "left").length;
  const r = set.entries.filter(e => e.result === "right").length;
  const winner = setWinnerOf(set);
  // 세트 승패는 W/L 배지 하나로만 말한다 — 초록 틴트까지 쓰면 같은 사실을 두 번 말하는 셈
  const headerBase = set.isAce ? ET.aceBg : ET.header;

  return (
    <div>
      {/* 세트 헤더 — W/L 배지 + 세트 안 경기 스코어 + 세트명.
          가운데로 뭉쳐서 배치 — 양 끝으로 벌리면 시선이 흩어짐 */}
      {showHeader && (<>
      <div style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "9px",
        padding: "4px 12px",
        background: headerBase,
        boxShadow: ET.topHighlight,
      }}>
        {/* 진행 중인 세트만 왼쪽에 세로 액센트 바 — 테두리로 두르면 무거움 */}
        {isActive && (
          <span style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            width: "3px", height: "62%", borderRadius: "0 2px 2px 0",
            background: ET.currentBorder,
          }} />
        )}
        <WinBadge side="left" winner={winner} />
        <span style={{ fontSize: "21px", fontWeight: 900, color: ET.text, lineHeight: 1, minWidth: "16px", textAlign: "right" }}>{l}</span>
        {/* 라벨이 없으면(대전 및 CK 단판) 빈 칸을 남기지 않고 점수·배지가 가운데로 모이게 */}
        {label && (
          <span style={{
            minWidth: "80px", textAlign: "center", fontSize: "16px", fontWeight: 900, letterSpacing: "0.05em", lineHeight: 1,
            color: set.isAce ? ET.aceText : ET.accent,
          }}>{label}</span>
        )}
        <span style={{ fontSize: "21px", fontWeight: 900, color: ET.text, lineHeight: 1, minWidth: "16px", textAlign: "left" }}>{r}</span>
        <WinBadge side="right" winner={winner} />
      </div>
      {/* 세트 헤더 아래 — 가운데가 밝고 양 끝으로 사라지는 선 */}
      <div style={{ height: "1px", background: CENTER_LINE }} />
      </>)}

      {/* 경기 행 — 아직 안 채운 빈 행도 그대로 노출(전체 판세를 보여주는 게 목적) */}
      {set.entries.map((entry, idx) => (
        // 세트 승패가 이미 확정됐으면(예: 5경기 중 3:1) 남은 경기는 치르지 않음 — 강조 테두리도 없어야 함
        <EntryLine key={entry.id} entry={entry} idx={idx} isCurrent={winner === null && set.currentMatch === idx} raceOf={raceOf} />
      ))}

      {/* 세트 사이 구분 — 양 끝이 사라지는 얇은 선 */}
      {!isLast && <div style={{ height: "1px", background: EDGE_LINE }} />}
    </div>
  );
}

function WinBadge({ side, winner }: { side: "left" | "right"; winner: OverlayResult }) {
  const decided = winner !== null;
  const won = winner === side;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: "24px", height: "22px", borderRadius: "5px", flexShrink: 0,
      fontSize: "15px", fontWeight: 900, lineHeight: 1,
      background: won ? "rgba(120,220,150,0.16)" : "transparent",
      border: `1.5px solid ${won ? ET.win : "rgba(255,255,255,0.16)"}`,
      color: won ? ET.win : ET.muted,
      // 승패 확정 전엔 빈 박스를 그리지 않는다 — 자리만 유지해 확정 시 레이아웃이 안 밀리게
      visibility: decided ? "visible" : "hidden",
    }}>{decided ? (won ? "W" : "L") : ""}</span>
  );
}

function EntryLine({ entry, idx, isCurrent, raceOf }: {
  entry: OverlayEntryRow; idx: number; isCurrent: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const leftRace  = entry.leftRace  ?? raceOf(entry.leftPlayer);
  const rightRace = entry.rightRace ?? raceOf(entry.rightPlayer);
  // 진 쪽은 종족색 대신 중립 회색 (주황 P를 흐리면 갈색으로 보여서).
  // 이긴 쪽은 자기 종족색으로 은은히 빛나게 — 죽이기만 하면 "이긴 쪽"이 안 보임
  const nameStyle = (race: OverlayRace | undefined, side: "left" | "right") => {
    if (entry.result && entry.result !== side) return { color: ET.lostText };
    const color = race ? RACE_COLORS[race] : ET.text;
    return entry.result === side
      ? { color, textShadow: `0 0 10px ${color}66` }
      : { color };
  };
  const active = isCurrent && entry.result === null;
  // 진행 중 경기: 두 선수의 종족색 그라디언트 테두리 — 움직임 없이(경쟁사는 흰 테두리 펄스)
  // 우리 색 언어(종족색)로 구분. 테두리만 그려야 해서 마스크로 가운데를 뚫는다.
  const borderFrom = leftRace  ? RACE_COLORS[leftRace]  : ET.currentBorder;
  const borderTo   = rightRace ? RACE_COLORS[rightRace] : ET.currentBorder;

  return (
    <div style={{
      position: "relative",
      display: "flex", alignItems: "center", gap: `${ROW_GAP}px`,
      padding: "3px 10px", minHeight: "33px",
      margin: "1px 6px",
      borderRadius: "6px",
      background: ET.rowBoxDark,
    }}>
      {active && (
        <span style={{
          position: "absolute", inset: 0, borderRadius: "6px", padding: "2px",
          background: `linear-gradient(90deg, ${borderFrom}, ${borderTo})`,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }} />
      )}
      <span style={{ width: `${IDX_W}px`, flexShrink: 0, fontSize: "15px", lineHeight: 1, color: active ? ET.accent : ET.muted, fontWeight: active ? 900 : 400 }}>
        {idx + 1}
      </span>
      <span style={{
        flex: 1, minWidth: 0, textAlign: "right", fontSize: "21px", fontWeight: 700, lineHeight: 1.1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        ...nameStyle(leftRace, "left"),
      }}>{entry.leftPlayer}</span>
      <RaceTag race={leftRace} lost={entry.result === "right"} />
      <span style={{ width: `${MAP_W}px`, margin: `0 ${MAP_GAP}px`, flexShrink: 0, textAlign: "center", fontSize: "15px", fontWeight: 600, color: ET.mapText, whiteSpace: "nowrap", lineHeight: 1 }}>
        {entry.map ? mapAbbr(entry.map) : ""}
      </span>
      <RaceTag race={rightRace} lost={entry.result === "left"} />
      <span style={{
        flex: 1, minWidth: 0, textAlign: "left", fontSize: "21px", fontWeight: 700, lineHeight: 1.1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        ...nameStyle(rightRace, "right"),
      }}>{entry.rightPlayer}</span>
    </div>
  );
}

// 종족 태그 — 이름 옆에 작게. 종족색은 overlay-race.ts 한 곳에서만 관리.
// 진 쪽은 이름과 마찬가지로 중립 회색 — 배지까지 같이 죽어야 승패 대비가 확실해짐
// (종족색을 흐리기만 하면 주황 P가 갈색으로 보여서 다른 색처럼 읽힘)
function RaceTag({ race, lost }: { race: OverlayRace | undefined; lost: boolean }) {
  if (!race) return <span style={{ width: "17px", flexShrink: 0 }} />;
  return (
    <span style={{
      width: `${RACE_W}px`, height: `${RACE_W}px`, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      borderRadius: "4px", fontSize: "14px", fontWeight: 900, lineHeight: 1,
      background: lost ? "rgba(150,152,158,0.12)" : `${RACE_COLORS[race]}22`,
      color: lost ? ET.lostText : RACE_COLORS[race],
    }}>{race}</span>
  );
}

// 획득 세트 수 — 세트 안 경기 스코어와 헷갈리지 않게 칩(박스)으로 형태를 구분
function SetScoreChip({ won }: { won: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: "30px", height: "30px", padding: "0 7px", flexShrink: 0,
      borderRadius: "8px",
      background: "rgba(255,255,255,0.09)",
      border: "1.5px solid rgba(255,255,255,0.30)",
      color: ET.text, fontSize: "21px", fontWeight: 900, lineHeight: 1,
    }}>{won}</span>
  );
}
