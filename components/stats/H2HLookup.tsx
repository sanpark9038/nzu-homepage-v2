'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { playerService } from '@/lib/player-service'
import type { Player } from '@/types'
import { TierBadge, getTierTone } from '@/components/ui/nzu-badges'
import { getInstantH2H } from '@/lib/h2h-service'
import type { H2HStats } from '@/types'
import { cn, getTierLabel } from '@/lib/utils'
import { Trophy, X, Swords, Plus, RotateCcw, Activity, Zap } from 'lucide-react'
import { UNIVERSITY_MAP } from '@/lib/university-config'
import { REAL_NAME_MAP } from '@/lib/constants'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

const TIER_CONFIG: Record<string, { weight: number; color: string }> = {
  GOD: { weight: 0, color: getTierTone('갓').hex },
  갓: { weight: 1, color: getTierTone('갓').hex },
  KING: { weight: 2, color: getTierTone('킹').hex },
  킹: { weight: 3, color: getTierTone('킹').hex },
  JACK: { weight: 4, color: getTierTone('잭').hex },
  잭: { weight: 5, color: getTierTone('잭').hex },
  QUEEN: { weight: 6, color: getTierTone('퀸').hex },
  퀸: { weight: 7, color: getTierTone('퀸').hex },
  JOKER: { weight: 8, color: getTierTone('조커').hex },
  조커: { weight: 9, color: getTierTone('조커').hex },
  SPADE: { weight: 10, color: getTierTone('스페이드').hex },
  스페이드: { weight: 11, color: getTierTone('스페이드').hex },
  '0': { weight: 12, color: getTierTone('0').hex },
  '1': { weight: 13, color: getTierTone('1').hex },
  '2': { weight: 14, color: getTierTone('2').hex },
  '3': { weight: 15, color: getTierTone('3').hex },
  '4': { weight: 16, color: getTierTone('4').hex },
  '5': { weight: 17, color: getTierTone('5').hex },
  '6': { weight: 18, color: getTierTone('6').hex },
  '7': { weight: 19, color: getTierTone('7').hex },
  '8': { weight: 20, color: getTierTone('8').hex },
  BABY: { weight: 21, color: getTierTone('베이비').hex },
  베이비: { weight: 22, color: getTierTone('베이비').hex },
  미정: { weight: 99, color: getTierTone('미정').hex },
};

const EXCLUDED_TIERS = ['JACK', '잭', 'JOKER', '조커', 'SPADE', '스페이드'];

interface Match {
  id: string;
  p1: Player;
  p2: Player;
  h2h?: H2HStats | null;
}

interface H2HLookupProps {
  players?: Player[]
  recentMatches?: unknown[]
}

