"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultOverlayState, type OverlayEntryRow, type OverlaySet, type OverlayState } from "@/lib/overlay-types";

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

const RACE_COLORS: Record<string, string> = { T: "#4A9EFF", P: "#FFD700", Z: "#A855F7" };

const TH = {
  bg:         "rgba(17, 17, 19, 0.98)",
  bgInner:    "rgba(10, 10, 12, 0.97)",
  bgRow:      "rgba(22, 22, 26, 0.65)",
  border:     "rgba(165, 72, 62, 1.00)",
  borderDark: "rgba(80, 28, 24, 1.00)",
  divider:    "rgba(255, 255, 255, 0.07)",
  divGlow:    "rgba(165, 72, 62, 0.25)",
  titleBg:    "rgba(8, 8, 10, 0.95)",
  titleText:  "rgba(210, 196, 168, 0.92)",
  accent:     "#c4714a",
  text:       "#ffffff",
  textMuted:  "rgba(175, 165, 145, 0.55)",
};

const SEP = (
  <span style={{ color: "rgba(165,72,62,0.65)", margin: "0 9px", fontSize: "11px" }}>|</span>
);

// ── 엔트리 테이블 ──────────────────────────────────────────

const ET = {
  bg:        "rgba(14, 14, 16, 0.96)",
  header:    "rgba(8, 8, 10, 0.97)",
  border:    "rgba(165, 72, 62, 0.55)",
  divider:   "rgba(255, 255, 255, 0.06)",
  accent:    "rgba(165, 72, 62, 0.80)",
  aceBg:     "rgba(180, 130, 30, 0.12)",
  aceBorder: "rgba(200, 160, 40, 0.60)",
  current:   "rgba(165, 72, 62, 0.12)",
  text:      "rgba(220, 210, 190, 0.90)",
  muted:     "rgba(160, 150, 130, 0.50)",
  lost:      "rgba(120, 110, 95, 0.35)",
};

const SET_COL_W = 210;

function mapAbbr(name: string) {
  return name.slice(0, 2);
}

function EntryTable({ sets, activeSetId, leftTeam, rightTeam, layout }: {
  sets: OverlaySet[];
  activeSetId: string | null;
  leftTeam: string;
  rightTeam: string;
  layout: { x: number; y: number; scale: number; visible: boolean };
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
        />
      ))}
    </div>
  );
}

