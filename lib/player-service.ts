
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { type Player } from "../types";
import {
  applyPlayerServingMetadata,
  applyPlayerServingMetadataToOne,
  getPlayerSearchAliases,
  isExactPlayerSearchMatch,
  normalizeSearchText,
} from "./player-serving-metadata";
import { applySoopLivePreviewToOne, applySoopLivePreviews } from "./player-live-overlay";
export type { Player };
export { isExactPlayerSearchMatch };

// Public pages should consume website-serving data from Supabase through this layer.
// Local metadata and tmp reports remain admin / pipeline sources, not public page sources.
const PLAYER_LIST_SELECT = [
  "broadcast_title, broadcast_url, channel_profile_image_url, elo_point, eloboard_id, id, is_live, live_thumbnail_url, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
] as const;

const PLAYER_DETAIL_SELECT = [
  "broadcast_title, broadcast_url, channel_profile_image_url, created_at, detailed_stats, elo_point, eloboard_id, id, is_live, last_synced_at, live_thumbnail_url, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
] as const;

const PLAYER_HISTORY_SELECT =
  "channel_profile_image_url, id, name, race, photo_url, created_at, last_synced_at, match_history" as const;

const MATCH_SERVING_SELECT =
  "*, player1:players!player1_id(channel_profile_image_url, id, name, race, photo_url), player2:players!player2_id(channel_profile_image_url, id, name, race, photo_url), winner:players!winner_id(id, name)" as const;

type StoredMatchHistoryItem = {
  match_date?: string | null;
  matchDate?: string | null;
  opponent_entity_id?: string | null;
  opponentEntityId?: string | null;
  opponent_name?: string | null;
  opponentName?: string | null;
  opponent_race?: string | null;
  opponentRace?: string | null;
  map_name?: string | null;
  mapName?: string | null;
  is_win?: boolean | null;
  isWin?: boolean | null;
  note?: string | null;
};
type StoredPlayerHistoryRecord = {
  id: string;
  name: string;
  race: string | null;
  photo_url: string | null;
  created_at: string | null;
  last_synced_at: string | null;
  match_history: StoredMatchHistoryItem[] | null;
};

type H2HHistoryEntry = {
  match_date: string | null;
  map_name: string | null;
  is_win: boolean;
};

type MinimalH2HPlayerRow = {
  id: string;
  eloboard_id?: string | null;
  name: string | null;
  nickname?: string | null;
  race?: string | null;
  match_history?: StoredMatchHistoryItem[] | null;
};

function applyServingMetadataLayer(players: Player[]) {
  return applyPlayerServingMetadata(players);
}

function applyServingMetadataLayerToOne(player: Player) {
  return applyPlayerServingMetadataToOne(player);
}

function applyLiveOverlayLayer(players: Player[]) {
  return applySoopLivePreviews(players);
}

function applyLiveOverlayLayerToOne(player: Player) {
  return applySoopLivePreviewToOne(player);
}

function applyPlayerServiceView(players: Player[]) {
  return applyLiveOverlayLayer(applyServingMetadataLayer(players));
}

function applyPlayerServiceViewToOne(player: Player) {
  return applyLiveOverlayLayerToOne(applyServingMetadataLayerToOne(player));
}

async function fetchPlayersForList() {
  const { data, error } = await supabase
    .from("players")
    .select(PLAYER_LIST_SELECT[0])
    .order("elo_point", { ascending: false, nullsFirst: false })
    .order("tier", { ascending: true });

  if (error) throw error;
  return applyPlayerServiceView((data || []) as Player[]);
}

const fetchCachedPlayersForList = unstable_cache(fetchPlayersForList, ["public-players-list-v1"], {
  revalidate: 300,
  tags: ["public-players-list"],
});

function hasPlayerSearchAliasMatch(player: Partial<Player>, normalizedQuery: string) {
  return getPlayerSearchAliases(player).some((alias) => normalizeSearchText(alias).includes(normalizedQuery));
}

