import { cn, normalizeRace } from "@/lib/utils";

import { PlayerCard, type Player } from "./PlayerCard";

type TierGroupProps = {
  rankName: string;
  players: Player[];
  startIndex: number;
  showRaceGroups?: boolean;
  emptyMessage?: string;
};

export function TierGroup({ rankName, players, showRaceGroups, emptyMessage }: TierGroupProps) {
  if (players.length === 0 && !emptyMessage) return null;

  return (
    <div className="mb-14">
      <div className="mb-8 flex items-center justify-between border-b border-foreground/5 px-2 pb-4">
        <div className="flex items-center gap-4">
          <div className="h-6 w-1.5 rounded-full bg-nzu-green shadow-[0_0_15px_rgba(46,213,115,0.4)]" />
          <h2 className="text-2xl font-black italic tracking-tighter text-foreground transition-colors md:text-3xl">{rankName}</h2>
        </div>

        <div className="flex items-center gap-4 text-right text-[10px] font-bold uppercase tracking-widest text-foreground/20 transition-colors">
          <span>선수 수 {players.length}</span>
          <div className="h-1 w-1 rounded-full bg-foreground/20" />
          <span>선수 상세는 카드를 선택해 확인</span>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/5 bg-white/[0.01] px-8 py-10 text-center">
          <p className="text-xs font-bold tracking-widest text-foreground/20">{emptyMessage}</p>
        </div>
      ) : !showRaceGroups ? (
        <div className="grid grid-cols-1 justify-items-center gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 xl:gap-2.5 2xl:grid-cols-7">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} variant="tier" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {[
            { id: "T", label: "테란" },
            { id: "Z", label: "저그" },
            { id: "P", label: "프로토스" },
          ].map((race) => {
            const racePlayers = players.filter((player) => normalizeRace(player.race) === race.id);

            return (
              <div key={race.id} className="flex flex-col gap-6">
                <div
                  className={cn(
                    "flex w-fit min-w-[120px] items-center justify-between rounded-2xl border px-6 py-2.5",
                    race.id === "T" && "border-blue-500/20 bg-blue-600/10 text-blue-400",
                    race.id === "Z" && "border-purple-500/20 bg-purple-600/10 text-purple-400",
                    race.id === "P" && "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                  )}
                >
                  <span className="text-xs font-black uppercase tracking-[0.2em]">{race.label}</span>
                  <span className="ml-4 text-[10px] font-bold opacity-40">{racePlayers.length}명</span>
                </div>

                {racePlayers.length > 0 ? (
                  <div className="grid grid-cols-1 justify-items-center gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 xl:gap-2.5 2xl:grid-cols-7">
                    {racePlayers.map((player) => (
                      <PlayerCard key={player.id} player={player} variant="tier" />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01] py-10">
                    <span className="text-[10px] font-bold italic tracking-[0.3em] text-white/10">{race.label} 선수 없음</span>
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
