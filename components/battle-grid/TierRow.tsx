import { Player } from '@/lib/player-service';
import { PlayerBubble } from './PlayerBubble';
import { cn, normalizeTier, getTierLabel } from '@/lib/utils';

export function TierRow({ tier, teamAPlayers, teamBPlayers }: { tier: string, teamAPlayers: Player[], teamBPlayers: Player[] }) {
  
  const getTierColor = (tier: string) => {
    const norm = normalizeTier(tier);
    if (["갓", "킹"].includes(norm)) return "bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.3)] font-black";
    if (["잭", "퀸", "조커", "스페이드"].includes(norm)) return "bg-gradient-to-r from-purple-600 to-indigo-500 text-white font-bold";
    if (parseInt(norm) >= 1 && parseInt(norm) <= 3) return "bg-gradient-to-r from-red-600 to-red-400 text-white font-bold";
    if (parseInt(norm) >= 4 && parseInt(norm) <= 6) return "bg-gradient-to-r from-blue-600 to-blue-400 text-white font-bold";
    return "bg-slate-700 text-slate-200 font-medium";

  }

  const getTierDisplayLabel = (tier: string) => {
    return getTierLabel(tier);
  }


  return (
    <div className="flex items-center gap-2 min-h-[4rem] p-2 bg-card/50 border border-border/60 rounded-xl">
      {/* Team A Lane */}
      <div className="flex-1 flex flex-wrap justify-end gap-2">
        {teamAPlayers
          .sort((a,b) => (b.elo_point || 0) - (a.elo_point || 0))
          .map(p => <PlayerBubble key={p.id} player={p} />)}
      </div>
      
      {/* Tier Badge Spine */}
      <div className={cn(
        "flex-shrink-0 w-24 h-full flex items-center justify-center text-xs tracking-tighter rounded-lg",
        getTierColor(tier)
      )}>
        {getTierDisplayLabel(tier)}
      </div>



      {/* Team B Lane */}
      <div className="flex-1 flex flex-wrap justify-start gap-2">
      {teamBPlayers
          .sort((a,b) => (b.elo_point || 0) - (a.elo_point || 0))
          .map(p => <PlayerBubble key={p.id} player={p} />)}
      </div>
    </div>
  );
}
