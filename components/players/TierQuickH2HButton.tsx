import { Check, Circle } from "lucide-react";

import type { MatchupPlayerSummary } from "@/lib/matchup-helpers";
import { cn } from "@/lib/utils";

type TierQuickH2HButtonProps = {
  player: MatchupPlayerSummary;
  className?: string;
};

export function TierQuickH2HButton({ player, className }: TierQuickH2HButtonProps) {
  return (
    <button
      type="button"
      data-tier-h2h-player
      data-player-id={player.id}
      data-player-name={player.name}
      data-player-nickname={player.nickname || ""}
      data-player-race={player.race}
      data-player-gender={player.gender || ""}
      data-player-tier={player.tier}
      data-player-university={player.university || ""}
      className={cn(
        "ui-label group/h2h flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-foreground/5 py-3 text-foreground/80 shadow-lg shadow-black/5 transition-all hover:bg-foreground/10 hover:text-foreground active:scale-95",
        className
      )}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Circle className="h-full w-full opacity-20 transition-opacity group-hover/h2h:opacity-40" />
        <span className="absolute inset-0 flex scale-75 items-center justify-center transition-transform group-hover/h2h:scale-100">
          <Check className="h-3.5 w-3.5 text-nzu-green opacity-0 drop-shadow-[0_0_8px_rgba(0,255,163,0.5)] transition-opacity group-hover/h2h:opacity-100" />
        </span>
      </span>
      빠른 상대전적 추가
    </button>
  );
}
