"use client";

// STARNEWS 위젯 — 한국 방송사(YTN풍) 자막 스타일.
// 직각 블록 + 솔리드 컬러 + 두꺼운 고딕. 화이트 자막바 / 다크 티커 바.
// blur·backdrop-filter는 OBS 브라우저 소스에서 프레임 드랍의 주범이라 일절 쓰지 않는다.
// 상시 애니메이션도 등장 1회 rise와 티커 문구 교체뿐 (마퀴 폐지).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  NewsBanner,
  NewsCard,
  NewsLowerThird,
  NewsReporter,
  NewsTable,
  NewsTicker,
  NewsTopBox,
  NewsWidgetLayout,
} from "./news-types";

const C = {
  ink: "#0A0E1A",
  blue: "#2563EB",
  blueDeep: "#1E3A8A",
  blueText: "#1D4ED8",
  tagBand: "linear-gradient(135deg, #2563EB, #1E3A8A)",
  panel: "#FFFFFF",
  tickerBg: "rgba(16,19,26,0.86)",
  rule: "1px solid rgba(10,20,50,0.10)",
  head: "#64748B",
  note: "#4A5568",
  shadow: "0 8px 24px rgba(0,0,0,0.25)",
  divider: "rgba(255,255,255,0.25)", // 티커 내부 세로 구분선 1px
  up: "#EF4444", // 상승 ▲ — 주식 관례대로 빨강
};

// 방송 자막체 — 굵은 디스플레이 고딕
const DISPLAY = "var(--font-news-display), 'Malgun Gothic', sans-serif";
// 본문·표·라벨
const SANS = "var(--font-news-sans), 'Malgun Gothic', sans-serif";

const display = (size: number): React.CSSProperties => ({
  fontFamily: DISPLAY,
  fontSize: `${size}px`,
  fontWeight: 400, // Black Han Sans는 400 하나뿐 — 자체가 블랙 웨이트
  letterSpacing: "-0.01em",
  lineHeight: 1.15,
});

const sans = (size: number, weight: 400 | 500 | 700 | 900 = 400): React.CSSProperties => ({
  fontFamily: SANS,
  fontSize: `${size}px`,
  fontWeight: weight,
  lineHeight: 1.3,
});

const KEYFRAMES =
  "@keyframes newsRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}" +
  "@keyframes newsRollIn{from{transform:translateY(100%)}to{transform:translateY(0)}}" +
  "@keyframes newsRollOut{from{transform:translateY(0)}to{transform:translateY(-100%)}}";

const RISE = "newsRise 700ms cubic-bezier(0.32,0.72,0,1) both";

// 배치 래퍼. 바깥 div가 좌표·배율을 잡고(앵커=좌상단), 안쪽 div가 등장 모션을 갖는다.
// transform을 나눠 갖지 않으면 scale과 rise가 서로를 덮어쓴다.
function Stage({ children, style, innerStyle }: {
  children: React.ReactNode;
  style: React.CSSProperties;
  innerStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "absolute", ...style }}>
      <style>{KEYFRAMES}</style>
      <div style={{ animation: RISE, ...innerStyle }}>{children}</div>
    </div>
  );
}

// 관리자에서 조정한 x/y/배율 → 절대 배치 스타일
function place(layout: NewsWidgetLayout): React.CSSProperties {
  return {
    left: layout.x,
    top: layout.y,
    transform: `scale(${layout.scale})`,
    transformOrigin: "left top",
  };
}

// 하단 자막 공통 무대 폭 — 티커와 메인 자막이 같은 좌우 라인을 쓴다(방송사 자막 기본).
const STAGE_LEFT = 96;
const STAGE_W = 1728;

// "..."·"…" → 방송 자막 관례대로 가운데 높이 점 3개. 저장 데이터는 원문 그대로 두고 렌더에서만 바꾼다.
const midDots = (text: string) => text.replace(/\.\.\.|…/g, "⋯");

