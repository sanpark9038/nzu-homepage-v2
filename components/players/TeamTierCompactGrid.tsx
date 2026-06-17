import { getUniversityLabel } from "@/lib/university-config";
import type { TierPlayerPayload } from "@/lib/tier-player-payload";

import { TierPlayerCard } from "./TierPlayerCard";
import { TIER_PLAYER_GRID_CLASS } from "./tier-grid-layout";

type TeamTierCompactGridProps = {
  players: TierPlayerPayload[];
  selectedUniversity: string;
};

export function TeamTierCompactGrid({ players, selectedUniversity }: TeamTierCompactGridProps) {
  const universityLabel = getUniversityLabel(selectedUniversity);

  return (
    <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/8 px-1 pb-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-black tracking-tight text-foreground sm:text-2xl">
            {universityLabel}
          </h2>
        </div>
        <div className="shrink-0 rounded-full border border-nzu-green/25 bg-nzu-green/10 px-3 py-1 text-xs font-black text-nzu-green">
          {players.length}
        </div>
      </div>

      <div className={TIER_PLAYER_GRID_CLASS}>
        {players.map((player) => (
          <TierPlayerCard key={player.id} player={player} />
        ))}
      </div>
    </section>
  );
}
