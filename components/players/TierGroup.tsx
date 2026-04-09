
import { Player, PlayerCard } from "./PlayerCard";
import { cn } from "@/lib/utils";

interface TierGroupProps {
  rankName: string;
  players: Player[];
  startIndex: number;
  showRaceGroups?: boolean;
  emptyMessage?: string;
}

export function TierGroup({ rankName, players, startIndex, showRaceGroups, emptyMessage }: TierGroupProps) {
  if (players.length === 0 && !emptyMessage) return null;

  return (
    <div className="mb-14">
      {/* --- Tier Header (Tactical) --- */}
      <div className="flex items-center justify-between mb-8 px-2 border-b border-foreground/5 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-6 bg-nzu-green rounded-full shadow-[0_0_15px_rgba(46,213,115,0.4)]" />
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-foreground uppercase italic transition-colors">
            {rankName}
          </h2>
        </div>
        
        <div className="flex items-center gap-4 text-foreground/20 text-[10px] font-bold uppercase tracking-widest transition-colors text-right">
           <span>선수 수: {players.length}</span>
           <div className="w-1 h-1 bg-foreground/20 rounded-full" />
           <span>선수 데이터 준비됨</span>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="px-8 py-10 rounded-3xl border border-dashed border-white/5 bg-white/[0.01] text-center">
          <p className="text-xs font-bold text-foreground/20 tracking-widest">{emptyMessage}</p>
        </div>
      ) : !showRaceGroups ? (
        <div className="grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 xl:gap-3">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} variant="tier" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {[
            { id: 'T', name: 'Terran', label: '테란' },
            { id: 'Z', name: 'Zerg', label: '저그' },
            { id: 'P', name: 'Protoss', label: '토스' }
          ].map((race) => {
            const racePlayers = players.filter(p => p.race === race.id);
            return (
              <div key={race.id} className="flex flex-col gap-6">
                <div className={cn(
                  "px-6 py-2.5 rounded-2xl flex items-center justify-between border w-fit min-w-[120px]",
                  race.id === 'T' && "bg-blue-600/10 border-blue-500/20 text-blue-400",
                  race.id === 'Z' && "bg-purple-600/10 border-purple-500/20 text-purple-400",
                  race.id === 'P' && "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                )}>
                  <span className="text-xs font-black uppercase tracking-[0.2em]">{race.label}</span>
                  <span className="ml-4 text-[10px] font-bold opacity-40">{racePlayers.length}명</span>
                </div>
                
                {racePlayers.length > 0 ? (
                  <div className="grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 xl:gap-3">
                    {racePlayers.map((player) => (
                      <PlayerCard key={player.id} player={player} variant="tier" />
                    ))}
                  </div>
                ) : (
                  <div className="py-10 rounded-3xl border border-dashed border-white/5 bg-white/[0.01] flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white/10 uppercase tracking-widest italic tracking-[0.3em]">등록 선수 없음</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
