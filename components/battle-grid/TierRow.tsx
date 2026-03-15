
import { Player } from '@/lib/player-service';
import { PlayerBubble } from './PlayerBubble';
import { cn } from '@/lib/utils'; // Assuming you have a cn utility for classnames

export function TierRow({ tier, teamAPlayers, teamBPlayers }: { tier: string, teamAPlayers: Player[], teamBPlayers: Player[] }) {
  
  const getTierColor = (tier: string) => {
    if (["GOD", "KING", "JACK", "QUEEN"].includes(tier)) return "bg-gradient-to-r from-yellow-500 to-amber-400 text-black";
    if (parseInt(tier) >= 1 && parseInt(tier) <= 3) return "bg-gradient-to-r from-red-600 to-red-400 text-white";
    if (parseInt(tier) >= 4 && parseInt(tier) <= 6) return "bg-gradient-to-r from-blue-600 to-blue-400 text-white";
    return "bg-slate-700 text-slate-200";
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
          "w-24 h-10 flex-shrink-0 rounded-md flex items-center justify-center font-black text-sm uppercase tracking-wider shadow-md",
          getTierColor(tier)
        )}>
        {tier} Tier
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
