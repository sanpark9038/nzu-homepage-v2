"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultOverlayState, setScoreOf, miniAceNeeded, type OverlayEntryRow, type OverlayRace, type OverlaySet, type OverlayState } from "@/lib/overlay-types";
import { RACE_COLORS, raceOfName, type RaceLookupPlayer } from "@/lib/overlay-race";

const POLL_INTERVAL = 500;

// 보드 치수 (스펙 기준, scale=1)
const W        = 600;
const TITLE_H  = 88;
const TEAM_H   = 96;
const PLAYER_H = 64;
const NOTCH_H  = 78;
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

const TH = {
  bg:         "rgba(17, 17, 19, 0.98)",
  bgInner:    "rgba(10, 10, 12, 0.97)",
  bgRow:      "rgba(22, 22, 26, 0.65)",
  bgRowHero:  "rgba(42, 42, 48, 0.8)", // 선수명 행(Row3) — 다크 톤 유지하되 한 단계 밝혀서 구역 구분
  border:     "rgba(200, 202, 208, 0.32)",
  borderDark: "rgba(0, 0, 0, 0.85)",
  divider:    "rgba(255, 255, 255, 0.07)",
  divGlow:    "rgba(255, 255, 255, 0.10)",
  titleBg:    "rgba(8, 8, 10, 0.95)",
  titleText:  "rgba(245, 246, 248, 0.95)",
  accent:     "rgba(225, 227, 232, 0.9)",
  text:       "#ffffff",
  textMuted:  "rgba(228, 229, 233, 0.85)",
};

const SEP = (
  <span style={{ color: "rgba(255,255,255,0.65)", margin: "0 14px", fontSize: "24px", fontWeight: 700 }}>|</span>
);

// ── 엔트리 테이블 ──────────────────────────────────────────

const ET = {
  bg:        "rgba(14, 14, 16, 0.96)",
  header:    "rgba(8, 8, 10, 0.97)",
  border:    "rgba(255, 255, 255, 0.16)",
  divider:   "rgba(255, 255, 255, 0.06)",
  accent:    "rgba(225, 227, 232, 0.85)",
  aceBg:     "rgba(180, 130, 30, 0.12)",
  aceBorder: "rgba(200, 160, 40, 0.60)",
  current:   "rgba(255, 255, 255, 0.07)",
  text:      "rgba(232, 233, 236, 0.90)",
  muted:     "rgba(180, 180, 186, 0.50)",
};

const SET_COL_W = 210;

