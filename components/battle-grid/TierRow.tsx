import { Player } from '@/lib/player-service';
import { PlayerBubble } from './PlayerBubble';
import { cn, getTierLabel } from '@/lib/utils';
import { getTierTone } from '@/components/ui/nzu-badges';

export function TierRow({ tier, teamAPlayers, teamBPlayers }: { tier: string, teamAPlayers: Player[], teamBPlayers: Player[] }) {
  
  const getTierColor = (tier: string) => {
    const tone = getTierTone(tier);
    return cn(
      "font-black shadow-[0_0_12px_rgba(0,0,0,0.18)]",
      tone.color
    );
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
        "flex-shrink-0 w-28 h-full flex items-center justify-center text-sm font-bold rounded-lg border border-white/10",
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
