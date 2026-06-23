import { cn, normalizeRace } from "@/lib/utils";
import type { TierPlayerPayload } from "@/lib/tier-player-payload";

import { TierPlayerCard } from "./TierPlayerCard";
import { TIER_PLAYER_GRID_CLASS } from "./tier-grid-layout";

type TierGroupProps = {
  rankName: string;
  players: TierPlayerPayload[];
  startIndex: number;
  showRaceGroups?: boolean;
  emptyMessage?: string;
};

export function TierGroup({ rankName, players, showRaceGroups, emptyMessage }: TierGroupProps) {
  if (players.length === 0 && !emptyMessage) return null;

  return (
    <div className="tier-content-visibility mb-14">
      <div className="mb-8 flex items-center justify-between border-b border-foreground/5 px-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-nzu-green" />
          <h2 className="text-xl font-bold tracking-tight text-foreground transition-colors md:text-2xl">{rankName}</h2>
        </div>

        <div className="flex items-center gap-3 text-right text-xs font-medium uppercase tracking-wider text-foreground/30 transition-colors">
          <span>선수 {players.length}명</span>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/5 bg-white/[0.01] px-8 py-10 text-center">
          <p className="text-xs font-medium tracking-wide text-foreground/28">{emptyMessage}</p>
        </div>
      ) : !showRaceGroups ? (
        <div className={TIER_PLAYER_GRID_CLASS}>
          {players.map((player) => (
            <TierPlayerCard key={player.id} player={player} />
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
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">{race.label}</span>
                  <span className="ml-4 text-[10px] font-medium opacity-38">{racePlayers.length}명</span>
                </div>

                {racePlayers.length > 0 ? (
                  <div className={TIER_PLAYER_GRID_CLASS}>
                    {racePlayers.map((player) => (
                      <TierPlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01] py-10">
                    <span className="text-[10px] font-medium tracking-wider text-white/18">{race.label} 선수 없음</span>
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
