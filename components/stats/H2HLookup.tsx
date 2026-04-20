'use client'

import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from 'react'
import { TierBadge, getTierTone } from '@/components/ui/nzu-badges'
import { RaceLetterBadge } from '@/components/ui/race-letter-badge'
import type { H2HStats } from '@/types'
import { cn, normalizeTier } from '@/lib/utils'
import { getTierSortWeight } from '@/lib/tier-order'
import { Trophy, X, Swords, Plus, RotateCcw, Activity, Zap } from 'lucide-react'
import { getUniversityLabel, UNIVERSITY_MAP } from '@/lib/university-config'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { buildH2HCacheKey, fetchH2HStats, filterMatchupPlayers, reportMatchupRuntimeIssue, type MatchupPlayerSummary } from '@/lib/matchup-helpers'
type Player = MatchupPlayerSummary;
type UniversityOption = {
  code: string;
  name: string;
  stars?: number;
};

// Legacy tier map retained temporarily until the file-wide encoding cleanup lands.
// Runtime ordering now uses the shared getTierSortWeight helper instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TIER_CONFIG: Record<string, { weight: number; color: string }> = {
  '媛?: { weight: 0, color: '#ff6b6b' },
  '??: { weight: 1, color: '#f59e0b' },
  '??: { weight: 2, color: '#8b5cf6' },
  '議곗빱': { weight: 3, color: '#22c55e' },
  '?ㅽ럹?대뱶': { weight: 4, color: '#06b6d4' },
  '0': { weight: 5, color: '#f97316' },
  '1': { weight: 6, color: '#ef4444' },
  '2': { weight: 7, color: '#84cc16' },
  '3': { weight: 8, color: '#3b82f6' },
  '4': { weight: 9, color: '#14b8a6' },
  '5': { weight: 10, color: '#0ea5e9' },
  '6': { weight: 11, color: '#64748b' },
  '7': { weight: 12, color: '#71717a' },
  '8': { weight: 13, color: '#78716c' },
  '9': { weight: 14, color: '#a855f7' },
  '誘몄젙': { weight: 99, color: '#6366f1' },
};

const EXCLUDED_TIERS = ['??, '議곗빱', '?ㅽ럹?대뱶'];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTierConfigSafeKey(tier: string | null | undefined) {
  return normalizeTier(tier);
}

interface Match {
  id: string;
  p1: MatchupPlayerSummary;
  p2: MatchupPlayerSummary;
  h2h?: H2HStats | null;
}

function buildGroupedMatches(matchList: Match[]) {
  const groups: { p1Id: string; entries: Array<{ match: Match; index: number }> }[] = [];

  matchList.forEach((match, index) => {
    const last = groups[groups.length - 1];
    if (last && last.p1Id === match.p1.id) {
      last.entries.push({ match, index });
      return;
    }

    groups.push({ p1Id: match.p1.id, entries: [{ match, index }] });
  });

  return groups;
}

interface H2HLookupProps {
  players?: MatchupPlayerSummary[]
  recentMatches?: unknown[]
  universityOptions?: UniversityOption[]
}

