"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultOverlayState, type OverlayState } from "@/lib/overlay-types";

const POLL_INTERVAL = 2000;

// 920px 기준 클립패스 (gapW=224, gapD=59, shoulder=36)
const BOARD_CLIP =
  "polygon(0 0, 100% 0, 100% 100%, 608px 100%, 572px calc(100% - 59px), 348px calc(100% - 59px), 312px 100%, 0 100%)";

const RACE_COLORS: Record<string, string> = {
  T: "#4A9EFF",
  P: "#FFD700",
  Z: "#A855F7",
};

// SC1 BW 인터페이스 테마
const THEME = {
  bg: "rgba(26, 23, 20, 0.97)",           // 따뜻한 다크 차콜
  bgInner: "rgba(19, 17, 15, 0.95)",      // 패널 내부 더 어둡게
  border: "rgba(140, 60, 55, 0.75)",      // 녹슨 크림슨 테두리
  borderFaint: "rgba(140, 60, 55, 0.25)", // 희미한 내부 구분선
  titleBg: "rgba(14, 12, 10, 0.80)",      // 타이틀 띠
  titleText: "rgba(212, 196, 168, 0.92)", // 크림 오프화이트
  accent: "#c4714a",                       // 구리빛 러스트 포인트
  gold: "#f0c040",                         // 승리 금색 (약간 따뜻하게)
  textMuted: "rgba(180, 165, 140, 0.55)", // 뮤티드 크림
};

