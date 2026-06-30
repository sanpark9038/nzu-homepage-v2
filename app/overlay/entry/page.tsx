"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultOverlayState, type OverlayState } from "@/lib/overlay-types";

const POLL_INTERVAL = 2000;

// SC1 BW 인터페이스 테마
const THEME = {
  bg: "rgba(26, 23, 20, 0.97)",
  bgInner: "rgba(19, 17, 15, 0.95)",
  border: "rgba(140, 60, 55, 0.75)",
  borderFaint: "rgba(140, 60, 55, 0.25)",
  titleBg: "rgba(14, 12, 10, 0.80)",
  titleText: "rgba(212, 196, 168, 0.92)",
  accent: "#c4714a",
  gold: "#f0c040",
  textMuted: "rgba(180, 165, 140, 0.55)",
};

export default function EntryOverlayPage() {
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

  const { title, left, right, mode } = state;
  const activeSet    = state.sets.find(s => s.id === state.activeSetId) ?? null;
  const activeSetIdx = state.sets.findIndex(s => s.id === state.activeSetId);
  const setLabel     = activeSet?.isAce ? "에이스" : activeSetIdx >= 0 ? `${activeSetIdx + 1}` : "";
  const entry        = activeSet?.entries ?? [];
  const currentMatch = activeSet?.currentMatch ?? null;
  const scoreLeft    = entry.filter(e => e.result === "left").length;
  const scoreRight   = entry.filter(e => e.result === "right").length;
  if (entry.length === 0) return null;

  return (
    <>
      <style>{`
        html, body, body > * { background: transparent !important; }
        #main-scroll-container { background: transparent !important; overflow: visible !important; }
      `}</style>

      <div style={{ position: "fixed", top: 0, left: 0, width: "1920px", height: "1080px", pointerEvents: "none", background: "transparent" }}>
        <div style={{
          position: "absolute",
          top: "20px",
          right: "20px",
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
            const isDone = row.result !== null;
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
                }}>
                  {row.leftPlayer}
                </span>
                <span style={{ textAlign: "center", fontSize: "11px", fontWeight: 700 }}>
                  {isDone ? (
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
                }}>
                  {row.rightPlayer}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
