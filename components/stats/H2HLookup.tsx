'use client'

import { useState, useEffect, useMemo } from 'react'
import { playerService, Player } from '@/lib/player-service'
import { TierBadge } from '@/components/ui/nzu-badges'
import { getInstantH2H } from '@/lib/h2h-service'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Search, Trophy, Map as MapIcon, X, Swords, Plus, RotateCcw, GripVertical, ShieldCheck } from 'lucide-react'
import { UNIVERSITY_MAP } from '@/lib/university-config'
import { REAL_NAME_MAP } from '@/lib/constants'
import Image from 'next/image'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

interface Match {
  id: string;
  p1: Player;
  p2: Player;
  h2h?: any;
}

interface H2HLookupProps {
  players?: Player[]
  recentMatches?: any[]
}

export default function H2HLookup({ players = [], recentMatches = [] }: H2HLookupProps) {
  // Selection State
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Side Selection States
  const [u1, setU1] = useState<string>('')
  const [u2, setU2] = useState<string>('')
  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  
  const [players1, setPlayers1] = useState<Player[]>([])
  const [players2, setPlayers2] = useState<Player[]>([])
  
  // Filter logic: Default to ON (true)
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true)
  
  // Match List State
  const [matches, setMatches] = useState<Match[]>([])

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

  // All Tiers with Unique Desaturated Colors
  const TIER_CONFIG: Record<string, { weight: number, color: string }> = {
    'GOD': { weight: 0, color: '#eab308' },
    '갓': { weight: 1, color: '#eab308' },
    'KING': { weight: 2, color: '#06b6d4' },
    '킹': { weight: 3, color: '#06b6d4' },
    'JACK': { weight: 4, color: '#3b82f6' },
    '잭': { weight: 5, color: '#3b82f6' },
    'JOKER': { weight: 6, color: '#8b5cf6' },
    '조커': { weight: 7, color: '#8b5cf6' },
    'SPADE': { weight: 8, color: '#a855f7' },
    '스페이드': { weight: 9, color: '#a855f7' },
    '0': { weight: 10, color: '#14b8a6' },
    '1': { weight: 11, color: '#10b981' },
    '2': { weight: 12, color: '#f43f5e' },
    '3': { weight: 13, color: '#ec4899' },
    '4': { weight: 14, color: '#f97316' },
    '5': { weight: 15, color: '#d97706' },
    '6': { weight: 16, color: '#6366f1' },
    '7': { weight: 17, color: '#64748b' },
    '8': { weight: 18, color: '#71717a' },
    'BABY': { weight: 19, color: '#94a3b8' },
    '베이비': { weight: 20, color: '#94a3b8' },
    '미정': { weight: 99, color: '#475569' }
  };

  // List of tiers to exclude when filter is ON
  const EXCLUDED_TIERS = ['JACK', '잭', 'JOKER', '조커', 'SPADE', '스페이드'];

  const groupPlayers = (players: Player[]) => {
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
  };

  const sortedUniversities = useMemo(() => {
    return Object.keys(UNIVERSITY_MAP).sort((a, b) => {
      const isKorean = (s: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(s);
      return (isKorean(a) && !isKorean(b)) ? -1 : (!isKorean(a) && isKorean(b)) ? 1 : a.localeCompare(b, 'ko');
    });
  }, []);

  const groups1 = useMemo(() => groupPlayers(players1), [players1]);
  const groups2 = useMemo(() => groupPlayers(players2), [players2]);

  const arenaTiers = useMemo(() => {
    const allUniqueTiers = Array.from(new Set([...groups1.map(g => g.tier), ...groups2.map(g => g.tier)]));
    const sortedTiers = allUniqueTiers.sort((a, b) => (TIER_CONFIG[a]?.weight ?? 50) - (TIER_CONFIG[b]?.weight ?? 50));
    
    return sortedTiers.filter(tier => {
      const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
      const hasPlayers = (g1?.players.length || 0) + (g2?.players.length || 0) > 0;
      
      if (!hasPlayers) return false;

      // 필터(hideEmptyTiers)가 ON인 경우:
      if (hideEmptyTiers) {
        // 1. 잭, 조커, 스페이드 티어는 무조건 제외
        const isExcludedTier = EXCLUDED_TIERS.includes(tier);
        if (isExcludedTier) return false;

        // 2. 양쪽 팀이 모두 선택된 경우, 양쪽 모두 선수가 있는 티어만 표시
        if (u1 && u2) {
          const bothSidesHavePlayers = (g1?.players.length || 0) > 0 && (g2?.players.length || 0) > 0;
          return bothSidesHavePlayers;
        }
      }

      // 필터가 OFF이거나 한쪽 팀만 선택된 경우, 선수가 있기만 하면 표시
      return true;
    });
  }, [groups1, groups2, hideEmptyTiers]);

  const addMatch = async (player1: Player, player2: Player) => {
    if (matches.some(m => m.p1.id === player1.id && m.p2.id === player2.id)) return;
    const newMatch: Match = { id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, p1: player1, p2: player2 };
    setMatches(prev => [...prev, newMatch]);
    getInstantH2H(REAL_NAME_MAP[player1.name] || player1.name, REAL_NAME_MAP[player2.name] || player2.name).then(data => setMatches(prev => prev.map(m => m.id === newMatch.id ? { ...m, h2h: data } : m)));
  };

  const autoMatch = () => {
    if (!u1 || !u2) { alert('양 팀의 대학을 먼저 선택해주세요.'); return; }
    const newMatches: Match[] = [];
    
    // Auto matching only happens for tiers visible in arenaTiers
    arenaTiers.forEach(tier => {
      const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
      if (g1 && g2) {
        g1.players.forEach(pA => g2.players.forEach(pB => {
          if (!matches.some(m => m.p1.id === pA.id && m.p2.id === pB.id)) {
            newMatches.push({ id: `m_${Date.now()}_${pA.id}_${pB.id}`, p1: pA, p2: pB });
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

  const handleSearch = async () => {
    if (!p1 || !p2) return;
    setLoading(true);
    const h2h = await getInstantH2H(REAL_NAME_MAP[p1.name] || p1.name, REAL_NAME_MAP[p2.name] || p2.name);
    setResults(h2h);
    setLoading(false);
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
  }, [matches, TIER_CONFIG]);

  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">
        
        {/* 아레나 섹션 */}
        <div className="space-y-4">
           <div className="bg-white/[0.03] border border-white/10 rounded-[1.5rem] p-4 backdrop-blur-md shadow-xl">
              <div className="flex flex-col md:flex-row items-center gap-4">
                 <div className="flex-1 w-full flex items-center gap-2">
                    <select value={u1} onChange={(e) => setU1(e.target.value)}
                      className="bg-black/95 border-2 border-nzu-green/30 rounded-xl px-4 py-2 text-sm font-black text-white focus:border-nzu-green transition-all flex-1">
                      <option value="">좌측 대학 선택</option>
                      {sortedUniversities.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <div className="relative flex-1 hidden xl:block">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input type="text" placeholder="선수 검색..." value={q1} onChange={(e) => setQ1(e.target.value)}
                        className="w-full bg-black/50 border-2 border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm font-black focus:border-nzu-green/50 outline-none transition-all" />
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => setHideEmptyTiers(!hideEmptyTiers)} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all", hideEmptyTiers ? "bg-nzu-green text-black" : "bg-white/5 border border-white/10 text-white/40")}>
                      필터 {hideEmptyTiers ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={autoMatch} className="px-5 py-2 bg-nzu-green text-black rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all"><Plus className="w-4 h-4" />자동매칭</button>
                    <button onClick={() => setMatches([])} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-red-500 transition-all"><RotateCcw className="w-4 h-4" /></button>
                 </div>
                 <div className="flex-1 w-full flex items-center gap-2">
                    <div className="relative flex-1 hidden xl:block">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input type="text" placeholder="선수 검색..." value={q2} onChange={(e) => setQ2(e.target.value)}
                        className="w-full bg-black/50 border-2 border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm font-black text-right focus:border-nzu-green/50 outline-none transition-all" />
                    </div>
                    <select value={u2} onChange={(e) => setU2(e.target.value)}
                      className="bg-black/95 border-2 border-nzu-green/30 rounded-xl px-4 py-2 text-sm font-black text-white focus:border-nzu-green transition-all flex-1 text-right">
                      <option value="">우측 대학 선택</option>
                      {sortedUniversities.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                 </div>
              </div>
           </div>

           <div className="bg-white/[0.01] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="grid grid-cols-[1fr_100px_1fr] bg-white/[0.04] border-b border-white/10 px-6 py-3 items-center">
                 <span className="text-[11px] font-black text-white/40 uppercase truncate">{u1 || "첫 번째 팀"}</span>
                 <div className="text-center text-[9px] font-black text-white/10 uppercase tracking-widest">배틀 아레나</div>
                 <span className="text-[11px] font-black text-white/40 uppercase truncate text-right">{u2 || "두 번째 팀"}</span>
              </div>
              <div className="h-[650px] overflow-y-auto custom-scrollbar p-1">
                 {(arenaTiers.length === 0 && (u1 || u2)) ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/5 gap-6">
                      <Swords className="w-16 h-16 opacity-10" />
                      <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/20">표시할 수 있는 매칭 가능한 티어가 없습니다</p>
                    </div>
                 ) : arenaTiers.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-white/5 gap-6">
                      <Swords className="w-16 h-16 opacity-10 animate-pulse" />
                      <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/20">대학을 선택하면 소속 선수가 나타납니다</p>
                    </div>
                 ) : arenaTiers.map(tier => {
                    const g1 = groups1.find(g => g.tier === tier), g2 = groups2.find(g => g.tier === tier);
                    const tCol = TIER_CONFIG[tier]?.color || '#475569';
                    return (
                      <div key={tier} className="grid grid-cols-[1fr_100px_1fr] border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors min-h-[70px]">
                         <div className="flex flex-wrap items-center justify-end gap-2 p-3 pr-4">
                            {g1?.players.map(p => (
                              <button key={p.id} onClick={() => p2 ? (addMatch(p, p2), setP2(null), setP1(null)) : setP1(p)}
                                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all text-[13px] font-black shadow-lg", p1?.id === p.id ? "bg-nzu-green border-nzu-green text-black" : "bg-white/[0.03] border-white/5 text-white/70 hover:border-white/30")}>
                                <span>{p.name}</span>
                                <span className={cn("text-[9px] w-4 h-4 flex items-center justify-center rounded font-black", p.race?.startsWith('T') ? "text-terran" : p.race?.startsWith('Z') ? "text-zerg" : "text-protoss")}>{p.race?.charAt(0)}</span>
                              </button>
                            ))}
                         </div>
                         <div className="flex items-center justify-center bg-black/40 border-x border-white/[0.02]">
                            <div className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-white/80 border border-white/10 shadow-lg" style={{ backgroundColor: `${tCol}22`, borderColor: `${tCol}44`, color: tCol }}>{tier}</div>
                         </div>
                         <div className="flex flex-wrap items-center justify-start gap-2 p-3 pl-4">
                            {g2?.players.map(p => (
                              <button key={p.id} onClick={() => p1 ? (addMatch(p1, p), setP1(null), setP2(null)) : setP2(p)}
                                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all text-[13px] font-black shadow-lg", p2?.id === p.id ? "bg-nzu-green border-nzu-green text-black" : "bg-white/[0.03] border-white/5 text-white/70 hover:border-white/30")}>
                                <span>{p.name}</span>
                                <span className={cn("text-[9px] w-4 h-4 flex items-center justify-center rounded font-black", p.race?.startsWith('T') ? "text-terran" : p.race?.startsWith('Z') ? "text-zerg" : "text-protoss")}>{p.race?.charAt(0)}</span>
                              </button>
                            ))}
                         </div>
                      </div>
                    )
                 })}
              </div>
           </div>
        </div>

        {/* 대진표 섹션 */}
        <div className="lg:sticky lg:top-4 bg-[#0a0c0b] border border-white/10 rounded-[2rem] flex flex-col h-[820px] shadow-2xl overflow-hidden backdrop-blur-xl">
           <div className="p-5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Trophy className="w-5 h-5 text-nzu-green" />
                 <h2 className="text-sm font-black text-white italic tracking-widest uppercase">배틀 엔트리</h2>
              </div>
              <div className="px-3 py-1 bg-nzu-green/10 border border-nzu-green/20 rounded-full">
                 <span className="text-[11px] font-black text-nzu-green tabular-nums">{matches.length} 매치</span>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pr-2">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="entry-list">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {groupedMatches.map((group) => {
                         const isGrouped = group.matches.length > 1;
                         const tInfo = TIER_CONFIG[group.matches[0].p1.tier] || { color: '#6366f1' };
                         return (
                           <div key={group.p1Id} 
                             className={cn("rounded-xl border transition-all overflow-hidden", isGrouped ? "bg-nzu-green/[0.05] border-nzu-green/40 shadow-xl ring-2 ring-nzu-green/10" : "bg-white/[0.03] border-white/5")} 
                             style={{ borderLeft: `6px solid ${isGrouped ? '#2ed573' : tInfo.color}` }}>
                              {group.matches.map((match, idx) => {
                                 const globalIdx = matches.findIndex(m => m.id === match.id);
                                   return (
                                     <Draggable key={match.id} draggableId={match.id} index={globalIdx}>
                                       {(dProv, snapshot) => (
                                         <div ref={dProv.innerRef} {...dProv.draggableProps} {...dProv.dragHandleProps}
                                           className={cn(
                                             "grid grid-cols-[32px_1fr_95px_1fr_24px] items-center p-3 hover:bg-white/[0.04] group cursor-grab active:cursor-grabbing relative", 
                                             idx !== 0 && "border-t border-white/[0.03]",
                                             snapshot.isDragging && "bg-white/[0.1] shadow-2xl z-50 rounded-lg ring-1 ring-nzu-green/30"
                                           )}>
                                            {/* Tier Indicator replaced Drag Handle */}
                                            <div className="flex justify-center">
                                               <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white/40 border border-white/10 bg-white/5" style={{ color: tInfo.color, borderColor: `${tInfo.color}33` }}>
                                                  {match.p1.tier.includes('GOD') || match.p1.tier.includes('갓') ? 'G' : 
                                                   match.p1.tier.includes('KING') || match.p1.tier.includes('킹') ? 'K' : 
                                                   match.p1.tier.includes('JACK') || match.p1.tier.includes('잭') ? 'J' : 
                                                   match.p1.tier}
                                               </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 px-1 truncate">
                                               <span className={cn("text-[10px] w-4 h-4 flex items-center justify-center rounded-sm font-black shadow-inner", idx !== 0 ? "opacity-20" : "", match.p1.race?.startsWith('T') ? "bg-terran/20 text-terran" : match.p1.race?.startsWith('Z') ? "bg-zerg/20 text-zerg" : "bg-protoss/20 text-protoss")}>{match.p1.race?.charAt(0)}</span>
                                               <span className={cn("text-[14px] font-black truncate block", idx === 0 ? "text-white" : "text-white/20")}>{match.p1.name}</span>
                                            </div>

                                            <div className="flex justify-center items-center gap-1.5">
                                               {match.h2h ? (
                                                  <div className="flex gap-1 scale-90">
                                                     <div className="flex flex-col items-center">
                                                       <span className="text-[6px] font-black text-white/30 uppercase">전체</span>
                                                       <div className="px-1.5 py-0.5 bg-black/80 rounded-[4px] text-[11px] font-black text-white/80 border border-white/5">{match.h2h.summary.wins}:{match.h2h.summary.losses}</div>
                                                     </div>
                                                     <div className="flex flex-col items-center">
                                                       <span className="text-[6px] font-black text-nzu-green/50 uppercase">90일</span>
                                                       <div className="px-1.5 py-0.5 bg-nzu-green/10 rounded-[4px] text-[11px] font-black text-nzu-green border border-nzu-green/20">{match.h2h.summary.momentum90?.wins ?? 0}:{match.h2h.summary.momentum90?.losses ?? 0}</div>
                                                     </div>
                                                  </div>
                                               ) : <div className="h-4 w-12 bg-white/5 animate-pulse rounded-full" />}
                                            </div>

                                            <div className="flex items-center justify-end gap-2 px-1 truncate">
                                               <span className="text-[14px] font-black text-white/90 group-hover:text-nzu-green truncate">{match.p2.name}</span>
                                               <span className={cn("text-[9px] w-4 h-4 rounded-sm flex items-center justify-center font-black shadow-inner", match.p2.race?.startsWith('T') ? "bg-terran/20 text-terran" : match.p2.race?.startsWith('Z') ? "bg-zerg/20 text-zerg" : "bg-protoss/20 text-protoss")}>{match.p2.race?.charAt(0)}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); removeMatch(match.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-white/20 hover:text-red-500 transition-all flex justify-center z-10"><X className="w-4 h-4" /></button>
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

      {/* 분석 대시보드 */}
      <div className={cn("bg-[#030504] border border-white/10 rounded-[2.5rem] transition-all duration-700 overflow-hidden shadow-2xl", results ? "min-h-[400px] mt-6 py-12 px-10 md:px-16" : "h-0 border-0 opacity-0")}>
        {results && (
          <div className="space-y-12">
             <div className="flex flex-col lg:flex-row items-stretch justify-between gap-12">
                <div className="flex-1 bg-white/[0.03] p-10 rounded-[3rem] border border-white/10 relative overflow-hidden group shadow-2xl">
                   <div className="flex flex-col md:flex-row items-center gap-12">
                      <div className="text-center min-w-[200px]">
                         <span className="text-xs font-black text-white/30 uppercase block mb-4 tracking-[0.3em]">승리 확률 분석</span>
                         <span className="text-8xl font-black text-nzu-green drop-shadow-[0_0_30px_rgba(46,213,115,0.4)]">{Math.round(results.summary.winRate)}%</span>
                      </div>
                      <div className="h-32 w-px bg-white/10 hidden md:block" />
                      <div className="flex-1 w-full space-y-6">
                          <div className="flex justify-between items-end"><span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">전체 승률 비율</span><div className="flex items-baseline gap-2"><span className="text-3xl text-nzu-green font-black">{Math.round(results.summary.winRate)}</span><span className="text-xl text-white/10 font-black">:</span><span className="text-3xl text-white/20 font-black">{100 - Math.round(results.summary.winRate)}</span></div></div>
                          <div className="h-4 bg-black/60 rounded-full p-1 border border-white/5 relative overflow-hidden"><div className="h-full bg-nzu-green rounded-full shadow-[0_0_20px_rgba(46,213,115,0.5)] transition-all duration-1000 ease-out" style={{ width: `${results.summary.winRate}%` }} /></div>
                      </div>
                   </div>
                </div>
                <div className="lg:w-[400px] flex flex-col">
                   <div className="flex-1 bg-white/[0.03] p-10 rounded-[3rem] border border-white/10 border-l-nzu-green border-l-[10px] shadow-2xl">
                      <div className="flex items-center gap-4 mb-6"><ShieldCheck className="w-6 h-6 text-nzu-green" /><span className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">AI 대진 분석</span></div>
                      <p className="text-xl font-black text-white/95 italic">
                        &quot;{results.summary.winRate > 65 ? '데이터 우위로 인한 승리 가능성이 매우 높습니다.' : '치열한 접전 속에서 전술적 변수가 승부를 가를 것으로 보입니다.'}&quot;
                      </p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  )
}
