'use client'

import { cn } from '@/lib/utils'
import { History, Swords, Trophy } from 'lucide-react'
import type { Database } from '@/lib/database.types'

type EloMatch = Database['public']['Tables']['eloboard_matches']['Row']

interface RecentEloMatchesProps {
  matches: EloMatch[]
}

export default function RecentEloMatches({ matches = [] }: RecentEloMatchesProps) {
  if (matches.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-2">
        <History className="w-5 h-5 text-nzu-green" />
        <h3 className="text-sm font-black text-white/60 uppercase tracking-[0.3em]">Latest University Activity</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {matches.map((m, idx) => (
          <div 
            key={`${m.player_name}-${m.match_date}-${idx}`}
            className="group relative overflow-hidden bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.05] hover:border-nzu-green/20 transition-all duration-300"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-[10px] font-bold text-white/20 uppercase tracking-widest">
                <span>{m.match_date}</span>
                <span className="text-nzu-green/40">{m.map}</span>
              </div>
              
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col flex-1">
                  <span className={cn(
                    "text-sm font-black truncate",
                    m.is_win ? "text-nzu-green" : "text-white/60"
                  )}>
                    {m.player_name}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/5">
                  <span className={cn(
                    "text-[10px] font-black",
                    m.is_win ? "text-nzu-green" : "text-white/20"
                  )}>
                    {m.is_win ? 'WIN' : 'LOSS'}
                  </span>
                </div>
                
                <div className="flex flex-col flex-1 text-right">
                  <span className="text-sm font-bold text-white/40 truncate">
                    {m.opponent_name}
                  </span>
                </div>
              </div>
              
              {m.note && (
                <div className="mt-1 pt-2 border-t border-white/5">
                  <p className="text-[10px] text-white/10 font-medium truncate italic">
                    {m.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
