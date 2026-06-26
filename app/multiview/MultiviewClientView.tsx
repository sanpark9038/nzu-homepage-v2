"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, MessageSquare, Search, Send, Star, Swords, Users, X } from "lucide-react";

import { unpackTierPlayersPayload, type TierPlayerPayload } from "@/lib/tier-player-payload";
import { useDuelviewRoom, type ChatMessage } from "./useDuelviewRoom";

const RACE_LABEL: Record<string, string> = {
  T: "Terran", Terran: "Terran",
  P: "Protoss", Protoss: "Protoss",
  Z: "Zerg", Zerg: "Zerg",
  R: "Random", Random: "Random",
};

const SOOP_EMBED_BASE = "https://play.sooplive.com";
const FAVORITES_KEY = "duelview_favorites_v1";
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

type Panel = {
  soopId: string;
  name: string;
  race: string | null;
  playerId: string;
} | null;

type H2HStats = {
  p1: { total: number; wins: number; losses: number; winRate: string };
  p2: { total: number; wins: number; losses: number; winRate: string };
} | null;

function toPanel(p: TierPlayerPayload): Panel {
  if (!p.soop_id) return null;
  return {
    soopId: p.soop_id,
    name: p.nickname || p.name || "",
    race: p.race || null,
    playerId: String(p.id || ""),
  };
}

