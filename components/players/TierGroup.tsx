
import { Player } from "./PlayerCard";
import { PlayerRow } from "./PlayerRow";

interface TierGroupProps {
  rankName: string;
  players: Player[];
  startIndex: number;
}

export function TierGroup({ rankName, players, startIndex }: TierGroupProps) {
  if (players.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3 px-1">
         <span className="text-sm font-black text-nzu-green/80 uppercase tracking-widest">{rankName}</span>
         <div className="flex-1 h-px bg-gradient-to-r from-nzu-green/20 to-transparent" />
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border/40">
        {players.map((player, index) => (
          <PlayerRow key={player.id} player={player} rank={startIndex + index + 1} />
        ))}
      </div>
    </div>
  );
}
