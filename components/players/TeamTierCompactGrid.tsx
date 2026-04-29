import { getUniversityLabel } from "@/lib/university-config";

import { PlayerCard, type Player } from "./PlayerCard";

type TeamTierCompactGridProps = {
  players: Player[];
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

      <div className="grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            variant="tier"
            className="max-w-[13.25rem]"
          />
        ))}
      </div>
    </section>
  );
}