// ── 즐겨찾기 칩 ──────────────────────────────────────────────────
function FavoriteChip({
  player,
  isActive,
  onSelect,
  onRemove,
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
      {player.is_live && (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />
      )}
      <span>{player.nickname || player.name}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 text-white/30 hover:text-white/70 transition-colors"
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ── 검색 드롭다운 아이템 ─────────────────────────────────────────
function SearchResultItem({
  player,
  isFavorite,
  isActive,
  onSelect,
  onToggleFavorite,
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
        {player.is_live && (
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />
        )}
        <span className="text-sm font-medium text-white truncate">
          {player.nickname || player.name}
        </span>
        {raceLabel && <span className="text-xs text-white/40 flex-shrink-0">{raceLabel}</span>}
        {player.university && (
          <span className="text-xs text-white/30 flex-shrink-0">{player.university}</span>
        )}
      </div>
      <button
        onClick={onToggleFavorite}
        className={`flex-shrink-0 p-1 rounded transition-colors ${
          isFavorite ? "text-amber-400" : "text-white/20 hover:text-amber-400"
        }`}
      >
        <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

// ── H2H 위젯 ────────────────────────────────────────────────────
function H2HWidget({ panel1, panel2 }: { panel1: Panel; panel2: Panel }) {
  const [stats, setStats] = useState<H2HStats>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!panel1 || !panel2) { setStats(null); return; }

    setLoading(true);
    const params = new URLSearchParams({
      p1: panel1.name,
      p2: panel2.name,
      p1_id: panel1.playerId,
      p2_id: panel2.playerId,
    });

    fetch(`/api/stats/h2h?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data?.p1 && data?.p2 ? data : null);
        setLoading(false);
      })
      .catch(() => { setStats(null); setLoading(false); });
  }, [panel1?.playerId, panel2?.playerId]);

  if (!panel1 || !panel2) return null;

  const p1Total = stats?.p1.total ?? 0;
  const p1Wins = stats?.p1.wins ?? 0;
  const p2Wins = stats?.p2?.wins ?? (p1Total - p1Wins);
  const total = p1Total;
  const p1Pct = total > 0 ? Math.round((p1Wins / total) * 100) : 50;
  const p2Pct = 100 - p1Pct;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-2.5">
      {/* 선수 1 */}
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        <span className="text-sm font-semibold text-white truncate">{panel1.name}</span>
        <span className="text-xs text-white/40">{RACE_LABEL[panel1.race ?? ""] ?? ""}</span>
      </div>

      {/* 중앙 전적 */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Swords size={12} className="text-white/30" />
          <span className="text-xs text-white/40">역대 전적</span>
        </div>
        {loading ? (
          <span className="text-xs text-white/30">조회 중...</span>
        ) : total === 0 ? (
          <span className="text-xs text-white/25">전적 없음</span>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5 text-sm font-bold">
              <span className="text-nzu-green">{p1Wins}승</span>
              <span className="text-white/30 text-xs font-normal">{total}전</span>
              <span className="text-red-400">{p2Wins}승</span>
            </div>
            {/* 비율 바 */}
            <div className="flex h-1 w-24 overflow-hidden rounded-full">
              <div className="bg-nzu-green transition-all" style={{ width: `${p1Pct}%` }} />
              <div className="bg-red-400 transition-all" style={{ width: `${p2Pct}%` }} />
            </div>
          </>
        )}
      </div>

      {/* 선수 2 */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-white/40">{RACE_LABEL[panel2.race ?? ""] ?? ""}</span>
        <span className="text-sm font-semibold text-white truncate">{panel2.name}</span>
      </div>
    </div>
  );
}

// ── 워치파티 채팅 ────────────────────────────────────────────────
function WatchpartyChat({
  viewerCount,
  messages,
  sendMessage,
  guestId,
}: {
  viewerCount: number;
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  guestId: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  }

  return (
    <div className="rounded-lg border border-white/8 bg-white/2 overflow-hidden">
      {/* 헤더 — 항상 표시 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 hover:bg-white/4 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <Users size={12} />
            <span className="font-medium text-white/80">{viewerCount > 0 ? viewerCount : 1}명</span>
            <span>이 같은 조합 시청 중</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-white/30">
            <MessageSquare size={11} />
            <span>워치파티 채팅</span>
          </div>
        </div>
        <span className="text-xs text-white/30">{open ? "접기 ▲" : "열기 ▼"}</span>
      </button>

      {/* 채팅 영역 */}
      {open && (
        <div className="border-t border-white/8">
          {/* 메시지 목록 */}
          <div className="h-36 overflow-y-auto px-3 py-2 space-y-1.5">
            {messages.length === 0 ? (
              <p className="text-xs text-white/25 text-center mt-4">
                첫 메시지를 남겨보세요!
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="flex gap-2 text-xs">
                  <span className={`flex-shrink-0 font-medium ${msg.sender === guestId ? "text-nzu-green" : "text-white/60"}`}>
                    {msg.sender}
                  </span>
                  <span className="text-white/80 break-all">{msg.text}</span>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* 입력창 */}
          <div className="flex items-center gap-2 border-t border-white/8 px-3 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="메시지 입력..."
              maxLength={100}
              className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="text-white/30 hover:text-white disabled:opacity-20 transition-colors"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 스트림 패널 ──────────────────────────────────────────────────
function StreamPanel({
  panel,
  slot,
  onClose,
  onOpenNew,
}: {
  panel: Panel;
  slot: 1 | 2;
  onClose: () => void;
  onOpenNew: () => void;
}) {
  if (!panel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-white/8 bg-white/2 text-white/30 min-h-[180px]">
        <span className="text-4xl">📺</span>
        <span className="text-sm">패널 {slot} — 위에서 선수를 선택하세요</span>
      </div>
    );
  }

  const raceLabel = RACE_LABEL[panel.race ?? ""] ?? panel.race ?? "";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-white/10 min-h-[180px]">
      <div className="flex items-center justify-between border-b border-white/10 bg-background/80 px-3 py-2 text-sm">
        <span className="font-semibold text-white">
          {panel.name}
          {raceLabel && <span className="ml-1.5 font-normal text-white/50">· {raceLabel}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNew}
            className="rounded px-2 py-0.5 text-xs text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            새창
          </button>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <iframe
        key={panel.soopId}
        src={buildEmbedUrl(panel.soopId)}
        className="flex-1 w-full border-0"
        allow="autoplay; fullscreen"
        title={`${panel.name} 방송`}
      />
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function MultiviewClientView() {
  const [players, setPlayers] = useState<TierPlayerPayload[]>([]);
  const [liveOnly, setLiveOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [panel1, setPanel1] = useState<Panel>(null);
  const [panel2, setPanel2] = useState<Panel>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const { viewerCount, messages, sendMessage, guestId } = useDuelviewRoom(
    panel1?.playerId ?? null,
    panel2?.playerId ?? null
  );

  useEffect(() => { setFavorites(loadFavorites()); }, []);

  useEffect(() => {
    const url = liveOnly ? "/api/tier/players?liveOnly=true" : "/api/tier/players?liveOnly=false";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setPlayers(unpackTierPlayersPayload(data).players))
      .catch(() => {});
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
<iframe src="${buildEmbedUrl(p.soopId)}" style="flex:1;width:100%;border:none;" allow="autoplay;fullscreen"></iframe>
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
  const searchResults = searchLower
    ? players.filter((p) => (p.nickname || p.name || "").toLowerCase().includes(searchLower)).slice(0, 10)
    : [];
  const favoritePlayers = players.filter((p) => p.soop_id && favorites.has(p.soop_id));
  const hasAnyPanel = panel1 || panel2;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-2 p-4">
      {/* 상단 컨트롤 */}
      <div className="flex flex-col gap-3 rounded-lg border border-white/8 bg-white/2 p-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 토글 */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-sm">
            <button
              onClick={() => setLiveOnly(true)}
              className={`px-3 py-1.5 transition-colors ${liveOnly ? "bg-red-500/20 text-red-400" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              라이브 중
            </button>
            <button
              onClick={() => setLiveOnly(false)}
              className={`px-3 py-1.5 transition-colors ${!liveOnly ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              전체
            </button>
          </div>

          {/* 검색 */}
          <div ref={searchRef} className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="선수 검색해서 추가..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/10 bg-[#0f1117] shadow-xl overflow-hidden">
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
            {searchOpen && searchLower && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/10 bg-[#0f1117] px-3 py-3 text-sm text-white/30 shadow-xl">
                검색 결과가 없습니다.
              </div>
            )}
          </div>

          {hasAnyPanel && (
            <button
              onClick={openFullscreen}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Maximize2 size={13} />
              전체화면
            </button>
          )}
        </div>

        {/* 즐겨찾기 칩 */}
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
          <p className="text-xs text-white/25">
            검색 결과에서 ⭐ 를 눌러 즐겨찾기에 추가하면 여기에 표시됩니다.
          </p>
        )}
      </div>

      {/* H2H 위젯 — 양쪽 패널 모두 로드됐을 때만 표시 */}
      <H2HWidget panel1={panel1} panel2={panel2} />

      {/* 워치파티 채팅 — 양쪽 패널 모두 로드됐을 때만 표시 */}
      {panel1 && panel2 && (
        <WatchpartyChat
          viewerCount={viewerCount}
          messages={messages}
          sendMessage={sendMessage}
          guestId={guestId}
        />
      )}

      {/* 패널 영역 */}
      <div className="flex flex-1 flex-col gap-3 min-h-0 md:flex-row">
        <StreamPanel
          panel={panel1}
          slot={1}
          onClose={() => setPanel1(null)}
          onOpenNew={() => panel1 && window.open(buildPlayUrl(panel1.soopId), "_blank", "noopener,noreferrer")}
        />
        <StreamPanel
          panel={panel2}
          slot={2}
          onClose={() => setPanel2(null)}
          onOpenNew={() => panel2 && window.open(buildPlayUrl(panel2.soopId), "_blank", "noopener,noreferrer")}
        />
      </div>
    </div>
  );
}
