'use client'

import { cn } from '@/lib/utils'
import { Swords } from 'lucide-react'
import type { Database } from '@/lib/database.types'

type EloMatch = Database['public']['Tables']['eloboard_matches']['Row']

interface RecentEloMatchesProps {
  matches: EloMatch[]
}

export default function RecentEloMatches({ matches = [] }: RecentEloMatchesProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 border border-white/5 bg-black/20 rounded-[3rem] space-y-6 animate-pulse">
        <div className="w-16 h-16 rounded-full border border-nzu-green/20 flex items-center justify-center">
           <Swords className="w-6 h-6 text-nzu-green/40" />
        </div>
        <div className="text-center">
           <h3 className="text-sm font-black text-white/20 uppercase tracking-[0.6em] mb-2">Broadcasting Feed Inactive</h3>
           <p className="text-[10px] text-white/10 font-bold uppercase tracking-widest">실시간 경기 데이터를 수신 대기 중입니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 rounded-xl bg-nzu-green/10 flex items-center justify-center border border-nzu-green/20">
              <Swords className="w-5 h-5 text-nzu-green" />
           </div>
           <div className="flex flex-col text-left">
              <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em] mb-0.5">Real-time Feed</span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">최근 경기 브리핑</h3>
           </div>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/5">
           <span className="w-2 h-2 rounded-full bg-nzu-green animate-pulse" />
           <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Live Updates</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {matches.map((m, idx) => {
          const isWin = m.is_win;
          return (
            <div 
              key={`${m.player_name}-${m.match_date}-${idx}`}
              className={cn(
                "group relative overflow-hidden bg-[#0A100D] border rounded-2xl p-6 transition-all duration-300",
                isWin 
                  ? "border-nzu-green/30 hover:border-nzu-green/60 hover:bg-[#0D1612] shadow-[0_0_20px_rgba(0,168,107,0.05)]" 
                  : "border-white/10 hover:border-white/20 hover:bg-[#111111]"
              )}
            >
              <div className="flex flex-col gap-4 text-left">
                <div className="flex items-center justify-between text-[11px] font-black tracking-widest uppercase">
                  <span className="text-white/30 font-bold">{m.match_date}</span>
                  <span className={cn(isWin ? "text-nzu-green/60" : "text-white/40")}>{m.map}</span>
                </div>
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col flex-1">
                    <span className={cn(
                      "text-base font-black tracking-tight transition-colors",
                      isWin ? "text-white" : "text-white/50"
                    )}>
                      {m.player_name}
                    </span>
                  </div>
                  
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg border font-black text-[10px] tracking-widest transition-all",
                    isWin 
                      ? "bg-nzu-green/10 border-nzu-green/30 text-nzu-green shadow-[0_0_10px_rgba(46,213,115,0.2)]" 
                      : "bg-white/5 border-white/10 text-white/30"
                  )}>
                    {isWin ? 'VICTORY' : 'DEFEAT'}
                  </div>
                  
                  <div className="flex flex-col flex-1 text-right">
                    <span className="text-base font-black tracking-tight text-white/30">
                      {m.opponent_name}
                    </span>
                  </div>
                </div>
                
                {m.note && (
                  <div className="mt-1 pt-3 border-t border-white/5">
                    <p className="text-[11px] text-white/20 font-bold italic truncate">
                      {m.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}
