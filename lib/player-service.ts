
import { supabase } from "./supabase";
import { type Player } from "../types";
export type { Player };

// Public pages should consume website-serving data from Supabase through this layer.
// Local metadata and tmp reports remain admin / pipeline sources, not public page sources.
const PLAYER_SERVING_SELECT = [
  "broadcast_title, broadcast_url, channel_profile_image_url, created_at, detailed_stats, elo_point, eloboard_id, id, is_live, last_synced_at, live_thumbnail_url, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
] as const;

const PLAYER_HISTORY_SELECT =
  "id, name, race, photo_url, created_at, last_synced_at, match_history" as const;

const MATCH_SERVING_SELECT =
  "*, player1:players!player1_id(id, name, race, photo_url), player2:players!player2_id(id, name, race, photo_url), winner:players!winner_id(id, name)" as const;

type RosterPlayerOverride = {
  university?: string;
  tier?: string;
  race?: string;
  display_name?: string;
};

type SoopLivePreview = {
  isLive?: boolean;
  thumbnail?: string;
  title?: string;
  viewers?: string;
  nickname?: string;
  broad_start?: string;
};

function normalizeEntityIdForPlayer(player: Partial<Player> & { eloboard_id?: string | number | null; gender?: string | null }) {
  const rawEloboardId = String(player.eloboard_id || "").trim();
  if (/^eloboard:(male|female):/i.test(rawEloboardId)) {
    return rawEloboardId.toLowerCase();
  }
  const rawGender = String(player.gender || "").trim().toLowerCase();
  const gender = rawGender === "male" || rawGender === "female" ? rawGender : "";
  const wrId = rawEloboardId;
  if (!gender || !wrId) return null;
  return `eloboard:${gender}:${wrId}`;
}

function loadRosterOverrides(): Map<string, RosterPlayerOverride> {
  const overrides = new Map<string, RosterPlayerOverride>();
  if (typeof window !== "undefined") return overrides;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const projectsDir = path.join(process.cwd(), "data", "metadata", "projects");
  if (!fs.existsSync(projectsDir)) return overrides;

  const readJson = <T,>(filePath: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
    } catch {
      return null;
    }
  };

  const projectDirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const code of projectDirs) {
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    const doc = readJson<{ roster?: Array<{ entity_id?: string; team_name?: string; tier?: string; race?: string; display_name?: string }> }>(filePath);
    const roster = Array.isArray(doc?.roster) ? doc.roster : [];
    for (const player of roster) {
      const entityId = String(player?.entity_id || "").trim();
      if (!entityId) continue;
      overrides.set(entityId, {
        university: String(player?.team_name || "").trim() || undefined,
        tier: String(player?.tier || "").trim() || undefined,
        race: String(player?.race || "").trim() || undefined,
        display_name: String(player?.display_name || "").trim() || undefined,
      });
    }
  }

  return overrides;
}

function applyRosterOverride<T extends Partial<Player> & { eloboard_id?: string | number | null; gender?: string | null }>(
  player: T,
  overrides: Map<string, RosterPlayerOverride>
): T {
  const entityId = normalizeEntityIdForPlayer(player);
  if (!entityId) return player;
  const override = overrides.get(entityId);
  if (!override) return player;
  const canonicalName = String(player.name || "").trim();
  const displayName = String(override.display_name || "").trim();
  return {
    ...player,
    name: displayName || player.name,
    nickname:
      displayName && canonicalName && displayName !== canonicalName
        ? canonicalName
        : player.nickname,
    university: override.university ?? player.university,
    tier: override.tier ?? player.tier,
    race: override.race ?? player.race,
  };
}

function applyRosterOverrides<T extends Partial<Player> & { eloboard_id?: string | number | null; gender?: string | null }>(players: T[]) {
  const overrides = loadRosterOverrides();
  return players.map((player) => applyRosterOverride(player, overrides));
}

function loadSoopLivePreview(): Map<string, SoopLivePreview> {
  const previews = new Map<string, SoopLivePreview>();
  if (typeof window !== "undefined") return previews;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "soop_live_preview.v1.json");
  if (!fs.existsSync(filePath)) return previews;

  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as {
      channels?: Record<string, SoopLivePreview>;
    };
    const channels = json && typeof json.channels === "object" ? json.channels : {};
    for (const [soopId, preview] of Object.entries(channels)) {
      const key = String(soopId || "").trim();
      if (!key || !preview || typeof preview !== "object") continue;
      previews.set(key, preview);
    }
  } catch {
    return previews;
  }

  return previews;
}

function applySoopLivePreview<T extends Partial<Player> & { soop_id?: string | null }>(player: T): T {
  const soopId = String(player?.soop_id || "").trim();
  if (!soopId) return player;
  const previews = loadSoopLivePreview();
  const preview = previews.get(soopId);
  if (!preview) return player;

  return {
    ...player,
    is_live: typeof preview.isLive === "boolean" ? preview.isLive : player.is_live,
    broadcast_title: String(preview.title || "").trim() || player.broadcast_title,
    live_thumbnail_url: String(preview.thumbnail || "").trim() || player.live_thumbnail_url,
    nickname: String(preview.nickname || "").trim() || player.nickname,
  };
}

function applySoopLivePreviews<T extends Partial<Player> & { soop_id?: string | null }>(players: T[]) {
  return players.map((player) => applySoopLivePreview(player));
}

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
    return applySoopLivePreviews(applyRosterOverrides(data || []));
  },

  /** 특정 ID의 선수 정보 가져오기 */
  async getPlayerById(id: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return applySoopLivePreview(applyRosterOverride(data, loadRosterOverrides()));
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
    return player ? applyRosterOverride(player, loadRosterOverrides()) : null;
  },

  /** 현재 방송 중인 선수들만 가져오기 */
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return applyRosterOverrides(data || []);
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
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .ilike("name", `%${query}%`)
      .limit(10);
    
    if (error) throw error;
    return applyRosterOverrides(data || []);
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
  }
};
