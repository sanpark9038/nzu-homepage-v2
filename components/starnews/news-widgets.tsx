"use client";

// STARNEWS 위젯 — "Tactical Telemetry" 디자인.
// 본 사이트(다크네이비+골드+라운드+글래스)와 의도적으로 완전히 다르다:
// 완전 불투명 검정 패널 / 90도 모서리 / 액센트는 빨강 하나 / 그림자·블러·그라디언트 없음
// (OBS 브라우저 소스에서 blur·shadow는 프레임 드랍의 주범이라 규칙이자 성능 조치)
import { useLayoutEffect, useRef, useState } from "react";
import type { NewsBanner, NewsLowerThird, NewsTable, NewsTicker } from "./news-types";

const C = {
  panel: "#0A0A0A",
  text: "#EAEAEA",
  accent: "#FF2A2A",
  live: "#4AF626",
  edge: "2px solid #EAEAEA",
  rule: "rgba(234,234,234,0.25)",
  dim: "rgba(234,234,234,0.55)",
};

const DISPLAY = "var(--font-news-display), 'Malgun Gothic', sans-serif";
const MONO = "var(--font-news-mono), 'Malgun Gothic', monospace";

// 라벨·메타·표 데이터 공통 서체
const monoStyle = (size: number, weight: 400 | 700 = 400): React.CSSProperties => ({
  fontFamily: MONO,
  fontSize: `${size}px`,
  fontWeight: weight,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  lineHeight: 1.2,
});

// 허용된 유일한 텍스처. 패널 위에 덮는 저비용 스캔라인.
function Scanlines() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.035) 2px 4px)",
      }}
    />
  );
}

// 패널 네 모서리의 + 크로스헤어 (계측 장비 느낌)
function Crosshairs() {
  const base: React.CSSProperties = {
    position: "absolute",
    ...monoStyle(14, 700),
    color: C.accent,
    lineHeight: 1,
    pointerEvents: "none",
  };
  return (
    <>
      <span style={{ ...base, left: 4, top: 3 }}>+</span>
      <span style={{ ...base, right: 4, top: 3 }}>+</span>
      <span style={{ ...base, left: 4, bottom: 3 }}>+</span>
      <span style={{ ...base, right: 4, bottom: 3 }}>+</span>
    </>
  );
}

function Panel({ children, style, crosshairs = true }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  crosshairs?: boolean;
}) {
  return (
    <div style={{ position: "relative", background: C.panel, border: C.edge, color: C.text, ...style }}>
      {children}
      <Scanlines />
      {crosshairs && <Crosshairs />}
    </div>
  );
}

// ── 표 ─────────────────────────────────────────────────────
// 자료 카드와 전면 화면이 같은 렌더러를 쓴다. 차이는 크기뿐.
// 구분선은 border 대신 grid gap 1px + 부모 배경색 — 셀마다 테두리를 겹치지 않게 하는 관례적 트릭.

const TABLE_SIZE = {
  card: { title: 30, subtitle: 13, head: 13, cell: 17, padX: 12, padY: 8 },
  full: { title: 64, subtitle: 20, head: 20, cell: 30, padX: 22, padY: 16 },
};