function mapAbbr(name: string) {
  return name.slice(0, 2);
}

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
  if (!layout.visible || sets.length === 0) return null;

  return (
    <div style={{
      position: "absolute",
      top: layout.y,
      left: layout.x,
      transform: layout.scale !== 1 ? `scale(${layout.scale})` : undefined,
      transformOrigin: "left top",
      display: "flex",
      fontFamily: "'Pretendard Variable','Pretendard','Malgun Gothic',sans-serif",
      borderRadius: "10px",
      overflow: "hidden",
      border: `1px solid ${ET.border}`,
      boxShadow: "0 4px 32px rgba(0,0,0,0.7)",
    }}>
      {sets.map((set, setIdx) => (
        <SetColumn
          key={set.id}
          set={set}
          setIdx={setIdx}
          total={sets.length}
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

function SetColumn({ set, setIdx, total, isActive: _isActive, leftTeam, rightTeam, showSetLabel, mini, raceOf }: {
  set: OverlaySet; setIdx: number; total: number;
  isActive: boolean; leftTeam: string; rightTeam: string; showSetLabel: boolean; mini: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const scoreLeft  = set.entries.filter(e => e.result === "left").length;
  const scoreRight = set.entries.filter(e => e.result === "right").length;
  const setLabel   = mini
    ? (set.isAce ? "슈에" : `${setIdx + 1}SET`)
    : (set.isAce ? "에이스" : `${setIdx + 1}SET`);
  const isLast     = setIdx === total - 1;

  return (
    <div style={{
      width: `${SET_COL_W}px`,
      borderRight: !isLast ? `1px solid ${ET.divider}` : "none",
      background: set.isAce ? ET.aceBg : ET.bg,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* SET 헤더 */}
      <div style={{
        background: ET.header,
        borderBottom: `1px solid ${set.isAce ? ET.aceBorder : ET.border}`,
        padding: "6px 10px 5px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
          {showSetLabel && (
            <span style={{
              fontSize: "10px", fontWeight: 900, letterSpacing: "0.05em",
              color: set.isAce ? "rgba(200,160,40,0.9)" : ET.accent,
            }}>{setLabel}</span>
          )}
          {set.title && (
            <>
              {showSetLabel && <span style={{ color: ET.muted, fontSize: "9px" }}>|</span>}
              <span style={{ fontSize: "10px", color: ET.muted, letterSpacing: "0.03em" }}>{set.title}</span>
            </>
          )}
        </div>
        {/* 팀 스코어 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: ET.text, maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leftTeam || "좌팀"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 900, color: "rgba(225,227,232,0.95)" }}>{scoreLeft}</span>
            <span style={{ fontSize: "10px", color: ET.muted }}>:</span>
            <span style={{ fontSize: "13px", fontWeight: 900, color: "rgba(225,227,232,0.95)" }}>{scoreRight}</span>
          </div>
          <span style={{ fontSize: "11px", fontWeight: 700, color: ET.text, maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{rightTeam || "우팀"}</span>
        </div>
      </div>

      {/* 경기 목록 */}
      {set.entries.map((entry, idx) => (
        <EntryRow key={entry.id} entry={entry} idx={idx} isCurrent={set.currentMatch === idx} raceOf={raceOf} />
      ))}

      {set.entries.length === 0 && (
        <div style={{ padding: "12px 10px", textAlign: "center", color: ET.muted, fontSize: "10px" }}>
          경기 없음
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, idx, isCurrent, raceOf }: {
  entry: OverlayEntryRow; idx: number; isCurrent: boolean;
  raceOf: (name: string) => OverlayRace | undefined;
}) {
  const leftLost  = entry.result === "right";
  const rightLost = entry.result === "left";
  const abbr      = entry.map ? mapAbbr(entry.map) : "";
  // 수동 지정 종족이 있으면 우선, 없으면 선수 DB 자동 인식
  const leftRace  = entry.leftRace  ?? raceOf(entry.leftPlayer);
  const rightRace = entry.rightRace ?? raceOf(entry.rightPlayer);
  // 진 쪽은 취소선 대신 흐리게 (심플하게)
  const nameStyle = (race: OverlayRace | undefined, lost: boolean) => ({
    color: race ? RACE_COLORS[race] : ET.text,
    opacity: lost ? 0.32 : 1,
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "4px 8px",
      background: isCurrent ? ET.current : "transparent",
      borderLeft: isCurrent ? `2px solid ${ET.accent}` : "2px solid transparent",
      gap: "4px",
      minHeight: "24px",
    }}>
      <span style={{ width: "14px", fontSize: "9px", color: isCurrent ? ET.accent : ET.muted, fontWeight: isCurrent ? 900 : 400, flexShrink: 0 }}>
        {idx + 1}
      </span>
      <span style={{
        flex: 1, textAlign: "right", fontSize: "11px", fontWeight: 700,
        ...nameStyle(leftRace, leftLost),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{entry.leftPlayer}</span>
      <span style={{ width: "20px", textAlign: "center", fontSize: "9px", color: ET.muted, flexShrink: 0 }}>{abbr}</span>
      <span style={{
        flex: 1, textAlign: "left", fontSize: "11px", fontWeight: 700,
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
  const [state, setState] = useState<OverlayState>(defaultOverlayState());
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // 선수 DB — 대진표의 이름을 종족 색으로 칠하기 위해 한 번만 불러옴
  const [playerDb, setPlayerDb] = useState<RaceLookupPlayer[]>([]);
  useEffect(() => {
    fetch("/api/players")
      .then(r => r.json())
      .then(p => { if (p.ok) setPlayerDb(p.players.map((x: RaceLookupPlayer) => ({ name: x.name, nickname: x.nickname ?? null, race: x.race }))); })
      .catch(() => {});
  }, []);
  const raceOf = useCallback((name: string) => raceOfName(playerDb, name), [playerDb]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    if (!overlayKey) return;
    const poll = () =>
      fetch(`/api/overlay/state?key=${encodeURIComponent(overlayKey)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(p => { if (p.ok) setState({ ...defaultOverlayState(), ...p.state }); })
        .catch(() => {});
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [overlayKey]);

  if (!overlayKey) return null;

  const { mode, title, left, right, sets, activeSetId, scoreboardLayout, entryLayout, matchFormat } = state;
  const isTeam    = mode === "team";
  const isMini    = matchFormat === "mini";
  // 대전 및 CK는 보통 세트 하나만 진행하므로 SET 표시를 안 함
  const showSetLabel = matchFormat !== "university";

  // 미니대전: 세트 스코어(세트 획득 수) + 슈에 필요 여부
  const setScore   = setScoreOf(sets);
  const aceNeeded  = miniAceNeeded(sets);
  // 세트 승리 조건 (3세트 중 2선승) — 핀 칸 수로 그대로 씀
  const setsToWin  = Math.max(1, Math.ceil(sets.length / 2));
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
        html, body, body > * { background: transparent !important; }
        #main-scroll-container { background: transparent !important; overflow: visible !important; }
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
              <div style={{ position: "absolute", inset: 0, background: TH.bg, clipPath: clipPoly }}>

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
                      <SetPips won={setScore.left} total={setsToWin} />
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
                      <SetPips won={setScore.right} total={setsToWin} mirrored />
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
function SetPips({ won, total, mirrored }: { won: number; total: number; mirrored?: boolean }) {
  const pips = Array.from({ length: total }, (_, i) => i < won);
  const ordered = mirrored ? [...pips].reverse() : pips;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "11px" }}>
      {ordered.map((filled, i) => (
        <span key={i} style={{
          width: "26px", height: "26px", borderRadius: "50%",
          background: filled ? TH.titleText : "transparent",
          border: filled ? "none" : `3px solid rgba(255,255,255,0.35)`,
          boxShadow: filled ? "0 0 12px rgba(255,255,255,0.35)" : "none",
        }} />
      ))}
    </span>
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
