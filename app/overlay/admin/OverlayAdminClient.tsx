"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy, Check, Eye, EyeOff,
  Search, Settings, Star, X, Layers, MapPin,
} from "lucide-react";
import {
  defaultOverlayState,
  defaultOverlaySet,
  type OverlayEntryRow,
  type OverlayFavorite,
  type OverlayPanelLayout,
  type OverlayRace,
  type OverlaySet,
  type OverlayState,
} from "@/lib/overlay-types";

// ─── 상수 ───
const RACES: OverlayRace[] = ["T", "P", "Z"];
const RACE_COLORS: Record<string, string> = { T: "#4A9EFF", P: "#FFD700", Z: "#A855F7" };
const RACE_BG:     Record<string, string> = { T: "#4A9EFF22", P: "#FFD70022", Z: "#A855F722" };

function genId() { return Math.random().toString(36).slice(2, 9); }

type FocusedField = { kind: "scoreboard"; side: "left" | "right" };

// ─── 메인 컴포넌트 ───
export default function OverlayAdminClient({
  overlayKey, displayName,
}: { overlayKey: string; displayName: string }) {
  const [state, setState]       = useState<OverlayState>(defaultOverlayState());
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [mapsModalOpen, setMapsModalOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<string | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // 타이틀 프리셋
  type TitlePreset = { id: string; title: string };
  const DEFAULT_PRESETS: TitlePreset[] = [
    { id: "preset-proleague", title: "프로리그 7/4" },
    { id: "preset-winners",   title: "위너스리그 9/5" },
  ];
  const PRESET_KEY = `overlay_title_presets_${overlayKey}`;
  const [titlePresets, setTitlePresets] = useState<TitlePreset[]>(() => {
    if (typeof window === "undefined") return DEFAULT_PRESETS;
    try {
      const stored = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "null");
      // 기존 프리셋(set 필드 포함)도 title만 사용하도록 정규화
      if (Array.isArray(stored) && stored.length > 0)
        return stored.map((p: { id?: string; title: string }) => ({ id: p.id ?? genId(), title: p.title }));
      return DEFAULT_PRESETS;
    } catch { return DEFAULT_PRESETS; }
  });
  const savePresets  = (next: TitlePreset[]) => { setTitlePresets(next); localStorage.setItem(PRESET_KEY, JSON.stringify(next)); };
  const addPreset    = () => { if (!state.title.trim()) return; savePresets([...titlePresets, { id: genId(), title: state.title.trim() }]); };
  const removePreset = (id: string) => savePresets(titlePresets.filter(p => p.id !== id));

  const scoreboardUrl = typeof window !== "undefined"
    ? `${window.location.origin}/overlay/scoreboard?key=${encodeURIComponent(overlayKey)}`
    : "";

  // ── 초기 로드 ──
  useEffect(() => {
    fetch(`/api/overlay/state?key=${encodeURIComponent(overlayKey)}`)
      .then(r => r.json())
      .then(p => {
        if (p.ok && p.state) {
          const d = defaultOverlayState();
          const loaded: OverlayState = {
            ...d,
            ...p.state,
            scoreboardLayout: p.state.scoreboardLayout ?? d.scoreboardLayout,
            entryLayout:      p.state.entryLayout      ?? d.entryLayout,
            favorites:        p.state.favorites        ?? [],
            sets:             p.state.sets             ?? [],
            maps:             p.state.maps             ?? [],
            activeSetId:      p.state.activeSetId      ?? null,
          };
          setState(loaded);
          if (loaded.sets.length > 0) setAdminTab(loaded.activeSetId ?? loaded.sets[0].id);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [overlayKey]);

  // ── 자동 저장 ──
  useEffect(() => {
    if (!loaded) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(state), 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loaded]);

  const doSave = useCallback(async (s: OverlayState) => {
    setSaving(true); setDirty(false);
    try {
      await fetch("/api/overlay/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: s }),
      });
    } finally { setSaving(false); }
  }, []);

  // ── 상태 헬퍼 ──
  const upd      = (patch: Partial<OverlayState>)              => setState(s => ({ ...s, ...patch }));
  const updLeft  = (patch: Partial<OverlayState["left"]>)      => setState(s => ({ ...s, left:  { ...s.left,  ...patch } }));
  const updRight = (patch: Partial<OverlayState["right"]>)     => setState(s => ({ ...s, right: { ...s.right, ...patch } }));
  const updLayout = (key: "scoreboardLayout" | "entryLayout", patch: Partial<OverlayPanelLayout>) =>
    setState(s => ({ ...s, [key]: { ...s[key], ...patch } }));

  // ── 즐겨찾기 ──
  const applyFavorite = (fav: OverlayFavorite) => {
    if (!focusedField) return;
    if (focusedField.side === "left") updLeft({ playerName: fav.name, race: fav.race });
    else updRight({ playerName: fav.name, race: fav.race });
  };
  const addFavorite    = (fav: Omit<OverlayFavorite, "id">) => {
    if (state.favorites.some(f => f.name === fav.name)) return;
    setState(s => ({ ...s, favorites: [...s.favorites, { ...fav, id: genId() }] }));
  };
  const removeFavorite = (id: string) => setState(s => ({ ...s, favorites: s.favorites.filter(f => f.id !== id) }));

  // ── 맵 풀 ──
  const addMap    = (name: string) => {
    const n = name.trim();
    if (!n || state.maps.includes(n)) return;
    setState(s => ({ ...s, maps: [...s.maps, n] }));
  };
  const removeMap = (name: string) => setState(s => ({ ...s, maps: s.maps.filter(m => m !== name) }));

  // ── 세트 ──
  const addSet = (isAce = false) => {
    const newSet = defaultOverlaySet(isAce ? "에이스" : "", isAce);
    setState(s => ({ ...s, sets: [...s.sets, newSet], activeSetId: s.activeSetId ?? newSet.id }));
    setAdminTab(newSet.id);
  };

  const removeSet = (id: string) => {
    const remaining = state.sets.filter(s => s.id !== id);
    setState(s => ({
      ...s,
      sets: remaining,
      activeSetId: s.activeSetId === id ? (remaining[0]?.id ?? null) : s.activeSetId,
    }));
    setAdminTab(remaining[0]?.id ?? null);
  };

  const patchSet = (id: string, patch: Partial<OverlaySet>) =>
    setState(s => ({ ...s, sets: s.sets.map(set => set.id === id ? { ...set, ...patch } : set) }));

  // ── 풀 관리 ──
  const addToPool = (setId: string, side: "left" | "right", name: string) => {
    const field = side === "left" ? "leftPool" : "rightPool";
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId
        ? { ...set, [field]: set[field].includes(name) ? set[field] : [...set[field], name] }
        : set),
    }));
  };

  const removeFromPool = (setId: string, side: "left" | "right", name: string) => {
    const field = side === "left" ? "leftPool" : "rightPool";
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId
        ? { ...set, [field]: (set[field] as string[]).filter(n => n !== name) }
        : set),
    }));
  };

  // ── 엔트리 ──
  const addEntry = (setId: string, entry: { leftPlayer: string; rightPlayer: string; map: string }) => {
    const newEntry: OverlayEntryRow = { ...entry, id: genId(), result: null };
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId ? { ...set, entries: [...set.entries, newEntry] } : set),
    }));
  };

  const removeEntry = (setId: string, entryId: string) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => {
        if (set.id !== setId) return set;
        const idx  = set.entries.findIndex(e => e.id === entryId);
        const next = set.entries.filter(e => e.id !== entryId);
        let cur    = set.currentMatch;
        if (cur !== null) {
          if (next.length === 0) cur = null;
          else if (cur > idx)   cur = cur - 1;
          else                  cur = Math.min(cur, next.length - 1);
        }
        return { ...set, entries: next, currentMatch: cur };
      }),
    }));
  };

  const setResult = (setId: string, entryId: string, result: "left" | "right") => {
    let msg = "";
    setState(s => {
      const set = s.sets.find(set => set.id === setId);
      if (!set) return s;
      const rowIdx = set.entries.findIndex(e => e.id === entryId);
      if (rowIdx === -1) return s;
      const newResult = set.entries[rowIdx].result === result ? null : result;
      const newEntries = set.entries.map(e => e.id === entryId ? { ...e, result: newResult } : e);
      const sL = newEntries.filter(e => e.result === "left").length;
      const sR = newEntries.filter(e => e.result === "right").length;
      msg = newResult ? `${newResult === "left" ? "좌팀" : "우팀"} 승 — ${sL}:${sR}` : `취소 — ${sL}:${sR}`;
      return {
        ...s,
        sets: s.sets.map(set => set.id === setId
          ? { ...set, entries: newEntries, currentMatch: newResult !== null ? rowIdx : set.currentMatch }
          : set),
      };
    });
    if (msg) showToast(msg);
  };

  const loadMatch = (setId: string, idx: number) => {
    setState(s => {
      const set = s.sets.find(set => set.id === setId);
      if (!set) return s;
      const row  = set.entries[idx];
      const lFav = s.favorites.find(f => f.name === row.leftPlayer);
      const rFav = s.favorites.find(f => f.name === row.rightPlayer);
      return {
        ...s,
        activeSetId: setId,
        sets: s.sets.map(set => set.id === setId ? { ...set, currentMatch: idx } : set),
        left:  { ...s.left,  playerName: row.leftPlayer  || s.left.playerName,  ...(lFav ? { race: lFav.race } : {}) },
        right: { ...s.right, playerName: row.rightPlayer || s.right.playerName, ...(rFav ? { race: rFav.race } : {}) },
      };
    });
    showToast(`${idx + 1}경기 로드`);
  };

  const addNextMatch = (setId: string, winnerSide: "left" | "right", nextOpponent: string) => {
    if (!nextOpponent) return;
    setState(s => {
      const set = s.sets.find(set => set.id === setId);
      if (!set || set.currentMatch === null) return s;
      const cur    = set.entries[set.currentMatch];
      const winner = winnerSide === "left" ? cur.leftPlayer : cur.rightPlayer;
      const newEntry: OverlayEntryRow = {
        id: genId(),
        leftPlayer:  winnerSide === "left"  ? winner : nextOpponent,
        rightPlayer: winnerSide === "right" ? winner : nextOpponent,
        map: cur.map,
        result: null,
      };
      const newEntries = [...set.entries, newEntry];
      return {
        ...s,
        activeSetId: setId,
        sets: s.sets.map(set => set.id === setId
          ? { ...set, entries: newEntries, currentMatch: newEntries.length - 1 }
          : set),
        left:  { ...s.left,  playerName: newEntry.leftPlayer  || s.left.playerName },
        right: { ...s.right, playerName: newEntry.rightPlayer || s.right.playerName },
      };
    });
    showToast("다음 경기 추가");
  };

  const resetSetResults = (setId: string) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId
        ? { ...set, entries: set.entries.map(e => ({ ...e, result: null })), currentMatch: null }
        : set),
    }));
    showToast("세트 결과 초기화");
  };

  // ── 파생값 ──
  const activeSet  = state.sets.find(s => s.id === state.activeSetId) ?? null;
  const scoreLeft  = activeSet?.entries.filter(e => e.result === "left").length  ?? 0;
  const scoreRight = activeSet?.entries.filter(e => e.result === "right").length ?? 0;
  const editingSet = state.sets.find(s => s.id === adminTab) ?? null;
  const activeSetLabel = (() => {
    const idx = state.sets.findIndex(s => s.id === state.activeSetId);
    return activeSet?.isAce ? "에이스" : idx >= 0 ? `${idx + 1}SET` : "-";
  })();

  if (!loaded) return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
      불러오는 중...
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-5 pb-20 select-none">

      {/* ── 헤더 ── */}
      <div className="mb-4 rounded-2xl border border-white/10 overflow-hidden border-l-[3px] border-l-emerald-500/70">
        <div className="px-5 py-2.5 bg-white/[0.07] border-b border-white/8 flex items-center gap-1.5">
          <div className="w-[3px] h-[13px] rounded-full bg-emerald-400/70" />
          <p className="text-xs font-bold text-emerald-300/85 tracking-tight">타이틀</p>
          {state.title && (
            <button onClick={() => upd({ title: "" })}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-0.5">
              지우기 <X size={10} />
            </button>
          )}
        </div>
        <div className="px-5 py-3.5 bg-white/[0.03] border-b border-white/6 flex items-center gap-3">
          <input
            className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-xl font-black outline-none placeholder:text-white/15 leading-tight focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors"
            value={state.title}
            onChange={e => upd({ title: e.target.value })}
            placeholder="타이틀을 입력하세요..."
          />
          <div className="shrink-0 text-center">
            <p className="text-[11px] font-bold text-white/65 mb-1">경기 모드</p>
            <div className="flex items-center gap-1">
              {(["team", "individual"] as const).map(m => (
                <button key={m} onClick={() => upd({ mode: m })}
                  className={`rounded-lg px-3 h-8 text-xs font-bold transition-all ${state.mode === m ? "bg-blue-600 text-white" : "bg-white/8 text-white/40 hover:bg-white/15 hover:text-white"}`}>
                  {m === "team" ? "팀전" : "개인전"}
                </button>
              ))}
            </div>
          </div>
          <div className="shrink-0 flex items-end gap-2">
            <UrlCopyBtn url={scoreboardUrl} />
            <button onClick={() => setObsModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/6 border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all">
              <Settings size={13} />
              <span className="text-xs font-semibold">OBS</span>
            </button>
            <span className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${saving ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : dirty ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-400/70" : "border-green-500/30 bg-green-500/5 text-green-400/70"}`}>
              {saving ? "저장 중..." : dirty ? "미저장" : "저장됨"}
            </span>
          </div>
        </div>
        {/* 프리셋 */}
        <div className="px-5 py-3 bg-white/[0.01]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-white/35">프리셋</span>
            {state.title && (
              <button onClick={addPreset}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all">
                + 현재 저장
              </button>
            )}
          </div>
          {titlePresets.length === 0
            ? <p className="text-[10px] text-white/20 italic">저장된 프리셋이 없어요</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {titlePresets.map(p => (
                  <div key={p.id} className="relative group">
                    <button onClick={() => upd({ title: p.title })}
                      className="rounded-md px-2.5 py-1 text-[11px] font-semibold bg-white/5 border border-white/10 text-white/40 hover:bg-blue-500/15 hover:border-blue-400/30 hover:text-blue-300 transition-all pr-5">
                      {p.title}
                    </button>
                    <button onClick={() => removePreset(p.id)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-zinc-700 border border-white/10 text-white/40 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ── 2컬럼 그리드 ── */}
      <div className="grid lg:grid-cols-[430px_1fr] gap-4">

        {/* ── 좌측: 스코어보드 설정 ── */}
        <div className="space-y-3">

          {/* 스코어 표시 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-red-500/60 bg-white/[0.04] overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.05] flex items-center justify-between">
              <span className="text-base font-bold text-white/85">스코어보드</span>
              <span className="text-xs font-semibold text-white/35">활성 세트 · {activeSetLabel}</span>
            </div>

            {/* 가운데 점수판 */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 border-b border-white/8 bg-black/20">
              <span className="text-sm font-bold truncate text-right" style={{ color: "#d08a84" }}>
                {state.left.teamName || "좌팀"}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black tabular-nums leading-none" style={{ color: "#d97b73" }}>{scoreLeft}</span>
                <span className="text-2xl font-bold text-white/25 leading-none">:</span>
                <span className="text-4xl font-black tabular-nums leading-none" style={{ color: "#7396cc" }}>{scoreRight}</span>
              </div>
              <span className="text-sm font-bold truncate text-left" style={{ color: "#8aa6d0" }}>
                {state.right.teamName || "우팀"}
              </span>
            </div>

            {/* 좌/우 선수 대칭 입력 */}
            <div className="grid grid-cols-2">
              {(["left", "right"] as const).map(side => {
                const player = side === "left" ? state.left : state.right;
                const update = side === "left" ? updLeft : updRight;
                const isLeft = side === "left";
                const focused = focusedField?.kind === "scoreboard" && focusedField.side === side;
                const align: "left" | "right" = isLeft ? "left" : "right";
                const lblCls = `block text-[11px] font-bold mb-1 ${isLeft ? "text-left" : "text-right"}`;
                return (
                  <div key={side}
                    className={`p-3.5 space-y-3 ${isLeft ? "border-r border-white/8" : ""} ${focused ? "bg-white/[0.02]" : ""}`}>
                    {/* 사이드 헤더 */}
                    <div className={`flex items-center gap-2 ${isLeft ? "" : "flex-row-reverse"}`}>
                      <span className="w-2 h-4 rounded-full" style={{ background: isLeft ? "#c4554d" : "#5577b0" }} />
                      <span className="text-sm font-black" style={{ color: isLeft ? "#d08a84" : "#8aa6d0" }}>
                        {isLeft ? "좌측" : "우측"}
                      </span>
                    </div>
                    {/* 팀명 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>팀명</label>
                      <input className="input-base w-full text-sm" value={player.teamName}
                        onChange={e => update({ teamName: e.target.value })} placeholder="예: T1"
                        style={{ textAlign: align }} />
                    </div>
                    {/* 선수명 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>선수명</label>
                      <input
                        className={`input-base w-full text-base font-bold transition-all ${focused ? "border-blue-500/60 bg-blue-500/8 ring-1 ring-blue-500/20" : ""}`}
                        value={player.playerName}
                        onChange={e => update({ playerName: e.target.value })}
                        onFocus={() => setFocusedField({ kind: "scoreboard", side })}
                        placeholder="예: 이제동"
                        style={{ textAlign: align }}
                      />
                    </div>
                    {/* 종족 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>종족</label>
                      <div className={`flex gap-1 ${isLeft ? "" : "flex-row-reverse"}`}>
                        {RACES.map(r => (
                          <button key={r} onClick={() => update({ race: r })}
                            className="flex-1 h-8 rounded-lg text-sm font-black transition-all"
                            style={{
                              background: player.race === r ? RACE_BG[r] : "rgba(255,255,255,0.05)",
                              border: `1px solid ${player.race === r ? RACE_COLORS[r] : "rgba(255,255,255,0.1)"}`,
                              color: player.race === r ? RACE_COLORS[r] : "rgba(255,255,255,0.3)",
                            }}>{r}</button>
                        ))}
                      </div>
                    </div>
                    {/* 스타팅 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>스타팅 위치 / 색상</label>
                      <div className={`flex gap-1.5 items-center ${isLeft ? "" : "flex-row-reverse"}`}>
                        <input className="input-base flex-1 min-w-0 text-sm" value={player.startingPoint}
                          onChange={e => update({ startingPoint: e.target.value })} placeholder="예: 12시"
                          style={{ textAlign: align }} />
                        <input type="color" value={player.startingColor}
                          onChange={e => update({ startingColor: e.target.value })}
                          className="w-8 h-8 shrink-0 rounded-lg border border-white/15 bg-transparent cursor-pointer" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 엔트리 표시 토글 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/55">오버레이 대진표 표시</span>
            <button
              onClick={() => updLayout("entryLayout", { visible: !state.entryLayout.visible })}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold border transition-all ${
                state.entryLayout.visible
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-white/5 border-white/10 text-white/30"
              }`}>
              {state.entryLayout.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              {state.entryLayout.visible ? "표시 중" : "숨김"}
            </button>
          </div>

        </div>

        {/* ── 우측: 즐겨찾기 + 맵풀 + 대진표 ── */}
        <div className="space-y-3">

          {/* 즐겨찾기 / 선수 등록 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-yellow-500/60 bg-white/[0.04]">
            <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.05] flex items-center gap-2">
              <Star size={12} className="text-yellow-500/60" />
              <span className="text-sm font-bold text-white/65">선수 등록 / 즐겨찾기</span>
              {focusedField && (
                <span className="ml-auto text-[10px] text-blue-400/70">
                  칩 클릭 → {focusedField.side === "left" ? "좌측" : "우측"} 스코어보드
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/8">
              <div className="px-3 py-3">
                <PlayerSearchAdd onAdd={addFavorite} existingNames={state.favorites.map(f => f.name)} />
              </div>
              <div className="px-3 py-3">
                {state.favorites.length === 0
                  ? <p className="text-[10px] text-white/20 italic">등록된 선수 없음</p>
                  : (
                    <div className="flex flex-wrap gap-1">
                      {state.favorites.map(fav => (
                        <FavoriteChip
                          key={fav.id}
                          fav={fav}
                          active={!!focusedField}
                          hasActiveSet={!!adminTab}
                          onClick={() => applyFavorite(fav)}
                          onRemove={() => removeFavorite(fav.id)}
                          onAddToLeftPool={() => adminTab && addToPool(adminTab, "left", fav.name)}
                          onAddToRightPool={() => adminTab && addToPool(adminTab, "right", fav.name)}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* 대진표 관리 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-purple-500/60 bg-white/[0.04]">
            <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.05] flex items-center gap-2">
              <Layers size={12} className="text-purple-400/60" />
              <span className="text-sm font-bold text-white/65">대진표 관리</span>
              <button onClick={() => setMapsModalOpen(true)}
                className="ml-auto flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/30 transition-all">
                <MapPin size={11} />
                <span className="text-[11px] font-semibold">맵 풀</span>
                <span className="text-[10px] text-white/25">{state.maps.length}</span>
              </button>
            </div>

            {/* 세트 탭 */}
            <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-white/8 flex-wrap">
              {state.sets.map((set, idx) => (
                <button key={set.id}
                  onClick={() => setAdminTab(set.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    adminTab === set.id
                      ? set.isAce ? "bg-yellow-500/20 border border-yellow-400/40 text-yellow-300" : "bg-purple-500/20 border border-purple-400/40 text-purple-300"
                      : "bg-white/5 border border-white/10 text-white/40 hover:bg-white/10"
                  }`}>
                  {set.isAce ? "에이스" : `${idx + 1}SET`}
                  {state.activeSetId === set.id && <span className="ml-1 text-[8px] text-emerald-400">●</span>}
                </button>
              ))}
              <button onClick={() => addSet(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-white/35 hover:bg-purple-500/15 hover:text-purple-300 hover:border-purple-400/30 transition-all">
                + SET
              </button>
              <button onClick={() => addSet(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-white/35 hover:bg-yellow-500/15 hover:text-yellow-300 hover:border-yellow-400/30 transition-all">
                + 에이스
              </button>
              {adminTab && (
                <button onClick={() => removeSet(adminTab)}
                  className="ml-auto px-2 py-1 rounded-lg text-[10px] text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20">
                  세트 삭제
                </button>
              )}
            </div>

            {/* 세트 에디터 */}
            {editingSet ? (
              <SetEditor
                set={editingSet}
                maps={state.maps}
                favorites={state.favorites}
                isActive={editingSet.id === state.activeSetId}
                onPatch={patch => patchSet(editingSet.id, patch)}
                onAddEntry={entry => addEntry(editingSet.id, entry)}
                onRemoveEntry={id => removeEntry(editingSet.id, id)}
                onSetResult={(id, r) => setResult(editingSet.id, id, r)}
                onLoad={idx => loadMatch(editingSet.id, idx)}
                onAddToPool={(side, name) => addToPool(editingSet.id, side, name)}
                onRemoveFromPool={(side, name) => removeFromPool(editingSet.id, side, name)}
                onNextMatch={(winSide, opp) => addNextMatch(editingSet.id, winSide, opp)}
                onReset={() => resetSetResults(editingSet.id)}
                onSetActive={() => setState(s => ({ ...s, activeSetId: editingSet.id }))}
              />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-white/25">
                + SET 버튼으로 세트를 추가하세요
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── OBS 모달 ── */}
      {obsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setObsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/15 bg-[#111114] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.04] border-l-[3px] border-l-white/25">
              <div className="flex items-center gap-2.5">
                <Settings size={14} className="text-white/50" />
                <span className="font-bold text-sm text-white/80">OBS 레이아웃 설정</span>
              </div>
              <button onClick={() => setObsModalOpen(false)} className="text-white/30 hover:text-white/70 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* 패널 표시 */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">패널 표시</p>
                <div className="flex gap-2">
                  {(["scoreboardLayout", "entryLayout"] as const).map(k => (
                    <button key={k}
                      onClick={() => updLayout(k, { visible: !state[k].visible })}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${state[k].visible ? "bg-blue-500/20 border-blue-400/50 text-blue-300" : "bg-white/5 border-white/10 text-white/35"}`}>
                      {state[k].visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      {k === "scoreboardLayout" ? "스코어보드" : "대진표"}
                    </button>
                  ))}
                </div>
              </div>
              {/* 위치/크기 */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">위치 / 크기 <span className="text-white/20 font-normal">(Y: 스코어보드=하단에서, 대진표=상단에서)</span></p>
                <div className="space-y-4">
                  <LayoutPanel label="스코어보드" layout={state.scoreboardLayout} onChange={p => updLayout("scoreboardLayout", p)} />
                  <LayoutPanel label="대진표"     layout={state.entryLayout}      onChange={p => updLayout("entryLayout",      p)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 맵 풀 모달 ── */}
      {mapsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMapsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/15 border-l-[3px] border-l-cyan-500/60 bg-[#111114] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-2.5">
                <MapPin size={14} className="text-cyan-400/60" />
                <span className="font-bold text-sm text-white/80">맵 풀 관리</span>
                <span className="text-[11px] text-white/30">시즌마다 한 번 등록</span>
              </div>
              <button onClick={() => setMapsModalOpen(false)} className="text-white/30 hover:text-white/70 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <MapPoolBody maps={state.maps} onAdd={addMap} onRemove={removeMap} />
            </div>
          </div>
        </div>
      )}

      {/* ── 토스트 ── */}
      {toast && (
        <>
          <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
          <div className="fixed bottom-8 left-1/2 z-50 pointer-events-none"
            style={{ animation: "toastIn 0.2s ease-out", transform: "translateX(-50%)" }}>
            <div className="rounded-xl bg-[#17171b] border border-white/15 shadow-2xl shadow-black/70 px-5 py-2.5 flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-white/85 whitespace-nowrap">{toast}</span>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── SetEditor ───
function SetEditor({ set, maps, favorites, isActive, onPatch, onAddEntry, onRemoveEntry, onSetResult, onLoad, onAddToPool, onRemoveFromPool, onNextMatch, onReset, onSetActive }: {
  set: OverlaySet;
  maps: string[];
  favorites: OverlayFavorite[];
  isActive: boolean;
  onPatch: (p: Partial<OverlaySet>) => void;
  onAddEntry: (e: { leftPlayer: string; rightPlayer: string; map: string }) => void;
  onRemoveEntry: (id: string) => void;
  onSetResult: (id: string, r: "left" | "right") => void;
  onLoad: (idx: number) => void;
  onAddToPool: (side: "left" | "right", name: string) => void;
  onRemoveFromPool: (side: "left" | "right", name: string) => void;
  onNextMatch: (winSide: "left" | "right", opp: string) => void;
  onReset: () => void;
  onSetActive: () => void;
}) {
  const [quickLeft, setQuickLeft]   = useState("");
  const [quickRight, setQuickRight] = useState("");
  const [quickMap, setQuickMap]     = useState("");
  const [nextOpp, setNextOpp]       = useState("");

  const lastEntry  = set.entries[set.entries.length - 1] ?? null;
  const canAddNext = lastEntry?.result != null;
  const winnerSide = lastEntry?.result as "left" | "right" | null;

  const handleQuickAdd = () => {
    if (!quickLeft || !quickRight) return;
    onAddEntry({ leftPlayer: quickLeft, rightPlayer: quickRight, map: quickMap });
    setQuickLeft(""); setQuickRight(""); setQuickMap("");
  };

  const favNotInPool = (pool: string[]) => favorites.filter(f => !pool.includes(f.name));

  return (
    <div className="p-3 space-y-3">
      {/* 타이틀 + 액션 */}
      <div className="flex items-center gap-2">
        <input
          className="input-base flex-1 text-sm font-semibold"
          value={set.title}
          onChange={e => onPatch({ title: e.target.value })}
          placeholder={set.isAce ? "에이스 결정전" : "세트 제목 (예: 위너스리그 9/5)"}
        />
        <button
          onClick={onSetActive}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-bold border transition-all ${
            isActive
              ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
              : "bg-white/5 border-white/10 text-white/35 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-400/30"
          }`}>
          {isActive ? "● 활성" : "활성화"}
        </button>
        <button onClick={onReset}
          className="shrink-0 h-8 px-2 rounded-lg text-[10px] text-red-400/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
          초기화
        </button>
      </div>

      {/* 팀 풀 */}
      <div className="grid grid-cols-2 gap-2">
        {(["left", "right"] as const).map(side => {
          const pool     = side === "left" ? set.leftPool : set.rightPool;
          const label    = side === "left" ? "좌팀 풀" : "우팀 풀";
          const color    = side === "left" ? "text-red-400/60" : "text-blue-400/60";
          const avail    = favNotInPool(pool);
          return (
            <div key={side} className="rounded-xl border border-white/8 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-bold ${color}`}>{label}</span>
                {avail.length > 0 && (
                  <select
                    className="text-[10px] bg-white/5 border border-white/10 rounded-md px-1 py-0.5 text-white/40 focus:outline-none"
                    value=""
                    onChange={e => { if (e.target.value) { onAddToPool(side, e.target.value); e.target.value = ""; } }}>
                    <option value="">+ 추가</option>
                    {avail.map(f => <option key={f.id} value={f.name}>{f.name} ({f.race})</option>)}
                  </select>
                )}
              </div>
              {pool.length === 0
                ? <p className="text-[10px] text-white/20 italic">선수 없음</p>
                : (
                  <div className="flex flex-wrap gap-1">
                    {pool.map(name => (
                      <span key={name} className="group flex items-center gap-0.5 rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                        {name}
                        <button onClick={() => onRemoveFromPool(side, name)} className="ml-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><X size={9} /></button>
                      </span>
                    ))}
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {/* 빠른 배정 */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
        <p className="text-[10px] font-bold text-white/30 mb-2">빠른 배정</p>
        <div className="flex items-center gap-1.5">
          <select className="flex-1 min-w-0 input-base text-xs"
            value={quickLeft} onChange={e => setQuickLeft(e.target.value)}>
            <option value="">좌팀 선수</option>
            {set.leftPool.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-white/20 text-xs shrink-0">VS</span>
          <select className="flex-1 min-w-0 input-base text-xs"
            value={quickRight} onChange={e => setQuickRight(e.target.value)}>
            <option value="">우팀 선수</option>
            {set.rightPool.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="w-24 shrink-0 input-base text-xs"
            value={quickMap} onChange={e => setQuickMap(e.target.value)}>
            <option value="">맵</option>
            {maps.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={handleQuickAdd}
            disabled={!quickLeft || !quickRight}
            className="shrink-0 h-8 px-3 rounded-lg bg-purple-600 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            배정
          </button>
        </div>
      </div>

      {/* 대진표 목록 */}
      {set.entries.length > 0 && (
        <div className="rounded-xl border border-white/8 overflow-hidden">
          {set.entries.map((entry, idx) => {
            const isCurrent = set.currentMatch === idx;
            const lFav = favorites.find(f => f.name === entry.leftPlayer);
            const rFav = favorites.find(f => f.name === entry.rightPlayer);
            return (
              <div key={entry.id}
                className={`flex items-center gap-2 px-3 py-2 border-b border-white/6 last:border-b-0 ${isCurrent ? "bg-purple-500/8" : "hover:bg-white/[0.02]"} transition-colors`}>
                <span className={`w-5 text-center text-[10px] font-bold shrink-0 ${isCurrent ? "text-purple-400" : "text-white/25"}`}>{idx + 1}</span>
                {/* 좌 선수 */}
                <div className="flex-1 text-right">
                  <span className={`text-xs font-semibold ${entry.result === "right" ? "line-through text-white/25" : entry.result === "left" ? "text-emerald-300" : "text-white/80"}`}>
                    {entry.leftPlayer || "—"}
                  </span>
                  {lFav && <span className="ml-1 text-[9px]" style={{ color: RACE_COLORS[lFav.race] }}>{lFav.race}</span>}
                </div>
                {/* 맵 */}
                <span className="text-[10px] text-white/25 w-12 text-center shrink-0">{entry.map ? entry.map.slice(0, 4) : "—"}</span>
                {/* 우 선수 */}
                <div className="flex-1">
                  {rFav && <span className="mr-1 text-[9px]" style={{ color: RACE_COLORS[rFav.race] }}>{rFav.race}</span>}
                  <span className={`text-xs font-semibold ${entry.result === "left" ? "line-through text-white/25" : entry.result === "right" ? "text-blue-300" : "text-white/80"}`}>
                    {entry.rightPlayer || "—"}
                  </span>
                </div>
                {/* 결과 버튼 */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onSetResult(entry.id, "left")}
                    className={`h-6 px-1.5 rounded text-[10px] font-black transition-all ${entry.result === "left" ? "bg-red-500/30 text-red-300 border border-red-400/40" : "bg-white/5 text-white/20 hover:bg-red-500/15 hover:text-red-300"}`}>
                    L
                  </button>
                  <button onClick={() => onSetResult(entry.id, "right")}
                    className={`h-6 px-1.5 rounded text-[10px] font-black transition-all ${entry.result === "right" ? "bg-blue-500/30 text-blue-300 border border-blue-400/40" : "bg-white/5 text-white/20 hover:bg-blue-500/15 hover:text-blue-300"}`}>
                    R
                  </button>
                  <button onClick={() => onLoad(idx)}
                    className={`h-6 px-1.5 rounded text-[10px] font-bold transition-all ${isCurrent ? "bg-purple-500/25 text-purple-300 border border-purple-400/30" : "bg-white/5 text-white/25 hover:bg-purple-500/15 hover:text-purple-300"}`}>
                    로드
                  </button>
                  <button onClick={() => onRemoveEntry(entry.id)}
                    className="h-6 w-6 flex items-center justify-center rounded text-white/15 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <X size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 위너스리그: 다음 경기 */}
      {canAddNext && winnerSide && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
          <p className="text-[10px] font-bold text-emerald-400/70 mb-2">다음 경기 (위너스리그)</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/60 shrink-0">
              {winnerSide === "left" ? lastEntry?.leftPlayer : lastEntry?.rightPlayer}
              <span className="ml-1 text-emerald-400/60 text-[9px]">유지</span>
            </span>
            <span className="text-white/20 text-xs shrink-0">VS</span>
            <select className="flex-1 input-base text-xs"
              value={nextOpp}
              onChange={e => setNextOpp(e.target.value)}>
              <option value="">상대 선수 선택...</option>
              {(winnerSide === "left" ? set.rightPool : set.leftPool).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              onClick={() => { onNextMatch(winnerSide, nextOpp); setNextOpp(""); }}
              disabled={!nextOpp}
              className="shrink-0 h-8 px-3 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 맵 풀 본문 (모달 내부) ───
function MapPoolBody({ maps, onAdd, onRemove }: {
  maps: string[]; onAdd: (n: string) => void; onRemove: (n: string) => void;
}) {
  const [input, setInput] = useState("");
  const handleAdd = () => { if (!input.trim()) return; onAdd(input.trim()); setInput(""); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          autoFocus
          className="input-base flex-1 text-sm"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="맵 이름 입력 후 Enter..."
        />
        <button onClick={handleAdd}
          className="shrink-0 h-9 px-4 rounded-lg bg-cyan-600 text-sm font-bold text-white hover:bg-cyan-500 transition-all">
          추가
        </button>
      </div>
      <p className="text-[11px] text-white/25">오버레이 대진표에서 맵 이름의 앞 2글자로 표시됩니다.</p>
      {maps.length === 0
        ? <p className="text-xs text-white/20 italic py-4 text-center">등록된 맵이 없습니다</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {maps.map(m => (
              <span key={m} className="group flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/8 px-2.5 py-1.5 text-sm font-semibold text-cyan-300/70">
                <span className="text-cyan-300 font-black">{m.slice(0, 2)}</span>
                <span className="text-white/40 text-xs">{m}</span>
                <button onClick={() => onRemove(m)}
                  className="ml-0.5 text-white/25 hover:text-red-400 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── 즐겨찾기 칩 ───
function FavoriteChip({ fav, active, hasActiveSet, onClick, onRemove, onAddToLeftPool, onAddToRightPool }: {
  fav: OverlayFavorite; active: boolean; hasActiveSet: boolean;
  onClick: () => void; onRemove: () => void;
  onAddToLeftPool: () => void; onAddToRightPool: () => void;
}) {
  return (
    <div className="group flex items-center gap-0.5">
      {hasActiveSet && (
        <button onClick={e => { e.stopPropagation(); onAddToLeftPool(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-l-full bg-white/5 border border-white/10 hover:bg-red-500/25 hover:border-red-400/40 text-white/30 hover:text-red-300 text-[10px] font-bold flex items-center justify-center"
          title="좌팀 풀에 추가">←</button>
      )}
      <div
        className={`flex items-center gap-1 border px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all ${hasActiveSet ? "" : "rounded-full"} ${active ? "border-blue-400/60 bg-blue-500/20 hover:bg-blue-500/35" : "border-white/15 bg-white/8 hover:bg-white/15"}`}
        onClick={onClick}>
        <span className="text-white">{fav.name}</span>
        <span style={{ color: RACE_COLORS[fav.race], fontSize: "10px", fontWeight: 900 }}>{fav.race}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <X size={10} />
        </button>
      </div>
      {hasActiveSet && (
        <button onClick={e => { e.stopPropagation(); onAddToRightPool(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-r-full bg-white/5 border border-white/10 hover:bg-blue-500/25 hover:border-blue-400/40 text-white/30 hover:text-blue-300 text-[10px] font-bold flex items-center justify-center"
          title="우팀 풀에 추가">→</button>
      )}
    </div>
  );
}

// ─── 레이아웃 패널 ───
function LayoutPanel({ label, layout, onChange }: {
  label: string; layout: OverlayPanelLayout;
  onChange: (p: Partial<OverlayPanelLayout>) => void;
}) {
  const rows = [
    { label: "X",   unit: "px", value: layout.x,     min: -200, max: 1920, step: 1,    key: "x"     as const },
    { label: "Y",   unit: "px", value: layout.y,     min: -200, max: 1080, step: 1,    key: "y"     as const },
    { label: "크기", unit: "×",  value: layout.scale, min: 0.3,  max: 2,    step: 0.01, key: "scale" as const },
  ];
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="space-y-2">
        {rows.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">{s.label}</span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
              onChange={e => onChange({ [s.key]: Number(e.target.value) })}
              className="flex-1 accent-blue-500 h-1 min-w-0" />
            <input type="number" min={s.min} max={s.max} step={s.step} value={s.value}
              onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) onChange({ [s.key]: Math.min(s.max, Math.max(s.min, v)) }); }}
              className="w-16 shrink-0 rounded-md bg-white/6 border border-white/10 px-2 py-0.5 text-xs text-right tabular-nums text-white/80 focus:outline-none focus:border-blue-500/60" />
            <span className="text-xs text-white/30 shrink-0">{s.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 선수 검색 + 추가 ───
type PlayerItem = { id: string; name: string; race: string; university?: string | null };

function PlayerSearchAdd({ onAdd, existingNames }: {
  onAdd: (f: Omit<OverlayFavorite, "id">) => void;
  existingNames: string[];
}) {
  const [query, setQuery]       = useState("");
  const [players, setPlayers]   = useState<PlayerItem[]>([]);
  const [manualRace, setManualRace] = useState<OverlayRace>("T");
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    fetch("/api/players").then(r => r.json()).then(p => { if (p.ok) setPlayers(p.players); }).catch(() => {});
  }, []);

  const filtered = query.length >= 1
    ? players.filter(p => p.name.includes(query) || (p.university ?? "").includes(query)).slice(0, 8)
    : [];
  const isManual = query.length > 0 && !players.some(p => p.name === query);

  const handleAdd = (name: string, race: OverlayRace) => {
    onAdd({ name, race });
    setQuery(""); setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input-base w-full pl-7 text-xs"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="선수 검색 또는 직접 입력..."
          />
        </div>
        {isManual && (
          <>
            {RACES.map(r => (
              <button key={r} onClick={() => setManualRace(r)}
                className="w-8 h-8 rounded-lg text-xs font-black transition-all shrink-0"
                style={{
                  background: manualRace === r ? RACE_BG[r] : "rgba(255,255,255,0.05)",
                  border: `1px solid ${manualRace === r ? RACE_COLORS[r] : "rgba(255,255,255,0.1)"}`,
                  color: manualRace === r ? RACE_COLORS[r] : "rgba(255,255,255,0.3)",
                }}>{r}</button>
            ))}
            <button onClick={() => handleAdd(query.trim(), manualRace)}
              className="shrink-0 rounded-lg bg-blue-600 px-3 h-8 text-xs font-bold text-white hover:bg-blue-500">
              추가
            </button>
          </>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-white/15 bg-[#0d1424] shadow-xl overflow-hidden">
          {filtered.map(p => {
            const race   = (["T", "P", "Z"].includes(p.race) ? p.race : "T") as OverlayRace;
            const already = existingNames.includes(p.name);
            return (
              <button key={p.id}
                onClick={() => !already && handleAdd(p.name, race)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/8 transition-colors ${already ? "opacity-40 cursor-default" : ""}`}>
                <span className="text-xs font-black w-5" style={{ color: RACE_COLORS[race] }}>{race}</span>
                <span className="text-sm font-semibold flex-1">{p.name}</span>
                {p.university && <span className="text-xs text-muted-foreground">{p.university}</span>}
                {already && <span className="text-xs text-muted-foreground">이미 추가됨</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── URL 복사 버튼 ───
function UrlCopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 transition-all" title={url}>
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "복사됨" : "OBS URL"}
    </button>
  );
}
