import { REAL_NAME_MAP } from "./constants";
import { normalizeTier } from "./utils";
import type { Player, H2HStats } from "../types";

export type MatchupPlayerSummary = {
  id: string;
  name: string;
  nickname?: string | null;
  race: string;
  gender?: string | null;
  tier: string;
  university?: string | null;
};

export type PackedMatchupPlayerSummary = [
  id: string,
  name: string,
  nickname: string | null,
  race: string,
  gender: string | null,
  tier: string,
  university: string | null,
];

export type PackedMatchupPayloadPlayer = [
  id: string,
  name: string,
  nickname: string | null,
  race: string,
  gender: string | null,
  tierIndex: number,
  universityIndex: number,
];

export type PackedMatchupPlayersPayload = {
  tiers: string[];
  universities: string[];
  players: PackedMatchupPayloadPlayer[];
};

export type MatchPagePlayerSummary = Pick<MatchupPlayerSummary, "id" | "name" | "nickname" | "race" | "gender">;

export type PackedMatchPagePlayerSummary = [
  id: string,
  name: string,
  nickname: string | null,
  race: string,
  gender: string | null,
];

type MatchupFilterPlayer = MatchPagePlayerSummary & Partial<Pick<MatchupPlayerSummary, "tier" | "university">>;

const UNKNOWN_TIER_KEY = "미정";

export function getMatchupTierKey(tier: string | null | undefined) {
  return normalizeTier(tier);
}

export function getMatchupTierBadgeLetter(tier: string | null | undefined) {
  const normalizedTier = getMatchupTierKey(tier);
  if (normalizedTier === UNKNOWN_TIER_KEY) return "?";
  if (normalizedTier === "갓" || normalizedTier.toUpperCase().includes("GOD")) return "G";
  if (normalizedTier === "킹" || normalizedTier.toUpperCase().includes("KING")) return "K";
  if (normalizedTier === "잭" || normalizedTier.toUpperCase().includes("JACK")) return "J";
  if (normalizedTier === "조커" || normalizedTier.toUpperCase().includes("JOKER")) return "J";
  if (normalizedTier === "스페이드" || normalizedTier.toUpperCase().includes("SPADE")) return "S";
  if (normalizedTier === "9" || normalizedTier === "베이비" || normalizedTier.toUpperCase().includes("BABY")) return "B";
  return normalizedTier.charAt(0) || "?";
}

export function reportMatchupRuntimeIssue(message: string, error?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof console === "undefined") return;
  console.warn(message, error);
}

export function mapPlayerToMatchupSummary(
  player: Pick<Player, "id" | "name" | "nickname" | "race" | "gender" | "tier" | "university">
): MatchupPlayerSummary {
  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname || null,
    race: player.race || "R",
    gender: player.gender || null,
    tier: getMatchupTierKey(player.tier),
    university: player.university || null,
  };
}

export function mapPlayersToMatchupSummaries(
  players: Array<Pick<Player, "id" | "name" | "nickname" | "race" | "gender" | "tier" | "university">>
) {
  return players.map(mapPlayerToMatchupSummary);
}

export function packMatchupPlayerSummary(player: MatchupPlayerSummary): PackedMatchupPlayerSummary {
  return [
    player.id,
    player.name,
    player.nickname || null,
    player.race || "R",
    player.gender || null,
    getMatchupTierKey(player.tier),
    player.university || null,
  ];
}

export function packMatchupPlayerSummaries(players: MatchupPlayerSummary[]) {
  return players.map(packMatchupPlayerSummary);
}

export function unpackMatchupPlayerSummary(packed: PackedMatchupPlayerSummary): MatchupPlayerSummary {
  return {
    id: packed[0],
    name: packed[1],
    nickname: packed[2],
    race: packed[3] || "R",
    gender: packed[4],
    tier: getMatchupTierKey(packed[5]),
    university: packed[6],
  };
}

export function unpackMatchupPlayerSummaries(players: PackedMatchupPlayerSummary[]) {
  return players.map(unpackMatchupPlayerSummary);
}

function getDictionaryIndex(value: string, values: string[], indexes: Map<string, number>) {
  const existingIndex = indexes.get(value);
  if (existingIndex !== undefined) return existingIndex;

  const nextIndex = values.length;
  values.push(value);
  indexes.set(value, nextIndex);
  return nextIndex;
}

export function packMatchupPlayersPayload(players: MatchupPlayerSummary[]): PackedMatchupPlayersPayload {
  const tiers: string[] = [];
  const tierIndexes = new Map<string, number>();
  const universities: string[] = [];
  const universityIndexes = new Map<string, number>();

  return {
    tiers,
    universities,
    players: players.map((player) => {
      const tierIndex = getDictionaryIndex(getMatchupTierKey(player.tier), tiers, tierIndexes);
      const university = player.university || null;
      const universityIndex = university
        ? getDictionaryIndex(university, universities, universityIndexes)
        : -1;

      return [
        player.id,
        player.name,
        player.nickname || null,
        player.race || "R",
        player.gender || null,
        tierIndex,
        universityIndex,
      ];
    }),
  };
}

export function unpackMatchupPlayersPayload(payload: PackedMatchupPlayersPayload) {
  return payload.players.map((packed): MatchupPlayerSummary => ({
    id: packed[0],
    name: packed[1],
    nickname: packed[2],
    race: packed[3] || "R",
    gender: packed[4],
    tier: payload.tiers[packed[5]] || UNKNOWN_TIER_KEY,
    university: packed[6] >= 0 ? payload.universities[packed[6]] ?? null : null,
  }));
}

