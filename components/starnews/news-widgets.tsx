"use client";

// STARNEWS 위젯 — "Editorial Luxury, 화이트 방송판" 디자인.
// 밝은 유리판을 알루미늄 트레이에 얹은 느낌: 반투명 화이트 코어 + 이중 베젤 + 헤어라인.
// blur/backdrop-filter는 OBS 브라우저 소스에서 프레임 드랍의 주범이라 일절 쓰지 않는다.
// 유리 질감은 헤어라인 + 이너 하이라이트 + 넓고 부드러운 그림자만으로 만든다.
import { useLayoutEffect, useRef, useState } from "react";
import type { NewsBanner, NewsLowerThird, NewsTable, NewsTicker } from "./news-types";

const C = {
  core: "rgba(252,253,255,0.96)",
  coreEdge: "1px solid rgba(16,42,90,0.10)",
  coreInner: "inset 0 1px 0 #FFFFFF",
  coreShadow: "0 24px 64px rgba(10,30,70,0.28)",
  coreSheen: "linear-gradient(rgba(255,255,255,0.9), rgba(244,247,252,0.0) 40%)",
  shell: "rgba(255,255,255,0.42)",
  shellEdge: "1px solid rgba(255,255,255,0.55)",
  ink: "#10243E",
  muted: "rgba(16,36,62,0.58)",
  accent: "#2563EB",
  rule: "1px solid rgba(16,42,90,0.10)",
};

const SERIF = "var(--font-news-serif), 'Batang', serif";
const SANS = "var(--font-news-sans), 'Malgun Gothic', sans-serif";

// 헤드라인·이름·타이틀
const serifStyle = (size: number, weight: 700 | 900 = 900): React.CSSProperties => ({
  fontFamily: SERIF,
  fontSize: `${size}px`,
  fontWeight: weight,
  letterSpacing: "-0.01em",
  lineHeight: 1.14,
});

// 라벨·표 데이터
const sansStyle = (size: number, weight: 400 | 500 | 700 = 400): React.CSSProperties => ({
  fontFamily: SANS,
  fontSize: `${size}px`,
  fontWeight: weight,
  lineHeight: 1.3,
});

// 등장 모션 — transform/opacity만. 마퀴 외 상시 애니메이션은 없다.
const RISE_KEYFRAMES =
  "@keyframes newsRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}";

// 각 위젯의 최상위 배치 래퍼. 마운트 시 1회 상승 페이드.
function Stage({ children, style }: { children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        animation: "newsRise 700ms cubic-bezier(0.32,0.72,0,1) both",
        ...style,
      }}
    >
      <style>{RISE_KEYFRAMES}</style>
      {children}
    </div>
  );
}

