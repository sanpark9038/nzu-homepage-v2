'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, GripVertical, ArrowLeftRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { RaceLetterBadge } from "@/components/ui/race-letter-badge"
import type { H2HStats } from "@/types"
import {
  fetchH2HStats,
  fetchMatchupPlayers,
  filterMatchupPlayers,
  normalizeMatchupSearchText,
  reportMatchupRuntimeIssue,
  unpackMatchPagePlayerSummaries,
  type MatchPagePlayerSummary,
  type PackedMatchPagePlayerSummary,
} from "@/lib/matchup-helpers"
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

// --- Types ---
type Player = MatchPagePlayerSummary;

interface MatchRow {
  id: string;
  p1: Player | null;
  p2: Player | null;
  p1Input: string;
  p2Input: string;
}

function normalizeRaceCode(race: string) {
  const raw = String(race || '').trim().toUpperCase();
  if (!raw) return 'R';
  if (raw.startsWith('T')) return 'T';
  if (raw.startsWith('Z')) return 'Z';
  if (raw.startsWith('P')) return 'P';
  return 'R';
}

function raceToneClasses(race: string, side: 1 | 2) {
  const raceCode = normalizeRaceCode(race);
  const base = side === 1
    ? "focus-within:border-nzu-green/40"
    : "focus-within:border-red-500/30";

  if (raceCode === 'T') {
    return side === 1
      ? "border-blue-500/40 bg-blue-500/[0.05] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]"
      : "border-blue-500/30 bg-blue-500/[0.04] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.06)]";
  }
  if (raceCode === 'Z') {
    return side === 1
      ? "border-purple-500/40 bg-purple-500/[0.05] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.08)]"
      : "border-purple-500/30 bg-purple-500/[0.04] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.06)]";
  }
  if (raceCode === 'P') {
    return side === 1
      ? "border-yellow-500/40 bg-yellow-500/[0.05] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.08)]"
      : "border-yellow-500/30 bg-yellow-500/[0.04] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.06)]";
  }
  return base;
}

type MatchupStats = {
  overall: [number, number];
  recent: [number, number];
};

function formatMatchDateLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "최근 맞대결 없음";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "최근 맞대결 없음";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

/** 왼쪽(p1) 승 = nzu-green, 오른쪽(p2) 승 = red 로 분할되는 승률 바. */
function SplitBar({ wins, losses, className }: { wins: number; losses: number; className?: string }) {
  const total = wins + losses;
  return (
    <div className={cn("flex overflow-hidden rounded-full bg-white/[0.06]", className)}>
      {total > 0 ? (
        <>
          <div
            className="shrink-0 bg-nzu-green shadow-[0_0_8px_rgba(0,255,163,0.35)]"
            style={{ width: `${(wins / total) * 100}%` }}
          />
          <div className="flex-1 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.28)]" />
        </>
      ) : null}
    </div>
  );
}

// 선수 페이지(RaceStatRow)와 같은 종족 색 언어. 상대 종족전 카드에서 사용.
const RACE_EDGE_TONE: Record<string, { border: string; bar: string; text: string }> = {
  T: { border: "border-terran/20 bg-terran/[0.04]", bar: "bg-terran", text: "text-terran" },
  Z: { border: "border-zerg/20 bg-zerg/[0.04]", bar: "bg-zerg", text: "text-zerg" },
  P: { border: "border-protoss/20 bg-protoss/[0.04]", bar: "bg-protoss", text: "text-protoss" },
};

function getH2HMatchupStats(stats: H2HStats | null): MatchupStats | null {
  if (!stats) return null;
  return {
    overall: [stats.summary.wins, stats.summary.losses],
    recent: [stats.summary.momentum90.wins, stats.summary.momentum90.losses],
  };
}

// --- Sortable Item Component ---
interface SortableItemProps {
  row: MatchRow;
  updateRow: (id: string, field: 'p1' | 'p2' | 'p1Input' | 'p2Input', value: Player | null | string) => void;
  removeRow: (id: string) => void;
  swapPlayers: (id: string) => void;
  allPlayers: Player[];
  isPlayersLoading: boolean;
  matchNumber: number;
}