export default function H2HLookup({}: H2HLookupProps) {
  // Selection State (Historical)
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [results, setResults] = useState<H2HStats | null>(null)

  // Side Selection States
  const [u1, setU1] = useState<string>('')
  const [u2, setU2] = useState<string>('')
  const [q1] = useState('')
  const [q2] = useState('')
  
  const [players1, setPlayers1] = useState<Player[]>([])
  const [players2, setPlayers2] = useState<Player[]>([])
  
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

  const nextMatchId = () => {
    matchIdCounter.current += 1;
    return `m_${matchIdCounter.current}`;
  }

  // Load Players for Side 1
  useEffect(() => {
    const load = async () => {
      try {
        let res: Player[] = [];
        if (u1) {
          res = await playerService.getPlayersByUniversity(u1) as Player[];
          if (q1) res = res.filter(p => p.name?.toLowerCase().includes(q1.toLowerCase()));
        } else if (q1) res = await playerService.searchPlayers(q1) as Player[];
        setPlayers1(res);
      } catch (err) { console.error(err) }
    }
    load()
  }, [u1, q1])

  // Load Players for Side 2
  useEffect(() => {
    const load = async () => {
      try {
        let res: Player[] = [];
        if (u2) {
          res = await playerService.getPlayersByUniversity(u2) as Player[];
          if (q2) res = res.filter(p => p.name?.toLowerCase().includes(q2.toLowerCase()));
        } else if (q2) res = await playerService.searchPlayers(q2) as Player[];
        setPlayers2(res);
      } catch (err) { console.error(err) }
    }
    load()
  }, [u2, q2])

  // Detailed Analysis for Manual Selection
  useEffect(() => {
    if (p1 && p2) {
      getInstantH2H(REAL_NAME_MAP[p1.name] || p1.name, REAL_NAME_MAP[p2.name] || p2.name)
        .then(data => setResults(data))
        .catch(err => console.error(err))
    }
  }, [p1, p2])

  const groupPlayers = useCallback((players: Player[]) => {
    const groups: Record<string, Player[]> = {};
    players.forEach(p => {
      const tier = p.tier || '미정';
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => (TIER_CONFIG[a]?.weight ?? 50) - (TIER_CONFIG[b]?.weight ?? 50))
      .map(tier => {
        const tierPlayers = [...groups[tier]].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        return { tier, players: tierPlayers };
      });
  }, []);

  const sortedUniversities = useMemo(() => {
    return Object.keys(UNIVERSITY_MAP).sort((a, b) => {
      const isKorean = (s: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(s);
      return (isKorean(a) && !isKorean(b)) ? -1 : (!isKorean(a) && isKorean(b)) ? 1 : a.localeCompare(b, 'ko');
    });
  }, []);

  const groups1 = useMemo(() => groupPlayers(players1), [groupPlayers, players1]);
  const groups2 = useMemo(() => groupPlayers(players2), [groupPlayers, players2]);

  const arenaTiers = useMemo(() => {
    const allUniqueTiers = Array.from(new Set([...groups1.map(g => g.tier), ...groups2.map(g => g.tier)]));
    const sortedTiers = allUniqueTiers.sort((a, b) => (TIER_CONFIG[a]?.weight ?? 50) - (TIER_CONFIG[b]?.weight ?? 50));
    
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
    getInstantH2H(REAL_NAME_MAP[player1.name] || player1.name, REAL_NAME_MAP[player2.name] || player2.name).then(data => setMatches(prev => prev.map(m => m.id === newMatch.id ? { ...m, h2h: data } : m)));
  };

  const autoMatch = () => {
    if (!u1 || !u2) { alert('양 팀의 대학을 먼저 선택해주세요.'); return; }
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
      newMatches.forEach(m => getInstantH2H(REAL_NAME_MAP[m.p1.name] || m.p1.name, REAL_NAME_MAP[m.p2.name] || m.p2.name).then(data => setMatches(prev => prev.map(old => old.id === m.id ? { ...old, h2h: data } : old))));
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(matches);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setMatches(items);
  };

  const removeMatch = (id: string) => setMatches(prev => prev.filter(m => m.id !== id));

  const groupedMatches = useMemo(() => {
    const sorted = [...matches].sort((a, b) => {
      const tA = TIER_CONFIG[a.p1.tier]?.weight ?? 99, tB = TIER_CONFIG[b.p1.tier]?.weight ?? 99;
      if (tA !== tB) return tA - tB;
      return a.p1.name.localeCompare(b.p1.name, 'ko') || a.p2.name.localeCompare(b.p2.name, 'ko');
    });
    const groups: { p1Id: string; matches: Match[] }[] = [];
    sorted.forEach(m => {
      const last = groups[groups.length - 1];
      if (last && last.p1Id === m.p1.id) last.matches.push(m); else groups.push({ p1Id: m.p1.id, matches: [m] });
    });
    return groups;
  }, [matches]);

  return (
    <div className="w-full space-y-20">
      <div 
        ref={containerRef}
        className="flex flex-col lg:flex-row gap-0 items-start relative"
      >
        {/* 아레나 섹션 (좌측) */}
        <div 
          className="flex-1 space-y-6 w-full lg:pr-6"
          style={{ width: isDesktop ? `calc(100% - ${sidebarWidth}px)` : '100%' }}
        >
           {/* 상단 컨트롤 바 */}
           <div className="bg-[#0A100D] border border-white/10 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-nzu-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">

                 <div className="flex-1 w-full flex items-center gap-3">
                    <div className="relative flex-1">
                      <select value={u1} onChange={(e) => setU1(e.target.value)}
                        className="w-full bg-black border-2 border-nzu-green/20 rounded-2xl px-6 py-4 text-base font-black text-white focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10 transition-all outline-none appearance-none cursor-pointer">
                        <option value="">좌측 대학 선택</option>
                        {sortedUniversities.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-nzu-green/40">▼</div>
                    </div>
                 </div>

                 <div className="flex gap-3 shrink-0">
                    <button onClick={() => setHideEmptyTiers(!hideEmptyTiers)} 
                      className={cn("px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg active:scale-95", 
                        hideEmptyTiers ? "bg-nzu-green text-black hover:brightness-110" : "bg-white/5 border border-white/10 text-white/40 hover:bg-white/10")}>
                      필터 {hideEmptyTiers ? '켜짐' : '꺼짐'}
                    </button>
                    <button onClick={autoMatch} 
                      className="px-7 py-4 bg-white text-black rounded-2xl text-base font-bold flex items-center gap-2 hover:bg-nzu-green hover:text-black transition-all shadow-xl active:scale-95">
                      <Plus className="w-5 h-5" />자동 매칭
                    </button>
                    <button onClick={() => setMatches([])} 
                      className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all shadow-lg">
                      <RotateCcw className="w-5 h-5" />
                    </button>
                 </div>

                 <div className="flex-1 w-full flex items-center gap-3">
                    <div className="relative flex-1">
                      <select value={u2} onChange={(e) => setU2(e.target.value)}
                        className="w-full bg-black border-2 border-nzu-green/20 rounded-2xl px-6 py-4 text-base font-black text-white focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10 transition-all outline-none appearance-none cursor-pointer">
                        <option value="">우측 대학 선택</option>
                        {sortedUniversities.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-nzu-green/40">▼</div>
                    </div>
                 </div>
              </div>
           </div>

           {/* 중앙 아레나 보드 */}
           <div className="bg-[#050706] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t-nzu-green/30 border-t-2 relative">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-nzu-green/50 to-transparent shadow-[0_0_15px_#2ed573]" />
              <div className="grid grid-cols-[1fr_120px_1fr] bg-white/[0.04] border-b border-white/5 px-10 py-7 items-center text-left backdrop-blur-md">
                 <div className="flex flex-col">
                    <span className="text-2xl font-black text-white/90 uppercase truncate tracking-tight">{u1 || "홈 팀"}</span>
                 </div>

                 <div className="text-center" />
                 <div className="flex flex-col text-right">
                    <span className="text-2xl font-black text-white/90 uppercase truncate tracking-tight text-right">{u2 || "원정 팀"}</span>
                  </div>
               </div>

               <div className="h-[700px] overflow-y-auto custom-scrollbar p-2">
                  {arenaTiers.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center">
                      <p className="text-sm font-bold text-white/20">대학 선택을 기다리고 있습니다...</p>
                    </div>
                  ) : arenaTiers.map(tier => {
                    const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
                    const tCol = TIER_CONFIG[tier]?.color || '#475569';
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
                            <div className="px-5 py-2.5 rounded-xl text-xs font-black uppercase text-white border-2 shadow-2xl relative z-10 transition-transform group-hover/row:scale-110" 
                                 style={{ backgroundColor: `${tCol}11`, borderColor: `${tCol}44`, color: tCol, boxShadow: `0 0 20px ${tCol}22` }}>
                              {getTierLabel(tier)}
                            </div>
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

        {/* 수직 리사이즈 핸들 (Cyber-Mechanic Slider) */}
        <div 
          className={cn(
            "hidden lg:flex flex-col items-center justify-center w-12 h-[750px] mt-24 mb-24 cursor-col-resize group z-[100] transition-all duration-500 relative",
            isResizing ? "opacity-100" : "opacity-80 hover:opacity-100"
          )}
          onMouseDown={(e) => { e.preventDefault(); startResizing(); }}
        >
          {/* Rail Track (레일 음각) */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-black border-l border-white/[0.05] border-r border-[#000] shadow-[inset_0_0_10px_rgba(0,0,0,1)]" />
          
          {/* LED Track Status (레이저 발광선) */}
          <div className={cn(
            "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] transition-all duration-500",
            isResizing ? "bg-nzu-green shadow-[0_0_20px_#2ed573] h-full" : "bg-nzu-green opacity-0 group-hover:opacity-100 h-1/2 group-hover:h-full group-hover:shadow-[0_0_10px_#2ed573]"
          )} />

           {/* Mechanic Knob (고성능 그립 핸들) */}
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 w-8 h-32 flex flex-col items-center justify-center transition-all duration-300 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.9)] cursor-col-resize",
            "bg-gradient-to-br from-[#1e2522] via-[#0d1210] to-[#050706] border border-white/10",
            isResizing ? "scale-110 border-nzu-green/60 shadow-[0_0_40px_rgba(46,213,115,0.3)]" : "group-hover:border-nzu-green/40 group-hover:shadow-[0_0_20px_rgba(46,213,115,0.1)]"
          )}>
             {/* Dynamic Grip Pattern (직관적인 3중 그립 바) */}
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

             {/* LED Status Glow (상태 표시 하이라이트) */}
             <div className={cn(
               "absolute inset-x-0 bottom-0 h-1 transition-all duration-300",
               isResizing ? "bg-nzu-green shadow-[0_0_15px_#2ed573]" : "bg-transparent group-hover:bg-nzu-green/30"
             )} />
          </div>
        </div>

        {/* 우측 엔트리 대진표 */}
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
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-md">전략 매치업</h2>
                 </div>
              </div>
              <div className="px-5 py-2 bg-gradient-to-r from-nzu-green/20 to-nzu-green/5 border border-nzu-green/30 rounded-xl shadow-inner cursor-default">
                  <span className="text-sm font-black text-nzu-green tabular-nums">
                    {matches.length} <span className="text-[10px] opacity-60">매치업 생성됨</span>
                  </span>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="entry-list">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {groupedMatches.map((group) => {
                         const isGrouped = group.matches.length > 1;
                         const tInfo = TIER_CONFIG[group.matches[0].p1.tier] || { color: '#6366f1' };
                         return (
                           <div key={group.p1Id} 
                             className={cn(
                               "rounded-2xl border transition-all overflow-hidden", 
                               isGrouped 
                               ? "bg-nzu-green/[0.03] border-nzu-green/30 shadow-[0_0_30px_rgba(46,213,115,0.05)]" 
                               : "bg-white/[0.02] border-white/5 shadow-xl"
                             )} 
                             style={{ borderLeft: `8px solid ${isGrouped ? '#2ed573' : tInfo.color}` }}>
                              {group.matches.map((match, idx) => {
                                 const globalIdx = matches.findIndex(m => m.id === match.id);
                                   return (
                                     <Draggable key={match.id} draggableId={match.id} index={globalIdx}>
                                       {(dProv, snapshot) => (
                                         <div ref={dProv.innerRef} {...dProv.draggableProps} {...dProv.dragHandleProps}
                                           className={cn(
                                             "grid grid-cols-[40px_1fr_100px_1fr_30px] items-center p-4 hover:bg-white/[0.05] group cursor-grab active:cursor-grabbing relative", 
                                             idx !== 0 && "border-t border-white/[0.02]",
                                             snapshot.isDragging && "bg-[#1A221F] shadow-4xl z-50 rounded-2xl ring-2 ring-nzu-green/50 scale-105"
                                           )}>
                                            <div className="flex justify-center">
                                               <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border border-white/10 bg-black shadow-inner" 
                                                    style={{ color: tInfo.color, borderColor: `${tInfo.color}33` }}>
                                                  {match.p1.tier.includes('GOD') || match.p1.tier.includes('갓') ? 'G' : 
                                                   match.p1.tier.includes('KING') || match.p1.tier.includes('킹') ? 'K' : 
                                                   match.p1.tier.charAt(0).toUpperCase()}
                                               </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3 px-2 truncate text-left">
                                               <span className={cn(
                                                  "text-lg font-black truncate block transition-colors", 
                                                  idx === 0 ? "text-white" : "text-white/30"
                                               )}>{match.p1.name}</span>
                                            </div>

                                            <div className="flex justify-center items-center">
                                               {match.h2h ? (
                                                  <div className="flex flex-col items-center gap-2">
                                                     <div className="flex items-center gap-3">
                                                        <span className="text-base font-black text-white">{match.h2h.summary.wins}</span>
                                                        <span className="text-[10px] font-black text-white/20">:</span>
                                                        <span className="text-base font-black text-white/40">{match.h2h.summary.losses}</span>
                                                     </div>
                                                     <div className="h-1.5 w-12 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-nzu-green" style={{ width: `${(match.h2h.summary.wins / (match.h2h.summary.wins + match.h2h.summary.losses || 1)) * 100}%` }} />
                                                     </div>
                                                  </div>
                                               ) : <div className="h-6 w-20 bg-white/5 animate-pulse rounded-full" />}
                                            </div>

                                            <div className="flex items-center justify-end gap-3 px-2 truncate">
                                               <span className="text-lg font-black text-white group-hover:text-nzu-green transition-colors truncate">{match.p2.name}</span>
                                            </div>
                                            
                                            <button onClick={(e) => { e.stopPropagation(); removeMatch(match.id); }} 
                                              className="opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all flex justify-center z-10">
                                              <X className="w-4 h-4" />
                                            </button>
                                         </div>
                                       )}
                                     </Draggable>
                                   )
                              })}
                           </div>
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

      {/* H2H 상세 분석 Dashboard (Full Width) */}
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
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-1">상세 분석 리포트</h3>
                  <p className="text-white/40 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-nzu-green animate-ping" />
                    데이터 분석 알고리즘 가동 중
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white/40 mb-2">승률 예측</span>
                <div className="text-5xl font-black text-white tracking-tighter tabular-nums">
                  {Math.round((results.summary.wins / (results.summary.wins + results.summary.losses || 1)) * 100)}% <span className="text-nzu-green">승리 예상</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
              {/* 좌측 선수 */}
              <div className="bg-white/[0.02] p-8 rounded-[2rem] border border-white/5 text-center space-y-4">
                <TierBadge tier={p1.tier} size="lg" />
                <h4 className="text-4xl font-black text-white">{p1.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-4 py-1.5 bg-terran/10 text-terran rounded-lg text-xs font-black border border-terran/20">{p1.race}</span>
                  <span className="px-4 py-1.5 bg-white/5 text-white/40 rounded-lg text-xs font-black border border-white/10">{p1.university}</span>
                </div>
              </div>

              {/* 중앙 전적 스코어 */}
              <div className="space-y-8 flex flex-col items-center">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-7xl font-black text-white mb-2">{results.summary.wins}</div>
                    <div className="text-[10px] font-black text-nzu-green uppercase tracking-widest">승리</div>
                  </div>
                  <div className="text-4xl font-black text-white/10">대전</div>
                  <div className="text-center">
                    <div className="text-7xl font-black text-white/40 mb-2">{results.summary.losses}</div>
                    <div className="text-[10px] font-black text-white/10 uppercase tracking-widest">패배</div>
                  </div>
                </div>
                {/* Win Prob Bar */}
                <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden relative">
                   <div className="absolute inset-0 bg-gradient-to-r from-nzu-green/20 to-transparent" />
                   <div className="h-full bg-nzu-green shadow-[0_0_20px_#2ed573] transition-all duration-1000" 
                        style={{ width: `${(results.summary.wins / (results.summary.wins + results.summary.losses || 1)) * 100}%` }} />
                </div>
              </div>

              {/* 우측 선수 */}
              <div className="bg-white/[0.02] p-8 rounded-[2rem] border border-white/5 text-center space-y-4">
                <TierBadge tier={p2.tier} size="lg" />
                <h4 className="text-4xl font-black text-white/60">{p2.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-4 py-1.5 bg-zerg/10 text-zerg rounded-lg text-xs font-black border border-zerg/20">{p2.race}</span>
                  <span className="px-4 py-1.5 bg-white/5 text-white/40 rounded-lg text-xs font-black border border-white/10">{p2.university}</span>
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
                  아레나 엔트리에 추가
                </span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
