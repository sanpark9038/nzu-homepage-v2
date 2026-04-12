
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
const PLAYER_SERVING_SELECT = [
  "broadcast_title, broadcast_url, channel_profile_image_url, created_at, detailed_stats, elo_point, eloboard_id, id, is_live, last_synced_at, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
] as const;

const PLAYER_HISTORY_SELECT =
  "channel_profile_image_url, id, name, race, photo_url, created_at, last_synced_at, match_history" as const;

const MATCH_SERVING_SELECT =
  "*, player1:players!player1_id(channel_profile_image_url, id, name, race, photo_url), player2:players!player2_id(channel_profile_image_url, id, name, race, photo_url), winner:players!winner_id(id, name)" as const;

type StoredMatchHistoryItem = {
  match_date?: string | null;
  matchDate?: string | null;
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

function synthesizeMatchesFromHistory(player: StoredPlayerHistoryRecord, limit: number) {
  const history = normalizeStoredMatchHistory(player?.match_history);
  const playerId = String(player?.id || "");
  const playerName = String(player?.name || "알 수 없음");
  const playerRace = String(player?.race || "");
  const playerPhoto = player?.photo_url || null;

  return history.slice(0, limit).map((item, index: number) => {
    const opponentName = String(item?.opponent_name || item?.opponentName || "알 수 없음").trim() || "알 수 없음";
    const opponentRace = normalizeHistoryRace(item?.opponent_race || item?.opponentRace);
    const opponentId = buildHistoryOpponentId(playerId, opponentName, opponentRace);
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

export const playerService = {
  /** 전적(ELO) 순으로 모든 선수 가져오기 */
  async getAllPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .order("elo_point", { ascending: false, nullsFirst: false })
      .order("tier", { ascending: true });
    
    if (error) throw error;
    return applySoopLivePreviews(applyPlayerServingMetadata(data || []));
  },

  /** 특정 ID의 선수 정보 가져오기 */
  async getPlayerById(id: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return applySoopLivePreviewToOne(applyPlayerServingMetadataToOne(data));
  },

  /** UUID 접두사(8자리 등)로 선수 정보 가져오기 */
  async getPlayerByIdPrefix(prefix: string) {
    const normalizedPrefix = String(prefix || "").trim().toLowerCase();
    if (!normalizedPrefix) return null;

    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .order("elo_point", { ascending: false, nullsFirst: false });

    if (error) throw error;
    const player = (data || []).find((row) => String(row.id || "").toLowerCase().startsWith(normalizedPrefix)) || null;
    return player ? applySoopLivePreviewToOne(applyPlayerServingMetadataToOne(player)) : null;
  },

  /** 현재 방송 중인 선수들만 가져오기 */
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return applySoopLivePreviews(applyPlayerServingMetadata(data || []));
  },

  /** 특정 선수의 매치 기록 가져오기 */
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

  /** 최근 매치 기록 가져오기 (전역) */
  async getRecentMatches(limit = 10) {
    const { data, error } = await supabase
      .from("matches")
      .select(MATCH_SERVING_SELECT)
      .order("match_date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 최근 Eloboard 매치 기록 가져오기 (전역) */
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

  /** 모든 선수 검색 (이름 기준) */
  async searchPlayers(query: string) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const players = await this.getAllPlayers();
    return players
      .filter((player) => {
        const name = normalizeSearchText(player.name);
        const nickname = normalizeSearchText(player.nickname);
        const aliasMatches = getPlayerSearchAliases(player).some((alias) =>
          normalizeSearchText(alias).includes(normalizedQuery)
        );
        return name.includes(normalizedQuery) || nickname.includes(normalizedQuery) || aliasMatches;
      })
      .sort((a, b) => {
        const aAliasExact = getPlayerSearchAliases(a).some((alias) => normalizeSearchText(alias) === normalizedQuery);
        const bAliasExact = getPlayerSearchAliases(b).some((alias) => normalizeSearchText(alias) === normalizedQuery);
        if (aAliasExact !== bAliasExact) return aAliasExact ? -1 : 1;

        const aName = normalizeSearchText(a.name);
        const bName = normalizeSearchText(b.name);
        const aNickname = normalizeSearchText(a.nickname);
        const bNickname = normalizeSearchText(b.nickname);
        const aExact = aName === normalizedQuery || aNickname === normalizedQuery;
        const bExact = bName === normalizedQuery || bNickname === normalizedQuery;
        if (aExact !== bExact) return aExact ? -1 : 1;

        return Number(b.elo_point || 0) - Number(a.elo_point || 0);
      })
      .slice(0, 10);
  },

  /** 모든 대학 목록 가져오기 */
  async getAllUniversities() {
    const players = await this.getAllPlayers();
    const univs = Array.from(new Set(players.map((item) => item.university)));
    return (univs as string[]).filter(Boolean).sort();
  },

  /** 특정 대학의 선수 목록 가져오기 */
  async getPlayersByUniversity(univ: string) {
    const players = await this.getAllPlayers();
    return players
      .filter((player) => String(player.university || "") === univ)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  },

  /** 두 선수 간의 상대 전적 가져오기 (전체 및 최근 3개월) */
  async getH2HStats(p1Id: string, p2Id: string) {
    if (!p1Id || !p2Id) return { overall: [0, 0], recent: [0, 0] };

    // 두 선수의 이름과 P1의 경기 기록을 가져옴
    const { data: players, error } = await supabase
      .from('players')
      .select('id, name, match_history')
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

    const p2Name = p2.name;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const stats = (p1.match_history as any[]).reduce((acc, m) => {
      // 상대방 이름이 매칭되는지 확인 (불필요한 공백 제거)
      if (m.opponent_name?.trim() === p2Name.trim()) {
        const matchDate = m.match_date ? new Date(m.match_date) : null;
        const isRecent = matchDate ? matchDate > threeMonthsAgo : false;

        if (m.is_win) {
          acc.overall[0]++;
          if (isRecent) acc.recent[0]++;
        } else {
          // P1이 졌다면 P2가 이긴 것 (1v1 기준)
          acc.overall[1]++;
          if (isRecent) acc.recent[1]++;
        }
      }
      return acc;
    }, { overall: [0, 0], recent: [0, 0] });

    return stats;
  }
};