export default function OverlayViewPage() {
  const searchParams = useSearchParams();
  const overlayKey = searchParams.get("key") ?? "";
  const [state, setState] = useState<OverlayState>(defaultOverlayState());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.querySelectorAll<HTMLElement>("body > *").forEach((el) => {
      el.style.background = "transparent";
    });
  }, []);

  useEffect(() => {
    if (!overlayKey) return;
    const poll = () => {
      fetch(`/api/overlay/state?key=${encodeURIComponent(overlayKey)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((p) => { if (p.ok) setState(p.state); })
        .catch(() => {});
    };
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [overlayKey]);

  if (!overlayKey) return null;

  const { mode, title, left, right, scoreboardLayout, entryLayout } = state;
  const activeSet   = state.sets.find(s => s.id === state.activeSetId) ?? null;
  const activeSetIdx = state.sets.findIndex(s => s.id === state.activeSetId);
  const setLabel    = activeSet?.isAce ? "에이스" : activeSetIdx >= 0 ? `${activeSetIdx + 1}` : "";
  const entry       = activeSet?.entries ?? [];
  const currentMatch = activeSet?.currentMatch ?? null;
  const scoreLeft   = entry.filter(e => e.result === "left").length;
  const scoreRight  = entry.filter(e => e.result === "right").length;

  return (
    <>
      <style>{`
        html, body, body > * { background: transparent !important; }
        #main-scroll-container { background: transparent !important; overflow: visible !important; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, width: "1920px", height: "1080px", background: "transparent", pointerEvents: "none", overflow: "hidden" }}>

        {/* 스코어보드 */}
        {scoreboardLayout.visible && (
          <div style={{
            position: "absolute",
            left: scoreboardLayout.x,
            top: scoreboardLayout.y,
            transform: `scale(${scoreboardLayout.scale})`,
            transformOrigin: "top left",
            width: "920px",
          }}>
            <div style={{
              width: "920px",
              background: THEME.bg,
              border: `1.5px solid ${THEME.border}`,
              borderBottom: "none",
              clipPath: BOARD_CLIP,
              fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
              color: THEME.titleText,
              paddingBottom: "59px",
              boxShadow: `inset 0 1px 0 rgba(212,180,140,0.08), 0 4px 32px rgba(0,0,0,0.7)`,
            }}>
              {/* 타이틀 띠 */}
              <div style={{
                background: THEME.titleBg,
                borderBottom: `1.5px solid ${THEME.border}`,
                textAlign: "center",
                padding: "9px 0",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: THEME.titleText,
                textTransform: "uppercase",
              }}>
                {title || "HOSAGA"}&nbsp;&nbsp;
                <span style={{ color: THEME.accent, fontWeight: 900 }}>|</span>
                &nbsp;&nbsp;{setLabel ? `${setLabel} SET` : ""}
              </div>

              {/* 팀명 + 스코어 (팀 경기) */}
              {mode === "team" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "10px 40px", gap: "16px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: THEME.titleText, letterSpacing: "0.04em" }}>{left.teamName}</span>
                  <div style={{
                    display: "flex", alignItems: "center",
                    background: THEME.bgInner,
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}>
                    <ScoreBox score={scoreLeft} color={THEME.titleText} />
                    <span style={{ padding: "0 8px", color: THEME.accent, fontSize: "18px", fontWeight: 900 }}>:</span>
                    <ScoreBox score={scoreRight} color={THEME.titleText} />
                  </div>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: THEME.titleText, textAlign: "right", letterSpacing: "0.04em" }}>{right.teamName}</span>
                </div>
              )}

              {/* 선수명 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: mode === "team" ? "2px 40px 14px" : "16px 40px 14px", gap: "16px" }}>
                <span style={{ fontSize: "24px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.01em" }}>{left.playerName}</span>
                {mode === "individual" ? (
                  <div style={{
                    display: "flex", alignItems: "center",
                    background: THEME.bgInner,
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}>
                    <ScoreBox score={scoreLeft} color={THEME.titleText} />
                    <span style={{ padding: "0 8px", color: THEME.accent, fontSize: "18px", fontWeight: 900 }}>:</span>
                    <ScoreBox score={scoreRight} color={THEME.titleText} />
                  </div>
                ) : (
                  <div style={{ width: 24 }} />
                )}
                <span style={{ fontSize: "24px", fontWeight: 900, color: "#ffffff", textAlign: "right", letterSpacing: "-0.01em" }}>{right.playerName}</span>
              </div>

              {/* 종족 + 스타팅 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "0 40px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <RaceIcon race={left.race} />
                  <StartingBadge point={left.startingPoint} color={left.startingColor} />
                </div>
                <div />
                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                  <StartingBadge point={right.startingPoint} color={right.startingColor} />
                  <RaceIcon race={right.race} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 대진표 */}
        {entryLayout.visible && entry.length > 0 && (
          <div style={{
            position: "absolute",
            left: entryLayout.x,
            top: entryLayout.y,
            transform: `scale(${entryLayout.scale})`,
            transformOrigin: "top left",
            width: "340px",
            background: THEME.bg,
            border: `1.5px solid ${THEME.border}`,
            borderRadius: "6px",
            fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
            color: THEME.titleText,
            overflow: "hidden",
            boxShadow: `0 4px 32px rgba(0,0,0,0.7)`,
          }}>
            {/* 헤더 */}
            <div style={{
              background: THEME.titleBg,
              borderBottom: `1.5px solid ${THEME.border}`,
              padding: "8px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: THEME.titleText, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {title || "HOSAGA"}&nbsp;
                <span style={{ color: THEME.accent }}>|</span>
                &nbsp;{setLabel ? `${setLabel}SET` : ""}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 900, color: THEME.titleText }}>
                {mode === "team"
                  ? `${left.teamName || "A"} ${scoreLeft}:${scoreRight} ${right.teamName || "B"}`
                  : `${scoreLeft} : ${scoreRight}`}
              </span>
            </div>

            {/* 대진 행 */}
            {entry.map((row, idx) => {
              const isCurrent = currentMatch === idx;
              const done = row.result !== null;
              return (
                <div key={row.id} style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr 76px 1fr",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 10px",
                  borderBottom: `1px solid ${THEME.borderFaint}`,
                  background: isCurrent ? "rgba(196,113,74,0.10)" : "transparent",
                  borderLeft: isCurrent ? `2.5px solid ${THEME.accent}` : "2.5px solid transparent",
                }}>
                  <span style={{ fontSize: "10px", color: THEME.textMuted, textAlign: "center", fontWeight: 700 }}>
                    {isCurrent ? "▶" : idx + 1}
                  </span>
                  <span style={{
                    fontSize: "13px", fontWeight: 700, textAlign: "left",
                    color: row.result === "left" ? THEME.gold : row.result === "right" ? "rgba(212,196,168,0.25)" : THEME.titleText,
                  }}>{row.leftPlayer}</span>
                  <span style={{ textAlign: "center", fontSize: "11px", fontWeight: 700 }}>
                    {done ? (
                      <>
                        <span style={{ color: row.result === "left" ? THEME.gold : "rgba(212,196,168,0.2)" }}>O</span>
                        <span style={{ color: THEME.textMuted, margin: "0 3px", fontSize: "10px" }}>{row.map}</span>
                        <span style={{ color: row.result === "right" ? THEME.gold : "rgba(212,196,168,0.2)" }}>O</span>
                      </>
                    ) : (
                      <span style={{ color: isCurrent ? THEME.accent : THEME.textMuted }}>{row.map}</span>
                    )}
                  </span>
                  <span style={{
                    fontSize: "13px", fontWeight: 700, textAlign: "right",
                    color: row.result === "right" ? THEME.gold : row.result === "left" ? "rgba(212,196,168,0.25)" : THEME.titleText,
                  }}>{row.rightPlayer}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ScoreBox({ score, color }: { score: number; color: string }) {
  return (
    <span style={{
      display: "inline-block", minWidth: "46px", textAlign: "center",
      padding: "5px 12px", fontSize: "24px", fontWeight: 900, color,
    }}>
      {score}
    </span>
  );
}

function RaceIcon({ race }: { race: string }) {
  const r = ["T", "P", "Z"].includes(race) ? race : "T";
  const color = RACE_COLORS[r];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: "32px", height: "32px", borderRadius: "5px",
      background: `${color}1a`, border: `1.5px solid ${color}60`,
      color, fontWeight: 900, fontSize: "14px",
      boxShadow: `0 0 8px ${color}20`,
    }}>{r}</span>
  );
}

function StartingBadge({ point, color }: { point: string; color: string }) {
  if (!point) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: "32px", height: "32px", borderRadius: "5px",
      background: `${color}18`, border: `1.5px solid ${color}`,
      color, fontWeight: 900, fontSize: "13px", padding: "0 6px",
    }}>{point}</span>
  );
}
