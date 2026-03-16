'use client'

import { useState, useEffect, useMemo } from 'react'
import { playerService, Player } from '@/lib/player-service'
import { RaceTag, TierBadge } from '@/components/ui/nzu-badges'
import { getInstantH2H } from '@/lib/h2h-service'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Search, Trophy, Map as MapIcon, History, X, ChevronRight, User, MousePointer2, Plus, ArrowRightLeft, Swords } from 'lucide-react'
import { UNIVERSITY_MAP, getUniversityInfo } from '@/lib/university-config'
import { REAL_NAME_MAP } from '@/lib/constants'
import Image from 'next/image'

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
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true)

  // Load Players for Side 1
  useEffect(() => {
    const load = async () => {
      try {
        let res: Player[] = [];
        if (u1) {
          res = await playerService.getPlayersByUniversity(u1) as Player[];
          if (q1) {
            res = res.filter(p => p.name?.toLowerCase().includes(q1.toLowerCase()));
          }
        } else if (q1) {
          res = await playerService.searchPlayers(q1) as Player[];
        }
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
          if (q2) {
            res = res.filter(p => p.name?.toLowerCase().includes(q2.toLowerCase()));
          }
        } else if (q2) {
          res = await playerService.searchPlayers(q2) as Player[];
        }
        setPlayers2(res);
      } catch (err) { console.error(err) }
    }
    load()
  }, [u2, q2])

  // Grouping logic
  const tierWeights: Record<string, number> = {
    'GOD': 0, '갓': 1, 'KING': 10, '킹': 11, 'JACK': 20, '잭': 21, '잭티어': 22, 'JOKER': 30, '조커': 31, '스페이드': 40,
    '0': 50, '1': 51, '2': 52, '3': 53, '4': 54, '5': 55, '6': 56, '7': 57, '8': 58, 
    '베이비': 60, 'BABY': 61,
    'N/A': 98, '미정': 99
  };

  const groupPlayers = (players: Player[]) => {
    const groups: Record<string, Player[]> = {};
    players.forEach(p => {
      const tier = p.tier || '미정';
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => (tierWeights[a] ?? 50) - (tierWeights[b] ?? 50))
      .map(tier => {
        // Sort players within the tier by name (Ga-Na-Da)
        const tierPlayers = [...groups[tier]].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        const raceCount = {
          T: tierPlayers.filter(p => p.race?.startsWith('T')).length,
          Z: tierPlayers.filter(p => p.race?.startsWith('Z')).length,
          P: tierPlayers.filter(p => p.race?.startsWith('P')).length
        };
        return { tier, players: tierPlayers, raceCount };
      });
  };

  const sortedUniversities = useMemo(() => {
    return Object.keys(UNIVERSITY_MAP).sort((a, b) => {
      const isKorean = (s: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(s);
      const aKo = isKorean(a);
      const bKo = isKorean(b);
      if (aKo && !bKo) return -1;
      if (!aKo && bKo) return 1;
      return a.localeCompare(b, 'ko');
    });
  }, []);

  const groups1 = useMemo(() => groupPlayers(players1), [players1]);
  const groups2 = useMemo(() => groupPlayers(players2), [players2]);

  // Combined Tiers for Arena
  const arenaTiers = useMemo(() => {
    // Basic tier pool from config and any actual data
    const allUniqueTiers = Array.from(new Set([
      ...groups1.map(g => g.tier),
      ...groups2.map(g => g.tier),
      ...Object.keys(tierWeights)
    ]));

    const sortedTiers = allUniqueTiers.sort((a, b) => (tierWeights[a] ?? 50) - (tierWeights[b] ?? 50));

    return sortedTiers.filter(tier => {
      const hasP1 = groups1.some(g => g.tier === tier && g.players.length > 0);
      const hasP2 = groups2.some(g => g.tier === tier && g.players.length > 0);
      
      if (hideEmptyTiers) {
        // True "Match-only" mode: Show if BOTH have players
        return hasP1 && hasP2;
      }
      // "Existence" mode: Show if EITHER has players
      return hasP1 || hasP2;
    });
  }, [groups1, groups2, hideEmptyTiers]);

  const handleSearch = async () => {
    if (!p1 || !p2) return
    setLoading(true)
    
    // Get real names for Eloboard lookup if they exist in the map
    const name1 = REAL_NAME_MAP[p1.name] || p1.name
    const name2 = REAL_NAME_MAP[p2.name] || p2.name
    
    const h2h = await getInstantH2H(name1, name2)
    setResults(h2h)
    setLoading(false)
  }

  return (
    <div className="w-full space-y-12">
      {/* 1. Battlefield Arena (Mirror Grid) */}
      <div className="space-y-4">
          
          {/* Controls & University Selection */}
           <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white/[0.02] border border-white/5 rounded-3xl p-6">
            {/* Side 1 Select */}
            <div className="flex items-center gap-4 flex-1 w-full">
              <select 
                value={u1}
                onChange={(e) => setU1(e.target.value)}
                className="bg-black/90 border-2 border-nzu-green/30 rounded-2xl px-6 py-4 text-lg font-black text-white focus:outline-none focus:border-nzu-green w-full md:w-64 shadow-[0_0_30px_rgba(0,168,107,0.15)] transition-all cursor-pointer"
              >
                <option value="" className="bg-[#0a1410]">대학 선택 (좌측)</option>
                {sortedUniversities.map(u => (
                  <option key={u} value={u} className="bg-[#0a1410]">{u}</option>
                ))}
              </select>
              <div className="relative flex-1 hidden lg:block">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input 
                  type="text" 
                  placeholder="선수 이름으로 검색..."
                  value={q1}
                  onChange={(e) => setQ1(e.target.value)}
                  className="w-full bg-black/70 border-2 border-white/10 rounded-xl pl-12 pr-6 py-4 text-base font-black placeholder:text-white/20 focus:border-nzu-green/50 outline-none transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Global Arena Controls */}
            <div className="flex flex-col items-center gap-4 px-10 border-x-2 border-white/5">
              <div className="flex items-center gap-3 mb-1">
                <Swords className="w-8 h-8 text-nzu-green animate-pulse" />
                <span className="text-sm font-black text-white/80 uppercase tracking-[0.5em]">Battle Arena</span>
              </div>
            <button 
                onClick={() => setHideEmptyTiers(!hideEmptyTiers)}
                className={cn(
                  "px-8 py-3 rounded-full text-xs font-black border-2 transition-all uppercase tracking-widest whitespace-nowrap shadow-xl",
                  hideEmptyTiers 
                    ? "bg-nzu-green border-nzu-green text-black hover:bg-nzu-green/90 shadow-[0_0_30px_rgba(46,213,115,0.3)]" 
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                )}
              >
                {hideEmptyTiers ? "매칭 있는 티어만 보기" : "전체 로스터 보기"}
              </button>
            </div>

            {/* Side 2 Select */}
            <div className="flex items-center gap-4 flex-1 w-full justify-end">
              <div className="relative flex-1 hidden lg:block">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input 
                  type="text" 
                  placeholder="선수 이름으로 검색..."
                  value={q2}
                  onChange={(e) => setQ2(e.target.value)}
                  className="w-full bg-black/70 border-2 border-white/10 rounded-xl pl-12 pr-6 py-4 text-base font-black placeholder:text-white/20 focus:border-nzu-green/50 outline-none transition-all text-right shadow-inner"
                />
              </div>
              <select 
                value={u2}
                onChange={(e) => setU2(e.target.value)}
                className="bg-black/90 border-2 border-nzu-green/30 rounded-2xl px-6 py-4 text-lg font-black text-white focus:outline-none focus:border-nzu-green w-full md:w-64 shadow-[0_0_30px_rgba(0,168,107,0.15)] transition-all cursor-pointer text-right"
              >
                <option value="" className="bg-[#0a1410]">대학 선택 (우측)</option>
                {sortedUniversities.map(u => (
                  <option key={u} value={u} className="bg-[#0a1410]">{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Arena Display */}
          <div className="min-h-[600px] bg-white/[0.01] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent pointer-events-none" />
            
            {/* Table Header like Mirror Arena */}
            <div className="grid grid-cols-[1fr_80px_1fr] md:grid-cols-[1fr_160px_1fr] bg-white/[0.04] border-b border-white/10 px-10 py-8">
               <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-nzu-green shadow-[0_0_15px_#2ed573]" />
                  <span className="text-xl font-black text-white tracking-[0.4em] uppercase">{u1 || "LEFT SIDE"}</span>
               </div>
               <div className="text-center">
                  <span className="text-sm font-black text-white/20 uppercase tracking-[0.5em]">VS</span>
               </div>
               <div className="flex items-center gap-4 justify-end">
                  <span className="text-xl font-black text-white tracking-[0.4em] uppercase text-right">{u2 || "RIGHT SIDE"}</span>
                  <div className="w-3 h-3 rounded-full bg-nzu-green shadow-[0_0_15px_#2ed573]" />
               </div>
            </div>

            {/* Tier Rows */}
            <div className="h-[700px] overflow-y-auto custom-scrollbar p-1 md:p-4 space-y-1">
              {(!u1 && !q1 && !u2 && !q2) ? (
                <div className="h-full flex flex-col items-center justify-center text-white/5 gap-4">
                  <MousePointer2 className="w-12 h-12 opacity-10" />
                  <p className="text-sm font-black uppercase tracking-[0.4em]">양 팀의 대학을 선택하여 아레나를 활성화하십시오</p>
                </div>
              ) : arenaTiers.map(tier => {
                const g1 = groups1.find(g => g.tier === tier);
                const g2 = groups2.find(g => g.tier === tier);
                
                return (
                  <div key={tier} className="grid grid-cols-[1fr_80px_1fr] md:grid-cols-[1fr_160px_1fr] items-stretch min-h-[80px] border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors group">
                    {/* Left Players */}
                    <div className="flex flex-wrap items-center justify-end gap-3 p-4 pr-16 md:pr-20">
                       {g1?.players.map(p => (
                         <button 
                           key={p.id} 
                           onClick={() => { setP1(p); setResults(null); }}
                           className={cn(
                             "flex items-center gap-4 pl-5 pr-4 py-3 rounded-2xl border-2 transition-all min-w-[140px] justify-between shadow-md",
                             p1?.id === p.id 
                               ? "bg-nzu-green border-nzu-green text-black scale-110 z-20" 
                               : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.1] hover:text-white hover:border-white/30"
                           )}
                         >
                            <span className="text-lg font-black tracking-tight">{p.name}</span>
                            <span className={cn(
                               "text-[11px] font-black w-6 h-6 rounded-lg flex items-center justify-center bg-black/30",
                               p.race?.startsWith('T') ? "text-terran" : p.race?.startsWith('Z') ? "text-zerg" : "text-protoss"
                            )}>
                               {p.race?.charAt(0)}
                            </span>
                         </button>
                       ))}
                    </div>

                    {/* Central Tier Badge */}
                    <div className="flex flex-col items-center justify-center px-2 py-6 bg-black/60 z-10 relative">
                        <div className={cn(
                          "px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-[0.2em] border-2 text-center min-w-[100px] shadow-2xl transition-transform group-hover:scale-105",
                          tier === '조커' || tier === 'JOKER' ? "bg-purple-600/30 border-purple-500/50 text-purple-200" :
                          tier === '잭' || tier === 'JACK' || tier === '잭티어' ? "bg-blue-600/30 border-blue-500/50 text-blue-200" :
                          tier.includes('갓') || tier === 'GOD' || tier === '스페이드' || tier === '킹' || tier === 'KING' ? "bg-amber-400/30 border-amber-400/60 text-amber-100" :
                          tier === '0' || tier === '1' ? "bg-cyan-400/30 border-cyan-400/60 text-cyan-100" :
                          tier === '2' ? "bg-rose-400/30 border-rose-400/60 text-rose-100" :
                          tier === '베이비' || tier === 'BABY' ? "bg-green-600/20 border-green-500/30 text-green-200" :
                          "bg-white/10 border-white/20 text-white"
                        )}>
                          {tier}
                        </div>
                    </div>

                    {/* Right Players */}
                    <div className="flex flex-wrap items-center justify-start gap-3 p-4 pl-16 md:pl-20">
                       {g2?.players.map(p => (
                         <button 
                           key={p.id} 
                           onClick={() => { setP2(p); setResults(null); }}
                           className={cn(
                             "flex items-center gap-4 pl-5 pr-4 py-3 rounded-2xl border-2 transition-all min-w-[140px] justify-between shadow-md",
                             p2?.id === p.id 
                               ? "bg-nzu-green border-nzu-green text-black scale-110 z-20" 
                               : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.1] hover:text-white hover:border-white/30"
                           )}
                         >
                            <span className="text-lg font-black tracking-tight">{p.name}</span>
                            <span className={cn(
                               "text-[11px] font-black w-6 h-6 rounded-lg flex items-center justify-center bg-black/30",
                               p.race?.startsWith('T') ? "text-terran" : p.race?.startsWith('Z') ? "text-zerg" : "text-protoss"
                            )}>
                               {p.race?.charAt(0)}
                            </span>
                         </button>
                       ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Matchup Display (Compact Center) */}
        <div className="xl:col-span-12 mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 px-2">
            {/* Player 1 Slot */}
            <div className={cn(
              "p-6 rounded-[2.5rem] border flex items-center gap-8 transition-all duration-500",
              p1 ? "bg-nzu-green/10 border-nzu-green/30 shadow-[0_0_40px_rgba(46,213,115,0.1)]" : "bg-white/[0.02] border-white/5 opacity-30"
            )}>
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/5 relative border border-white/10 shadow-inner">
                {p1 && <Image src={p1.photo_url || "/placeholder-player.png"} alt={p1.name} fill className="object-cover scale-110" />}
              </div>
              <div className="flex-1">
                <p className="text-3xl font-black text-white leading-none mb-3 tracking-tighter">{p1 ? p1.name : 'PLAYER 01'}</p>
                <div className="flex items-center gap-3">
                   <TierBadge tier={p1?.tier || 'N/A'} />
                   <span className="text-sm font-black text-white/40 tracking-[0.2em]">{p1?.elo_point || 0} ELO</span>
                </div>
              </div>
            </div>

            {/* Launch Action */}
             <div className="flex items-center">
               <Button 
                onClick={handleSearch}
                disabled={!p1 || !p2 || loading}
                className={cn(
                  "w-full rounded-[2.5rem] py-10 text-lg font-black uppercase tracking-[0.4em] transition-all duration-500",
                  p1 && p2 ? "bg-nzu-green text-black hover:bg-nzu-green/90 shadow-[0_0_50px_rgba(46,213,115,0.4)]" : "bg-white/5 text-white/5 border border-white/5"
                )}
              >
                {loading ? "ANALYZING..." : "VS 성적 조회"}
              </Button>
            </div>

            {/* Player 2 Slot */}
            <div className={cn(
              "p-6 rounded-[2.5rem] border flex items-center gap-8 transition-all duration-500",
              p2 ? "bg-nzu-green/10 border-nzu-green/30 shadow-[0_0_40px_rgba(46,213,115,0.1)]" : "bg-white/[0.02] border-white/5 opacity-30"
            )}>
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/5 relative border border-white/10 shadow-inner order-last">
                {p2 && <Image src={p2.photo_url || "/placeholder-player.png"} alt={p2.name} fill className="object-cover scale-110" />}
              </div>
              <div className="flex-1 text-right">
                <p className="text-3xl font-black text-white leading-none mb-3 tracking-tighter">{p2 ? p2.name : 'PLAYER 02'}</p>
                <div className="flex items-center justify-end gap-3">
                   <span className="text-sm font-black text-white/40 tracking-[0.2em]">{p2?.elo_point || 0} ELO</span>
                   <TierBadge tier={p2?.tier || 'N/A'} />
                </div>
              </div>
            </div>
        </div>

      {/* 3. Result Section (Premium Dashboard) */}
      <div className={cn(
        "bg-[#030504] border border-white/10 rounded-[2.5rem] transition-all duration-700 overflow-hidden shadow-2xl",
        results ? "min-h-[500px] mt-12" : "h-0 border-0 opacity-0"
      )}>
        {results && (
          <div className="p-8 md:p-12 space-y-16 fade-in">
             <div className="flex flex-col lg:flex-row items-stretch justify-between gap-12">
                {/* Win Probabilities */}
                <div className="flex-1 bg-white/[0.03] p-10 rounded-[2rem] border border-white/10 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Swords className="w-20 h-20" />
                   </div>
                   
                   <div className="flex items-center gap-16 mb-10">
                     <div className="text-center min-w-[160px]">
                        <span className="text-[12px] font-black text-white/40 uppercase block mb-2 tracking-[0.2em]">Predicted Victory</span>
                        <span className="text-7xl font-black text-nzu-green drop-shadow-[0_0_30px_rgba(46,213,115,0.5)]">{Math.round(results.summary.winRate)}%</span>
                     </div>
                     <div className="h-32 w-px bg-white/10" />
                     <div className="flex-1 space-y-6">
                         <div className="flex justify-between items-end text-base font-black uppercase tracking-[0.15em]">
                            <span className="text-white/40">WIN PROBABILITY RATIO</span>
                            <div className="flex items-baseline gap-2">
                               <span className="text-3xl text-nzu-green">{Math.round(results.summary.winRate)}</span>
                               <span className="text-xl text-white/10">:</span>
                               <span className="text-3xl text-white/30">{100 - Math.round(results.summary.winRate)}</span>
                            </div>
                         </div>
                         <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                            <div className="h-full bg-nzu-green rounded-full shadow-[0_0_20px_rgba(46,213,115,0.6)] transition-all duration-1000 ease-out" style={{ width: `${results.summary.winRate}%` }} />
                         </div>
                     </div>
                   </div>

                   {results.summary.momentum && (
                     <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                           <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">30일 기세 (MOMENTUM)</span>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className="text-[10px] font-bold text-white/60 italic">전적: {results.summary.momentum.wins}승 {results.summary.momentum.losses}패</span>
                           <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] font-black text-blue-400">
                             {results.summary.momentum.winRate}%
                           </div>
                        </div>
                     </div>
                   )}
                </div>

                {/* Map Summary Header */}
                <div className="w-full lg:w-96 space-y-6">
                   <div className="flex items-center gap-3">
                      <MapIcon className="w-5 h-5 text-nzu-green" />
                      <span className="text-sm font-black text-white/50 uppercase tracking-widest">맵별 분석 데이터</span>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      {Object.keys(results.mapStats).slice(0, 4).map(map => {
                        const winRate = Math.round((results.mapStats[map].w / (results.mapStats[map].w + results.mapStats[map].l)) * 100);
                        return (
                          <div key={map} className="p-4 bg-white/[0.04] rounded-xl border border-white/5 hover:border-nzu-green/20 transition-colors">
                             <p className="text-xs font-black text-white/80 truncate mb-2">{map}</p>
                             <div className="flex items-end justify-between">
                                <span className="text-base font-black text-nzu-green">{winRate}%</span>
                                <span className="text-[10px] text-white/20 font-bold">{results.mapStats[map].w + results.mapStats[map].l}전</span>
                             </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
             </div>

             {/* Deeper History Grid */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-white/20" />
                        <h4 className="text-sm font-black text-white/60 uppercase tracking-widest">최근 대전 기록</h4>
                      </div>
                   </div>
                   <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                      {results.recentMatches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all group">
                           <div className="flex flex-col gap-1">
                              <span className="text-sm font-bold text-white/80 group-hover:text-nzu-green truncate">{m.map}</span>
                              <span className="text-xs font-medium text-white/20">{m.match_date}</span>
                           </div>
                           <div className={cn(
                             "text-[10px] font-black uppercase px-4 py-2 rounded-lg tracking-wider",
                             m.is_win ? "text-nzu-green bg-nzu-green/10 border border-nzu-green/20" : "text-white/20 bg-white/5 border border-white/5"
                           )}>
                              {m.is_win ? 'VICTORY' : 'DEFEAT'}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="bg-white/5 rounded-[3rem] p-16 flex flex-col items-center justify-center text-center space-y-10 border border-white/10 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-nzu-green/[0.08] via-transparent to-transparent pointer-events-none" />
                    <Trophy className="w-20 h-20 text-nzu-green/20" />
                    <div className="space-y-3">
                       <p className="text-xl font-black text-white uppercase tracking-[0.3em]">H2H AGGREGATE</p>
                       <p className="text-xs font-bold text-white/20 uppercase tracking-[0.4em]">NZU ANALYSIS ENGINE V2</p>
                    </div>
                    <div className="flex items-center justify-center gap-16 w-full">
                       <div className="flex flex-col gap-2">
                          <span className="text-6xl font-black text-white">{results.summary.wins}</span>
                          <span className="text-[12px] font-black text-white/30 uppercase tracking-[0.2em]">WINS</span>
                       </div>
                       <div className="w-px h-24 bg-white/10" />
                       <div className="flex flex-col gap-2">
                          <span className="text-6xl font-black text-white/20">{results.summary.losses}</span>
                          <span className="text-[12px] font-black text-white/30 uppercase tracking-[0.2em]">LOSSES</span>
                       </div>
                    </div>
                 </div>
             </div>
          </div>
        )}
      </div>

    </div>
  )
}