function hasExactPlayerSearchAliasMatch(player: Partial<Player>, normalizedQuery: string) {
  return getPlayerSearchAliases(player).some((alias) => normalizeSearchText(alias) === normalizedQuery);
}

function rankPlayerSearchResults(a: Partial<Player>, b: Partial<Player>, normalizedQuery: string) {
  const aAliasExact = hasExactPlayerSearchAliasMatch(a, normalizedQuery);
  const bAliasExact = hasExactPlayerSearchAliasMatch(b, normalizedQuery);
  if (aAliasExact !== bAliasExact) return aAliasExact ? -1 : 1;

  const aName = normalizeSearchText(a.name);
  const bName = normalizeSearchText(b.name);
  const aNickname = normalizeSearchText(a.nickname);
  const bNickname = normalizeSearchText(b.nickname);
  const aExact = aName === normalizedQuery || aNickname === normalizedQuery;
  const bExact = bName === normalizedQuery || bNickname === normalizedQuery;
  if (aExact !== bExact) return aExact ? -1 : 1;

  return Number(b.elo_point || 0) - Number(a.elo_point || 0);
}

function normalizeStoredMatchHistory(value: unknown): StoredMatchHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredMatchHistoryItem => Boolean(item) && typeof item === "object");
}

function normalizeHistoryRace(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

function buildHistoryOpponentId(playerId: string, opponentName: string, opponentRace: string) {
  const nameKey = String(opponentName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const raceKey = normalizeHistoryRace(opponentRace);
  return `history-opponent:${playerId}:${nameKey}:${raceKey}`;
}

function resolveHistoryOpponentId(playerId: string, item: StoredMatchHistoryItem) {
  const directId = String(item?.opponent_entity_id || item?.opponentEntityId || "").trim();
  if (directId) return directId;
  return buildHistoryOpponentId(
    playerId,
    String(item?.opponent_name || item?.opponentName || ""),
    String(item?.opponent_race || item?.opponentRace || "")
  );
}

function synthesizeMatchesFromHistory(player: StoredPlayerHistoryRecord, limit: number) {
  const history = normalizeStoredMatchHistory(player?.match_history);
  const playerId = String(player?.id || "");
  const playerName = String(player?.name || "?????놁쓬");
  const playerRace = String(player?.race || "");
  const playerPhoto = player?.photo_url || null;

  return history.slice(0, limit).map((item, index: number) => {
    const opponentName = String(item?.opponent_name || item?.opponentName || "?????놁쓬").trim() || "?????놁쓬";
    const opponentRace = normalizeHistoryRace(item?.opponent_race || item?.opponentRace);
    const opponentId = resolveHistoryOpponentId(playerId, item);
    const isWin = Boolean(item?.is_win ?? item?.isWin);
    const winnerId = isWin ? playerId : opponentId;
    return {
      id: `history-${playerId}-${index}`,
      created_at: player?.last_synced_at || player?.created_at || new Date().toISOString(),
      event_name: item?.note || null,
      is_university_battle: null,
      map_name: item?.map_name || item?.mapName || null,
      match_date: item?.match_date || item?.matchDate || null,
      player1_id: playerId,
      player2_id: opponentId,
      winner_id: winnerId,
      player1: {
        id: playerId,
        name: playerName,
        race: playerRace,
        photo_url: playerPhoto,
      },
      player2: {
        id: opponentId,
        name: opponentName,
        race: opponentRace,
        photo_url: null,
      },
      winner: {
        id: winnerId,
        name: isWin ? playerName : opponentName,
      },
    };
  });
}

function buildDetailedH2HStats(
  p1: Pick<MinimalH2HPlayerRow, "name">,
  p2: Pick<MinimalH2HPlayerRow, "name">,
  entries: H2HHistoryEntry[]
) {
  const total = entries.length;
  const wins = entries.filter((entry) => entry.is_win).length;
  const losses = total - wins;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentEntries = entries.filter((entry) => {
    if (!entry.match_date) return false;
    const matchDate = new Date(entry.match_date);
    return !Number.isNaN(matchDate.getTime()) && matchDate >= ninetyDaysAgo;
  });
  const recentWins = recentEntries.filter((entry) => entry.is_win).length;
  const recentLosses = recentEntries.length - recentWins;

  const mapStats = entries.reduce<Record<string, { w: number; l: number }>>((acc, entry) => {
    const mapName = String(entry.map_name || "").trim() || "Unknown Map";
    if (!acc[mapName]) acc[mapName] = { w: 0, l: 0 };
    if (entry.is_win) acc[mapName].w += 1;
    else acc[mapName].l += 1;
    return acc;
  }, {});

  const recentMatches = entries.slice(0, 10).map((entry, index) => ({
    id: `h2h-${index}`,
    player_name: String(p1.name || ""),
    opponent_name: String(p2.name || ""),
    match_date: entry.match_date,
    map: entry.map_name,
    is_win: entry.is_win,
    result_text: entry.is_win ? "+" : "-",
    note: null,
  })) as unknown as import("../types").EloMatch[];

  return {
    summary: {
      total,
      wins,
      losses,
      winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0",
      momentum90: {
        total: recentEntries.length,
        wins: recentWins,
        losses: recentLosses,
        winRate: recentEntries.length > 0 ? ((recentWins / recentEntries.length) * 100).toFixed(1) : "0.0",
      },
    },
    mapStats,
    recentMatches,
  };
}

function buildDetailedHistoryEntries(
  p1: MinimalH2HPlayerRow,
  p2: MinimalH2HPlayerRow
): H2HHistoryEntry[] {
  const history = normalizeStoredMatchHistory(p1.match_history);
  if (history.length === 0) return [];

  const p2IdentityCandidates = new Set<string>(
    [String(p2.id || "").trim(), String(p2.eloboard_id || "").trim()].filter(Boolean)
  );
  const p2NameCandidates = new Set<string>(
    [String(p2.name || "").trim(), String(p2.nickname || "").trim()]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
  );

  return history
    .filter((item) => {
      const historyOpponentEntityId = String(item.opponent_entity_id || item.opponentEntityId || "").trim();
      if (historyOpponentEntityId) {
        return p2IdentityCandidates.has(historyOpponentEntityId);
      }
      return p2NameCandidates.has(normalizeSearchText(item.opponent_name || item.opponentName));
    })
    .map((item) => ({
      match_date: item.match_date || item.matchDate || null,
      map_name: item.map_name || item.mapName || null,
      is_win: Boolean(item.is_win ?? item.isWin),
    }))
    .sort((left, right) => String(right.match_date || "").localeCompare(String(left.match_date || "")));
}

function buildDetailedServingEntries(
  p1Id: string,
  p2Id: string,
  matches: Array<{
    match_date?: string | null;
    map_name?: string | null;
    player1_id?: string | null;
    player2_id?: string | null;
    winner_id?: string | null;
  }>
): H2HHistoryEntry[] {
  return matches
    .filter((match) => {
      const left = String(match.player1_id || "");
      const right = String(match.player2_id || "");
      return (left === p1Id && right === p2Id) || (left === p2Id && right === p1Id);
    })
    .map((match) => ({
      match_date: match.match_date || null,
      map_name: match.map_name || null,
      is_win: String(match.winner_id || "") === p1Id,
    }))
    .sort((left, right) => String(right.match_date || "").localeCompare(String(left.match_date || "")));
}

export const playerService = {
  async getCachedPlayersList() {
    return fetchCachedPlayersForList();
  },
  /** ?꾩쟻(ELO) ?쒖쑝濡?紐⑤뱺 ?좎닔 媛?몄삤湲?*/
  async getAllPlayers() {
    return fetchPlayersForList();
  },

  /** ?뱀젙 ID???좎닔 ?뺣낫 媛?몄삤湲?*/
  async getPlayerById(id: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_DETAIL_SELECT[0])
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return applyPlayerServiceViewToOne(data as Player);
  },

  /** UUID ?묐몢??8?먮━ ??濡??좎닔 ?뺣낫 媛?몄삤湲?*/
  async getPlayerByIdPrefix(prefix: string) {
    const normalizedPrefix = String(prefix || "").trim().toLowerCase();
    if (!normalizedPrefix) return null;

    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_LIST_SELECT[0])
      .order("elo_point", { ascending: false, nullsFirst: false });

    if (error) throw error;
    const player = (data || []).find((row) => String(row.id || "").toLowerCase().startsWith(normalizedPrefix)) || null;
    return player ? applyPlayerServiceViewToOne(player as Player) : null;
  },

  /** ?꾩옱 諛⑹넚 以묒씤 ?좎닔?ㅻ쭔 媛?몄삤湲?*/
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_LIST_SELECT[0])
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return applyPlayerServiceView((data || []) as Player[]);
  },

  /** ?뱀젙 ?좎닔??留ㅼ튂 湲곕줉 媛?몄삤湲?*/
  async getPlayerMatches(playerId: string, limit = 10) {
    const { data, error } = await supabase
      .from('matches')
      .select(MATCH_SERVING_SELECT)
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order('match_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    if (data && data.length > 0) return data;

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select(PLAYER_HISTORY_SELECT)
      .eq("id", playerId)
      .single();

    if (playerError) throw playerError;
    return synthesizeMatchesFromHistory(
      {
        ...player,
        match_history: normalizeStoredMatchHistory(player?.match_history),
      },
      limit
    );
  },

  /** 理쒓렐 留ㅼ튂 湲곕줉 媛?몄삤湲?(?꾩뿭) */
  async getRecentMatches(limit = 10) {
    const { data, error } = await supabase
      .from("matches")
      .select(MATCH_SERVING_SELECT)
      .order("match_date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 理쒓렐 Eloboard 留ㅼ튂 湲곕줉 媛?몄삤湲?(?꾩뿭) */
  async getRecentEloMatches(limit = 20) {
    const { data, error } = await supabase
      .from("eloboard_matches")
      .select("*")
      .order("match_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 紐⑤뱺 ?좎닔 寃??(?대쫫 湲곗?) */
  async searchPlayers(query: string) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const players = await this.getCachedPlayersList();
    return players
      .filter((player) => {
        const name = normalizeSearchText(player.name);
        const nickname = normalizeSearchText(player.nickname);
        const aliasMatches = hasPlayerSearchAliasMatch(player, normalizedQuery);
        return name.includes(normalizedQuery) || nickname.includes(normalizedQuery) || aliasMatches;
      })
      .sort((a, b) => rankPlayerSearchResults(a, b, normalizedQuery))
      .slice(0, 10);
  },

  /** 紐⑤뱺 ???紐⑸줉 媛?몄삤湲?*/
  async getAllUniversities() {
    const players = await this.getCachedPlayersList();
    const univs = Array.from(new Set(players.map((item) => item.university)));
    return (univs as string[]).filter(Boolean).sort();
  },

  /** ?뱀젙 ??숈쓽 ?좎닔 紐⑸줉 媛?몄삤湲?*/
  async getPlayersByUniversity(univ: string) {
    const players = await this.getCachedPlayersList();
    return players
      .filter((player) => String(player.university || "") === univ)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  },

  /** ???좎닔 媛꾩쓽 ?곷? ?꾩쟻 媛?몄삤湲?(?꾩껜 諛?理쒓렐 3媛쒖썡) */
  async getDetailedH2HStats(p1Id: string, p2Id: string) {
    if (!p1Id || !p2Id) {
      return buildDetailedH2HStats({ name: "" }, { name: "" }, []);
    }

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, eloboard_id, name, nickname, race, match_history")
      .in("id", [p1Id, p2Id]);

    if (playersError || !players || players.length < 2) {
      console.error("Error fetching players for detailed H2H:", playersError);
      return buildDetailedH2HStats({ name: "" }, { name: "" }, []);
    }

    const p1 = players.find((player) => player.id === p1Id) as MinimalH2HPlayerRow | undefined;
    const p2 = players.find((player) => player.id === p2Id) as MinimalH2HPlayerRow | undefined;

    if (!p1 || !p2) {
      return buildDetailedH2HStats({ name: "" }, { name: "" }, []);
    }

    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("match_date, map_name, player1_id, player2_id, winner_id")
      .or(`and(player1_id.eq.${p1Id},player2_id.eq.${p2Id}),and(player1_id.eq.${p2Id},player2_id.eq.${p1Id})`)
      .order("match_date", { ascending: false });

    if (matchesError) {
      console.error("Error fetching serving matches for detailed H2H:", matchesError);
    }

    const servingEntries = buildDetailedServingEntries(
      p1Id,
      p2Id,
      (matches || []) as Array<{
        match_date?: string | null;
        map_name?: string | null;
        player1_id?: string | null;
        player2_id?: string | null;
        winner_id?: string | null;
      }>
    );

    if (servingEntries.length > 0) {
      return buildDetailedH2HStats(p1, p2, servingEntries);
    }

    return buildDetailedH2HStats(p1, p2, buildDetailedHistoryEntries(p1, p2));
  },

  async getH2HStats(p1Id: string, p2Id: string) {
    if (!p1Id || !p2Id) return { overall: [0, 0], recent: [0, 0] };

    // ???좎닔???대쫫怨?P1??寃쎄린 湲곕줉??媛?몄샂
    const { data: players, error } = await supabase
      .from('players')
      .select('id, eloboard_id, name, nickname, match_history')
      .in('id', [p1Id, p2Id]);

    if (error || !players || players.length < 2) {
      console.error('Error fetching players for H2H:', error);
      return { overall: [0, 0], recent: [0, 0] };
    }

    const p1 = players.find(p => p.id === p1Id);
    const p2 = players.find(p => p.id === p2Id);

    if (!p1 || !p2 || !p1.match_history || !Array.isArray(p1.match_history)) {
      return { overall: [0, 0], recent: [0, 0] };
    }

    const p2IdentityCandidates = new Set<string>(
      [
        String(p2.id || "").trim(),
        String((p2 as { eloboard_id?: string | null }).eloboard_id || "").trim(),
      ].filter(Boolean)
    );
    const p2Candidates = new Set<string>(
      [
        String(p2.name || "").trim(),
        String(p2.nickname || "").trim(),
      ]
        .map((value) => normalizeSearchText(value))
        .filter(Boolean)
    );
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const stats = (p1.match_history as Array<{
      opponent_entity_id?: string | null;
      opponentEntityId?: string | null;
      opponent_name?: string | null;
      match_date?: string | null;
      is_win?: boolean | null;
    }>).reduce((acc, m) => {
      // ?곷?諛??대쫫??留ㅼ묶?섎뒗吏 ?뺤씤 (遺덊븘?뷀븳 怨듬갚 ?쒓굅)
      const historyOpponentEntityId = String(m.opponent_entity_id || m.opponentEntityId || "").trim();
      const opponentMatched = historyOpponentEntityId
        ? p2IdentityCandidates.has(historyOpponentEntityId)
        : p2Candidates.has(normalizeSearchText(m.opponent_name));
      if (opponentMatched) {
        const matchDate = m.match_date ? new Date(m.match_date) : null;
        const isRecent = matchDate ? matchDate > threeMonthsAgo : false;

        if (m.is_win) {
          acc.overall[0]++;
          if (isRecent) acc.recent[0]++;
        } else {
          // P1??議뚮떎硫?P2媛 ?닿릿 寃?(1v1 湲곗?)
          acc.overall[1]++;
          if (isRecent) acc.recent[1]++;
        }
      }
      return acc;
    }, { overall: [0, 0], recent: [0, 0] });

    return stats;
  }
};
