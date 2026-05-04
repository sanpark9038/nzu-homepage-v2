'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Player } from './PlayerCard'
import { cn } from '@/lib/utils'
import { X, ArrowLeftRight, Plus } from 'lucide-react'
import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import type { H2HStats } from "@/types";
import { buildH2HCacheKey, fetchH2HStats, reportMatchupRuntimeIssue } from "@/lib/matchup-helpers";

interface MatchSlot {
  p1: Player | null;
  p2: Player | null;
  overallScore: [number, number]; // [p1_wins, p2_wins]
  recentScore: [number, number];  // [p1_recent_wins, p2_recent_wins]
}

export function H2HSelectorBar() {
  const [matchups, setMatchups] = useState<MatchSlot[]>([{
    p1: null, p2: null, overallScore: [0, 0], recentScore: [0, 0]
  }])
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [isLoading, setIsLoading] = useState<Record<number, boolean>>({})
  const h2hRequestCacheRef = useRef<Map<string, Promise<H2HStats | null>>>(new Map())
  const resolvedMatchupKeyRef = useRef<Record<number, string>>({})

  useEffect(() => {
    const handleAddPlayer = (e: Event) => {
      const newPlayer = (e as CustomEvent<Player>).detail
      setIsVisible(true)

      setMatchups(prev => {
        const next = [...prev]
        const currentMatch = { ...next[activeMatchIndex] }
        
        // Skip duplicate
        if (currentMatch.p1?.id === newPlayer.id || currentMatch.p2?.id === newPlayer.id) return prev

        if (!currentMatch.p1) {
          currentMatch.p1 = newPlayer
          next[activeMatchIndex] = currentMatch
          return next
        } else if (!currentMatch.p2) {
          currentMatch.p2 = newPlayer
          next[activeMatchIndex] = currentMatch
          return next
        } else {
          // Both slots full, automatically create NEW match slot
          const newMatchSlot: MatchSlot = {
            p1: newPlayer,
            p2: null,
            overallScore: [5, 2],
            recentScore: [1, 0]
          }
          const updatedNext = [...next, newMatchSlot]
          setActiveMatchIndex(updatedNext.length - 1)
          return updatedNext
        }
      })
    }
    window.addEventListener('add-h2h-player', handleAddPlayer)
    return () => window.removeEventListener('add-h2h-player', handleAddPlayer)
  }, [activeMatchIndex])

  const matchupSignature = useMemo(
    () => matchups.map((match) => `${match.p1?.id || ""}-${match.p2?.id || ""}`).join(","),
    [matchups]
  );

  useEffect(() => {
    const requestH2H = (player1: Player, player2: Player) => {
      const queryKey = buildH2HCacheKey(player1, player2);
      const cached = h2hRequestCacheRef.current.get(queryKey);
      if (cached) return cached;

      const promise = fetchH2HStats(player1, player2).then((payload) => {
        if (!payload) {
          h2hRequestCacheRef.current.delete(queryKey);
        }
        return payload;
      });
      h2hRequestCacheRef.current.set(queryKey, promise);
      promise.catch(() => {
        h2hRequestCacheRef.current.delete(queryKey);
      });
      return promise;
    };

    matchups.forEach((match, idx) => {
      if (!match.p1 || !match.p2 || isLoading[idx]) return;
      const queryKey = buildH2HCacheKey(match.p1, match.p2);
      if (resolvedMatchupKeyRef.current[idx] === queryKey) return;

      setIsLoading((prev) => ({ ...prev, [idx]: true }));
      requestH2H(match.p1, match.p2)
        .then((stats) => {
          resolvedMatchupKeyRef.current[idx] = queryKey;
          setMatchups((prev) =>
            prev.map((slot, slotIdx) =>
              slotIdx === idx
                ? {
                    ...slot,
                    overallScore: stats
                      ? [stats.summary.wins, stats.summary.losses]
                      : [0, 0],
                    recentScore: stats
                      ? [stats.summary.momentum90.wins, stats.summary.momentum90.losses]
                      : [0, 0],
                  }
                : slot
            )
          );
        })
        .catch((err) => {
          reportMatchupRuntimeIssue("Tier H2H selector fetch failed", err);
        })
        .finally(() => {
          setIsLoading((prev) => ({ ...prev, [idx]: false }));
        });
    });
  }, [isLoading, matchupSignature, matchups])

  const removePlayer = (matchIdx: number, slot: 'p1' | 'p2') => {
    delete resolvedMatchupKeyRef.current[matchIdx]
    setMatchups(prev => {
      const next = prev.map((m, i) => i === matchIdx ? { ...m, [slot]: null } : m)
      if (next.every(m => !m.p1 && !m.p2)) {
        setIsVisible(false)
        return [{ p1: null, p2: null, overallScore: [12, 8], recentScore: [3, 1] }]
      }
      return next
    })
  }

  const removeMatch = (idx: number) => {
    delete resolvedMatchupKeyRef.current[idx]
    setMatchups(prev => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) {
        setIsVisible(false)
        return [{ p1: null, p2: null, overallScore: [12, 8], recentScore: [3, 1] }]
      }
      setActiveMatchIndex(Math.min(activeMatchIndex, next.length - 1))
      return next
    })
  }

  const swapMatch = (idx: number) => {
    delete resolvedMatchupKeyRef.current[idx]
    setMatchups(prev => prev.map((m, i) => {
      if (i === idx) {
        return {
          ...m,
          p1: m.p2,
          p2: m.p1,
          overallScore: [m.overallScore[1], m.overallScore[0]],
          recentScore: [m.recentScore[1], m.recentScore[0]]
        }
      }
      return m
    }))
  }

  if (!isVisible) return null

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[150] w-full max-w-2xl px-4 animate-in fade-in slide-in-from-top-4 duration-500 overflow-y-auto max-h-[85vh] no-scrollbar">
      <div className="bg-card/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.95)] border border-white/10 p-5 flex flex-col gap-4">
        
        {/* --- Header (Increased Font Size) --- */}
        <div className="flex items-center justify-between border-b pb-3 border-white/5 px-2 relative">
           <div className="flex flex-col gap-1 pt-1">
              <div className="flex items-center gap-2.5">
                 <span className="w-2.5 h-2.5 rounded-full bg-nzu-green shadow-[0_0_12px_rgba(0,255,163,0.6)]" />
                 <span className="text-[14px] font-black text-nzu-green uppercase tracking-wide">전체: 2025.01.01 ~ 현재</span>
              </div>
              <div className="flex items-center gap-2.5">
                 <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
                 <span className="text-[14px] font-black text-red-500 uppercase tracking-wide">최근: 최근 3개월 전적</span>
              </div>
           </div>
           
           {/* Center Title */}
           <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
             <span className="text-[18px] font-[1000] text-foreground uppercase tracking-[0.2em] italic drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
               퀵 매칭
             </span>
           </div>

           <button onClick={() => setIsVisible(false)} className="text-foreground/20 hover:text-foreground transition-all p-2 hover:bg-white/5 rounded-xl">
             <X size={22} strokeWidth={3} />
           </button>
        </div>

        {/* --- Multi-Match Arena (Reduced Padding/Gap) --- */}
        <div className="flex flex-col gap-3">
          {matchups.map((match, mIdx) => {
            const isReady = !!(match.p1 && match.p2)
            const isActive = mIdx === activeMatchIndex

            return (
              <div 
                key={mIdx} 
                className={cn(
                  "flex items-center justify-center gap-4 relative p-0.5 rounded-[1.75rem] transition-all group/match",
                  isActive ? "ring-2 ring-nzu-green/20 bg-white/[0.02]" : "opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
                  isLoading[mIdx] && "opacity-40 pointer-events-none animate-pulse"
                )}
                onClick={() => setActiveMatchIndex(mIdx)}
              >
                {/* Match Box X */}
                {matchups.length > 1 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeMatch(mIdx); }}
                    className="absolute -top-1.5 -right-1.5 p-1.5 bg-card border border-white/10 text-white/20 hover:text-red-400 hover:border-red-500/40 rounded-full shadow-lg opacity-0 group-hover/match:opacity-100 transition-all z-30"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                )}

                {/* Player 1 Card (Tightened) */}
                <div className={cn(
                  "w-[220px] flex flex-col justify-center px-4 rounded-[1.75rem] border transition-all h-[72px] bg-black/50 relative overflow-hidden group/p1",
                  match.p1 ? "border-nzu-green/40 shadow-[inset_0_0_25px_rgba(0,255,163,0.1)]" : "border-dashed border-white/5 opacity-50"
                )}>
                  {match.p1 ? (
                    <div className="flex items-center gap-3 justify-center">
                      <span className="text-[24px] font-black text-foreground drop-shadow-md leading-none">{match.p1.name}</span>
                      <div className="relative flex items-center scale-110">
                         <RaceLetterBadge race={match.p1.race} size="sm" />
                         <button 
                            onClick={(e) => { e.stopPropagation(); removePlayer(mIdx, 'p1'); }} 
                            className="ml-2 p-1 bg-white/5 border border-white/5 hover:border-red-500/35 text-white/20 hover:text-red-400 rounded-lg transition-all opacity-0 group-hover/p1:opacity-100"
                         >
                            <X size={10} strokeWidth={3} />
                         </button>
                      </div>
                    </div>
                  ) : (
                    <span className="mx-auto text-[11px] font-black tracking-[0.4em] text-foreground/5 italic">A팀 선수</span>
                  )}
                </div>

                {/* Center Core (Tighter Vertical Spacing) */}
                <div className="flex flex-col items-center justify-center min-w-[125px] relative pt-3 pb-1">
                   <button 
                      onClick={(e) => { e.stopPropagation(); swapMatch(mIdx); }}
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 p-2 rounded-xl bg-card border border-white/20 hover:border-nzu-green/50 hover:text-nzu-green transition-all shadow-xl active:scale-75 z-20"
                   >
                      <ArrowLeftRight size={15} strokeWidth={3} />
                   </button>

                   {/* Overall Stats (Fixed Colors For Label Too) */}
                   <div className="flex items-center justify-center gap-3 w-full">
                      <span className={cn("text-[42px] font-[1000] italic tracking-tighter transition-all leading-none", isReady ? "text-nzu-green drop-shadow-[0_0_15px_rgba(0,255,163,0.3)]" : "text-white/5")}>
                         {isReady ? match.overallScore[0] : "0"}
                      </span>
                      <span className={cn("text-[18px] font-black italic uppercase pt-0.5 tracking-tightest transition-colors", isReady ? "text-nzu-green/60" : "text-white/10")}>전체</span>
                      <span className={cn("text-[42px] font-[1000] italic tracking-tighter transition-all leading-none", isReady ? "text-nzu-green drop-shadow-[0_0_15px_rgba(0,255,163,0.3)]" : "text-white/5")}>
                         {isReady ? match.overallScore[1] : "0"}
                      </span>
                   </div>

                   {/* Recent Stats (Tighter Top Margin) */}
                   <div className="flex items-center justify-center gap-5 w-full border-t border-white/5 mt-0.5 pt-1.5">
                      <span className={cn("text-[30px] font-[1000] italic tracking-tighter transition-all leading-none", isReady ? "text-red-500/80 drop-shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "text-white/5")}>
                         {isReady ? match.recentScore[0] : "0"}
                      </span>
                      <span className={cn("text-[16px] font-[1000] italic uppercase pb-0.5 transition-colors", isReady ? "text-red-500/40" : "text-white/10")}>최근</span>
                      <span className={cn("text-[30px] font-[1000] italic tracking-tighter transition-all leading-none", isReady ? "text-red-500/80 drop-shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "text-white/5")}>
                         {isReady ? match.recentScore[1] : "0"}
                      </span>
                   </div>
                </div>

                {/* Player 2 Card (Tightened) */}
                <div className={cn(
                  "w-[220px] flex flex-col justify-center px-4 rounded-[1.75rem] border transition-all h-[72px] bg-black/50 relative overflow-hidden items-center group/p2",
                  match.p2 ? "border-red-500/40 shadow-[inset_0_0_25px_rgba(239,68,68,0.1)]" : "border-dashed border-white/5 opacity-50"
                )}>
                  {match.p2 ? (
                    <div className="flex items-center gap-3 text-center">
                      <div className="relative flex items-center scale-110">
                         <button 
                            onClick={(e) => { e.stopPropagation(); removePlayer(mIdx, 'p2'); }} 
                            className="mr-2 p-1 bg-white/5 border border-white/5 hover:border-red-500/35 text-white/20 hover:text-red-400 rounded-lg transition-all opacity-0 group-hover/p2:opacity-100"
                         >
                            <X size={10} strokeWidth={3} />
                         </button>
                         <RaceLetterBadge race={match.p2.race} size="sm" />
                      </div>
                      <span className="text-[24px] font-black text-foreground drop-shadow-md leading-none">{match.p2.name}</span>
                    </div>
                  ) : (
                    <span className="mx-auto text-[11px] font-black tracking-[0.4em] text-foreground/5 italic">B팀 선수</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* --- Quick Add Slot --- */}
        <div className="pt-0.5">
           <button 
              onClick={() => {
                setMatchups(prev => [...prev, { p1: null, p2: null, overallScore: [0, 0], recentScore: [0, 0] }])
                setActiveMatchIndex(matchups.length)
              }}
              className="w-full py-3 rounded-2xl border border-nzu-green/18 bg-nzu-green/[0.05] hover:border-nzu-green/40 hover:bg-nzu-green/[0.1] text-nzu-green transition-all flex items-center justify-center gap-3 group"
           >
              <Plus size={18} className="group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-[13.5px] font-black uppercase tracking-[0.3em]">새로운 팀 매치 전적 추가</span>
           </button>
        </div>
      </div>
    </div>
  )
}
