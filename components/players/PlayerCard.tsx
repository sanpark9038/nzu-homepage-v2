
'use client'

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { TierBadge } from "../ui/nzu-badges";
import { RaceLetterBadge } from "../ui/race-letter-badge";
import type { Player } from "@/types";
import { cn, normalizeRace } from "@/lib/utils";
import { ExternalLink, Check, Circle, Crown } from "lucide-react";
import { buildPlayerHref } from "@/lib/player-route";
import { resolveSoopChannelImageUrl, resolveSoopChannelUrl, resolveSoopWatchUrl } from "@/lib/soop";

export type { Player };

interface PlayerCardProps {
  player: Player
  layout?: 'default' | 'compact'
  className?: string
  showQuickH2H?: boolean
  variant?: 'default' | 'home' | 'tier'
  isCaptain?: boolean
}

export function PlayerCard({
  player,
  layout = 'default',
  className,
  showQuickH2H = true,
  variant = 'default',
  isCaptain = false,
}: PlayerCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [isTierPreviewVisible, setIsTierPreviewVisible] = useState(false);
  const [tierPreviewStyle, setTierPreviewStyle] = useState<{ left: number; top: number } | null>(null);
  const tierPreviewAnchorRef = useRef<HTMLDivElement | null>(null);
  const race = normalizeRace(player.race);
  const isLive = player.is_live ?? false;
  const isHomeVariant = variant === "home";
  const isTierVariant = variant === "tier";
  const profileUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "";
  
  const soopWatchUrl = resolveSoopWatchUrl(player);
  const soopChannelUrl = resolveSoopChannelUrl(player);
  const hoverSoopHref = isLive ? soopWatchUrl : soopChannelUrl;
  const hoverSoopLabel = isLive ? "LIVE 시청" : soopChannelUrl ? "방송국 이동" : "";
  const liveTitle = player.broadcast_title || `${player.name} 현재 방송`;
  const liveMeta = [player.live_viewers ? `${player.live_viewers}명 시청 중` : null, player.live_started_at ? "LIVE" : null]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    setThumbnailFailed(false);
  }, [player.id, player.live_thumbnail_url]);

  function updateTierPreviewPosition() {
    if (!isTierVariant || !isLive || typeof window === "undefined") return;
    const anchor = tierPreviewAnchorRef.current;
    if (!anchor) return;

    const previewWidth = 496;
    const previewHeight = 279;
    const viewportPadding = 20;
    const rect = anchor.getBoundingClientRect();
    const centeredLeft = rect.left + rect.width / 2 - previewWidth / 2;
    const left = Math.min(
      Math.max(centeredLeft, viewportPadding),
      window.innerWidth - previewWidth - viewportPadding
    );
    const top = Math.max(rect.top - previewHeight - 14, viewportPadding);
    setTierPreviewStyle({ left, top });
  }

  useEffect(() => {
    if (!isTierPreviewVisible || !isTierVariant || !isLive) return;
    const handleViewportChange = () => updateTierPreviewPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isTierPreviewVisible, isTierVariant, isLive]);

  const raceStyles = {
    'Terran': {
      border: "border-blue-500/20 group-hover:border-blue-500/60",
      accent: "bg-blue-500",
      text: "text-blue-500",
      bg: "bg-blue-500/5",
      glow: "shadow-[0_0_20px_rgba(59,130,246,0.15)]",
    },
    'Zerg': {
      border: "border-purple-500/20 group-hover:border-purple-500/60",
      accent: "bg-purple-500",
      text: "text-purple-500",
      bg: "bg-purple-500/5",
      glow: "shadow-[0_0_20px_rgba(168,85,247,0.15)]",
    },
    'Protoss': {
      border: "border-yellow-500/20 group-hover:border-yellow-500/60",
      accent: "bg-yellow-500",
      text: "text-yellow-500",
      bg: "bg-yellow-500/5",
      glow: "shadow-[0_0_20px_rgba(255,215,0,0.15)]",
    },
    'Random': {
      border: "border-gray-500/20 group-hover:border-gray-500/60",
      accent: "bg-gray-500",
      text: "text-gray-500",
      bg: "bg-gray-500/5",
      glow: "shadow-[0_0_20px_rgba(107,114,128,0.15)]",
    }
  } as const;

  type RaceKey = keyof typeof raceStyles;
  const raceMap: Record<string, RaceKey> = {
    'T': 'Terran',
    'P': 'Protoss',
    'Z': 'Zerg',
    'R': 'Random',
    'Terran': 'Terran',
    'Protoss': 'Protoss',
    'Zerg': 'Zerg',
    'Random': 'Random'
  };

  const currentRaceKey = raceMap[race] || 'Random';
  const currentStyles = raceStyles[currentRaceKey];
  const tierShellClass = "max-w-52 rounded-2xl border-[3px]";
  const tierContentClass = "gap-2 px-3.5 py-3";

  return (
    <>
    <div className={cn(
      "group relative flex w-full flex-col bg-card border-2 transition-all duration-300 hover:-translate-y-1",
      isTierVariant ? "overflow-visible" : "overflow-hidden",
      isHomeVariant ? "rounded-[1.35rem]" : "rounded-2xl",
      isHomeVariant ? "aspect-[3/4]" : "",
      isTierVariant ? tierShellClass : "hover:scale-[1.02]",
      currentStyles.border,
      currentStyles.glow,
      isLive && "ring-2 ring-nzu-live ring-offset-2 ring-offset-background",
      className
    )}
      onMouseEnter={() => {
        if (!isTierVariant || !isLive) return;
        updateTierPreviewPosition();
        setIsTierPreviewVisible(true);
      }}
      onMouseLeave={() => {
        if (!isTierVariant || !isLive) return;
        setIsTierPreviewVisible(false);
      }}
    >
      {/* 카드 상단: 이미지 & 필터 레이어 */}
      <div
        className={cn(
          "relative bg-muted",
          isTierVariant ? "overflow-visible" : "overflow-hidden",
          isHomeVariant ? "aspect-[3/3.22]" : isTierVariant ? "flex items-start justify-center bg-transparent px-5 pt-5" : "aspect-[4/3]"
        )}
      >
        {isTierVariant ? (
          <div ref={tierPreviewAnchorRef} className="relative h-[140px] w-[132px]">
            <div className="relative h-full w-full overflow-hidden rounded-xl bg-muted">
              <Image
                src={profileUrl || "/placeholder-player.png"}
                alt={player.name}
                width={132}
                height={140}
                sizes="132px"
                unoptimized
                className="h-full w-full object-cover object-top"
              />
              {isLive ? (
                <>
                  <div className="absolute left-2 top-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black tracking-tight text-white shadow-lg">
                    LIVE
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <Image
            src={profileUrl || "/placeholder-player.png"}
            alt={player.name}
            fill
            unoptimized
            className="object-cover object-top transition-transform duration-700 group-hover:scale-110"
          />
        )}
        
        {/* Live Indicator overlay (Top Right) */}
        {isLive && !isTierVariant && (
          <div className={cn(
            "bg-red-600 text-white font-black rounded-full flex items-center gap-1.5 shadow-lg z-10 animate-pulse",
            isTierVariant ? "absolute right-3 top-3 px-2.5 py-0.5 text-[9px]" : "absolute top-3 right-3 px-3 py-1 text-[10px]"
          )}>
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            방송중
          </div>
        )}

        {isLive && !isTierVariant ? (
          <div className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-[linear-gradient(180deg,rgba(2,6,7,0),rgba(2,6,7,0.78)_35%,rgba(2,6,7,0.94))]",
            "translate-y-3 px-3 pb-3 pt-10 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          )}>
            <div className={cn(
              "border border-red-400/25 bg-black/45 backdrop-blur-md",
              "rounded-2xl px-3 py-2.5"
            )}>
              <div className="flex items-center justify-between gap-3">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-red-500/18 font-black uppercase text-red-200",
                  "px-2 py-1 text-[10px] tracking-[0.18em]"
                )}>
                  <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                  LIVE
                </span>
                {player.live_viewers ? (
                  <span className={cn(
                    "font-black tracking-tight text-white/72",
                    "text-[10px]"
                  )}>{player.live_viewers}명</span>
                ) : null}
              </div>
              <p className={cn(
                "line-clamp-2 font-black tracking-tight text-white",
                "mt-2 text-[12px] leading-4"
              )}>
                {liveTitle}
              </p>
              {liveMeta ? (
                <p className={cn(
                  "font-bold tracking-tight text-white/58",
                  "mt-1 text-[10px]"
                )}>{liveMeta}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Hover Action Layer (Centering Buttons) */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-20">
          <Link 
            href={buildPlayerHref(player)}
            className="w-full transform rounded-full border border-nzu-green bg-nzu-green py-2.5 text-center text-[11px] font-black uppercase tracking-tighter text-black transition-all translate-y-4 backdrop-blur-md group-hover:translate-y-0 hover:border-white hover:bg-white"
          >
            전적 보기
          </Link>
          
          {hoverSoopHref ? (
            <a 
              href={hoverSoopHref}
              target="_blank"
              rel="noopener noreferrer"
              className="delay-75 flex w-full transform items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 py-2.5 text-center text-[11px] font-black uppercase tracking-tighter text-white transition-all translate-y-4 backdrop-blur-md group-hover:translate-y-0 hover:bg-white/30"
            >
              <span>{hoverSoopLabel}</span>
              <ExternalLink size={12} />
            </a>
          ) : (
            <div className="w-full py-2.5 rounded-full bg-white/5 text-white/30 text-[11px] font-black uppercase tracking-tighter border border-white/5 cursor-not-allowed text-center transform translate-y-4 group-hover:translate-y-0 delay-75">
              방송 준비중
            </div>
          )}
        </div>
      </div>

      {/* 카드 하단: 정보 영역 */}
        <div
          className={cn(
            "flex flex-1 flex-col transition-colors",
            currentStyles.bg,
            isHomeVariant ? "gap-2.5 px-4 py-3.5" : isTierVariant ? tierContentClass : "gap-3 p-4"
          )}
        >
        {isHomeVariant ? (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[1.48rem] font-black tracking-tight text-foreground transition-colors">
                  {player.name}
                </h3>
                {isCaptain ? (
                  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-amber-200/45 bg-[linear-gradient(180deg,rgba(191,161,74,0.92),rgba(150,121,45,0.92))] px-3.5 text-[14px] font-black tracking-[0.08em] text-[#0f0b03] shadow-[0_8px_22px_rgba(191,161,74,0.24)]">
                    <Crown size={14} className="shrink-0 text-[#120d03]" />
                    팀장
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-hidden">
              <RaceLetterBadge race={race} size="md" />
              <TierBadge tier={player.tier || "미정"} />
              <div className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/15 px-3 py-2 text-center">
                <div className="truncate text-[13px] font-black tracking-tight text-white/84">
                  {player.university || "무소속"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <h3 className={cn(
              "min-w-0 flex-1 truncate font-black tracking-tight text-foreground transition-colors",
              isTierVariant ? "text-[1.16rem]" : "text-[1.32rem]"
            )}>
              {player.name}
            </h3>
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border font-black",
                isTierVariant ? "h-7 w-7 text-[11px]" : "h-7 w-7 text-[12px]",
                currentStyles.border,
                currentStyles.text,
                "bg-background/50"
              )}
            >
              {race[0]}
            </div>
            <span className={cn(
              "inline-flex shrink-0 items-center rounded-full border border-white/10 bg-black/15 font-[1000] tracking-tight text-white/72",
              isTierVariant ? "h-7 px-2.5 text-[10px]" : "h-7 px-3 text-[11px]"
            )}>
                {player.university || "무소속"}
            </span>
          </div>
        )}

        {/* keep layout stable even when quick action is hidden */}
        <div className="mt-auto">
          {showQuickH2H ? (
            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('add-h2h-player', { detail: player }));
              }}
              className={cn(
                "w-full rounded-xl font-[900] uppercase tracking-tight flex items-center justify-center gap-2.5 transition-all border shadow-lg shadow-black/5 active:scale-95 group/h2h",
                isTierVariant ? "gap-2 py-3 text-[12px]" : "py-4 text-[14px]",
                currentStyles.border,
                "bg-foreground/5 hover:bg-foreground/10 text-foreground/80 hover:text-foreground"
              )}
            >
              <div className="relative flex items-center justify-center w-5 h-5">
                <Circle className="w-full h-full opacity-20 group-hover/h2h:opacity-40 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center scale-75 group-hover/h2h:scale-100 transition-transform">
                  <Check className="w-3.5 h-3.5 text-nzu-green opacity-0 group-hover/h2h:opacity-100 transition-opacity drop-shadow-[0_0_8px_rgba(0,255,163,0.5)]" />
                </div>
              </div>
              빠른 상대전적 추가
            </button>
          ) : null}
        </div>
      </div>
    </div>
    {isTierVariant && isLive && isTierPreviewVisible && tierPreviewStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[140] hidden w-[31rem] overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#061015] shadow-[0_24px_52px_rgba(0,0,0,0.42)] md:block"
            style={{ left: `${tierPreviewStyle.left}px`, top: `${tierPreviewStyle.top}px` }}
          >
            <div className="relative aspect-[16/9] w-full bg-[linear-gradient(180deg,rgba(8,14,18,0.55),rgba(3,6,8,0.92))]">
              {player.live_thumbnail_url && !thumbnailFailed ? (
                <Image
                  src={player.live_thumbnail_url}
                  alt={`${player.name} live preview`}
                  fill
                  unoptimized
                  className="object-cover"
                  onError={() => setThumbnailFailed(true)}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute left-4 top-4 flex items-center gap-2.5">
                <div className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-[12px] font-black tracking-tight text-white shadow-lg">
                  LIVE
                </div>
                {player.live_viewers ? (
                  <div className="inline-flex items-center rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[12px] font-[1000] tracking-tight text-white">
                    {player.live_viewers}명 시청 중
                  </div>
                ) : null}
              </div>
              <div className="absolute right-4 top-4 h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-black/40">
                <Image
                  src={profileUrl || "/placeholder-player.png"}
                  alt={`${player.name} profile`}
                  width={40}
                  height={40}
                  sizes="40px"
                  unoptimized
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="line-clamp-2 text-[1.16rem] font-[1000] leading-snug text-white">
                  {liveTitle}
                </p>
                <div className="mt-1.5 text-[0.9rem] font-[900] tracking-tight text-white/68">
                  <span className="truncate">{player.name}</span>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    </>
  );
}
