import Image from "next/image";
import Link from "next/link";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { TierBadge } from "@/components/ui/nzu-badges";
import { mapPlayerToMatchupSummary } from "@/lib/matchup-helpers";
import { buildPlayerHref } from "@/lib/player-route";
import { resolveSoopChannelImageUrl } from "@/lib/soop";
import { getUniversityLabel } from "@/lib/university-config";
import { cn, normalizeRace } from "@/lib/utils";
import type { Player } from "@/types";

import { TierQuickH2HButton } from "./TierQuickH2HButton";

type TierPlayerCardProps = {
  player: Player;
  className?: string;
};

const raceTone: Record<string, string> = {
  T: "border-blue-500/24 bg-blue-500/[0.035]",
  Z: "border-purple-500/24 bg-purple-500/[0.035]",
  P: "border-yellow-500/24 bg-yellow-500/[0.035]",
  R: "border-white/14 bg-white/[0.025]",
};

export function TierPlayerCard({ player, className }: TierPlayerCardProps) {
  const race = normalizeRace(player.race);
  const isLive = Boolean(player.is_live);
  const universityLabel = getUniversityLabel(player.university);
  const profileUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const matchupSummary = mapPlayerToMatchupSummary(player);

  return (
    <article
      className={cn(
        "group relative flex w-full max-w-52 flex-col overflow-hidden rounded-2xl border-[3px] bg-card shadow-[0_0_20px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-1",
        raceTone[race] || raceTone.R,
        isLive && "ring-2 ring-red-500/80 ring-offset-2 ring-offset-background",
        className
      )}
    >
      <Link href={buildPlayerHref(player)} className="block px-5 pt-5" aria-label={`${player.name} 전적 보기`}>
        <div className="relative mx-auto h-[140px] w-[132px] overflow-hidden rounded-xl bg-muted">
          <Image
            src={profileUrl}
            alt={player.name}
            width={132}
            height={140}
            sizes="132px"
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
          {isLive ? (
            <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black tracking-tight text-white shadow-lg">
              LIVE
            </span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={buildPlayerHref(player)}
            className="min-w-0 flex-1 truncate text-[1.16rem] font-black tracking-tight text-foreground transition-colors hover:text-nzu-green"
          >
            {player.name}
          </Link>
          <RaceLetterBadge race={race} size="md" />
        </div>

        <div className="flex items-center gap-1.5 overflow-hidden">
          <TierBadge tier={player.tier || "미정"} size="xs" />
          <span className="min-w-0 flex-1 truncate rounded-full border border-white/10 bg-black/15 px-2.5 py-1.5 text-center text-[10px] font-[1000] tracking-tight text-white/72">
            {universityLabel}
          </span>
        </div>

        <Link
          href={buildPlayerHref(player)}
          className="mt-1 rounded-xl border border-nzu-green/45 bg-nzu-green/90 py-2 text-center text-[11px] font-black tracking-tight text-black transition-colors hover:border-white hover:bg-white"
        >
          전적 보기
        </Link>

        <TierQuickH2HButton player={matchupSummary} />
      </div>
    </article>
  );
}
