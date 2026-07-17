"use client";

import { useSearchParams } from "next/navigation";
import { setScoreOf, miniAceNeeded, type OverlayEntryRow, type OverlayRace, type OverlaySet } from "@/lib/overlay-types";
import { RACE_COLORS } from "@/lib/overlay-race";
import { ET, mapAbbr, nameColWidth } from "@/lib/overlay-entry-theme";
import { useOverlayLive } from "@/lib/use-overlay-live";

// 보드 치수 (스펙 기준, scale=1)
// 행 높이는 "내용물 + 최소 여백"으로 잡는다 — 뒤 화면을 덜 가리려고 글씨는 그대로 두고 여백만 압축.
// 바닥값: 타이틀=글씨 40 / 팀=스코어박스 56 / 선수=글씨 44 / 노치=배지 48
const W        = 600;
const TITLE_H  = 62;
const TEAM_H   = 66;
const PLAYER_H = 56;
const NOTCH_H  = 70;
const GAP_D    = 59;
const GAP_W    = 224;
const SHOULDER = 36;
const xL  = W / 2 - GAP_W / 2;   // 188
const xR  = W / 2 + GAP_W / 2;   // 412
const xLs = xL - SHOULDER;        // 152
const xRs = xR + SHOULDER;        // 448

function buildSvgPath(h: number) {
  const yi = h - GAP_D;
  return [
    `M 0 0`, `L ${W} 0`, `L ${W} ${h}`,
    `L ${xRs} ${h}`, `L ${xR} ${yi}`,
    `M ${xL} ${yi}`, `L ${xLs} ${h}`,
    `L 0 ${h}`, `L 0 0`,
  ].join(" ");
}

function buildPolygon(h: number) {
  const yi = h - GAP_D;
  return `polygon(0px 0px, ${W}px 0px, ${W}px ${h}px, ${xRs}px ${h}px, ${xR}px ${yi}px, ${xL}px ${yi}px, ${xLs}px ${h}px, 0px ${h}px)`;
}

// 사다리꼴 노치의 "천장" 구간(xL~xR, y=yi) — buildSvgPath에는 이 구간이 없어(펜을 들었다 놓음) 외곽선이 끊겨 보임. 별도로 그려서 이어줌.
function buildNotchTopPath(h: number) {
  const yi = h - GAP_D;
  return `M ${xL} ${yi} L ${xR} ${yi}`;
}

// 색온도는 대진표(overlay-entry-theme의 ET)와 맞춘 딥 네이비 계열.
// 게임 장면에선 이 스코어보드와 대진표 카드가 한 화면에 같이 뜨므로 톤이 어긋나면 안 됨.
const TH = {
  bg:         "rgba(15, 18, 27, 0.98)",
  bgInner:    "rgba(9, 11, 17, 0.97)",
  bgRow:      "rgba(19, 23, 34, 0.65)",
  bgRowHero:  "rgba(34, 41, 60, 0.8)", // 선수명 행(Row3) — 다크 톤 유지하되 한 단계 밝혀서 구역 구분
  border:     "rgba(200, 202, 208, 0.32)",
  borderDark: "rgba(0, 0, 0, 0.85)",
  divider:    "rgba(255, 255, 255, 0.07)",
  divGlow:    "rgba(255, 255, 255, 0.10)",
  // 타이틀 행만 살짝 투명(뒤 화면이 비침) — 55%로 깔리므로 다른 행과 같은 값이면 네이비가 안 보인다.
  // 투명도를 뚫고 색온도가 읽히도록 파란 기를 더 준다.
  titleBg:    "rgba(14, 20, 40, 0.55)",
  titleText:  "rgba(245, 246, 248, 0.95)",
  accent:     "rgba(225, 227, 232, 0.9)",
  text:       "#ffffff",
  textMuted:  "rgba(228, 229, 233, 0.85)",
};

const SEP = (
  <span style={{ color: "rgba(255,255,255,0.65)", margin: "0 14px", fontSize: "24px", fontWeight: 700 }}>|</span>
);

// ── 엔트리 테이블 ──────────────────────────────────────────

const SET_COL_W = 200;