// 고정 폭 바 안에서 한 줄로 맞추는 텍스트. 넘치면 말줄임 대신 글씨를 줄인다.
// 부모가 display:flex여야 한다(자기 clientWidth = 쓸 수 있는 폭).
function FitText({ text, size, min }: { text: string; size: number; min: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${size}px`;
      const avail = el.clientWidth;
      if (!avail || el.scrollWidth <= avail) return;
      let next = Math.max(min, Math.floor((size * avail) / el.scrollWidth));
      el.style.fontSize = `${next}px`;
      // 비례 축소는 커닝 탓에 1~2px 모자랄 수 있다 — 남으면 1px씩 더 줄인다
      for (let i = 0; i < 8 && next > min && el.scrollWidth > avail; i += 1) {
        next -= 1;
        el.style.fontSize = `${next}px`;
      }
    };
    fit();
    // 웹폰트가 늦게 붙으면 폭이 확 달라진다 — 로드 완료 후 재측정. 방송 중 잘림은 사고다.
    document.fonts?.ready.then(fit).catch(() => {});
  }, [text, size, min]);

  return (
    <div ref={ref} style={{ ...display(size), flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
      {text}
    </div>
  );
}

// ── 표 ─────────────────────────────────────────────────────
// 자료 카드와 전면 화면이 같은 렌더러를 쓴다. 차이는 크기뿐.
// 제목·부제는 각 패널의 헤더 밴드가 그리므로 여기선 격자만 그린다.

const TABLE_SIZE = {
  card: { head: 12, cell: 17, padX: 12, padY: 9 },
  full: { head: 17, cell: 27, padX: 20, padY: 16 },
};

export function NewsTableView({ table, size }: { table: NewsTable; size: "card" | "full" }) {
  const S = TABLE_SIZE[size];
  const colCount = Math.max(table.columns.length, ...table.rows.map(r => r.length), 1);
  // 첫 열(이름·순위 등)이 가장 길다 — 나머지는 균등
  const gridCols = colCount === 1 ? "1fr" : `1.6fr ${Array(colCount - 1).fill("1fr").join(" ")}`;
  const highlight = new Set(table.highlightRows);
  const lastRow = table.rows.length - 1;

  const cell = (i: number, hot: boolean, head: boolean, last: boolean): React.CSSProperties => ({
    padding: `${S.padY}px ${S.padX}px`,
    ...(head
      ? { ...sans(S.head, 500), letterSpacing: "0.12em", textTransform: "uppercase" as const }
      : sans(S.cell, hot ? 700 : 400)),
    color: head ? C.head : hot ? C.blueText : C.ink,
    textAlign: i === 0 ? "left" : "center",
    borderBottom: last ? undefined : C.rule,
    background: hot ? "rgba(37,99,235,0.10)" : undefined,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  if (table.rows.length === 0) return null;

  return (
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
  );
}

// 카드·전면이 공유하는 헤더 밴드 (블루 그라디언트)
function HeaderBand({ table, size }: { table: NewsTable; size: "card" | "full" }) {
  const full = size === "full";
  if (!table.title && !table.subtitle) return null;
  return (
    <div style={{ background: C.tagBand, padding: full ? "24px 48px" : "14px 20px" }}>
      {table.title && <div style={{ ...display(full ? 48 : 26), color: "#FFFFFF" }}>{table.title}</div>}
      {table.subtitle && (
        <div style={{ ...sans(full ? 16 : 12), color: "rgba(255,255,255,0.75)", marginTop: full ? 8 : 4 }}>
          {table.subtitle}
        </div>
      )}
    </div>
  );
}

// ── 티커 ───────────────────────────────────────────────────
// 화면 최하단 다크 바. 문구는 흐르지 않고 N초마다 교체된다.

const TICKER_H = 56;
const ROLL = "420ms cubic-bezier(0.32,0.72,0,1) both";

// 롤업 교체 — 새 문구가 아래에서 올라오고 이전 문구는 위로 밀려 나간다.
// 나간 문구는 translateY(-100%)에 멈춘 채 overflow:hidden에 가려지므로 제거 타이머가 필요 없다.
// id가 바뀔 때만 애니메이션이 돈다. 내용은 render(id)로 뽑으므로 이전 문구도 그릴 수 있다.
function Roll({ id, height, align, render }: {
  id: string;
  height: number;
  align: "flex-start" | "flex-end";
  render: (id: string) => React.ReactNode;
}) {
  const [roll, setRoll] = useState({ cur: id, prev: null as string | null, gen: 0 });

  useEffect(() => {
    setRoll(s => (s.cur === id ? s : { cur: id, prev: s.cur, gen: s.gen + 1 }));
  }, [id]);

  const line: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: align,
  };
  const text: React.CSSProperties = { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
      {roll.prev !== null && (
        <div key={`p${roll.gen}`} style={{ ...line, animation: `newsRollOut ${ROLL}` }}>
          <span style={text}>{render(roll.prev)}</span>
        </div>
      )}
      <div key={`c${roll.gen}`} style={{ ...line, animation: roll.gen > 0 ? `newsRollIn ${ROLL}` : undefined }}>
        <span style={text}>{render(roll.cur)}</span>
      </div>
    </div>
  );
}

// 순환 인덱스 — count가 2 이상일 때만 secPerItem 간격으로 돈다
function useCycle(count: number, secPerItem: number) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (count < 2) {
      setIdx(0);
      return;
    }
    const timer = setInterval(() => setIdx(i => (i + 1) % count), Math.max(secPerItem, 2) * 1000);
    return () => clearInterval(timer);
  }, [count, secPerItem]);
  return count > 0 ? idx % count : 0;
}

export function Ticker({ ticker }: { ticker: NewsTicker }) {
  const items = ticker.items.filter(Boolean);
  const [clock, setClock] = useState(""); // 서버 렌더와 어긋나면 hydration mismatch — 마운트 후에만 채운다

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // 우측 존 = 관리자가 넣은 짧은 정보들 (온도 등)
  const rightItems: { id: string; node: React.ReactNode }[] = [];
  for (const item of ticker.rightItems.filter(Boolean)) rightItems.push({ id: item, node: item });

  const idx = useCycle(items.length, ticker.secPerItem);
  const rightIdx = useCycle(rightItems.length, ticker.rightSecPerItem);

  const divider = <div style={{ width: 1, alignSelf: "stretch", background: C.divider, flexShrink: 0 }} />;

  return (
    <Stage
      style={{
        left: STAGE_LEFT,
        width: STAGE_W,
        bottom: ticker.y,
        transform: `scale(${ticker.scale})`,
        transformOrigin: "left bottom",
      }}
      innerStyle={{
        display: "flex",
        alignItems: "center",
        height: TICKER_H,
        background: C.tickerBg,
        boxShadow: C.shadow,
        overflow: "hidden",
      }}
    >
      {/* 시각 */}
      <div style={{ ...sans(24, 700), color: "#FFFFFF", padding: "0 20px", flexShrink: 0, minWidth: 96, textAlign: "center" }}>
        {clock}
      </div>
      {divider}

      {/* 분류 태그 */}
      {ticker.label && (
        <div
          style={{
            ...display(24),
            color: "#FFFFFF",
            background: C.blue,
            height: "100%",
            padding: "0 18px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {ticker.label}
        </div>
      )}

      {/* 문구 — secPerItem마다 롤업 교체 */}
      <div style={{ flex: 1, minWidth: 0, padding: "0 22px", ...sans(26, 700), color: "#FFFFFF" }}>
        <Roll id={items[idx] ?? ""} height={34} align="flex-start" render={id => id} />
      </div>

      {/* 우측 고정 존 — 온도·지수 등 짧은 정보가 따로 순환 */}
      {rightItems.length > 0 && (
        <>
          {divider}
          <div style={{ width: 240, flexShrink: 0, padding: "0 20px", ...sans(24, 700), color: "#FFFFFF" }}>
            <Roll
              id={rightItems[rightIdx].id}
              height={32}
              align="flex-end"
              render={id => rightItems.find(item => item.id === id)?.node ?? null}
            />
          </div>
        </>
      )}

      {/* 방송사 워드마크 */}
      {divider}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, padding: "0 20px", flexShrink: 0 }}>
        <span style={{ ...display(20), color: "#FFFFFF", lineHeight: 1 }}>SSNEWS</span>
        <span style={{ ...sans(10, 500), color: "rgba(255,255,255,0.55)", letterSpacing: "0.2em", lineHeight: 1 }}>NEWS 24</span>
      </div>
    </Stage>
  );
}

// ── 메인 자막바 ────────────────────────────────────────────
// [블루 태그 블록 + 흰 바 전체 폭]. 위에 얇은 딥블루 보조 스트립.
// 흰 바는 티커와 같은 고정 폭(STAGE_W)이라 문구 길이에 따라 늘었다 줄었다 하지 않는다.
// 기본 layout.x가 96(=STAGE_LEFT)이라 티커와 좌우 라인이 맞고, 관리자 x/y 오프셋은 그대로 먹는다.

const BANNER_SIZE = 54;
const BANNER_MIN_SIZE = 26;

export function Banner({ banner }: { banner: NewsBanner }) {
  return (
    // 그림자는 자막 행에만 — 고정 폭 래퍼에 걸면 보조 문구 오른쪽 빈 영역에도 그림자가 뜬다
    <Stage style={place(banner.layout)} innerStyle={{ width: STAGE_W }}>
      {banner.subline && (
        <div style={{ display: "inline-block", background: C.blueDeep, color: "#FFFFFF", ...sans(22, 500), padding: "6px 16px" }}>
          {midDots(banner.subline)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "stretch", boxShadow: C.shadow }}>
        {banner.tag && (
          <div style={{ ...display(36), color: "#FFFFFF", background: C.tagBand, padding: "0 26px", display: "flex", alignItems: "center", flexShrink: 0 }}>
            {banner.tag}
          </div>
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: C.ink,
            background: C.panel,
            padding: "12px 34px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <FitText text={midDots(banner.headline)} size={BANNER_SIZE} min={BANNER_MIN_SIZE} />
        </div>
      </div>
    </Stage>
  );
}

// ── 로워서드 ───────────────────────────────────────────────

export function LowerThird({ lower }: { lower: NewsLowerThird }) {
  return (
    <Stage style={place(lower.layout)} innerStyle={{ display: "flex", background: C.panel, boxShadow: C.shadow, minWidth: 380 }}>
      <div style={{ width: 6, background: C.blue, flexShrink: 0 }} />
      <div style={{ padding: "18px 30px" }}>
        {lower.tag && (
          <div style={{ display: "inline-block", background: C.blue, color: "#FFFFFF", ...display(18), padding: "3px 12px", marginBottom: 10 }}>
            {lower.tag}
          </div>
        )}
        {lower.name && <div style={{ ...display(46), color: C.ink }}>{lower.name}</div>}
        {lower.affiliation && <div style={{ ...sans(21, 700), color: C.blueText, marginTop: 8 }}>{lower.affiliation}</div>}
        {lower.note && <div style={{ ...sans(17), color: C.note, marginTop: 6 }}>{lower.note}</div>}
      </div>
    </Stage>
  );
}

// ── 좌상단 요약 박스 ───────────────────────────────────────
// 컬러 태그 바 + 흰 바탕 요약 줄(최대 2줄). 자료화면이 나가는 동안 주제를 고정 표시한다.

const TOPBOX_W = 460;

export function TopBox({ box }: { box: NewsTopBox }) {
  const lines = box.lines.filter(Boolean).slice(0, 2);
  if (!box.tag && lines.length === 0) return null;

  return (
    <Stage style={place(box.layout)} innerStyle={{ width: TOPBOX_W, boxShadow: C.shadow }}>
      {box.tag && (
        <div style={{ ...display(26), color: "#FFFFFF", background: C.tagBand, padding: "8px 18px" }}>{box.tag}</div>
      )}
      {lines.length > 0 && (
        <div style={{ background: C.panel, padding: "12px 18px" }}>
          {lines.map((line, i) => (
            <div key={i} style={{ ...sans(23, 700), color: C.ink, marginTop: i === 0 ? 0 : 6 }}>
              {midDots(line)}
            </div>
          ))}
        </div>
      )}
    </Stage>
  );
}

// ── 기자 연결 카드 ─────────────────────────────────────────
// 사진(3:4) + 하단 네이비 네임바(이름 크게 + 직함 작게). 소속 표기는 없다.

const REPORTER_W = 260;

// 사진 미지정용 회색 실루엣 — 외부 파일 없이 인라인 SVG로 그린다
function Silhouette() {
  return (
    <svg viewBox="0 0 120 160" width="100%" height="100%" style={{ display: "block", background: "#D5D9E0" }}>
      <circle cx="60" cy="58" r="27" fill="#9AA3B2" />
      <path d="M14 160c0-27 21-46 46-46s46 19 46 46z" fill="#9AA3B2" />
    </svg>
  );
}

export function Reporter({ reporter }: { reporter: NewsReporter }) {
  return (
    <Stage
      style={place(reporter.layout)}
      innerStyle={{ width: REPORTER_W, background: C.panel, boxShadow: C.shadow, overflow: "hidden" }}
    >
      <div style={{ width: "100%", aspectRatio: "3 / 4", overflow: "hidden" }}>
        {reporter.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reporter.imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Silhouette />
        )}
      </div>
      <div
        style={{
          background: C.blueDeep,
          padding: "10px 16px",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span style={{ ...display(32), color: "#FFFFFF" }}>{reporter.name}</span>
        <span style={{ ...sans(16, 500), color: "rgba(255,255,255,0.72)" }}>{reporter.role}</span>
      </div>
    </Stage>
  );
}

// ── 자료 카드 / 전면 화면 ──────────────────────────────────

export function Card({ card }: { card: NewsCard }) {
  return (
    <Stage
      style={place(card.layout)}
      innerStyle={{ width: 480, background: C.panel, borderRadius: 4, boxShadow: C.shadow, overflow: "hidden" }}
    >
      <HeaderBand table={card.table} size="card" />
      <div style={{ padding: "8px 20px 16px" }}>
        <NewsTableView table={card.table} size="card" />
      </div>
    </Stage>
  );
}

export function Fullscreen({ table }: { table: NewsTable }) {
  return (
    <Stage
      style={{ left: 96, right: 96, top: 54, bottom: 54 }}
      innerStyle={{ height: "100%", background: C.panel, borderRadius: 4, boxShadow: C.shadow, overflow: "hidden" }}
    >
      <HeaderBand table={table} size="full" />
      <div style={{ padding: "32px 48px" }}>
        <NewsTableView table={table} size="full" />
      </div>
    </Stage>
  );
}
