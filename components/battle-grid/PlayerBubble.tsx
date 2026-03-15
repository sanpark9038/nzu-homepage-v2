
import { Player } from '@/lib/player-service';
import { RACE_COLORS } from '@/lib/constants';

// A simple utility to get a race character from the race enum
const getRaceChar = (race: 'T' | 'Z' | 'P') => race[0];

export function PlayerBubble({ player }: { player: Player }) {
  const raceColor = RACE_COLORS[player.race as keyof typeof RACE_COLORS] || 'text-gray-400';

  return (
    <div 
      className="inline-flex items-center gap-2 bg-muted/50 hover:bg-muted border border-transparent hover:border-nzu-green/50 rounded-full px-3 py-1.5 text-sm font-bold cursor-pointer transition-all duration-200 group"
    >
      <span 
        className="font-mono text-xs"
        style={{ color: raceColor }}
      >
        {getRaceChar(player.race as 'T' | 'Z' | 'P')}
      </span>
      <span>{player.name}</span>
    </div>
  );
}