function SetColumn({ set, setIdx, total, isActive: _isActive, leftTeam, rightTeam }: {
  set: OverlaySet; setIdx: number; total: number;
  isActive: boolean; leftTeam: string; rightTeam: string;
}) {
  const scoreLeft  = set.entries.filter(e => e.result === "left").length;
  const scoreRight = set.entries.filter(e => e.result === "right").length;
  const setLabel   = set.isAce ? "에이스" : `${setIdx + 1}SET`;
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
          <span style={{
            fontSize: "10px", fontWeight: 900, letterSpacing: "0.05em",
            color: set.isAce ? "rgba(200,160,40,0.9)" : ET.accent,
          }}>{setLabel}</span>
          {set.title && (
            <>
              <span style={{ color: ET.muted, fontSize: "9px" }}>|</span>
              <span style={{ fontSize: "10px", color: ET.muted, letterSpacing: "0.03em" }}>{set.title}</span>
            </>
          )}
        </div>
        {/* 팀 스코어 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: ET.text, maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leftTeam || "좌팀"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 900, color: "rgba(184,120,120,0.95)" }}>{scoreLeft}</span>
            <span style={{ fontSize: "10px", color: ET.muted }}>:</span>
            <span style={{ fontSize: "13px", fontWeight: 900, color: "rgba(104,136,176,0.95)" }}>{scoreRight}</span>
          </div>
          <span style={{ fontSize: "11px", fontWeight: 700, color: ET.text, maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{rightTeam || "우팀"}</span>
        </div>
      </div>

      {/* 경기 목록 */}
      {set.entries.map((entry, idx) => (
        <EntryRow key={entry.id} entry={entry} idx={idx} isCurrent={set.currentMatch === idx} />
      ))}

      {set.entries.length === 0 && (
        <div style={{ padding: "12px 10px", textAlign: "center", color: ET.muted, fontSize: "10px" }}>
          경기 없음
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, idx, isCurrent }: { entry: OverlayEntryRow; idx: number; isCurrent: boolean }) {
  const leftLost  = entry.result === "right";
  const rightLost = entry.result === "left";
  const abbr      = entry.map ? mapAbbr(entry.map) : "";

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
        flex: 1, textAlign: "right", fontSize: "11px", fontWeight: 600,
        color: leftLost ? ET.lost : ET.text,
        textDecoration: leftLost ? "line-through" : "none",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{entry.leftPlayer}</span>
      <span style={{ width: "20px", textAlign: "center", fontSize: "9px", color: ET.muted, flexShrink: 0 }}>{abbr}</span>
      <span style={{
        flex: 1, textAlign: "left", fontSize: "11px", fontWeight: 600,
        color: rightLost ? ET.lost : ET.text,
        textDecoration: rightLost ? "line-through" : "none",
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

  const { mode, title, left, right, sets, activeSetId, scoreboardLayout, entryLayout } = state;
  const isTeam    = mode === "team";

  // 활성 세트에서 스코어·현재맵 파생
  const activeSet   = sets.find(s => s.id === activeSetId) ?? null;
  const activeSetIdx = sets.findIndex(s => s.id === activeSetId);
  const scoreLeft   = activeSet?.entries.filter(e => e.result === "left").length ?? 0;
  const scoreRight  = activeSet?.entries.filter(e => e.result === "right").length ?? 0;
  const currentEntry = activeSet && activeSet.currentMatch !== null ? activeSet.entries[activeSet.currentMatch] : null;
  const currentMap   = currentEntry?.map ?? "";
  const setLabel     = activeSet?.isAce ? "에이스" : activeSetIdx >= 0 ? `${activeSetIdx + 1} SET` : `${1} SET`;

  const boardH   = TITLE_H + (isTeam ? TEAM_H : 0) + PLAYER_H + NOTCH_H;
  const svgPath  = buildSvgPath(boardH);
  const clipPoly = buildPolygon(boardH);

  const { x: lX, y: lY, scale: lS, visible: lV } = scoreboardLayout;

  return (
    <>
      <style>{`
        html, body, body > * { background: transparent !important; }
        #main-scroll-container { background: transparent !important; overflow: visible !important; }
        @keyframes scorePulse {
          0%   { transform: scale(1);    color: rgba(212,196,168,0.95); }
          40%  { transform: scale(1.18); color: #f0c040; }
          100% { transform: scale(1);    color: rgba(212,196,168,0.95); }
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
          sets={sets}
          activeSetId={activeSetId}
          leftTeam={left.teamName}
          rightTeam={right.teamName}
          layout={entryLayout}
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

                {/* Row 1: 타이틀 */}
                <div style={{
                  background: TH.titleBg,
                  borderBottom: `1px solid ${TH.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: `${TITLE_H}px`, padding: "0 28px",
                }}>
                  {!isTeam && currentMap && (
                    <><span style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "0.06em", color: TH.textMuted }}>{currentMap}</span>{SEP}</>
                  )}
                  <span style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "0.18em", color: TH.titleText, textTransform: "uppercase" }}>
                    {title || "HOSAGA"}
                  </span>
                  {SEP}
                  <span style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "0.18em", color: TH.titleText }}>
                    {setLabel}
                  </span>
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
                    <div style={{ fontSize: "32px", fontWeight: 800, color: TH.titleText, letterSpacing: "-0.01em" }}>{left.teamName || " "}</div>
                    <ScoreWidget scoreLeft={scoreLeft} scoreRight={scoreRight} />
                    <div style={{ fontSize: "32px", fontWeight: 800, color: TH.titleText, letterSpacing: "-0.01em", textAlign: "right" }}>{right.teamName || " "}</div>
                  </div>
                )}

                {/* Row 3: 선수명 | 맵/스코어 */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center", height: `${PLAYER_H}px`,
                  padding: "0 32px", gap: "16px",
                  background: TH.bgRow, borderBottom: `1px solid ${TH.divider}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 ${TH.divGlow}`,
                }}>
                  <div style={{ fontSize: "38px", fontWeight: 900, color: TH.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{left.playerName || " "}</div>
                  {isTeam
                    ? <div style={{ fontSize: "18px", fontWeight: 600, color: TH.textMuted, letterSpacing: "0.06em", textAlign: "center", minWidth: "80px" }}>{currentMap || ""}</div>
                    : <ScoreWidget scoreLeft={scoreLeft} scoreRight={scoreRight} />}
                  <div style={{ fontSize: "38px", fontWeight: 900, color: TH.text, letterSpacing: "-0.02em", lineHeight: 1, textAlign: "right" }}>{right.playerName || " "}</div>
                </div>

                {/* Row 4: 날개 */}
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
      minWidth: "130px",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.5)",
    }}>
      <ScoreBox score={scoreLeft} />
      <div style={{ padding: "0 12px", fontSize: "26px", fontWeight: 900, color: TH.accent, borderLeft: `1px solid ${TH.border}`, borderRight: `1px solid ${TH.border}`, height: "52px", display: "flex", alignItems: "center" }}>:</div>
      <ScoreBox score={scoreRight} />
    </div>
  );
}

function ScoreBox({ score }: { score: number }) {
  return (
    <div key={score} className="score-digit" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minWidth: "60px", height: "52px",
      fontSize: "36px", fontWeight: 900,
      color: "rgba(212,196,168,0.95)", letterSpacing: "-0.02em",
    }}>{score}</div>
  );
}

function RaceStartBadge({ race, point, color }: { race: string; point: string; color: string }) {
  const r = ["T", "P", "Z"].includes(race) ? race : "";
  const raceColor  = RACE_COLORS[r] ?? "rgba(175,165,145,0.8)";
  const badgeColor = color || raceColor;
  if (!r && !point) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      height: "44px", borderRadius: "7px",
      background: `${badgeColor}15`, border: `1.5px solid ${badgeColor}90`,
      padding: "0 14px", boxShadow: `0 0 12px ${badgeColor}22`,
    }}>
      {r     && <span style={{ fontSize: "30px", fontWeight: 900, color: raceColor,  lineHeight: 1 }}>{r}</span>}
      {point && <span style={{ fontSize: "28px", fontWeight: 900, color: badgeColor, lineHeight: 1 }}>{point}</span>}
    </span>
  );
}