function EntryTable({ sets, activeSetId, leftTeam, rightTeam, layout, showSetLabel, mini, raceOf }: {
  sets: OverlaySet[];
  activeSetId: string | null;
  leftTeam: string;
  rightTeam: string;
  layout: { x: number; y: number; scale: number; visible: boolean };
  showSetLabel: boolean;
  mini: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  // 진행되는 세트만 노출 — 활성 세트이거나, 이미 결과가 하나라도 나온 세트.
  // (처음부터 1SET·2SET·에이스를 다 띄우지 않고, 세트가 시작되면 그때 추가로 나타남)
  // 원래 세트 순번(setIdx)은 라벨용으로 유지.
  const shown = sets
    .map((set, setIdx) => ({ set, setIdx }))
    .filter(({ set }) => set.id === activeSetId || set.entries.some(e => e.result !== null));
  if (!layout.visible || shown.length === 0) return null;

  return (
    <div style={{
      position: "absolute",
      top: layout.y,
      left: layout.x,
      transform: layout.scale !== 1 ? `scale(${layout.scale})` : undefined,
      transformOrigin: "left top",
      display: "flex",
      alignItems: "flex-start", // 세트마다 경기 수가 달라도 각 카드는 자기 내용 높이만
      gap: "8px",               // 세트별 독립 카드 사이 간격
      fontFamily: "'Pretendard Variable','Pretendard','Malgun Gothic',sans-serif",
    }}>
      {shown.map(({ set, setIdx }) => (
        <SetColumn
          key={set.id}
          set={set}
          setIdx={setIdx}
          isActive={set.id === activeSetId}
          leftTeam={leftTeam}
          rightTeam={rightTeam}
          showSetLabel={showSetLabel}
          mini={mini}
          raceOf={raceOf}
        />
      ))}
    </div>
  );
}

function SetColumn({ set, setIdx, isActive: _isActive, leftTeam, rightTeam, showSetLabel, mini, raceOf }: {
  set: OverlaySet; setIdx: number;
  isActive: boolean; leftTeam: string; rightTeam: string; showSetLabel: boolean; mini: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const scoreLeft  = set.entries.filter(e => e.result === "left").length;
  const scoreRight = set.entries.filter(e => e.result === "right").length;
  const setLabel   = mini
    ? (set.isAce ? "슈에" : `${setIdx + 1}SET`)
    : (set.isAce ? "에이스" : `${setIdx + 1}SET`);
  // 선수·맵이 모두 없는 완전 빈 행만 렌더 제외. 맵만 미리 적어둔 행(위너스 대기 경기 등)은 맵을 보여줌.
  const hasContent = (e: OverlayEntryRow) => !!(e.leftPlayer || e.rightPlayer || e.map);
  const hasAnyRow  = set.entries.some(hasContent);
  // 이름 칸 폭 — 이 세트에서 가장 긴 이름 기준(6글자 상한). 모든 행이 같은 폭을 쓰므로 열이 어긋나지 않음
  const nameW = nameColWidth(
    [...set.entries.flatMap(e => [e.leftPlayer, e.rightPlayer]), leftTeam, rightTeam],
    18,
  );

  return (
    <div style={{
      minWidth: `${SET_COL_W}px`,   // 최소 폭은 유지, 이름이 길면 6글자 상한까지 반응형으로 늘어남
      width: "max-content",
      background: set.isAce ? ET.aceBg : ET.bg,
      display: "flex",
      flexDirection: "column",
      // 세트별 독립 카드 — 자기 테두리·모서리·그림자
      border: `1px solid ${set.isAce ? ET.aceBorder : ET.border}`,
      borderRadius: "10px",
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.65)",
    }}>
      {/* SET 헤더 */}
      <div style={{
        background: ET.header,
        borderBottom: `1px solid ${set.isAce ? ET.aceBorder : ET.border}`,
        padding: "2px 8px 3px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", marginBottom: "2px", lineHeight: 1 }}>
          {showSetLabel && (
            <span style={{
              fontSize: "15px", fontWeight: 900, letterSpacing: "0.05em", lineHeight: 1,
              color: set.isAce ? "rgba(200,160,40,0.9)" : ET.accent,
            }}>{setLabel}</span>
          )}
          {set.title && (
            <>
              {showSetLabel && <span style={{ color: ET.muted, fontSize: "13px", lineHeight: 1 }}>|</span>}
              <span style={{ fontSize: "15px", color: ET.muted, letterSpacing: "0.03em", lineHeight: 1 }}>{set.title}</span>
            </>
          )}
        </div>
        {/* 팀 스코어 — 아래 경기행과 같은 열 구조로 정렬(번호칸 자리 · 좌팀=좌선수열 · 스코어=맵열 · 우팀=우선수열) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          <span style={{ width: "16px", flexShrink: 0 }} />
          <span style={{ width: nameW, flexShrink: 0, minWidth: 0, textAlign: "center", fontSize: "16px", fontWeight: 700, color: ET.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>{leftTeam || "좌팀"}</span>
          <div style={{ width: "30px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
            <span style={{ fontSize: "20px", fontWeight: 900, color: "rgba(225,227,232,0.95)", lineHeight: 1 }}>{scoreLeft}</span>
            <span style={{ fontSize: "13px", color: ET.muted, lineHeight: 1 }}>:</span>
            <span style={{ fontSize: "20px", fontWeight: 900, color: "rgba(225,227,232,0.95)", lineHeight: 1 }}>{scoreRight}</span>
          </div>
          <span style={{ width: nameW, flexShrink: 0, minWidth: 0, textAlign: "center", fontSize: "16px", fontWeight: 700, color: ET.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>{rightTeam || "우팀"}</span>
        </div>
      </div>

      {/* 경기 목록 — 선수 또는 맵이 있는 행만 (원래 경기 번호 유지 위해 원본 idx 사용) */}
      {set.entries.map((entry, idx) =>
        hasContent(entry)
          ? <EntryRow key={entry.id} entry={entry} idx={idx} isCurrent={set.currentMatch === idx} nameW={nameW} raceOf={raceOf} />
          : null
      )}

      {!hasAnyRow && (
        <div style={{ padding: "15px 13px", textAlign: "center", color: ET.muted, fontSize: "13px" }}>
          경기 없음
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, idx, isCurrent, nameW, raceOf }: {
  entry: OverlayEntryRow; idx: number; isCurrent: boolean; nameW: number;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const leftLost  = entry.result === "right";
  const rightLost = entry.result === "left";
  const abbr      = entry.map ? mapAbbr(entry.map) : "";
  // 수동 지정 종족이 있으면 우선, 없으면 선수 DB 자동 인식
  const leftRace  = entry.leftRace  ?? raceOf(entry.leftPlayer);
  const rightRace = entry.rightRace ?? raceOf(entry.rightPlayer);
  // 진 쪽은 종족색을 버리고 회색으로 — 흐리게만 하면 주황(P)이 갈색으로 보여 다른 색처럼 읽힘
  const nameStyle = (race: OverlayRace | undefined, lost: boolean) =>
    lost ? { color: ET.lostText } : { color: race ? RACE_COLORS[race] : ET.text };
  // 강조는 "지금 진행 중인 경기"에만 — 결과가 이미 나온 경기는(세트 종료 후 마지막 경기 포함) 강조 안 함
  const active = isCurrent && entry.result === null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "3px 8px",
      background: "transparent",
      // 진행 중 경기: 배경 채움 없이 테두리만 강조 (박스 안쪽 라인 + 은은한 글로우, 정적)
      boxShadow: active ? `inset 0 0 0 2px ${ET.currentBorder}, inset 0 0 9px rgba(255,255,255,0.14)` : undefined,
      borderRadius: active ? "5px" : undefined,
      gap: "4px",
      minHeight: "29px",
    }}>
      <span style={{ width: "16px", fontSize: "15px", color: active ? ET.accent : ET.muted, fontWeight: active ? 900 : 400, flexShrink: 0, lineHeight: 1 }}>
        {idx + 1}
      </span>
      <span style={{
        width: nameW, flexShrink: 0, minWidth: 0, textAlign: "center", fontSize: "18px", fontWeight: 700, lineHeight: 1.1,
        ...nameStyle(leftRace, leftLost),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{entry.leftPlayer}</span>
      <span style={{ width: "30px", textAlign: "center", fontSize: "15px", fontWeight: 600, color: ET.mapText, flexShrink: 0, whiteSpace: "nowrap", lineHeight: 1 }}>{abbr}</span>
      <span style={{
        width: nameW, flexShrink: 0, minWidth: 0, textAlign: "center", fontSize: "18px", fontWeight: 700, lineHeight: 1.1,
        ...nameStyle(rightRace, rightLost),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{entry.rightPlayer}</span>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────

export default function ScoreboardOverlayPage() {
  const searchParams = useSearchParams();
  const overlayKey   = searchParams.get("key") ?? "";
  const { state, raceOf } = useOverlayLive(overlayKey);

  if (!overlayKey) return null;

  const { mode, title, left, right, sets, activeSetId, scoreboardLayout, entryLayout, matchFormat } = state;
  const isTeam    = mode === "team";
  const isMini    = matchFormat === "mini";
  // 대전 및 CK는 보통 세트 하나만 진행하므로 SET 표시를 안 함
  const showSetLabel = matchFormat !== "university";

  // 미니대전: 세트 스코어(세트 획득 수) + 슈에 필요 여부
  const setScore   = setScoreOf(sets);
  const aceNeeded  = miniAceNeeded(sets);
  // 슈에가 불필요(한쪽 2:0)하면 방송 대진표에서 슈에 세트를 숨김
  const visibleSets = isMini && aceNeeded === false ? sets.filter(s => !s.isAce) : sets;

  // 활성 세트에서 스코어·현재맵 파생
  const activeSet   = sets.find(s => s.id === activeSetId) ?? null;
  const activeSetIdx = sets.findIndex(s => s.id === activeSetId);
  const scoreLeft   = activeSet?.entries.filter(e => e.result === "left").length ?? 0;
  const scoreRight  = activeSet?.entries.filter(e => e.result === "right").length ?? 0;
  const currentEntry = activeSet && activeSet.currentMatch !== null ? activeSet.entries[activeSet.currentMatch] : null;
  const currentMap   = currentEntry?.map ?? "";
  const nonAceIdx    = sets.filter(s => !s.isAce).findIndex(s => s.id === activeSetId);
  const setLabel     = isMini
    ? (activeSet?.isAce ? "슈에" : `${(nonAceIdx >= 0 ? nonAceIdx : 0) + 1} SET`)
    : (activeSet?.isAce ? "에이스" : activeSetIdx >= 0 ? `${activeSetIdx + 1} SET` : `${1} SET`);
  // 선수명 행 그라디언트 — 각 선수의 "인게임 스타팅 색상"이 자기 쪽에서 옅게 번지도록
  // (종족은 하단 배지의 T/P/Z 글자가 담당 → 색은 게임 화면과 매칭되는 스타팅 색으로)
  const leftNameColor  = left.startingColor  || "#ffffff";
  const rightNameColor = right.startingColor || "#ffffff";

  const boardH   = TITLE_H + (isTeam ? TEAM_H : 0) + PLAYER_H + NOTCH_H;
  const svgPath  = buildSvgPath(boardH);
  const notchTopPath = buildNotchTopPath(boardH);
  const clipPoly = buildPolygon(boardH);

  const { x: lX, y: lY, scale: lS, visible: lV } = scoreboardLayout;

  return (
    <>
      <style>{`
        @keyframes scorePulse {
          0%   { transform: scale(1);    color: rgba(235,236,240,0.95); }
          40%  { transform: scale(1.18); color: #ffffff; }
          100% { transform: scale(1);    color: rgba(235,236,240,0.95); }
        }
        .score-digit { animation: scorePulse 0.25s ease-out; }
      `}</style>

      {/* 1920×1080 고정 캔버스 */}
      <div style={{
        position: "fixed", inset: 0,
        width: "1920px", height: "1080px",
        background: "transparent",
        pointerEvents: "none",
        overflow: "hidden",
        fontFamily: "'Pretendard Variable','Pretendard','Malgun Gothic',sans-serif",
      }}>

        {/* ── 엔트리 테이블 ── */}
        <EntryTable
          sets={visibleSets}
          activeSetId={activeSetId}
          leftTeam={left.teamName}
          rightTeam={right.teamName}
          layout={entryLayout}
          showSetLabel={showSetLabel}
          mini={isMini}
          raceOf={raceOf}
        />

        {/* ── 스코어보드 ── */}
        {lV && (
          <div style={{
            position: "absolute",
            bottom: lY - GAP_D,
            left: lX,
            width: `${W}px`,
            transform: lS !== 1 ? `scale(${lS})` : undefined,
            transformOrigin: "left bottom",
          }}>
            <div style={{ position: "relative", width: `${W}px`, height: `${boardH}px` }}>

              {/* 보드 본체 */}
              {/* 본체 배경은 타이틀 행(위 TITLE_H px) 아래부터만 칠한다 —
                  그래야 타이틀 행이 자기 titleBg만 갖고 뒤 화면이 비침 */}
              <div style={{
                position: "absolute", inset: 0, clipPath: clipPoly,
                background: `linear-gradient(to bottom, rgba(0,0,0,0) ${TITLE_H}px, ${TH.bg} ${TITLE_H}px)`,
              }}>

                {/* Row 1: 타이틀 (미니대전은 양 끝에 세트 스코어 = 세트 획득 수) */}
                <div style={{
                  position: "relative",
                  background: TH.titleBg,
                  borderBottom: `1px solid ${TH.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: `${TITLE_H}px`, padding: "0 28px",
                }}>
                  {/* 세트 스코어 — 숫자 대신 핀(칸). 칸 수 = 승리에 필요한 세트 수(2선승).
                      도형이라 타이틀 글자·아래 줄 박스 점수와 절대 안 헷갈림 */}
                  {isMini && (
                    <span style={{ position: "absolute", left: "26px", top: "50%", transform: "translateY(-50%)" }}>
                      <SetScoreChip won={setScore.left} />
                    </span>
                  )}
                  {!isTeam && currentMap && (
                    <><span style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.04em", color: TH.textMuted }}>{currentMap}</span>{SEP}</>
                  )}
                  <span style={{ fontSize: "40px", fontWeight: 800, letterSpacing: "0.12em", color: TH.titleText, textTransform: "uppercase" }}>
                    {title || "HOSAGA"}
                  </span>
                  {showSetLabel && (
                    <>
                      {SEP}
                      <span style={{ fontSize: "40px", fontWeight: 800, letterSpacing: "0.12em", color: TH.titleText }}>
                        {setLabel}
                      </span>
                    </>
                  )}
                  {isMini && (
                    <span style={{ position: "absolute", right: "26px", top: "50%", transform: "translateY(-50%)" }}>
                      <SetScoreChip won={setScore.right} />
                    </span>
                  )}
                </div>

                {/* Row 2 (팀전): 팀명 | 스코어 | 팀명 */}
                {isTeam && (
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center", height: `${TEAM_H}px`,
                    padding: "0 32px", gap: "16px",
                    background: TH.bgRow, borderBottom: `1px solid ${TH.divider}`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 ${TH.divGlow}`,
                  }}>
                    <div style={{ fontSize: "38px", fontWeight: 800, color: TH.titleText, letterSpacing: "-0.01em", lineHeight: 1 }}>{left.teamName || " "}</div>
                    <ScoreWidget scoreLeft={scoreLeft} scoreRight={scoreRight} />
                    <div style={{ fontSize: "38px", fontWeight: 800, color: TH.titleText, letterSpacing: "-0.01em", textAlign: "right", lineHeight: 1 }}>{right.teamName || " "}</div>
                  </div>
                )}

                {/* Row 3: 선수명 | 맵/스코어 — 각 선수 종족 색이 자기 쪽에서 옅게 번지는 그라디언트 */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center", height: `${PLAYER_H}px`,
                  padding: "0 32px", gap: "16px",
                  // 좌/우 종족 색 — 135°로 기울여 부드럽지만 대각선 방향이 살아있도록(빛줄기처럼). 가운데 점수 전에 옅어짐
                  background: `linear-gradient(135deg, ${leftNameColor}59 0%, ${leftNameColor}33 18%, transparent 34%), linear-gradient(225deg, ${rightNameColor}59 0%, ${rightNameColor}33 18%, transparent 34%), ${TH.bgRowHero}`,
                  borderBottom: `1px solid ${TH.divider}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 ${TH.divGlow}`,
                }}>
                  <div style={{ fontSize: "44px", fontWeight: 900, color: TH.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{left.playerName || " "}</div>
                  {isTeam
                    ? <div style={{ fontSize: "28px", fontWeight: 800, color: TH.textMuted, letterSpacing: "0.04em", textAlign: "center", minWidth: "80px" }}>{currentMap || ""}</div>
                    : <ScoreWidget scoreLeft={scoreLeft} scoreRight={scoreRight} />}
                  <div style={{ fontSize: "44px", fontWeight: 900, color: TH.text, letterSpacing: "-0.02em", lineHeight: 1, textAlign: "right" }}>{right.playerName || " "}</div>
                </div>

                {/* Row 4: 날개 (사다리꼴 모양 — 보드 전체 clip-path에 맞춰 자동으로 잘림) */}
                <div style={{ position: "relative", height: `${NOTCH_H}px` }}>
                  <Wing side="left"  race={left.race}  point={left.startingPoint}  color={left.startingColor} />
                  <Wing side="right" race={right.race} point={right.startingPoint} color={right.startingColor} />
                </div>
              </div>

              {/* SVG 테두리 */}
              <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width={W} height={boardH} viewBox={`0 0 ${W} ${boardH}`}>
                <path d={svgPath} fill="none" stroke={TH.borderDark} strokeWidth="5"  strokeLinejoin="miter" />
                <path d={svgPath} fill="none" stroke={TH.border}     strokeWidth="2"  strokeLinejoin="miter" />
                <path d={svgPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeLinejoin="miter" />
                {/* 노치 천장(사다리꼴 윗변) — 위 경로에는 없는 구간이라 따로 이어서 외곽선 끊김 방지 */}
                <path d={notchTopPath} fill="none" stroke={TH.borderDark} strokeWidth="5" />
                <path d={notchTopPath} fill="none" stroke={TH.border}     strokeWidth="2" />
                <path d={notchTopPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Wing({ side, race, point, color }: { side: "left" | "right"; race: string; point: string; color: string }) {
  return (
    <div style={{
      position: "absolute", [side]: 0, top: 0,
      width: `${xLs}px`, height: `${NOTCH_H}px`,
      display: "flex", alignItems: "center",
      justifyContent: side === "left" ? "flex-start" : "flex-end",
      paddingLeft:  side === "left"  ? "20px" : "0",
      paddingRight: side === "right" ? "20px" : "0",
    }}>
      <RaceStartBadge race={race} point={point} color={color} />
    </div>
  );
}

function ScoreWidget({ scoreLeft, scoreRight }: { scoreLeft: number; scoreRight: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: TH.bgInner, border: `1.5px solid ${TH.border}`,
      borderRadius: "6px", overflow: "hidden",
      minWidth: "140px",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.5)",
    }}>
      <ScoreBox score={scoreLeft} />
      <div style={{ padding: "0 12px", fontSize: "30px", fontWeight: 900, color: TH.accent, borderLeft: `1px solid ${TH.border}`, borderRight: `1px solid ${TH.border}`, height: "56px", display: "flex", alignItems: "center", lineHeight: 1 }}>:</div>
      <ScoreBox score={scoreRight} />
    </div>
  );
}

function ScoreBox({ score }: { score: number }) {
  return (
    <div key={score} className="score-digit" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minWidth: "66px", height: "56px",
      fontSize: "42px", fontWeight: 900, lineHeight: 1,
      color: "rgba(235,236,240,0.95)", letterSpacing: "-0.02em",
    }}>{score}</div>
  );
}

// 세트 스코어 핀 — total칸 중 won칸이 채워짐 (예: ●○ = 1승, ●● = 2승·매치 승리)
// 바깥쪽부터 안쪽으로 채워지도록 우측은 mirrored
// 세트 스코어(획득 세트 수). 아래 줄의 경기 스코어(0 : 1)와 헷갈리지 않게
// 숫자를 칩(테두리 박스)에 담아 형태로 구분한다.
function SetScoreChip({ won }: { won: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: "46px", height: "46px", padding: "0 11px",
      borderRadius: "11px",
      background: "rgba(255,255,255,0.09)",
      border: "2px solid rgba(255,255,255,0.32)",
      color: TH.titleText, fontSize: "34px", fontWeight: 900, lineHeight: 1,
    }}>{won}</span>
  );
}

function RaceStartBadge({ race, point: pointRaw, color }: { race: string; point: string; color: string }) {
  const r = ["T", "P", "Z"].includes(race) ? race : "";
  // 배지 전체를 한 색으로 — 그 선수의 인게임 스타팅 색상(없으면 흰색).
  // 종족색을 따로 쓰면 배지 안에 색이 두 개라 시청자가 헷갈림.
  const badgeColor = color || "#ffffff";
  const point = pointRaw.replace(/시$/, ""); // 과거 저장값("12시") 호환 — 방송 화면엔 숫자만 표시
  if (!r && !point) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      height: "48px", borderRadius: "7px",
      background: "rgba(255,255,255,0.05)",
      border: `1.5px solid ${badgeColor}90`,
      padding: "0 15px", boxShadow: `0 0 12px ${badgeColor}22`,
    }}>
      {r     && <span style={{ fontSize: "32px", fontWeight: 900, color: badgeColor, lineHeight: 1 }}>{r}</span>}
      {point && <span style={{ fontSize: "32px", fontWeight: 900, color: badgeColor, lineHeight: 1 }}>{point}</span>}
    </span>
  );
}
