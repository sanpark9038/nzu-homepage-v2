"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight, Check, ChevronDown, ChevronUp,
  Link2, Maximize2, MessageSquare, Search, Send, Star, Swords, Users, X,
} from "lucide-react";

import { unpackTierPlayersPayload, type TierPlayerPayload } from "@/lib/tier-player-payload";
import type { H2HStats } from "@/types";
import { UNIVERSITY_MAP, getUniversityLabel, normalizeUniversityKey } from "@/lib/university-config";
import { useDuelviewRoom, type ChatMessage } from "./useDuelviewRoom";

const RACE_LABEL: Record<string, string> = {
  T: "Terran", Terran: "Terran",
  P: "Protoss", Protoss: "Protoss",
  Z: "Zerg", Zerg: "Zerg",
  R: "Random", Random: "Random",
};

const SOOP_EMBED_BASE = "https://play.sooplive.com";
const FAVORITES_KEY = "duelview_favorites_v1";
const CHAT_WIDTH_KEY = "duelview_chat_width_v1";
const CHAT_MIN_WIDTH = 200;
const CHAT_MAX_WIDTH = 480;
const RECENT_KEY = "duelview_recent_v1";
const MAX_RECENT = 5;
const QUALITY_PARAMS = "quality=1080p&resolution=1080p&preferredQuality=1080p&vq=hd1080&hd=1";

function buildEmbedUrl(soopId: string) {
  return `${SOOP_EMBED_BASE}/${soopId}/embed?${QUALITY_PARAMS}`;
}

function buildPlayUrl(soopId: string) {
  return `${SOOP_EMBED_BASE}/${soopId}/`;
}

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {}
}

type Panel = { soopId: string; name: string; race: string | null; playerId: string } | null;
type RecentCombo = { p1: NonNullable<Panel>; p2: NonNullable<Panel>; savedAt: number };

function toPanel(p: TierPlayerPayload): Panel {
  if (!p.soop_id) return null;
  return {
    soopId: p.soop_id,
    name: p.nickname || p.name || "",
    race: p.race || null,
    playerId: String(p.id || ""),
  };
}

function loadRecent(): RecentCombo[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function sortTeamKeys(keys: string[]): string[] {
  const withLabel = keys.map((k) => ({ key: k, label: getUniversityLabel(k) }));
  const isKorean = (s: string) => /^[가-힣]/.test(s);
  const fa = withLabel.filter((t) => t.key === "FA");
  const korean = withLabel.filter((t) => t.key !== "FA" && isKorean(t.label));
  const english = withLabel.filter((t) => t.key !== "FA" && !isKorean(t.label));
  korean.sort((a, b) => a.label.localeCompare(b.label, "ko-KR"));
  english.sort((a, b) => a.label.localeCompare(b.label, "en"));
  return [...korean, ...english, ...fa].map((t) => t.key);
}

// 정적 팀 목록 — UNIVERSITY_MAP에서 한 번만 계산, API 불필요
const ALL_TEAM_KEYS: string[] = sortTeamKeys(Object.keys(UNIVERSITY_MAP));

const PLAYERS_CACHE_TTL = 5 * 60 * 1000; // 5분 (티어표와 동일)
const PLAYERS_REFRESH_MS = 5 * 60 * 1000;

async function fetchCachedPlayers(liveOnly: boolean): Promise<TierPlayerPayload[]> {
  const cacheKey = `duelview_players_${liveOnly}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { players, ts } = JSON.parse(cached);
      if (Date.now() - ts < PLAYERS_CACHE_TTL) return players;
    }
  } catch {}
  const url = `/api/tier/players?liveOnly=${liveOnly}`;
  const raw = await fetch(url).then((r) => r.json());
  const players = unpackTierPlayersPayload(raw).players;
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ players, ts: Date.now() }));
  } catch {}
  return players;
}

function removeFromRecent(combo: RecentCombo) {
  try {
    const next = loadRecent().filter(
      (c) => !(c.p1.soopId === combo.p1.soopId && c.p2.soopId === combo.p2.soopId)
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function saveToRecent(p1: NonNullable<Panel>, p2: NonNullable<Panel>) {
  try {
    const existing = loadRecent();
    const deduped = existing.filter(
      (c) => !(
        (c.p1.soopId === p1.soopId && c.p2.soopId === p2.soopId) ||
        (c.p1.soopId === p2.soopId && c.p2.soopId === p1.soopId)
      )
    );
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([{ p1, p2, savedAt: Date.now() }, ...deduped].slice(0, MAX_RECENT))
    );
  } catch {}
}

// ── 즐겨찾기 칩 ──────────────────────────────────────────────────
function FavoriteChip({
  player, isActive, onSelect, onRemove,
}: {
  player: TierPlayerPayload;
  isActive: boolean;
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer select-none transition-all ${
        isActive
          ? "border-nzu-green bg-nzu-green/15 text-nzu-green"
          : "border-amber-400/30 bg-amber-400/8 text-white/80 hover:border-amber-400/50 hover:text-white"
      }`}
    >
      {player.is_live && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />}
      <span>{player.nickname || player.name}</span>
      <button onClick={onRemove} className="ml-0.5 text-white/30 hover:text-white/70 transition-colors">
        <X size={11} />
      </button>
    </div>
  );
}

