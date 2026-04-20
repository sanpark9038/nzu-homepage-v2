import type { Player } from "@/types";
import { normalizeRace, normalizeTier } from "@/lib/utils";

const RACE_ORDER: Record<string, number> = {
  T: 0,
  Z: 1,
  P: 2,
};

export const NAMED_TIER_LABELS = {
  god: "갓",
  king: "킹",
  jack: "잭",
  joker: "조커",
  spade: "스페이드",
  baby: "베이비",
} as const;

export type NumericTierGroup = {
  tier: number;
  name: string;
  players: Player[];
};

export type TierNavigationItem = {
  id: string;
  name: string;
};

export function sortTierPlayers(players: Player[]) {
  return [...players].sort((left, right) => {
    const leftRace = normalizeRace(left.race);
    const rightRace = normalizeRace(right.race);
    const leftOrder = RACE_ORDER[leftRace] ?? 99;
    const rightOrder = RACE_ORDER[rightRace] ?? 99;

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || "").localeCompare(String(right.name || ""), "ko");
  });
}

export function filterTierPlayers(
  players: Player[],
  {
    liveOnly = false,
    race = "",
    university = "",
    tier = "",
    search = "",
  }: {
    liveOnly?: boolean;
    race?: string | null;
    university?: string | null;
    tier?: string | null;
    search?: string | null;
  }
) {
  const normalizedRace = String(race || "").trim();
  const normalizedUniversity = String(university || "").trim();
  const normalizedTierFilter = String(tier || "").trim();
  const normalizedSearch = String(search || "").trim().toLowerCase();

  let playerList = [...players];

  if (liveOnly) {
    playerList = playerList.filter((player) => player.is_live);
  }
  if (normalizedRace && normalizedRace !== "ALL") {
    playerList = playerList.filter((player) => player.race === normalizedRace);
  }
  if (normalizedUniversity && normalizedUniversity !== "ALL") {
    playerList = playerList.filter((player) => player.university === normalizedUniversity);
  }
  if (normalizedTierFilter && normalizedTierFilter !== "ALL") {
    playerList = playerList.filter((player) => normalizeTier(player.tier) === normalizeTier(normalizedTierFilter));
  }
  if (normalizedSearch) {
    const searchedList = playerList.filter((player) => String(player.name || "").toLowerCase().includes(normalizedSearch));
    if (searchedList.length > 0) {
      playerList = searchedList;
    }
  }

  return playerList;
}

export function buildNamedTierPlayers(players: Player[]) {
  return {
    godPlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.god)),
    kingPlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.king)),
    jackPlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.jack)),
    jokerPlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.joker)),
    spadePlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.spade)),
    babyPlayers: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === NAMED_TIER_LABELS.baby)),
  };
}

export function buildNumericTierGroups(players: Player[], numericTiers: number[]): NumericTierGroup[] {
  return numericTiers
    .map((tier) => ({
      tier,
      name: `${tier}티어`,
      players: sortTierPlayers(players.filter((player) => normalizeTier(player.tier) === String(tier))),
    }))
    .filter((group) => group.players.length > 0);
}

export function buildTierNavigation(numericTiers: number[]): TierNavigationItem[] {
  return [
    { id: "god", name: NAMED_TIER_LABELS.god },
    { id: "king", name: NAMED_TIER_LABELS.king },
    { id: "jack", name: NAMED_TIER_LABELS.jack },
    { id: "joker", name: NAMED_TIER_LABELS.joker },
    { id: "spade", name: NAMED_TIER_LABELS.spade },
    ...numericTiers.map((tier) => ({ id: String(tier), name: `${tier}티어` })),
    { id: "baby", name: NAMED_TIER_LABELS.baby },
  ];
}
