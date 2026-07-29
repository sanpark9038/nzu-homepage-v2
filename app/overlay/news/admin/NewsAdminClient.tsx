"use client";

// 뉴스 오버레이 관리자 — 기능 위주 다크 폼. 1초 디바운스 자동저장.
// 로드 실패 시 편집을 막는다(자동저장이 빈 상태로 기존 저장분을 덮어쓰는 사고 방지).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultNewsState,
  normalizeNewsState,
  type NewsState,
  type NewsTable,
  type NewsWidgetLayout,
} from "@/components/starnews/news-types";

type PlayerRow = {
  name: string;
  nickname: string | null;
  race: string;
  tier: string | null;
  university: string | null;
};

const input =
  "w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/20 focus:border-white/30";
const label = "mb-1 block text-xs font-bold text-white/45";

// scale(배율)은 저장은 1.0 기준, 입력은 % 기준으로 보여준다.
const toPct = (scale: number) => Math.round(scale * 100);
const fromPct = (v: string) => Math.round((Number(v) || 0)) / 100;

// 배너·로워서드·자료 카드 공용 위치·크기 입력 (전면 화면은 항상 전체라 미사용)
function LayoutFields({
  layout,
  onChange,
}: {
  layout: NewsWidgetLayout;
  onChange: (l: NewsWidgetLayout) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <span className={label}>X (px)</span>
        <input
          type="number"
          className={input}
          value={layout.x}
          onChange={(e) => onChange({ ...layout, x: Number(e.target.value) || 0 })}
        />
      </div>
      <div>
        <span className={label}>Y (px)</span>
        <input
          type="number"
          className={input}
          value={layout.y}
          onChange={(e) => onChange({ ...layout, y: Number(e.target.value) || 0 })}
        />
      </div>
      <div>
        <span className={label}>크기 (%)</span>
        <input
          type="number"
          className={input}
          value={toPct(layout.scale)}
          onChange={(e) => onChange({ ...layout, scale: fromPct(e.target.value) })}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  visible,
  onToggle,
  children,
}: {
  title: string;
  visible: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black text-white/85">{title}</h2>
        <button
          onClick={() => onToggle(!visible)}
          className={`h-8 rounded-lg border px-3 text-xs font-bold transition-colors ${
            visible
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70"
          }`}
        >
          {visible ? "송출 중" : "숨김"}
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// 자료 카드·전면 화면 공용 표 편집기
function TableEditor({
  table,
  onChange,
  preset,
}: {
  table: NewsTable;
  onChange: (t: NewsTable) => void;
  preset: NewsTable | null;
}) {
  const set = (patch: Partial<NewsTable>) => onChange({ ...table, ...patch });

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>제목</span>
          <input className={input} value={table.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div>
          <span className={label}>부제</span>
          <input className={input} value={table.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </div>
      </div>
      <div>
        <span className={label}>열 머리글 (쉼표 구분, 비우면 머리글 없음)</span>
        <input
          className={input}
          value={table.columns.join(", ")}
          onChange={(e) =>
            set({ columns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
        />
      </div>
      <div>
        <span className={label}>행 (한 줄에 한 행, 셀은 쉼표 구분)</span>
        <textarea
          className={`${input} h-40 font-mono`}
          value={table.rows.map((r) => r.join(", ")).join("\n")}
          onChange={(e) =>
            set({
              rows: e.target.value
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => line.split(",").map((c) => c.trim())),
            })
          }
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <span className={label}>강조할 행 번호 (0부터, 쉼표 구분)</span>
          <input
            className={input}
            value={table.highlightRows.join(", ")}
            onChange={(e) =>
              set({
                highlightRows: e.target.value
                  .split(",")
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isInteger(n) && n >= 0),
              })
            }
          />
        </div>
        <button
          disabled={!preset}
          onClick={() => preset && onChange({ ...preset, highlightRows: table.highlightRows })}
          className="h-9 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-bold text-white/70 hover:bg-white/12 disabled:opacity-30"
        >
          중만컵 순위 불러오기
        </button>
      </div>
    </>
  );
}

export default function NewsAdminClient({ jungmanPreset }: { jungmanPreset: NewsTable | null }) {
  const [news, setNews] = useState<NewsState>(defaultNewsState());
  const [viewToken, setViewToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/overlay/news")
      .then((r) => r.json())
      .then((p) => {
        if (!p.ok) throw new Error(p.message || "load failed");
        setNews(normalizeNewsState(p.state));
        setViewToken(p.viewToken || "");
        setLoaded(true);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "load failed"));
  }, []);

  useEffect(() => {
    fetch("/api/players")
      .then((r) => r.json())
      .then((p) => {
        if (p.ok) setPlayers(p.players as PlayerRow[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch("/api/overlay/news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ news }),
        });
        setSavedAt(Date.now());
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [news, loaded]);

  const patch = useCallback(<K extends keyof NewsState>(key: K, value: Partial<NewsState[K]>) => {
    setNews((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
  }, []);

  if (loadError)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-white/60">저장된 데이터를 불러오지 못했어요. ({loadError})</p>
        <button
          onClick={() => window.location.reload()}
          className="h-9 rounded-lg border border-white/12 bg-white/[0.06] px-4 text-sm font-bold text-white/70"
        >
          새로고침
        </button>
      </div>
    );

  if (!loaded)
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-white/40">
        불러오는 중...
      </div>
    );

  const obsUrl =
    typeof window !== "undefined" && viewToken
      ? `${window.location.origin}/overlay/news?key=${encodeURIComponent(viewToken)}`
      : "";

  const q = playerQuery.trim().toLowerCase();
  const matches = q
    ? players
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q)
        )
        .slice(0, 8)
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-black text-white/90">방송 뉴스 오버레이</h1>
        <span className="text-xs text-white/40">
          {saving ? "저장 중..." : savedAt ? "저장됨" : ""}
        </span>
      </header>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <span className={label}>OBS 브라우저 소스 URL</span>
        <div className="flex gap-2">
          <input readOnly value={obsUrl} className={`${input} font-mono text-xs`} />
          <button
            onClick={() => {
              navigator.clipboard.writeText(obsUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-9 shrink-0 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-bold text-white/70 hover:bg-white/12"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="mt-2 text-xs text-white/40">브라우저 소스 1920×1080, 배경 투명으로 추가하세요.</p>
      </div>

      <Section title="티커" visible={news.ticker.visible} onToggle={(v) => patch("ticker", { visible: v })}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>라벨</span>
            <input className={input} value={news.ticker.label} onChange={(e) => patch("ticker", { label: e.target.value })} />
          </div>
          <div>
            <span className={label}>문구 표시 시간 (초)</span>
            <input
              type="number"
              min={2}
              className={input}
              value={news.ticker.secPerItem}
              onChange={(e) => patch("ticker", { secPerItem: Math.max(2, Number(e.target.value) || 2) })}
            />
          </div>
        </div>
        <div>
          <span className={label}>문구 (한 줄에 하나)</span>
          <textarea
            className={`${input} h-28`}
            value={news.ticker.items.join("\n")}
            onChange={(e) => patch("ticker", { items: e.target.value.split("\n").filter((s) => s.trim()) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>하단 여백 (px)</span>
            <input
              type="number"
              className={input}
              value={news.ticker.y}
              onChange={(e) => patch("ticker", { y: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <span className={label}>크기 (%)</span>
            <input
              type="number"
              className={input}
              value={toPct(news.ticker.scale)}
              onChange={(e) => patch("ticker", { scale: fromPct(e.target.value) })}
            />
          </div>
        </div>
      </Section>

      <Section title="속보 배너" visible={news.banner.visible} onToggle={(v) => patch("banner", { visible: v })}>
        <div>
          <span className={label}>태그</span>
          <input className={input} value={news.banner.tag} onChange={(e) => patch("banner", { tag: e.target.value })} />
        </div>
        <div>
          <span className={label}>헤드라인</span>
          <input className={input} value={news.banner.headline} onChange={(e) => patch("banner", { headline: e.target.value })} />
        </div>
        <div>
          <span className={label}>보조 문구</span>
          <input className={input} value={news.banner.subline} onChange={(e) => patch("banner", { subline: e.target.value })} />
        </div>
        <LayoutFields layout={news.banner.layout} onChange={(layout) => patch("banner", { layout })} />
      </Section>

      <Section title="로워서드" visible={news.lowerThird.visible} onToggle={(v) => patch("lowerThird", { visible: v })}>
        <div>
          <span className={label}>선수 검색 (이름·닉네임)</span>
          <input className={input} value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="이름 일부 입력" />
          {matches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border border-white/10">
              {matches.map((p) => (
                <button
                  key={`${p.name}-${p.nickname ?? ""}`}
                  onClick={() => {
                    patch("lowerThird", {
                      name: p.name,
                      affiliation: p.university ?? "",
                      note: [p.tier, p.race].filter(Boolean).join(" · "),
                    });
                    setPlayerQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/10"
                >
                  {p.name}
                  {p.nickname ? ` (${p.nickname})` : ""} — {p.university ?? "무소속"} · {p.tier ?? "-"} · {p.race}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>태그</span>
            <input className={input} value={news.lowerThird.tag} onChange={(e) => patch("lowerThird", { tag: e.target.value })} />
          </div>
          <div>
            <span className={label}>이름</span>
            <input className={input} value={news.lowerThird.name} onChange={(e) => patch("lowerThird", { name: e.target.value })} />
          </div>
          <div>
            <span className={label}>소속</span>
            <input className={input} value={news.lowerThird.affiliation} onChange={(e) => patch("lowerThird", { affiliation: e.target.value })} />
          </div>
          <div>
            <span className={label}>설명</span>
            <input className={input} value={news.lowerThird.note} onChange={(e) => patch("lowerThird", { note: e.target.value })} />
          </div>
        </div>
        <LayoutFields layout={news.lowerThird.layout} onChange={(layout) => patch("lowerThird", { layout })} />
      </Section>

      <Section title="자료 카드" visible={news.card.visible} onToggle={(v) => patch("card", { visible: v })}>
        <TableEditor
          table={news.card.table}
          onChange={(table) => patch("card", { table })}
          preset={jungmanPreset}
        />
        <LayoutFields layout={news.card.layout} onChange={(layout) => patch("card", { layout })} />
      </Section>

      <Section title="전면 화면" visible={news.fullscreen.visible} onToggle={(v) => patch("fullscreen", { visible: v })}>
        <TableEditor
          table={news.fullscreen.table}
          onChange={(table) => patch("fullscreen", { table })}
          preset={jungmanPreset}
        />
      </Section>
    </div>
  );
}