// ── 검색 드롭다운 아이템 ─────────────────────────────────────────
function SearchResultItem({
  player, isFavorite, isActive, onSelect, onToggleFavorite,
}: {
  player: TierPlayerPayload;
  isFavorite: boolean;
  isActive: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const raceLabel = RACE_LABEL[player.race ?? ""] ?? "";
  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-white/8 ${
        isActive ? "bg-nzu-green/10" : ""
      } ${!player.soop_id ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {player.is_live && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />}
        <span className="text-sm font-medium text-white truncate">{player.nickname || player.name}</span>
        {raceLabel && <span className="text-xs text-white/40 flex-shrink-0">{raceLabel}</span>}
        {player.university && <span className="text-xs text-white/30 flex-shrink-0">{getUniversityLabel(player.university)}</span>}
      </div>
      <button
        onClick={onToggleFavorite}
        className={`flex-shrink-0 p-1 rounded transition-colors ${isFavorite ? "text-amber-400" : "text-white/20 hover:text-amber-400"}`}
      >
        <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

// ── 스코어보드 스트립 (패널 헤더 + H2H 통합) ─────────────────────
function ScoreboardStrip({
  panel1, panel2, onClose, onOpenNew,
}: {
  panel1: Panel;
  panel2: Panel;
  onClose: (slot: 1 | 2) => void;
  onOpenNew: (slot: 1 | 2) => void;
}) {
  const [stats, setStats] = useState<H2HStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!panel1 || !panel2) { setStats(null); return; }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      p1: panel1.name, p2: panel2.name,
      p1_id: panel1.playerId, p2_id: panel2.playerId,
    });
    fetch(`/api/stats/h2h?${params}`)
      .then((r) => r.json())
      .then((data) => { if (cancelled) return; setStats(data?.summary ? data : null); setLoading(false); })
      .catch(() => { if (cancelled) return; setStats(null); setLoading(false); });
    return () => { cancelled = true; };
  }, [panel1?.playerId, panel2?.playerId]);

  if (!panel1 && !panel2) return null;

  const summary = stats?.summary;
  const total = summary?.total ?? 0;
  const p1Wins = summary?.wins ?? 0;
  const p2Wins = summary?.losses ?? 0;
  const p1Pct = total > 0 ? Math.round((p1Wins / total) * 100) : 50;
  const p2Pct = 100 - p1Pct;
  const momentum = summary?.momentum90;
  // API는 최신순으로 주므로 뒤집어서 왼→오 = 과거→최신
  const recentForm = (stats?.recentMatches ?? []).slice(0, 5).reverse();

  const sideInfo = (panel: NonNullable<Panel>, slot: 1 | 2, reverse: boolean) => (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className="truncate text-sm font-bold text-white">{panel.name}</span>
      <span className="flex-shrink-0 text-xs text-white/40">{RACE_LABEL[panel.race ?? ""] ?? ""}</span>
      <button
        onClick={() => onOpenNew(slot)}
        className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white transition-colors"
      >
        새창
      </button>
      <button
        onClick={() => onClose(slot)}
        className="flex-shrink-0 rounded p-0.5 text-white/30 hover:bg-white/10 hover:text-white transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-1.5">
      {panel1 ? sideInfo(panel1, 1, false) : <div className="flex-1 text-xs text-white/25">선수 1을 선택하세요</div>}

      <div className="flex flex-col items-center flex-shrink-0">
        {!panel1 || !panel2 ? (
          <span className="text-xs font-semibold text-white/25">VS</span>
        ) : loading ? (
          <span className="text-xs text-white/30">전적 조회 중...</span>
        ) : total === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <Swords size={11} />
            <span>첫 대결</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black leading-none text-nzu-green">{p1Wins}</span>
              <div className="flex h-1 w-24 overflow-hidden rounded-full bg-white/10">
                <div className="bg-nzu-green transition-all duration-500" style={{ width: `${p1Pct}%` }} />
                <div className="bg-rose-400 transition-all duration-500" style={{ width: `${p2Pct}%` }} />
              </div>
              <span className="text-lg font-black leading-none text-rose-400">{p2Wins}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
              <span>{total}전 · {p1Pct}% vs {p2Pct}%</span>
              {momentum && momentum.total > 0 && (
                <span>
                  최근 3개월{" "}
                  <span className="font-semibold text-nzu-green">{momentum.wins}승</span>{" "}
                  <span className="font-semibold text-rose-400">{momentum.losses}패</span>
                </span>
              )}
              {recentForm.length > 0 && (
                <span className="flex items-center gap-1">
                  {recentForm.map((m) => (
                    <span
                      key={m.id}
                      title={[m.match_date, m.map].filter(Boolean).join(" · ")}
                      className={`h-1.5 w-1.5 rounded-full ${m.is_win ? "bg-nzu-green" : "bg-rose-400"}`}
                    />
                  ))}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {panel2 ? sideInfo(panel2, 2, true) : <div className="flex-1 text-right text-xs text-white/25">선수 2를 선택하세요</div>}
    </div>
  );
}

// ── 관전 채팅 사이드바 ───────────────────────────────────────────
function ChatSidebar({
  viewerCount, messages, sendMessage, guestId,
}: {
  viewerCount: number;
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  guestId: string;
}) {
  const [input, setInput] = useState("");
  const [width, setWidth] = useState(256);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(CHAT_WIDTH_KEY));
      if (saved >= CHAT_MIN_WIDTH && saved <= CHAT_MAX_WIDTH) setWidth(saved);
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const clamp = (x: number) =>
      Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, startWidth + (startX - x)));
    // 드래그 중 iframe이 mousemove를 삼키지 않도록 잠시 꺼둔다
    const iframes = Array.from(document.querySelectorAll("iframe"));
    iframes.forEach((f) => { f.style.pointerEvents = "none"; });
    function onMove(ev: MouseEvent) {
      setWidth(clamp(ev.clientX));
    }
    function onUp(ev: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      iframes.forEach((f) => { f.style.pointerEvents = ""; });
      try { localStorage.setItem(CHAT_WIDTH_KEY, String(clamp(ev.clientX))); } catch {}
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      style={{ "--chat-w": `${width}px` } as React.CSSProperties}
      className="relative flex h-48 w-full flex-shrink-0 flex-col overflow-hidden rounded-lg border border-white/8 bg-white/2 lg:h-auto lg:w-[var(--chat-w)]"
    >
      <div
        onMouseDown={startResize}
        title="드래그해서 폭 조절"
        className="absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-white/15 lg:block"
      />
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-white/8 px-3 py-2">
        <MessageSquare size={12} className="text-white/40" />
        <span className="text-xs font-medium text-white/60">관전 채팅</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-white/40">
          <Users size={11} />
          {viewerCount > 0 ? viewerCount : 1}명
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-xs text-white/25">첫 메시지를 남겨보세요!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="break-all text-xs leading-relaxed">
              <span className={`font-medium ${msg.sender === guestId ? "text-nzu-green" : "text-white/50"}`}>
                {msg.sender}
              </span>{" "}
              <span className="text-white/85">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-t border-white/8 px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="메시지 입력..."
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-white/25 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="flex-shrink-0 text-white/30 hover:text-white disabled:opacity-20 transition-colors"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// ── 스트림 패널 (헤더는 스코어보드 스트립으로 이동) ──────────────
function StreamPanel({ panel, slot }: { panel: Panel; slot: 1 | 2 }) {
  if (!panel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-white/8 bg-white/2 text-white/30 min-h-[180px]">
        <span className="text-4xl">📺</span>
        <span className="text-sm">패널 {slot} — 위에서 선수를 선택하세요</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-white/10 min-h-[180px]">
      <iframe
        key={panel.soopId}
        src={buildEmbedUrl(panel.soopId)}
        className="flex-1 w-full border-0"
        allow="autoplay; fullscreen; local-network-access"
        title={`${panel.name} 방송`}
      />
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function MultiviewClientView() {
  const [players, setPlayers] = useState<TierPlayerPayload[]>([]);
  const [liveOnly, setLiveOnly] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<RecentCombo[]>([]);
  const [panel1, setPanel1] = useState<Panel>(null);
  const [panel2, setPanel2] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [pendingSoopIds, setPendingSoopIds] = useState<{ p1: string | null; p2: string | null } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { viewerCount, messages, sendMessage, guestId } = useDuelviewRoom(
    panel1?.playerId ?? null,
    panel2?.playerId ?? null
  );

  useEffect(() => {
    setFavorites(loadFavorites());
    setRecent(loadRecent());
  }, []);

  // 시청 모드: 두 패널이 다 차면 컨트롤을 접어 방송 공간 확보
  const bothLoaded = Boolean(panel1 && panel2);
  useEffect(() => {
    setControlsOpen(!bothLoaded);
  }, [bothLoaded]);

  // URL 파라미터 읽기 (마운트 시 1회)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p1 = params.get("p1");
    const p2 = params.get("p2");
    if (p1 || p2) setPendingSoopIds({ p1, p2 });
  }, []);

  // 플레이어 데이터 로드 완료 후 URL 파라미터 적용
  useEffect(() => {
    if (!pendingSoopIds || players.length === 0) return;
    if (pendingSoopIds.p1) {
      const p = players.find((pl) => pl.soop_id === pendingSoopIds.p1);
      if (p) setPanel1(toPanel(p));
    }
    if (pendingSoopIds.p2) {
      const p = players.find((pl) => pl.soop_id === pendingSoopIds.p2);
      if (p) setPanel2(toPanel(p));
    }
    setPendingSoopIds(null);
  }, [pendingSoopIds, players]);

  useEffect(() => {
    fetchCachedPlayers(liveOnly).then(setPlayers).catch(() => {});

    const id = setInterval(() => {
      try { sessionStorage.removeItem(`duelview_players_${liveOnly}`); } catch {}
      fetchCachedPlayers(liveOnly).then(setPlayers).catch(() => {});
    }, PLAYERS_REFRESH_MS);

    return () => clearInterval(id);
  }, [liveOnly]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // 양쪽 패널 로드 시 URL 업데이트 + 최근 조합 저장
  useEffect(() => {
    if (panel1 && panel2) {
      const url = new URL(window.location.href);
      url.searchParams.set("p1", panel1.soopId);
      url.searchParams.set("p2", panel2.soopId);
      window.history.replaceState({}, "", url.toString());
      saveToRecent(panel1, panel2);
      setRecent(loadRecent());
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("p1");
      url.searchParams.delete("p2");
      window.history.replaceState({}, "", url.toString());
    }
  }, [panel1?.soopId, panel2?.soopId]);

  const toggleFavorite = useCallback((soopId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(soopId)) next.delete(soopId);
      else next.add(soopId);
      saveFavorites(next);
      return next;
    });
  }, []);

  const loadToPanel = useCallback((player: TierPlayerPayload) => {
    const entry = toPanel(player);
    if (!entry) return;
    if (!panel1) { setPanel1(entry); return; }
    if (!panel2) { setPanel2(entry); return; }
    setPanel1(entry);
  }, [panel1, panel2]);

  const handleSwap = useCallback(() => {
    setPanel1(panel2);
    setPanel2(panel1);
  }, [panel1, panel2]);

  const handleShare = useCallback(() => {
    if (!panel1 || !panel2) return;
    const url = `${window.location.origin}/multiview?p1=${panel1.soopId}&p2=${panel2.soopId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [panel1, panel2]);

  const openFullscreen = useCallback(() => {
    const panels = [panel1, panel2].filter(Boolean) as NonNullable<Panel>[];
    if (panels.length === 0) return;

    const iframeHtml = panels.map((p) => {
      const raceLabel = RACE_LABEL[p.race ?? ""] ?? p.race ?? "";
      return `<div style="position:relative;flex:1;display:flex;flex-direction:column;overflow:hidden;">
<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(0,0,0,0.7);border-bottom:1px solid rgba(255,255,255,0.1);font-size:13px;color:#fff;font-family:sans-serif;">
  <span>${p.name}${raceLabel ? ` <span style="color:rgba(255,255,255,0.4);">· ${raceLabel}</span>` : ""}</span>
  <a href="${buildPlayUrl(p.soopId)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:12px;padding:2px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;">새창</a>
</div>
<iframe src="${buildEmbedUrl(p.soopId)}" style="flex:1;width:100%;border:none;" allow="autoplay;fullscreen;local-network-access"></iframe>
</div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>대결뷰 | HOSAGA</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;height:100vh;background:#000;gap:1px;overflow:hidden;}</style>
</head><body>${iframeHtml}</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [panel1, panel2]);

  const activeIds = new Set([panel1?.soopId, panel2?.soopId].filter(Boolean) as string[]);
  const searchLower = search.toLowerCase().trim();
  const liveCount = players.filter((p) => p.is_live).length;

  const filteredByTeam = teamFilter
    ? players.filter((p) => normalizeUniversityKey(p.university) === teamFilter)
    : players;

  const searchResults = (searchLower || teamFilter)
    ? filteredByTeam
        .filter((p) => p.soop_id)
        .filter((p) => !searchLower || (p.nickname || p.name || "").toLowerCase().includes(searchLower))
        .slice(0, 12)
    : [];

  const favoritePlayers = players.filter((p) => p.soop_id && favorites.has(p.soop_id));
  const hasAnyPanel = panel1 || panel2;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-2 p-2">

      {/* ── 컨트롤 카드 ── */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-white/8 bg-white/2 p-3">

        {/* 행 1: 토글 + 검색 + 공유 + 전체화면 */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-sm flex-shrink-0">
            <button
              onClick={() => setLiveOnly(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${liveOnly ? "bg-red-500/20 text-red-400" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              라이브 중
              {liveCount > 0 && (
                <span className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${liveOnly ? "bg-red-500/30 text-red-300" : "bg-white/10 text-white/50"}`}>
                  {liveCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setLiveOnly(false)}
              className={`px-3 py-1.5 transition-colors ${!liveOnly ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              전체
            </button>
          </div>

          <div ref={searchRef} className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={teamFilter ? `${getUniversityLabel(teamFilter)} 선수 검색...` : "선수 검색해서 추가..."}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearch(""); (e.target as HTMLInputElement).blur(); } }}
              className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/10 bg-[#0f1117] shadow-xl max-h-64 overflow-y-auto">
                {searchResults.map((p) => (
                  <SearchResultItem
                    key={p.id}
                    player={p}
                    isFavorite={!!(p.soop_id && favorites.has(p.soop_id))}
                    isActive={activeIds.has(p.soop_id || "")}
                    onSelect={() => { loadToPanel(p); setSearch(""); setSearchOpen(false); }}
                    onToggleFavorite={(e) => p.soop_id && toggleFavorite(p.soop_id, e)}
                  />
                ))}
              </div>
            )}
            {searchOpen && (searchLower || teamFilter) && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/10 bg-[#0f1117] px-3 py-3 text-sm text-white/30 shadow-xl">
                {teamFilter && !searchLower
                  ? liveOnly
                    ? `${getUniversityLabel(teamFilter)} 중 현재 라이브 선수가 없습니다.`
                    : `${getUniversityLabel(teamFilter)} 소속 선수가 없습니다.`
                  : "검색 결과가 없습니다."}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {panel1 && panel2 && (
              <button
                onClick={handleShare}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all ${
                  copied
                    ? "border-nzu-green/50 bg-nzu-green/10 text-nzu-green"
                    : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {copied ? <Check size={13} /> : <Link2 size={13} />}
                {copied ? "복사됨!" : "공유"}
              </button>
            )}
            {hasAnyPanel && (
              <button
                onClick={openFullscreen}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Maximize2 size={13} />
                전체화면
              </button>
            )}
            <button
              onClick={() => setControlsOpen((v) => !v)}
              title={controlsOpen ? "필터 접기" : "필터 펼치기"}
              className="rounded-lg border border-white/10 p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              {controlsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {controlsOpen && (
          <>
            {/* 행 2: 소속 팀 필터 (정적 — API 대기 없음) */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setTeamFilter(null); searchInputRef.current?.focus(); }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  !teamFilter
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
                }`}
              >
                전체팀
              </button>
              {ALL_TEAM_KEYS.map((team) => (
                <button
                  key={team}
                  onClick={() => {
                    setTeamFilter((prev) => (prev === team ? null : team));
                    searchInputRef.current?.focus();
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    teamFilter === team
                      ? "border-rose-400/50 bg-rose-400/12 text-rose-300"
                      : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
                  }`}
                >
                  {getUniversityLabel(team)}
                </button>
              ))}
            </div>

            {/* 행 3: 즐겨찾기 칩 */}
            {favoritePlayers.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-amber-400/60 flex-shrink-0">
                  <Star size={11} fill="currentColor" />
                  즐겨찾기
                </span>
                {favoritePlayers.map((p) => (
                  <FavoriteChip
                    key={p.id}
                    player={p}
                    isActive={activeIds.has(p.soop_id || "")}
                    onSelect={() => loadToPanel(p)}
                    onRemove={(e) => p.soop_id && toggleFavorite(p.soop_id, e)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/20">
                검색 결과에서 ⭐ 를 눌러 즐겨찾기에 추가하면 여기에 표시됩니다.
              </p>
            )}

            {/* 행 4: 최근 본 조합 */}
            {recent.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/25 flex-shrink-0">최근</span>
                {recent.map((combo, i) => (
                  <div
                    key={i}
                    onClick={() => { setPanel1(combo.p1); setPanel2(combo.p2); }}
                    className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-white/40 cursor-pointer select-none hover:border-white/25 hover:text-white/70 transition-all"
                  >
                    <span>{combo.p1.name} vs {combo.p2.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromRecent(combo);
                        setRecent(loadRecent());
                      }}
                      className="ml-0.5 text-white/25 hover:text-white/70 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 메인: (스코어보드 + 스트림) 컬럼 + 채팅 사이드바 (좁은 화면에선 아래로) ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* 스코어보드 스트립 — 방송 영역과 같은 폭이라 중앙이 두 방송 사이에 온다 */}
          <ScoreboardStrip
            panel1={panel1}
            panel2={panel2}
            onClose={(slot) => (slot === 1 ? setPanel1(null) : setPanel2(null))}
            onOpenNew={(slot) => {
              const p = slot === 1 ? panel1 : panel2;
              if (p) window.open(buildPlayUrl(p.soopId), "_blank", "noopener,noreferrer");
            }}
          />

          <div className="relative flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
            <StreamPanel panel={panel1} slot={1} />
            {panel1 && panel2 && (
              <button
                onClick={handleSwap}
                title="패널 좌우 교체"
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 p-1.5 backdrop-blur-sm hover:border-white/30 hover:bg-white/10 transition-all"
              >
                <ArrowLeftRight size={13} className="text-white/60" />
              </button>
            )}
            <StreamPanel panel={panel2} slot={2} />
          </div>
        </div>

        {panel1 && panel2 && (
          <ChatSidebar
            viewerCount={viewerCount}
            messages={messages}
            sendMessage={sendMessage}
            guestId={guestId}
          />
        )}
      </div>
    </div>
  );
}