export function mapPlayerToMatchPageSummary(
  player: Pick<Player, "id" | "name" | "nickname" | "race" | "gender">
): MatchPagePlayerSummary {
  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname || null,
    race: player.race || "R",
    gender: player.gender || null,
  };
}

export function mapPlayersToMatchPageSummaries(
  players: Array<Pick<Player, "id" | "name" | "nickname" | "race" | "gender">>
) {
  return players.map(mapPlayerToMatchPageSummary);
}

export function packMatchPagePlayerSummary(player: MatchPagePlayerSummary): PackedMatchPagePlayerSummary {
  return [
    player.id,
    player.name,
    player.nickname || null,
    player.race || "R",
    player.gender || null,
  ];
}

export function packMatchPagePlayerSummaries(players: MatchPagePlayerSummary[]) {
  return players.map(packMatchPagePlayerSummary);
}

export function unpackMatchPagePlayerSummary(packed: PackedMatchPagePlayerSummary): MatchPagePlayerSummary {
  return {
    id: packed[0],
    name: packed[1],
    nickname: packed[2],
    race: packed[3] || "R",
    gender: packed[4],
  };
}

export function unpackMatchPagePlayerSummaries(players: PackedMatchPagePlayerSummary[]) {
  return players.map(unpackMatchPagePlayerSummary);
}

export async function fetchMatchupPlayers() {
  const response = await fetch("/api/players");
  if (!response.ok) {
    throw new Error(`Failed to load players: ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as { players?: MatchupPlayerSummary[] } | null;
  return Array.isArray(payload?.players) ? payload.players : [];
}

export function normalizeMatchupSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function filterMatchupPlayers<T extends MatchupFilterPlayer>(
  players: T[],
  {
    university = "",
    query = "",
    excludePlayerId = "",
  }: {
    university?: string | null;
    query?: string | null;
    excludePlayerId?: string | null;
  } = {}
) {
  const normalizedUniversity = String(university || "").trim();
  const normalizedQuery = normalizeMatchupSearchText(query || "");
  const normalizedExcludePlayerId = String(excludePlayerId || "").trim();

  return players.filter((player) => {
    if (normalizedExcludePlayerId && player.id === normalizedExcludePlayerId) return false;
    if (normalizedUniversity && String(player.university || "") !== normalizedUniversity) return false;
    if (
      normalizedQuery &&
      !normalizeMatchupSearchText(player.name).includes(normalizedQuery) &&
      !normalizeMatchupSearchText(player.nickname || "").includes(normalizedQuery)
    ) {
      return false;
    }
    return true;
  });
}

export function getSharedMatchupGender(
  player1: Pick<MatchupPlayerSummary, "gender">,
  player2: Pick<MatchupPlayerSummary, "gender">
) {
  const left = String(player1.gender || "").trim();
  const right = String(player2.gender || "").trim();
  return left && left === right ? left : "";
}

function uniqueNameCandidates(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push(normalized);
  }

  return candidates;
}

export function getMatchupNameCandidates(player: Pick<MatchupPlayerSummary, "name" | "nickname">) {
  const name = String(player.name || "").trim();
  const nickname = String(player.nickname || "").trim();
  return uniqueNameCandidates([name, REAL_NAME_MAP[name], nickname, REAL_NAME_MAP[nickname]]);
}

export function buildH2HQueryParams(
  player1: Pick<MatchupPlayerSummary, "name" | "nickname" | "gender">,
  player2: Pick<MatchupPlayerSummary, "name" | "nickname" | "gender">
) {
  const leftNames = getMatchupNameCandidates(player1);
  const rightNames = getMatchupNameCandidates(player2);
  const params = new URLSearchParams({
    p1: leftNames[0] || player1.name,
    p2: rightNames[0] || player2.name,
  });

  const sharedGender = getSharedMatchupGender(player1, player2);
  if (sharedGender) params.set("gender", sharedGender);
  return params;
}

export function buildH2HCacheKey(
  player1: Pick<MatchupPlayerSummary, "id" | "gender">,
  player2: Pick<MatchupPlayerSummary, "id" | "gender">
) {
  const sharedGender = getSharedMatchupGender(player1, player2);
  return `${player1.id}:${player2.id}:${sharedGender || "all"}`;
}

function hasStableMatchupIds(
  player1: Pick<MatchupPlayerSummary, "id">,
  player2: Pick<MatchupPlayerSummary, "id">
) {
  return Boolean(String(player1.id || "").trim() && String(player2.id || "").trim());
}

async function fetchSingleH2H(
  player1: Pick<MatchupPlayerSummary, "id" | "name">,
  player2: Pick<MatchupPlayerSummary, "id" | "name">,
  player1Name: string,
  player2Name: string,
  gender?: string
) {
  const params = new URLSearchParams({ p1: player1Name, p2: player2Name });
  params.set("p1_id", player1.id);
  params.set("p2_id", player2.id);
  if (gender) params.set("gender", gender);

  const response = await fetch(`/api/stats/h2h?${params.toString()}`);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload as H2HStats | null;
}

export async function fetchH2HStats(
  player1: Pick<MatchupPlayerSummary, "id" | "name" | "nickname" | "gender">,
  player2: Pick<MatchupPlayerSummary, "id" | "name" | "nickname" | "gender">
) {
  const player1Candidates = getMatchupNameCandidates(player1);
  const player2Candidates = getMatchupNameCandidates(player2);
  const sharedGender = getSharedMatchupGender(player1, player2) || undefined;

  if (hasStableMatchupIds(player1, player2)) {
    return fetchSingleH2H(
      player1,
      player2,
      player1Candidates[0] || player1.name,
      player2Candidates[0] || player2.name,
      sharedGender
    );
  }

  return null;
}