// 이중 베젤 — 외피(트레이) 안에 코어(유리판)를 6px 여백으로 앉힌다.
function Bezel({ children, radius = 24, style, coreStyle }: {
  children: React.ReactNode;
  radius?: number;
  style?: React.CSSProperties;
  coreStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        background: C.shell,
        border: C.shellEdge,
        borderRadius: radius,
        padding: 6,
        boxShadow: C.coreShadow,
        ...style,
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          height: "100%",
          background: C.core,
          backgroundImage: C.coreSheen,
          border: C.coreEdge,
          borderRadius: radius >= 999 ? 999 : radius - 6,
          boxShadow: C.coreInner,
          color: C.ink,
          ...coreStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// 아이브로우 필 — 솔리드(블루 배경/흰 글자) 또는 아웃라인(블루 테두리/블루 글자)
function Eyebrow({ children, solid = true }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        borderRadius: 999,
        padding: "5px 14px",
        background: solid ? C.accent : "transparent",
        border: solid ? "1px solid transparent" : `1px solid ${C.accent}`,
        color: solid ? "#FFFFFF" : C.accent,
        ...sansStyle(11, 500),
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

// ── 표 ─────────────────────────────────────────────────────
// 자료 카드와 전면 화면이 같은 렌더러를 쓴다. 차이는 크기뿐.
// 행 구분은 셀마다 borderBottom 헤어라인 (grid gap 트릭 아님 — 밝은 판에선 선이 그대로 보여야 한다).

const TABLE_SIZE = {
  card: { title: 28, titleWeight: 700 as const, subtitle: 12, head: 12, cell: 17, padX: 12, padY: 9 },
  full: { title: 60, titleWeight: 900 as const, subtitle: 18, head: 18, cell: 28, padX: 20, padY: 18 },
};

export function NewsTableView({ table, size }: { table: NewsTable; size: "card" | "full" }) {
  const S = TABLE_SIZE[size];
  const colCount = Math.max(table.columns.length, ...table.rows.map(r => r.length), 1);
  // 첫 열(이름·순위 등)이 가장 길다 — 나머지는 균등
  const gridCols = colCount === 1 ? "1fr" : `1.6fr ${Array(colCount - 1).fill("1fr").join(" ")}`;
  const highlight = new Set(table.highlightRows);

  const cell = (i: number, hot: boolean, head: boolean, last: boolean): React.CSSProperties => ({
    padding: `${S.padY}px ${S.padX}px`,
    ...(head
      ? { ...sansStyle(S.head, 500), letterSpacing: "0.12em", textTransform: "uppercase" as const }
      : sansStyle(S.cell, hot ? 700 : 400)),
    color: head ? C.muted : hot ? C.accent : C.ink,
    textAlign: i === 0 ? "left" : "center",
    borderBottom: last ? undefined : C.rule,
    // 강조 행은 셀 전체에 옅은 블루 배경 — 양끝 셀만 라운드 처리해 행 하나로 보이게 한다
    background: hot ? "rgba(37,99,235,0.10)" : undefined,
    borderTopLeftRadius: hot && i === 0 ? 10 : undefined,
    borderBottomLeftRadius: hot && i === 0 ? 10 : undefined,
    borderTopRightRadius: hot && i === colCount - 1 ? 10 : undefined,
    borderBottomRightRadius: hot && i === colCount - 1 ? 10 : undefined,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  const lastRow = table.rows.length - 1;

  return (
    <div>
      {table.title && (
        <div style={{ marginBottom: size === "full" ? 28 : 14 }}>
          <div style={{ ...serifStyle(S.title, S.titleWeight), color: C.ink }}>{table.title}</div>
          {table.subtitle && (
            <div style={{ ...sansStyle(S.subtitle), color: C.muted, marginTop: 6 }}>{table.subtitle}</div>
          )}
          <div style={{ width: 48, height: 3, borderRadius: 999, background: C.accent, marginTop: size === "full" ? 18 : 12 }} />
        </div>
      )}

      {table.rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: gridCols }}>
          {table.columns.length > 0 &&
            Array.from({ length: colCount }, (_, i) => (
              <div key={`h${i}`} style={cell(i, false, true, false)}>
                {table.columns[i] ?? ""}
              </div>
            ))}
          {table.rows.map((row, r) =>
            Array.from({ length: colCount }, (_, i) => (
              <div key={`${r}-${i}`} style={cell(i, highlight.has(r), false, r === lastRow)}>
                {row[i] ?? ""}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── 티커 ───────────────────────────────────────────────────
// 하단 플로팅 아일랜드 — 풀폭 바가 아니라 라운드 필.

const TICKER_H = 60;

export function Ticker({ ticker }: { ticker: NewsTicker }) {
  const copyRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(0);
  const text = ticker.items.filter(Boolean).join("   ·   ");

  // 한 벌의 실제 폭을 재서 "px/초" 속도를 초 단위 duration으로 환산.
  // 문구나 속도가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const w = copyRef.current?.offsetWidth ?? 0;
    setDuration(w > 0 ? w / Math.max(ticker.pxPerSec, 1) : 0);
  }, [text, ticker.pxPerSec]);

  const copy: React.CSSProperties = { ...sansStyle(22), color: C.ink, paddingRight: 64, whiteSpace: "nowrap" };

  return (
    <Stage style={{ left: 96, right: 96, bottom: 54, height: TICKER_H }}>
      <Bezel
        radius={999}
        style={{ height: "100%" }}
        coreStyle={{ display: "flex", alignItems: "center", overflow: "hidden", padding: "0 22px 0 6px" }}
      >
        {/* 고정 라벨 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexShrink: 0,
            background: C.accent,
            borderRadius: 999,
            height: 36,
            padding: "0 18px",
            color: "#FFFFFF",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "#FFFFFF", display: "block" }} />
          <span style={{ ...sansStyle(11, 700), letterSpacing: "0.22em", textTransform: "uppercase" }}>LIVE</span>
          <span style={{ ...sansStyle(16, 700), letterSpacing: "0.02em" }}>{ticker.label}</span>
        </div>

        {/* 마퀴 — 콘텐츠 2벌을 이어 붙이고 -50%까지 밀면 이음매 없이 순환 */}
        <div style={{ flex: 1, overflow: "hidden", margin: "0 20px", display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              whiteSpace: "nowrap",
              animation: duration > 0 ? `newsMarquee ${duration}s linear infinite` : undefined,
            }}
          >
            <span ref={copyRef} style={copy}>{text}</span>
            <span style={copy}>{text}</span>
          </div>
        </div>

        {/* 방송사 워드마크 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 2 }}>
          <span style={{ ...serifStyle(15, 900), color: C.ink, lineHeight: 1 }}>SCNN</span>
          <span style={{ ...sansStyle(9, 500), color: C.muted, letterSpacing: "0.22em", lineHeight: 1 }}>NEWS 24</span>
        </div>
      </Bezel>
    </Stage>
  );
}

// ── 속보 배너 ──────────────────────────────────────────────

export function Banner({ banner }: { banner: NewsBanner }) {
  return (
    <Stage style={{ left: 96, top: 54, maxWidth: 1150 }}>
      {banner.tag && <div style={{ marginBottom: 10 }}><Eyebrow>{banner.tag}</Eyebrow></div>}
      <Bezel coreStyle={{ padding: "26px 34px 28px" }}>
        <div style={{ ...serifStyle(64, 900), color: C.ink }}>{banner.headline}</div>
        {banner.subline && (
          <div style={{ ...sansStyle(22), color: C.muted, marginTop: 18, borderTop: C.rule, paddingTop: 16 }}>
            {banner.subline}
          </div>
        )}
      </Bezel>
    </Stage>
  );
}

// ── 로워서드 ───────────────────────────────────────────────

export function LowerThird({ lower }: { lower: NewsLowerThird }) {
  return (
    <Stage style={{ left: 96, bottom: 54 + TICKER_H + 16 }}>
      <Bezel coreStyle={{ padding: "20px 32px 22px", minWidth: 420, display: "flex", gap: 20 }}>
        {/* 블루 세로 캡슐 — 텍스트 높이만큼 */}
        <div style={{ width: 4, borderRadius: 999, background: C.accent, flexShrink: 0 }} />
        <div>
          {lower.tag && <div style={{ marginBottom: 8 }}><Eyebrow solid={false}>{lower.tag}</Eyebrow></div>}
          {lower.name && <div style={{ ...serifStyle(52, 900), color: C.ink }}>{lower.name}</div>}
          {lower.affiliation && <div style={{ ...sansStyle(20, 700), color: C.ink, marginTop: 8 }}>{lower.affiliation}</div>}
          {lower.note && <div style={{ ...sansStyle(17), color: C.muted, marginTop: 6 }}>{lower.note}</div>}
        </div>
      </Bezel>
    </Stage>
  );
}

// ── 자료 카드 / 전면 화면 ──────────────────────────────────

export function Card({ table }: { table: NewsTable }) {
  return (
    <Stage style={{ right: 96, top: 200, width: 480 }}>
      <Bezel coreStyle={{ padding: "22px 24px 24px" }}>
        <NewsTableView table={table} size="card" />
      </Bezel>
    </Stage>
  );
}

export function Fullscreen({ table }: { table: NewsTable }) {
  return (
    <Stage style={{ left: 96, right: 96, top: 54, bottom: 54 }}>
      <Bezel
        style={{ height: "100%" }}
        coreStyle={{ padding: "48px 64px", overflow: "hidden" }}
      >
        <div style={{ marginBottom: 26 }}><Eyebrow>SCNN NEWS</Eyebrow></div>
        <NewsTableView table={table} size="full" />
      </Bezel>
    </Stage>
  );
}