const SortableMatchRow = ({ row, updateRow, removeRow, swapPlayers, allPlayers, isPlayersLoading, matchNumber }: SortableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [s1, setS1] = useState<Player[]>([]);
  const [s2, setS2] = useState<Player[]>([]);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);
  const [h2hStats, setH2hStats] = useState<H2HStats | null>(null);
  const [isH2HLoading, setIsH2HLoading] = useState(false);
  const p1InputRef = useRef<HTMLInputElement | null>(null);
  const p2InputRef = useRef<HTMLInputElement | null>(null);
  const hasOpenDropdown = show1 || show2;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
    zIndex: isDragging ? 60 : hasOpenDropdown ? 40 : 0,
  };

  const filterCandidates = (value: string, side: 1 | 2) => {
    const needle = normalizeMatchupSearchText(value);
    if (!needle) return [];

    const oppositePlayer = side === 1 ? row.p2 : row.p1;
    return filterMatchupPlayers(allPlayers, {
      query: needle,
      excludePlayerId: oppositePlayer?.id || "",
    })
      .slice(0, 8);
  };

  const handleSearch = (val: string, side: 1 | 2) => {
    if (!val.trim()) {
      if (side === 1) {
        setS1([]);
        setShow1(false);
      } else {
        setS2([]);
        setShow2(false);
      }
      return;
    }
    const filtered = filterCandidates(val, side);
    if (side === 1) {
      setS1(filtered);
      setShow1(filtered.length > 0);
    } else {
      setS2(filtered);
      setShow2(filtered.length > 0);
    }
  };

  const handleInputChange = (side: 1 | 2, value: string) => {
    const selectedPlayer = side === 1 ? row.p1 : row.p2;
    const inputField = side === 1 ? 'p1Input' : 'p2Input';
    const playerField = side === 1 ? 'p1' : 'p2';

    updateRow(row.id, inputField, value);
    if (selectedPlayer && selectedPlayer.name !== value) {
      updateRow(row.id, playerField, null);
    }
    handleSearch(value, side);
  };

  const handleEnterSelect = (side: 1 | 2) => {
    const suggestions = side === 1 ? s1 : s2;
    const nextPlayer = suggestions[0];
    if (!nextPlayer) return;

    if (side === 1) {
      updateRow(row.id, 'p1', nextPlayer);
      updateRow(row.id, 'p1Input', nextPlayer.name);
      setShow1(false);
      setTimeout(() => p2InputRef.current?.focus(), 0);
      return;
    }

    updateRow(row.id, 'p2', nextPlayer);
    updateRow(row.id, 'p2Input', nextPlayer.name);
    setShow2(false);
  };

  const isConfirmed = row.p1 && row.p2;
  const matchupStats = useMemo(() => getH2HMatchupStats(h2hStats), [h2hStats]);
  /** 상대 종족전 통산 승률(H2H 아님). 둘 다 없으면 섹션 자체를 생략한다. */
  const raceEdgeRows = useMemo(() => {
    const edge = h2hStats?.raceEdge;
    if (!edge || (!edge.p1 && !edge.p2)) return [];
    return [
      { side: "p1" as const, name: row.p1?.name || "", record: edge.p1 },
      { side: "p2" as const, name: row.p2?.name || "", record: edge.p2 },
    ];
  }, [h2hStats, row.p1, row.p2]);
  const momentum90Total = h2hStats?.summary.momentum90.total ?? 0;
  const isRecentSampleThin = momentum90Total > 0 && momentum90Total < 3;

  useEffect(() => {
    let cancelled = false;

    async function loadH2H() {
      if (!row.p1 || !row.p2) {
        setH2hStats(null);
        setIsH2HLoading(false);
        return;
      }

      setIsH2HLoading(true);
      try {
        const payload = await fetchH2HStats(row.p1, row.p2);
        if (cancelled) return;

        if (!payload) {
          setH2hStats(null);
          return;
        }

        setH2hStats(payload);
      } catch (error) {
        reportMatchupRuntimeIssue("Match row H2H fetch failed", error);
        if (!cancelled) setH2hStats(null);
      } finally {
        if (!cancelled) setIsH2HLoading(false);
      }
    }

    loadH2H();

    return () => {
      cancelled = true;
    };
  }, [row.p1, row.p2]);

  return (
    <div ref={setNodeRef} style={style} className={cn("group relative flex flex-col gap-2 overflow-visible bg-white/[0.02] backdrop-blur-xl p-2 rounded-[2rem] border transition-all", isDragging ? "border-nzu-green/40 shadow-2xl scale-[1.01]" : "border-white/5 hover:border-white/10")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5 md:pl-1">
      <div className="ml-1 flex items-center gap-2 self-start md:self-auto">
        <div
          {...attributes}
          {...listeners}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-[0.95rem] border border-white/6 bg-white/[0.03] text-white/10 cursor-grab active:cursor-grabbing transition-all hover:border-nzu-green/22 hover:bg-nzu-green/[0.05] hover:text-nzu-green"
        >
          <GripVertical size={17} />
        </div>
        <div className="min-w-[56px] text-center">
          <div className="text-[1rem] font-bold italic tracking-tight text-white/88">
            {matchNumber}경기
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-stretch gap-2.5 md:flex-1 md:flex-row md:items-center md:justify-center md:gap-3">
        
        {/* P1 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="relative flex-1">
          <div className={cn(
            "relative flex items-center h-[56px] bg-[#0a1112]/88 border border-white/10 rounded-[1.15rem] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            row.p1 ? raceToneClasses(row.p1.race, 1) : "focus-within:border-nzu-green/40"
          )}>
            {/* 중앙 입력창 */}
            <input 
              ref={p1InputRef}
              type="text" 
              value={row.p1Input}
              onChange={(e) => handleInputChange(1, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && show1 && s1.length > 0) {
                  e.preventDefault();
                  handleEnterSelect(1);
                }
              }}
              onFocus={() => { if (row.p1Input) handleSearch(row.p1Input, 1); }}
              onBlur={() => setTimeout(() => setShow1(false), 200)}
              placeholder="A팀 선수" 
              className="flex-1 h-full bg-transparent pl-4.5 pr-[3.35rem] text-[1.45rem] font-bold text-left text-white placeholder:text-white/14 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />
            
            {/* 우측 아이콘 고정 영역 */}
            <div className="absolute inset-y-0 right-4 w-6 h-full flex items-center justify-center pointer-events-none">
               {row.p1 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p1.race} size="sm" />
                 </div>
               )}
            </div>
          </div>
          {/* Autocomplete 1 */}
          {show1 && (
            <div className="absolute top-[64px] left-0 z-[100] w-full overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#05090a]/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1">
               {s1.map(p => (
                 <button
                   key={p.id}
                   onClick={() => {
                     updateRow(row.id, 'p1', p);
                     updateRow(row.id, 'p1Input', p.name);
                     setShow1(false);
                     setTimeout(() => p2InputRef.current?.focus(), 0);
                   }}
                   className="w-full flex items-center justify-between rounded-[0.9rem] px-4 py-2.5 text-[1rem] font-bold text-white/72 transition-all hover:bg-nzu-green/[0.09] hover:text-white"
                 >
                   <span className="truncate pr-3">{p.name}</span>
                   <RaceLetterBadge race={p.race} size="sm" />
                 </button>
               ))}
               {isPlayersLoading ? (
                 <div className="px-4 py-3 text-[0.92rem] font-medium text-white/32">
                   선수 목록 불러오는 중...
                 </div>
               ) : s1.length === 0 && row.p1Input.trim() ? (
                 <div className="px-4 py-3 text-[0.92rem] font-medium text-white/32">
                   일치하는 선수가 없습니다.
                 </div>
               ) : null}
            </div>
          )}
        </div>
        
        {/* VS / Swap Area */}
        <div className="relative flex min-w-[112px] flex-col items-center justify-center rounded-[1.15rem] border border-white/6 bg-white/[0.02] px-3 pb-2 pt-5 md:border-none md:bg-transparent md:px-0 md:pb-0">
           <button onClick={() => swapPlayers(row.id)} className="absolute top-0 bg-[#101718]/95 border border-white/15 p-1.5 rounded-full text-white/40 hover:text-nzu-green hover:border-nzu-green/40 transition-all active:scale-90 group/swap shadow-[0_10px_24px_rgba(0,0,0,0.45)] z-20 backdrop-blur-sm">
              <ArrowLeftRight size={13} strokeWidth={3.5} className="group-hover/swap:rotate-180 transition-transform duration-500" />
           </button>
           {isConfirmed && matchupStats ? (
             <div className={cn(
               "flex flex-col items-center animate-in fade-in zoom-in-90 duration-300",
               isRecentSampleThin && "opacity-90"
             )}>
                <div className="flex min-w-[104px] items-center justify-center gap-2">
                   <span className="min-w-[26px] text-right text-[1.65rem] font-extrabold italic text-nzu-green leading-none tabular-nums">{matchupStats.overall[0]}</span>
                   <span className="min-w-[34px] px-1 text-center text-[11px] font-semibold italic text-nzu-green/68">전체</span>
                   <span className="min-w-[26px] text-left text-[1.65rem] font-extrabold italic text-nzu-green leading-none tabular-nums">{matchupStats.overall[1]}</span>
                </div>
                <div className="my-1 h-px w-[92px] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
                <div className="flex min-w-[104px] items-center justify-center gap-2 opacity-75">
                   <span className="min-w-[22px] text-right text-[1.28rem] font-bold italic text-red-500/85 leading-none tabular-nums">{matchupStats.recent[0]}</span>
                   <span className="min-w-[34px] text-center text-[11px] font-semibold italic text-red-500/45">최근</span>
                   <span className="min-w-[22px] text-left text-[1.28rem] font-bold italic text-red-500/85 leading-none tabular-nums">{matchupStats.recent[1]}</span>
                </div>
                {isRecentSampleThin ? (
                  <div className="mt-1 rounded-full border border-amber-300/14 bg-amber-300/[0.06] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                    최근 표본 얇음
                  </div>
                ) : null}
             </div>
           ) : isConfirmed && isH2HLoading ? (
             <div className="flex flex-col items-center gap-2">
               <div className="h-7 w-24 animate-pulse rounded-full bg-white/8" />
               <div className="h-5 w-20 animate-pulse rounded-full bg-white/6" />
             </div>
           ) : (
             <div className="flex flex-col items-center gap-1.5 pt-1">
               <div className="h-[1px] w-[92px] bg-gradient-to-r from-transparent via-white/6 to-transparent group-hover:via-nzu-green/20 transition-colors" />
               <div className="flex min-w-[104px] items-center justify-center gap-3 opacity-60">
                 <span className="text-[12px] font-semibold italic text-white/16">{isConfirmed ? '표본' : '전체'}</span>
                 <span className="text-[11px] font-semibold italic text-white/12">{isConfirmed ? '없음' : '최근'}</span>
               </div>
             </div>
           )}
        </div>

        {/* P2 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="relative flex-1">
          <div className={cn(
            "relative flex items-center h-[56px] bg-[#0a1112]/88 border border-white/10 rounded-[1.15rem] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            row.p2 ? raceToneClasses(row.p2.race, 2) : "focus-within:border-red-500/30"
          )}>
            {/* 좌측 아이콘 고정 영역 */}
            <div className="absolute inset-y-0 left-4 w-6 h-full flex items-center justify-center pointer-events-none">
               {row.p2 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p2.race} size="sm" />
                 </div>
               )}
            </div>
            
            {/* 중앙 입력창 */}
            <input 
              ref={p2InputRef}
              type="text" 
              value={row.p2Input}
              onChange={(e) => handleInputChange(2, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && show2 && s2.length > 0) {
                  e.preventDefault();
                  handleEnterSelect(2);
                }
              }}
              onFocus={() => { if (row.p2Input) handleSearch(row.p2Input, 2); }}
              onBlur={() => setTimeout(() => setShow2(false), 200)}
              placeholder="B팀 선수" 
              className="flex-1 h-full bg-transparent pl-[3.35rem] pr-4.5 text-[1.45rem] font-bold text-right text-white placeholder:text-white/14 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />
          </div>
          {/* Autocomplete 2 */}
          {show2 && (
            <div className="absolute top-[64px] left-0 z-[100] w-full overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#05090a]/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1">
               {s2.map(p => (
                 <button
                   key={p.id}
                   onClick={() => { updateRow(row.id, 'p2', p); updateRow(row.id, 'p2Input', p.name); setShow2(false); }}
                   className="w-full flex items-center justify-between rounded-[0.9rem] px-4 py-2.5 text-[1rem] font-bold text-white/72 transition-all hover:bg-red-500/[0.09] hover:text-white"
                 >
                   <RaceLetterBadge race={p.race} size="sm" />
                   <span className="truncate pl-3 text-right">{p.name}</span>
                 </button>
               ))}
               {isPlayersLoading ? (
                 <div className="px-4 py-3 text-right text-[0.92rem] font-medium text-white/32">
                   선수 목록 불러오는 중...
                 </div>
               ) : s2.length === 0 && row.p2Input.trim() ? (
                 <div className="px-4 py-3 text-right text-[0.92rem] font-medium text-white/32">
                   일치하는 선수가 없습니다.
                 </div>
               ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Action Buttons: Sized Appropriately */}
      <div className="flex w-full items-center gap-2 pt-1 md:w-auto md:pr-3 md:pt-0">
        <button 
          disabled={!isConfirmed} 
          onClick={() => {
            if (isConfirmed) setShowMomentum((prev) => !prev);
          }}
          className={cn(
            "h-[56px] flex-1 px-4 rounded-[1.15rem] font-bold uppercase tracking-tight transition-all flex items-center justify-center border md:min-w-[110px] md:flex-none",
            isConfirmed 
              ? "bg-white/[0.04] border-white/10 text-white/78 hover:border-nzu-green/30 hover:bg-nzu-green/[0.06] hover:text-nzu-green text-[1.02rem]" 
              : "bg-white/[0.03] border-white/5 text-white/10 cursor-not-allowed text-[0.98rem]"
          )}
        >
          기세 분석
        </button>
        <button onClick={() => removeRow(row.id)} className="h-[56px] w-[56px] shrink-0 bg-white/[0.03] hover:bg-red-500/[0.08] text-white/15 hover:text-red-400 rounded-[1.15rem] border border-white/6 hover:border-red-500/25 transition-all flex items-center justify-center group/del"><X size={17} /></button>
      </div>
      </div>

      {showMomentum && h2hStats && (
        <div className="rounded-[1.4rem] border border-white/8 bg-[#071011]/92 px-3 py-3 md:px-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[1.05rem] font-bold tracking-tight">
                <span className="text-nzu-green">{row.p1?.name}</span>
                <span className="text-[0.76rem] font-semibold uppercase tracking-[0.22em] text-white/26">vs</span>
                <span className="text-red-300">{row.p2?.name}</span>
              </div>
              <div className="mt-1 text-[0.78rem] font-medium tabular-nums text-white/32">
                전체 {h2hStats.summary.total}경기
                {h2hStats.recentMatches[0]
                  ? ` · 최근 맞대결 ${formatMatchDateLabel(h2hStats.recentMatches[0].match_date)}`
                  : ""}
              </div>
            </div>
            <button
              onClick={() => setShowMomentum(false)}
              className="shrink-0 rounded-full border border-white/6 px-2.5 py-1 text-[0.76rem] font-semibold text-white/28 transition-all hover:border-white/12 hover:text-white/58"
            >
              닫기
            </button>
          </div>

          <div className="grid gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.025] px-3 py-3 md:px-4">
            {[
              { label: "전체", wins: h2hStats.summary.wins, losses: h2hStats.summary.losses, thin: false },
              {
                label: "최근 90일",
                wins: h2hStats.summary.momentum90.wins,
                losses: h2hStats.summary.momentum90.losses,
                thin: isRecentSampleThin,
              },
            ].map((bar) => {
              const total = bar.wins + bar.losses;
              const leftRate = total > 0 ? (bar.wins / total) * 100 : 0;
              return (
                <div key={bar.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[1.05rem] font-extrabold tabular-nums text-nzu-green">
                      {total > 0 ? `${leftRate.toFixed(1)}%` : "-"}
                    </span>
                    <span className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/30">
                      {bar.label}
                      {bar.thin ? (
                        <span className="rounded-full border border-amber-300/18 bg-amber-300/[0.08] px-2 py-0.5 text-[0.66rem] font-semibold tracking-[0.16em] text-amber-100/85">
                          표본 부족
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[1.05rem] font-extrabold tabular-nums text-red-300">
                      {total > 0 ? `${(100 - leftRate).toFixed(1)}%` : "-"}
                    </span>
                  </div>
                  <SplitBar wins={bar.wins} losses={bar.losses} className="mt-1.5 h-1.5" />
                  {total > 0 ? (
                    <div className="mt-1 flex justify-between text-[0.74rem] font-medium tabular-nums text-white/40">
                      <span>{bar.wins}승 {bar.losses}패</span>
                      <span>{bar.losses}승 {bar.wins}패</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-center text-[0.74rem] font-medium text-white/26">표본 없음</div>
                  )}
                </div>
              );
            })}
          </div>

          {raceEdgeRows.length > 0 || h2hStats.recentMatches.length > 0 ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {raceEdgeRows.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-white/28">상대 종족전 승률</div>
                  <div className="grid gap-1.5">
                    {raceEdgeRows.map((edgeRow) => {
                      const record = edgeRow.record;
                      const total = record ? record.wins + record.losses : 0;
                      const rate = record && total > 0 ? (record.wins / total) * 100 : 0;
                      const tone = record ? RACE_EDGE_TONE[record.race] : undefined;
                      return (
                        <div
                          key={edgeRow.side}
                          className={cn("rounded-[1rem] border px-3 py-2", tone ? tone.border : "border-white/7 bg-white/[0.025]")}
                        >
                          {record && total > 0 && tone ? (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className={cn(
                                    "truncate text-[0.92rem] font-bold",
                                    edgeRow.side === "p1" ? "text-nzu-green" : "text-red-300"
                                  )}>
                                    {edgeRow.name}
                                  </span>
                                  <span className="text-[0.72rem] font-medium text-white/40">vs</span>
                                  <RaceLetterBadge race={record.race} size="sm" />
                                </span>
                                <span className="flex shrink-0 items-baseline gap-1.5">
                                  <span className={cn("text-[0.98rem] font-extrabold tabular-nums tracking-tight", tone.text)}>{rate.toFixed(1)}%</span>
                                  <span className="text-[0.74rem] font-medium tabular-nums text-white/40">
                                    {total}전 {record.wins}승 {record.losses}패
                                  </span>
                                </span>
                              </div>
                              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className={cn("h-full rounded-full", tone.bar)}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <div className="text-[0.78rem] font-medium text-white/26">
                              {edgeRow.name} · 데이터 없음
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {h2hStats.recentMatches.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-white/28">최근 맞대결</div>
                  <div className="grid gap-1.5">
                    {h2hStats.recentMatches.slice(0, 5).map((match) => {
                      const winnerName = (match.is_win ? row.p1?.name : row.p2?.name) || "";
                      return (
                      <div key={match.id} className="rounded-[1rem] border border-white/7 bg-white/[0.025] px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold",
                            match.is_win
                              ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green"
                              : "border-red-400/25 bg-red-400/[0.1] text-red-300"
                          )}>
                            {match.is_win ? "승" : "패"}
                          </span>
                          {winnerName ? (
                            <span className={cn(
                              "min-w-0 flex-1 truncate text-[0.86rem] font-bold",
                              match.is_win ? "text-nzu-green" : "text-red-300"
                            )}>
                              {winnerName}
                              <span className="ml-1 text-[0.72rem] font-medium text-white/40">승</span>
                            </span>
                          ) : (
                            <span className="min-w-0 flex-1" />
                          )}
                          <span className="shrink-0 text-[0.78rem] font-medium tabular-nums text-white/40">
                            {formatMatchDateLabel(match.match_date)}
                          </span>
                        </div>
                        {match.map || match.note ? (
                          <div className="mt-0.5 flex min-w-0 items-center text-[0.76rem]">
                            {match.map ? <span className="shrink-0 text-white/50">{match.map}</span> : null}
                            {match.map && match.note ? <span className="shrink-0 px-1 text-white/20">·</span> : null}
                            {match.note ? <span className="truncate text-white/35">{match.note}</span> : null}
                          </div>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// --- Page ---
export default function MatchPageClient({
  packedInitialPlayers,
  initialPlayersLoadFailed,
}: {
  packedInitialPlayers: PackedMatchPagePlayerSummary[];
  initialPlayersLoadFailed: boolean;
}) {
  const initialPlayers = useMemo(
    () => unpackMatchPagePlayerSummaries(packedInitialPlayers),
    [packedInitialPlayers]
  );
  const [rows, setRows] = useState<MatchRow[]>([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const [allPlayers, setAllPlayers] = useState<Player[]>(initialPlayers);
  const [isPlayersLoading, setIsPlayersLoading] = useState(initialPlayersLoadFailed);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!initialPlayersLoadFailed) {
      setAllPlayers(initialPlayers);
      setIsPlayersLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPlayers() {
      try {
        setIsPlayersLoading(true);
        if (!cancelled) {
          setAllPlayers(await fetchMatchupPlayers());
        }
      } catch (error) {
        reportMatchupRuntimeIssue("Match page player list fetch failed", error);
        if (!cancelled) {
          setAllPlayers([]);
        }
      } finally {
        if (!cancelled) {
          setIsPlayersLoading(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [initialPlayers, initialPlayersLoadFailed]);

  const addRow = () => setRows([...rows, { id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const removeRow = (id: string) => rows.length > 1 ? setRows(rows.filter(r => r.id !== id)) : setRows([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const swapPlayers = (id: string) => setRows((prev) => prev.map(r => r.id === id ? { ...r, p1: r.p2, p2: r.p1, p1Input: r.p2Input, p2Input: r.p1Input } : r));
  const updateRow = (id: string, field: keyof MatchRow, value: Player | null | string) => setRows((prev) => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRows((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1520px] px-4 py-3 animate-in fade-in duration-700 md:px-6 md:py-6">
        <header className="mb-3 ml-2 flex flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 md:justify-start">
            <h1 className="text-2xl font-bold tracking-tighter italic text-white md:text-[2.25rem]">
              매치 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">편성</span>
            </h1>
            <p className="hidden text-[14px] font-semibold text-white/45 md:block">
              빠르게 매치를 배치하고 팀밸런스를 확인합니다.
            </p>
          </div>

        </header>

        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 px-2">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-nzu-green shadow-[0_0_12px_rgba(0,255,163,0.6)]" />
            <span className="text-[13px] font-semibold text-nzu-green tracking-wide">전체: 2025.01.01 ~ 현재</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
            <span className="text-[13px] font-semibold text-red-500 tracking-wide">최근: 최근 3개월 전적</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", isPlayersLoading ? "bg-white/28" : "bg-nzu-green shadow-[0_0_12px_rgba(0,255,163,0.45)]")} />
            <span className="text-[13px] font-semibold text-white/45 tracking-wide">
              {isPlayersLoading ? "선수 목록 불러오는 중" : `${allPlayers.length.toLocaleString()}명 로드 완료`}
            </span>
          </div>
        </div>
        <div className="grid gap-4">
          <section className="min-w-0">
            <DndContext id="match-rows-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
              <div className="flex flex-col gap-2.5">
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((row, index) => (
                    <SortableMatchRow key={row.id} row={row} updateRow={updateRow} removeRow={removeRow} swapPlayers={swapPlayers} allPlayers={allPlayers} isPlayersLoading={isPlayersLoading} matchNumber={index + 1} />
                  ))}
                </SortableContext>
                
                <button onClick={addRow} className="w-full py-3.5 mt-0.5 rounded-[1.45rem] border border-nzu-green/18 bg-nzu-green/[0.05] hover:border-nzu-green/40 hover:bg-nzu-green/[0.1] text-nzu-green transition-all flex items-center justify-center gap-3 group">
                   <div className="p-2.5 rounded-[1rem] bg-nzu-green/14 group-hover:bg-nzu-green group-hover:text-black transition-all shadow-xl"><Plus size={18} strokeWidth={4} /></div>
                   <span className="text-[1rem] font-bold uppercase tracking-[0.3em]">매치 추가</span>
                </button>
              </div>
            </DndContext>
          </section>
        </div>
      </main>
    </div>
  );
}