function getMatchRowStyle(
  style: CSSProperties | undefined,
  isDropAnimating: boolean
): CSSProperties | undefined {
  if (!style) return style;

  if (!isDropAnimating) {
    return style;
  }

  return {
    ...style,
    transitionDuration: '220ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  };
}

function getMatchupStats(stats: H2HStats | null | undefined) {
  if (!stats) return null;
  return {
    overall: [stats.summary.wins, stats.summary.losses] as const,
    recent: [stats.summary.momentum90.wins, stats.summary.momentum90.losses] as const,
  };
}

export default function H2HLookup({ players: initialPlayers = [], universityOptions = [] }: H2HLookupProps) {
  // Selection State (Historical)
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [results, setResults] = useState<H2HStats | null>(null)

  // Side Selection States
  const [u1, setU1] = useState<string>('')
  const [u2, setU2] = useState<string>('')
  const [q1] = useState('')
  const [q2] = useState('')

  // Filter logic: Default to ON (true)
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true)

   // Resizable Logic
   const [sidebarWidth, setSidebarWidth] = useState(500)
   const [isResizing, setIsResizing] = useState(false)
   const [isDesktop, setIsDesktop] = useState(true)
   const containerRef = useRef<HTMLDivElement>(null)

   // Responsive Check
   useEffect(() => {
     const checkSize = () => {
       setIsDesktop(window.innerWidth >= 1024)
     }
     checkSize()
     window.addEventListener('resize', checkSize)
     return () => window.removeEventListener('resize', checkSize)
   }, [])

   const startResizing = useCallback(() => setIsResizing(true), [])
   const stopResizing = useCallback(() => setIsResizing(false), [])
   const resize = useCallback((e: MouseEvent) => {
     if (isResizing && containerRef.current && isDesktop) {
       const containerWidth = containerRef.current.offsetWidth
       const containerLeft = containerRef.current.getBoundingClientRect().left
       const newWidth = containerWidth - (e.clientX - containerLeft)
       // Constraints: 350px to 900px
       if (newWidth >= 350 && newWidth <= 900) {
         setSidebarWidth(newWidth)
       }
     }
   }, [isResizing, isDesktop])

   useEffect(() => {
     if (isResizing && isDesktop) {
       window.addEventListener('mousemove', resize)
       window.addEventListener('mouseup', stopResizing)
     }
     return () => {
       window.removeEventListener('mousemove', resize)
       window.removeEventListener('mouseup', stopResizing)
     }
   }, [isResizing, resize, stopResizing, isDesktop])

  // Match List State
  const [matches, setMatches] = useState<Match[]>([])
  const matchIdCounter = useRef(0)
  const h2hRequestCacheRef = useRef<Map<string, Promise<H2HStats | null>>>(new Map())

  const resetEntryBoard = useCallback(() => {
    setMatches([]);
    setP1(null);
    setP2(null);
    setResults(null);
  }, []);

  const nextMatchId = () => {
    matchIdCounter.current += 1;
    return `m_${matchIdCounter.current}`;
  }

  const requestH2HStats = useCallback((player1: Player, player2: Player) => {
    const queryKey = buildH2HCacheKey(player1, player2);
    const cached = h2hRequestCacheRef.current.get(queryKey);
    if (cached) return cached;

    const promise = (async () => {
      return fetchH2HStats(player1, player2);
    })();

    h2hRequestCacheRef.current.set(queryKey, promise);
    promise.catch(() => {
      h2hRequestCacheRef.current.delete(queryKey);
    });
    return promise;
  }, []);

  const players1 = useMemo(() => {
    if (!u1) return [];
    return filterMatchupPlayers(initialPlayers, { university: u1, query: q1 }).map(player => ({
      ...player,
      tier: normalizeTier(player.tier),
    }));
  }, [initialPlayers, u1, q1])

  const players2 = useMemo(() => {
    if (!u2) return [];
    return filterMatchupPlayers(initialPlayers, { university: u2, query: q2 }).map(player => ({
      ...player,
      tier: normalizeTier(player.tier),
    }));
  }, [initialPlayers, u2, q2])

  // Detailed Analysis for Manual Selection
  useEffect(() => {
    if (p1 && p2) {
      requestH2HStats(p1, p2)
        .then(data => setResults(data))
        .catch(err => reportMatchupRuntimeIssue('Entry H2H fetch failed', err))
    }
  }, [p1, p2, requestH2HStats])

  const groupPlayers = useCallback((players: Player[]) => {
    const groups: Record<string, Player[]> = {};
    players.forEach(p => {
      const tier = p.tier || '誘몄젙';
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => getTierSortWeight(a) - getTierSortWeight(b))
      .map(tier => {
        const tierPlayers = [...groups[tier]].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        return { tier, players: tierPlayers };
      });
  }, []);

  const universityNameMap = useMemo(
    () => Object.fromEntries(universityOptions.map((option) => [option.code, option.name])) as Record<string, string>,
    [universityOptions]
  );

  const getUniversityDisplayName = useCallback(
    (code: string) => universityNameMap[code] || getUniversityLabel(code),
    [universityNameMap]
  );

  const sortedUniversities = useMemo(() => {
    const codes = universityOptions.length > 0 ? universityOptions.map((option) => option.code) : Object.keys(UNIVERSITY_MAP);

    return codes.sort((a, b) => {
      const nameA = getUniversityDisplayName(a);
      const nameB = getUniversityDisplayName(b);
      const isFaA = nameA === '臾댁냼??;
      const isFaB = nameB === '臾댁냼??;
      if (isFaA !== isFaB) return isFaA ? 1 : -1;
      const isKorean = (s: string) => /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(s);
      return (isKorean(nameA) && !isKorean(nameB)) ? -1 : (!isKorean(nameA) && isKorean(nameB)) ? 1 : nameA.localeCompare(nameB, 'ko');
    });
  }, [getUniversityDisplayName, universityOptions]);

  const groups1 = useMemo(() => groupPlayers(players1), [groupPlayers, players1]);
  const groups2 = useMemo(() => groupPlayers(players2), [groupPlayers, players2]);

  const arenaTiers = useMemo(() => {
    const allUniqueTiers = Array.from(new Set([...groups1.map(g => g.tier), ...groups2.map(g => g.tier)]));
    const sortedTiers = allUniqueTiers.sort((a, b) => getTierSortWeight(a) - getTierSortWeight(b));

    return sortedTiers.filter(tier => {
      const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
      const hasPlayers = (g1?.players.length || 0) + (g2?.players.length || 0) > 0;

      if (!hasPlayers) return false;

      if (hideEmptyTiers) {
        const isExcludedTier = EXCLUDED_TIERS.includes(tier);
        if (isExcludedTier) return false;
        if (u1 && u2) {
          const bothSidesHavePlayers = (g1?.players.length || 0) > 0 && (g2?.players.length || 0) > 0;
          return bothSidesHavePlayers;
        }
      }
      return true;
    });
  }, [groups1, groups2, hideEmptyTiers, u1, u2]);

  const addMatch = async (player1: Player, player2: Player) => {
    if (matches.some(m => m.p1.id === player1.id && m.p2.id === player2.id)) return;
    const newMatch: Match = { id: nextMatchId(), p1: player1, p2: player2 };
    setMatches(prev => [...prev, newMatch]);
    requestH2HStats(player1, player2).then(data => {
      setMatches(prev => prev.map(m => m.id === newMatch.id ? { ...m, h2h: data } : m));
    });
  };

  const autoMatch = () => {
    if (!u1 || !u2) { alert('?묒そ ?숆탳瑜?癒쇱? ?좏깮?댁＜?몄슂.'); return; }
    const newMatches: Match[] = [];
    arenaTiers.forEach(tier => {
      const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
      if (g1 && g2) {
        g1.players.forEach(pA => g2.players.forEach(pB => {
          if (!matches.some(m => m.p1.id === pA.id && m.p2.id === pB.id)) {
            newMatches.push({ id: nextMatchId(), p1: pA, p2: pB });
          }
        }));
      }
    });

    if (newMatches.length > 0) {
      setMatches(prev => [...prev, ...newMatches]);
      newMatches.forEach(m => {
        requestH2HStats(m.p1, m.p2).then(data => {
          setMatches(prev => prev.map(old => old.id === m.id ? { ...old, h2h: data } : old));
        });
      });
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const destination = result.destination;
    setMatches((prev) => {
      const groups = buildGroupedMatches(prev).map((group) => group.entries.map((entry) => entry.match));
      const [reorderedGroup] = groups.splice(result.source.index, 1);
      groups.splice(destination.index, 0, reorderedGroup);
      return groups.flat();
    });
  };

  const removeMatch = (id: string) => setMatches(prev => prev.filter(m => m.id !== id));

  const groupedMatches = useMemo(() => {
    return buildGroupedMatches(matches);
  }, [matches]);

  return (
    <div className="w-full space-y-20">
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row gap-0 items-start relative"
      >
        {/* ?袁⑥쟿???諭??(?ル슣瑜? */}
        <div
          className="flex-1 space-y-6 w-full lg:pr-6"
          style={{ width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : '100%' }}
        >
           {/* ?怨룸뼊 ?뚢뫂?껅에?獄?*/}
           <div className="bg-[#0A100D] border border-white/10 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-nzu-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">

                 <div className="flex-1 w-full flex items-center gap-3">
                    <div className="relative flex-1">
                      <select value={u1} onChange={(e) => { resetEntryBoard(); setU1(e.target.value); }}
                        className="w-full bg-black border-2 border-nzu-green/20 rounded-2xl px-6 py-4 text-base font-black text-white focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10 transition-all outline-none appearance-none cursor-pointer">
                        <option value="">?쇱そ ?숆탳 ?좏깮</option>
                        {sortedUniversities.map(u => <option key={u} value={u}>{getUniversityDisplayName(u)}</option>)}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-nzu-green/40">??/div>
                    </div>
                 </div>

                 <div className="flex gap-3 shrink-0">
                    <button onClick={() => setHideEmptyTiers(!hideEmptyTiers)}
                      className={cn("px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg active:scale-95",
                        hideEmptyTiers ? "bg-nzu-green text-black hover:brightness-110" : "bg-white/5 border border-white/10 text-white/40 hover:bg-white/10")}>
                      ??꾩슜?꾪꽣
                    </button>
                    <button onClick={autoMatch}
                      className="px-7 py-4 bg-white text-black rounded-2xl text-base font-bold flex items-center gap-2 hover:bg-nzu-green hover:text-black transition-all shadow-xl active:scale-95">
                      <Plus className="w-5 h-5" />?먮룞 留ㅼ튂
                    </button>
                    <button onClick={() => setMatches([])}
                      className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all shadow-lg">
                      <RotateCcw className="w-5 h-5" />
                    </button>
                 </div>

                 <div className="flex-1 w-full flex items-center gap-3">
                    <div className="relative flex-1">
                      <select value={u2} onChange={(e) => { resetEntryBoard(); setU2(e.target.value); }}
                        className="w-full bg-black border-2 border-nzu-green/20 rounded-2xl px-6 py-4 text-base font-black text-white focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10 transition-all outline-none appearance-none cursor-pointer">
                        <option value="">?ㅻⅨ履??숆탳 ?좏깮</option>
                        {sortedUniversities.map(u => <option key={u} value={u}>{getUniversityDisplayName(u)}</option>)}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-nzu-green/40">??/div>
                    </div>
                 </div>
              </div>
           </div>

           {/* 餓λ쵐釉??袁⑥쟿??癰귣?諭?*/}
           <div className="bg-[#050706] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t-nzu-green/30 border-t-2 relative">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nzu-green/50 to-transparent shadow-[0_0_15px_#2ed573]" />
              <div className="grid grid-cols-[1fr_120px_1fr] bg-white/[0.04] border-b border-white/5 px-10 py-7 items-center text-left backdrop-blur-md">
                 <div className="flex flex-col">
                    <span className="text-2xl font-black text-white/90 truncate tracking-tight">{getUniversityDisplayName(u1) || "?쇱そ ?숆탳"}</span>
                 </div>

                 <div className="text-center" />
                 <div className="flex flex-col text-right">
                    <span className="text-2xl font-black text-white/90 truncate tracking-tight text-right">{getUniversityDisplayName(u2) || "?ㅻⅨ履??숆탳"}</span>
                  </div>
               </div>

               <div className="h-[700px] overflow-y-auto custom-scrollbar p-2">
                  {arenaTiers.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center">
                      <p className="text-sm font-bold text-white/20">?숆탳瑜??좏깮?섎㈃ ?좎닔媛 ?섑??⑸땲??..</p>
                    </div>
                  ) : arenaTiers.map(tier => {
                    const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
                    return (
                      <div key={tier} className="grid grid-cols-[1fr_120px_1fr] border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors min-h-[90px] group/row">
                         <div className="flex flex-wrap items-center justify-end gap-3 p-4 pr-6">
                            {g1?.players.map(p => {
                              const isTerran = p.race?.startsWith('T');
                              const isZerg = p.race?.startsWith('Z');
                              return (
                                <button key={p.id} onClick={() => p1?.id === p.id ? setP1(null) : setP1(p)}
                                  className={cn(
                                    "flex items-center gap-4 px-5 py-3 rounded-xl border-2 transition-all duration-300 text-base font-black shadow-lg relative group/btn",
                                    p1?.id === p.id
                                      ? "bg-nzu-green border-nzu-green text-black scale-105 z-10"
                                      : "bg-[#0D1210] border-white/5 text-white/40 hover:text-white hover:border-white/20"
                                  )}>
                                  <span className="relative z-10">{p.name}</span>
                                  <span className={cn(
                                    "text-xs font-black relative z-10",
                                    isTerran ? "text-terran" : isZerg ? "text-zerg" : "text-protoss"
                                  )}>{p.race?.charAt(0)}</span>
                                </button>
                              );
                            })}
                         </div>
                          <div className="flex items-center justify-center bg-black/40 border-x border-white/[0.03] relative">
                             <div className="absolute w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
                             <TierBadge
                               tier={tier}
                               size="sm"
                               className="relative z-10 min-w-[72px] justify-center shadow-2xl transition-transform group-hover/row:scale-110"
                             />
                          </div>
                         <div className="flex flex-wrap items-center justify-start gap-3 p-4 pl-6">
                            {g2?.players.map(p => {
                               const isTerran = p.race?.startsWith('T');
                               const isZerg = p.race?.startsWith('Z');
                                return (
                                <button key={p.id} onClick={() => p2?.id === p.id ? setP2(null) : setP2(p)}
                                  className={cn(
                                    "flex items-center gap-4 px-5 py-3 rounded-xl border-2 transition-all duration-300 text-base font-black shadow-lg relative group/btn",
                                    p2?.id === p.id
                                      ? "bg-nzu-green border-nzu-green text-black scale-105 z-10"
                                      : "bg-[#0D1210] border-white/5 text-white/40 hover:text-white hover:border-white/20"
                                  )}>
                                  <span className="relative z-10">{p.name}</span>
                                  <span className={cn(
                                    "text-xs font-black relative z-10",
                                    isTerran ? "text-terran" : isZerg ? "text-zerg" : "text-protoss"
                                  )}>{p.race?.charAt(0)}</span>
                                </button>
                               );
                            })}
                         </div>
                      </div>
                    )
                 })}
              </div>
           </div>
        </div>

        {/* ??륁춦 ?귐딄텢??곸グ ?紐껊굶 (Cyber-Mechanic Slider) */}
        <div
          className={cn(
            "hidden lg:flex flex-col items-center justify-center w-12 h-[750px] mt-24 mb-24 cursor-col-resize group z-[100] transition-all duration-500 relative",
            isResizing ? "opacity-100" : "opacity-80 hover:opacity-100"
          )}
          onMouseDown={(e) => { e.preventDefault(); startResizing(); }}
        >
          {/* Rail Track (??됱뵬 ???퍟) */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-black border-l border-white/[0.05] border-r border-[#000] shadow-[inset_0_0_10px_rgba(0,0,0,1)]" />

          {/* LED Track Status (??됱뵠?? 獄쏆뮄??? */}
          <div className={cn(
            "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] transition-all duration-500",
            isResizing ? "bg-nzu-green shadow-[0_0_20px_#2ed573] h-full" : "bg-nzu-green opacity-0 group-hover:opacity-100 h-1/2 group-hover:h-full group-hover:shadow-[0_0_10px_#2ed573]"
          )} />

           {/* Mechanic Knob (?⑥쥙苑??域밸챶???紐껊굶) */}
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 w-8 h-32 flex flex-col items-center justify-center transition-all duration-300 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.9)] cursor-col-resize",
            "bg-gradient-to-br from-[#1e2522] via-[#0d1210] to-[#050706] border border-white/10",
            isResizing ? "scale-110 border-nzu-green/60 shadow-[0_0_40px_rgba(46,213,115,0.3)]" : "group-hover:border-nzu-green/40 group-hover:shadow-[0_0_20px_rgba(46,213,115,0.1)]"
          )}>
             {/* Dynamic Grip Pattern (筌욊낫??怨몄뵥 3餓?域밸챶??獄? */}
             <div className="flex gap-1.5 items-center justify-center h-full pointer-events-none">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-[3px] rounded-full transition-all duration-300",
                      isResizing ? "bg-nzu-green h-12 shadow-[0_0_10px_#2ed573]" : "bg-white/20 h-8 group-hover:bg-white/40 group-hover:h-10"
                    )}
                  />
                ))}
             </div>

             {/* LED Status Glow (?怨밴묶 ??뽯뻻 ??륁뵠??깆뵠?? */}
             <div className={cn(
               "absolute inset-x-0 bottom-0 h-1 transition-all duration-300",
               isResizing ? "bg-nzu-green shadow-[0_0_15px_#2ed573]" : "bg-transparent group-hover:bg-nzu-green/30"
             )} />
          </div>
        </div>

        {/* ?怨쀫? ?酉?껆뵳???筌욊쑵紐?*/}
        <div
          className="bg-background border border-white/10 rounded-[2.5rem] flex flex-col h-[600px] lg:h-[850px] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden lg:sticky lg:top-8 mt-12 lg:mt-0"
          style={{ width: isDesktop ? `${sidebarWidth}px` : '100%' }}
        >
           <div className="p-7 bg-gradient-to-b from-white/[0.04] to-transparent border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4 text-left">
                 <div className="w-10 h-10 rounded-xl bg-nzu-gold/10 flex items-center justify-center border border-nzu-gold/20">
                    <Trophy className="w-5 h-5 text-nzu-gold" />
                 </div>

                 <div className="flex flex-col">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-md">?먮룞 留ㅼ튂 寃곌낵</h2>
                 </div>
              </div>
              <div className="px-5 py-2 bg-gradient-to-r from-nzu-green/20 to-nzu-green/5 border border-nzu-green/30 rounded-xl shadow-inner cursor-default">
                  <span className="text-sm font-black text-nzu-green tabular-nums">
                    {matches.length} <span className="text-[10px] opacity-60">留ㅼ튂???앹꽦??/span>
                  </span>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="entry-list">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {groupedMatches.map((group, groupIndex) => {
                          const isGrouped = group.entries.length > 1;
                          const tierKey = normalizeTier(group.entries[0].match.p1.tier);
                          const tInfo = { color: getTierTone(tierKey).hex };
                          const groupKey = `${group.p1Id}:${group.entries[0].match.id}`;
                          return (
                            <Draggable key={groupKey} draggableId={groupKey} index={groupIndex}>
                              {(dProv, snapshot) => (
                                <div
                                  ref={dProv.innerRef}
                                  {...dProv.draggableProps}
                                  {...dProv.dragHandleProps}
                                  className={cn(
                                    "rounded-2xl border overflow-hidden transition-[background-color,border-color,box-shadow,ring-color,border-radius]",
                                    isGrouped
                                      ? "bg-nzu-green/[0.03] border-nzu-green/30 shadow-[0_0_30px_rgba(46,213,115,0.05)]"
                                      : "bg-white/[0.02] border-white/5 shadow-xl",
                                    snapshot.isDragging && "bg-[#1A221F] shadow-4xl z-50 rounded-2xl ring-2 ring-nzu-green/50",
                                    snapshot.isDropAnimating && "ring-1 ring-nzu-green/30"
                                  )}
                                  style={{ ...getMatchRowStyle(dProv.draggableProps.style, snapshot.isDropAnimating), borderLeft: `8px solid ${isGrouped ? '#2ed573' : tInfo.color}` }}
                                >
                               {group.entries.map(({ match }, idx) => {
                                  const matchupStats = getMatchupStats(match.h2h);
                                    return (
                                          <div
                                            key={match.id}
                                            className={cn(
                                              "grid grid-cols-[44px_minmax(0,1fr)_82px_minmax(0,1fr)_24px] gap-x-1.5 items-center px-3 py-2.5 group relative transition-[background-color,box-shadow,ring-color,border-radius]",
                                              idx !== 0 && "border-t border-white/[0.02]",
                                              !snapshot.isDragging && "hover:bg-white/[0.05]"
                                            )}>
                                              <div className="flex justify-center">
                                                 <TierBadge
                                                   tier={match.p1.tier}
                                                   size="sm"
                                                   className="min-w-[40px] px-1 shadow-inner"
                                                 />
                                              </div>
                                              <div className="min-w-0 flex items-center gap-1 px-0.5 truncate text-left">
                                                 <span className={cn(
                                                    "min-w-0 text-lg font-black truncate block transition-colors md:text-xl",
                                                    idx === 0 ? "text-white" : "text-white/30"
                                                 )}>{match.p1.name}</span>
                                                 <RaceLetterBadge race={match.p1.race} size="sm" />
                                              </div>

                                            <div className="flex justify-center items-center">
                                               {matchupStats ? (
                                                  <div className="flex min-w-[82px] flex-col items-center animate-in fade-in zoom-in-90 duration-300">
                                                     <div className="flex min-w-[82px] items-center justify-center gap-1">
                                                        <span className="min-w-[18px] text-right text-[1.28rem] font-[1000] italic text-nzu-green leading-none tabular-nums md:text-[1.45rem]">{matchupStats.overall[0]}</span>
                                                        <span className="min-w-[34px] px-1 text-center text-[11px] font-[1000] italic text-nzu-green/68">?꾩껜</span>
                                                        <span className="min-w-[18px] text-left text-[1.28rem] font-[1000] italic text-nzu-green leading-none tabular-nums md:text-[1.45rem]">{matchupStats.overall[1]}</span>
                                                     </div>
                                                     <div className="my-0.5 h-px w-[74px] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
                                                     <div className="flex min-w-[82px] items-center justify-center gap-1 opacity-75">
                                                        <span className="min-w-[16px] text-right text-[1rem] font-[1000] italic text-red-500/85 leading-none tabular-nums md:text-[1.08rem]">{matchupStats.recent[0]}</span>
                                                        <span className="min-w-[34px] text-center text-[11px] font-[1000] italic text-red-500/45">理쒓렐</span>
                                                        <span className="min-w-[16px] text-left text-[1rem] font-[1000] italic text-red-500/85 leading-none tabular-nums md:text-[1.08rem]">{matchupStats.recent[1]}</span>
                                                     </div>
                                                  </div>
                                               ) : (
                                                  <div className="flex min-w-[82px] flex-col items-center gap-1.5">
                                                     <div className="h-5 w-16 rounded-full bg-white/5 animate-pulse" />
                                                     <div className="h-4 w-14 rounded-full bg-white/[0.04] animate-pulse" />
                                                  </div>
                                               )}
                                            </div>

                                              <div className="min-w-0 flex items-center justify-end gap-1 px-0.5 truncate">
                                                 <RaceLetterBadge race={match.p2.race} size="sm" />
                                                 <span className="min-w-0 text-lg font-black text-white group-hover:text-nzu-green transition-colors truncate md:text-xl">{match.p2.name}</span>
                                              </div>
                                             <button onClick={(e) => { e.stopPropagation(); removeMatch(match.id); }}
                                               className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all flex justify-center z-10">
                                               <X className="w-3.5 h-3.5" />
                                             </button>
                                          </div>
                                    )
                               })}
                                </div>
                              )}
                            </Draggable>
                          )
                       })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
           </div>
        </div>
      </div>
      {/* H2H ?怨멸쉭 ?브쑴苑?Dashboard (Full Width) */}
      {results && p1 && p2 && (
        <section className="bg-black/80 border-2 border-nzu-green/40 rounded-[3rem] p-12 shadow-[0_0_100px_rgba(46,213,115,0.1)] relative overflow-hidden fade-in">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Swords className="w-64 h-64 text-nzu-green rotate-12" />
          </div>

          <div className="relative z-10 space-y-12">
            <div className="flex items-center justify-between border-b border-white/10 pb-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-nzu-green/10 flex items-center justify-center border border-nzu-green/20">
                  <Activity className="w-8 h-8 text-nzu-green" />
                </div>
                <div>
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-1">?곸꽭 遺꾩꽍 由ы룷??/h3>
                  <p className="text-white/40 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-nzu-green animate-ping" />
                    ?ㅼ떆媛?遺꾩꽍 ?붿쭊 ?묐룞 以?/p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white/40 mb-2">?밸쪧 ?덉륫</span>
                <div className="text-5xl font-black text-white tracking-tighter tabular-nums">
                  {Math.round((results.summary.wins / (results.summary.wins + results.summary.losses || 1)) * 100)}% <span className="text-nzu-green">?곗꽭</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
              {/* ?ル슣瑜??醫롫땾 */}
              <div className="bg-white/[0.02] p-8 rounded-[2rem] border border-white/5 text-center space-y-4">
                <TierBadge tier={p1.tier} size="lg" />
                <h4 className="text-4xl font-black text-white">{p1.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-4 py-1.5 bg-terran/10 text-terran rounded-lg text-xs font-black border border-terran/20">{p1.race}</span>
                  <span className="px-4 py-1.5 bg-white/5 text-white/40 rounded-lg text-xs font-black border border-white/10">{getUniversityLabel(p1.university)}</span>
                </div>
              </div>

              {/* 餓λ쵐釉??袁⑹읅 ??쇳맜??*/}
              <div className="space-y-8 flex flex-col items-center">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-7xl font-black text-white mb-2">{results.summary.wins}</div>
                    <div className="text-[10px] font-black text-nzu-green uppercase tracking-widest">??/div>
                  </div>
                  <div className="text-4xl font-black text-white/10">VS</div>
                  <div className="text-center">
                    <div className="text-7xl font-black text-white/40 mb-2">{results.summary.losses}</div>
                    <div className="text-[10px] font-black text-white/10 uppercase tracking-widest">??/div>
                  </div>
                </div>
                {/* Win Prob Bar */}
                <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden relative">
                   <div className="absolute inset-0 bg-gradient-to-r from-nzu-green/20 to-transparent" />
                   <div className="h-full bg-nzu-green shadow-[0_0_20px_#2ed573] transition-all duration-1000"
                        style={{ width: `${(results.summary.wins / (results.summary.wins + results.summary.losses || 1)) * 100}%` }} />
                </div>
              </div>

              {/* ?怨쀫? ?醫롫땾 */}
              <div className="bg-white/[0.02] p-8 rounded-[2rem] border border-white/5 text-center space-y-4">
                <TierBadge tier={p2.tier} size="lg" />
                <h4 className="text-4xl font-black text-white/60">{p2.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-4 py-1.5 bg-zerg/10 text-zerg rounded-lg text-xs font-black border border-zerg/20">{p2.race}</span>
                  <span className="px-4 py-1.5 bg-white/5 text-white/40 rounded-lg text-xs font-black border border-white/10">{getUniversityLabel(p2.university)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-8">
              <button
                onClick={() => addMatch(p1, p2)}
                className="group relative px-12 py-5 bg-white text-black text-xl font-black uppercase tracking-tighter rounded-3xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(46,213,115,0.3)]"
              >
                <div className="absolute inset-0 bg-nzu-green translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
                <span className="relative z-10 flex items-center gap-3 group-hover:text-black">
                  <Zap className="w-6 h-6 fill-current" />
                  ?꾨왂 留ㅼ튂?낆뿉 異붽?
                </span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