export function NewsTableView({ table, size }: { table: NewsTable; size: "card" | "full" }) {
  const S = TABLE_SIZE[size];
  const colCount = Math.max(table.columns.length, ...table.rows.map(r => r.length), 1);
  // 첫 열(이름·순위 등)이 가장 길다 — 나머지는 균등
  const gridCols = colCount === 1 ? "1fr" : `1.6fr ${Array(colCount - 1).fill("1fr").join(" ")}`;
  const highlight = new Set(table.highlightRows);

  const cell = (v: string, i: number, hot: boolean, head: boolean): React.CSSProperties => ({
    background: C.panel,
    padding: `${S.padY}px ${S.padX}px`,
    ...monoStyle(head ? S.head : S.cell, head || hot ? 700 : 400),
    color: head ? C.dim : hot ? C.accent : C.text,
    textAlign: i === 0 ? "left" : "center",
    // 강조 행은 왼쪽에 빨간 바 — 첫 셀에만 붙여 행 전체의 시작을 표시
    borderLeft: !head && hot && i === 0 ? `4px solid ${C.accent}` : undefined,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  return (
    <div>
      {table.title && (
        <div style={{ borderBottom: `4px solid ${C.accent}`, paddingBottom: size === "full" ? 12 : 6, marginBottom: size === "full" ? 20 : 10 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: `${S.title}px`, lineHeight: 1.1, color: C.text }}>{table.title}</div>
          {table.subtitle && (
            <div style={{ ...monoStyle(S.subtitle), color: C.dim, marginTop: 4 }}>{`>>> ${table.subtitle}`}</div>
          )}
        </div>
      )}

      {table.rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "1px", background: C.rule }}>
          {table.columns.length > 0 &&
            Array.from({ length: colCount }, (_, i) => (
              <div key={`h${i}`} style={cell(table.columns[i] ?? "", i, false, true)}>
                {table.columns[i] ?? ""}
              </div>
            ))}
          {table.rows.map((row, r) =>
            Array.from({ length: colCount }, (_, i) => (
              <div key={`${r}-${i}`} style={cell(row[i] ?? "", i, highlight.has(r), false)}>
                {row[i] ?? ""}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── 티커 바 ────────────────────────────────────────────────

const TICKER_H = 64;

export function Ticker({ ticker }: { ticker: NewsTicker }) {
  const copyRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(0);
  const text = ticker.items.filter(Boolean).join("  ///  ");

  // 한 벌의 실제 폭을 재서 "px/초" 속도를 초 단위 duration으로 환산.
  // 문구나 속도가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const w = copyRef.current?.offsetWidth ?? 0;
    setDuration(w > 0 ? w / Math.max(ticker.pxPerSec, 1) : 0);
  }, [text, ticker.pxPerSec]);

  return (
    <div style={{ position: "absolute", left: 96, right: 96, bottom: 54, height: TICKER_H, display: "flex", border: C.edge, background: C.panel }}>
      {/* 고정 라벨 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.accent, color: "#000000", padding: "0 20px", flexShrink: 0 }}>
        <span style={{ width: 10, height: 10, background: C.live, display: "block" }} />
        <span style={{ ...monoStyle(15, 700) }}>LIVE</span>
        <span style={{ fontFamily: DISPLAY, fontSize: "26px", lineHeight: 1, paddingBottom: 2 }}>{ticker.label}</span>
      </div>

      {/* 마퀴 — 콘텐츠 2벌을 이어 붙이고 -50%까지 밀면 이음매 없이 순환 */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            whiteSpace: "nowrap",
            animation: duration > 0 ? `newsMarquee ${duration}s linear infinite` : undefined,
          }}
        >
          <span ref={copyRef} style={{ ...monoStyle(24, 400), color: C.text, paddingRight: 60 }}>{text}</span>
          <span style={{ ...monoStyle(24, 400), color: C.text, paddingRight: 60 }}>{text}</span>
        </div>
        <Scanlines />
      </div>

      {/* 방송사 워드마크 */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", padding: "0 16px", borderLeft: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <span style={{ ...monoStyle(17, 700), color: C.text }}>SCNN</span>
        <span style={{ ...monoStyle(10), color: C.dim }}>CH-01</span>
      </div>
    </div>
  );
}

// ── 속보 배너 ──────────────────────────────────────────────

export function Banner({ banner }: { banner: NewsBanner }) {
  return (
    <div style={{ position: "absolute", left: 96, top: 54, maxWidth: 1200 }}>
      {banner.tag && (
        <div style={{ display: "inline-block", background: C.accent, color: "#000000", padding: "6px 16px", ...monoStyle(18, 700) }}>
          {`[ ${banner.tag} ]`}
        </div>
      )}
      <Panel style={{ padding: "22px 28px 20px" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: "72px", lineHeight: 1.08, color: "#FFFFFF" }}>{banner.headline}</div>
        {banner.subline && (
          <div style={{ ...monoStyle(24), color: C.dim, marginTop: 14, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
            {`/// ${banner.subline}`}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── 로워서드 ───────────────────────────────────────────────

export function LowerThird({ lower }: { lower: NewsLowerThird }) {
  return (
    <div style={{ position: "absolute", left: 96, bottom: 54 + TICKER_H + 16, display: "flex" }}>
      <div style={{ width: 8, background: C.accent }} />
      <Panel style={{ padding: "16px 32px 18px", minWidth: 420 }} crosshairs={false}>
        {lower.tag && <div style={{ ...monoStyle(15, 700), color: C.accent }}>{`[ ${lower.tag} ]`}</div>}
        {lower.name && <div style={{ fontFamily: DISPLAY, fontSize: "56px", lineHeight: 1.1, color: "#FFFFFF", marginTop: 4 }}>{lower.name}</div>}
        {lower.affiliation && <div style={{ ...monoStyle(20, 700), color: C.text, marginTop: 6 }}>{lower.affiliation}</div>}
        {lower.note && <div style={{ ...monoStyle(17), color: C.dim, marginTop: 6 }}>{lower.note}</div>}
      </Panel>
    </div>
  );
}

// ── 자료 카드 / 전면 화면 ──────────────────────────────────

export function Card({ table }: { table: NewsTable }) {
  return (
    <Panel style={{ position: "absolute", right: 96, top: 200, width: 480, padding: "16px 18px 20px" }}>
      <NewsTableView table={table} size="card" />
    </Panel>
  );
}

export function Fullscreen({ table }: { table: NewsTable }) {
  return (
    <Panel style={{ position: "absolute", left: 96, right: 96, top: 54, bottom: 54, padding: "40px 56px", overflow: "hidden" }}>
      <div style={{ ...monoStyle(15, 700), color: C.accent, marginBottom: 18 }}>SCNN /// DATA FEED</div>
      <NewsTableView table={table} size="full" />
    </Panel>
  );
}
