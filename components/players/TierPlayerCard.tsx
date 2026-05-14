import Link from "next/link";
import Image from "next/image";

import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { TierBadge } from "@/components/ui/nzu-badges";
import { mapPlayerToMatchupSummary } from "@/lib/matchup-helpers";
import { buildPlayerHref } from "@/lib/player-route";
import { buildSoopThumbnailProxyUrl, resolveSoopChannelImageUrl } from "@/lib/soop";
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
  const matchupSummary = mapPlayerToMatchupSummary(player);
  const profileUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const liveThumbnailUrl = isLive
    ? buildSoopThumbnailProxyUrl(player.live_thumbnail_url) || player.live_thumbnail_url || ""
    : "";

  return (
    <div
      className={cn("group relative w-full max-w-56 overflow-visible hover:z-[70]", className)}
      data-live-thumbnail-hover-anchor={liveThumbnailUrl ? "true" : undefined}
      data-live-thumbnail-url={liveThumbnailUrl || undefined}
      data-live-player-name={player.name}
      data-live-broadcast-title={player.broadcast_title || undefined}
    >
      {isLive ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-red-500/90"
        />
      ) : null}

      <article
        className={cn(
          "relative m-[4px] flex min-h-[11.75rem] w-[calc(100%-0.5rem)] flex-col overflow-hidden rounded-[0.9rem] border-[3px] bg-card",
          raceTone[race] || raceTone.R
        )}
      >
        {isLive ? (
          <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black tracking-tight text-white">
            LIVE
          </span>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 p-3.5">
          <Link
            href={buildPlayerHref(player)}
            className="absolute left-3 top-3 h-[4.75rem] w-[4.75rem] overflow-hidden rounded-xl border border-white/10 bg-muted/30"
            aria-label={`${player.name} profile`}
          >
            <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-white/45">
              {player.name.slice(0, 1)}
            </span>
            <Image
              src={profileUrl}
              alt={player.name}
              width={76}
              height={76}
              sizes="76px"
              className="relative z-10 h-full w-full object-cover object-top"
            />
          </Link>

          <div className="pl-[5.25rem]">
            <Link
              href={buildPlayerHref(player)}
              className="block min-w-0 truncate text-[1.16rem] font-black leading-tight tracking-tight text-foreground transition-colors hover:text-nzu-green"
              aria-label={`${player.name} 전적 보기`}
            >
              {player.name}
            </Link>
          </div>

          <div className="flex items-center gap-1 overflow-hidden pl-[5.25rem]">
            <RaceLetterBadge race={race} size="lg" />
            <TierBadge tier={player.tier || "미정"} size="sm" />
          </div>

          <div className="overflow-hidden">
            <span className="block truncate rounded-full border border-white/10 bg-black/15 px-2.5 py-1.5 text-center text-[10px] font-[1000] tracking-tight text-white/72">
              {universityLabel}
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <Link
              href={buildPlayerHref(player)}
              className="rounded-xl border border-nzu-green/45 bg-nzu-green/90 py-2 text-center text-[11px] font-black tracking-tight text-black transition-colors hover:border-white hover:bg-white"
            >
              전적 보기
            </Link>

            <TierQuickH2HButton player={matchupSummary} className="py-2.5" />
          </div>
        </div>
      </article>

    </div>
  );
}
