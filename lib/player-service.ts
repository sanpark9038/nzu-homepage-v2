
import { supabase } from "./supabase";
import { type Player } from "../types";
export type { Player };

// Public pages should consume website-serving data from Supabase through this layer.
// Local metadata and tmp reports remain admin / pipeline sources, not public page sources.
const PLAYER_SERVING_SELECT = [
  "broadcast_title, broadcast_url, created_at, detailed_stats, elo_point, eloboard_id, id, is_live, last_synced_at, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
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

type SoopIdentityOverride = {
  name?: string;
  soop_id?: string;
};

type SoopLivePreview = {
  isLive?: boolean;
  thumbnail?: string;
  title?: string;
  viewers?: string;
  nickname?: string;
  broad_start?: string;
};

type SoopLiveSnapshotDoc = {
  updated_at?: string;
  channels?: Record<string, SoopLivePreview>;
};

let cachedSearchAliasesMtimeMs: number | null = null;
let cachedSearchAliases = new Map<string, string[]>();

const SOOP_PREVIEW_LIVE_WINDOW_MS = 8 * 60 * 60 * 1000;
const SOOP_GENERATED_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
let cachedSoopLivePreviewMtimeMs: number | null = null;
let cachedSoopLivePreview = new Map<string, SoopLivePreview>();
let cachedSoopGeneratedSnapshotMtimeMs: number | null = null;
let cachedSoopGeneratedSnapshot = new Map<string, SoopLivePreview>();
let cachedSoopGeneratedSnapshotUpdatedAt: string | null = null;

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

function loadSoopIdentityOverrides(): Map<string, SoopIdentityOverride> {
  const overrides = new Map<string, SoopIdentityOverride>();
  if (typeof window !== "undefined") return overrides;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "scripts", "player_metadata.json");
  if (!fs.existsSync(filePath)) return overrides;

  try {
    const rows = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as Array<{
      name?: string;
      wr_id?: string | number;
      soop_user_id?: string;
    }>;
    for (const row of Array.isArray(rows) ? rows : []) {
      const wrId = String(row?.wr_id || "").trim();
      const soopId = String(row?.soop_user_id || "").trim();
      if (!wrId || !soopId) continue;
      overrides.set(wrId, {
        name: String(row?.name || "").trim() || undefined,
        soop_id: soopId,
      });
    }
  } catch {
    return overrides;
  }

  return overrides;
}

function extractWrId(player: Partial<Player> & { eloboard_id?: string | number | null }) {
  const rawEloboardId = String(player.eloboard_id || "").trim();
  if (!rawEloboardId) return null;
  if (/^\d+$/.test(rawEloboardId)) return rawEloboardId;
  const match = rawEloboardId.match(/(\d+)$/);
  return match ? match[1] : null;
}

function hasMixedEloboardIdentity(player: Partial<Player> & { eloboard_id?: string | number | null }) {
  return /^eloboard:(male|female):mix:\d+$/i.test(String(player.eloboard_id || "").trim());
}

function applyRosterOverride<T extends Partial<Player> & { eloboard_id?: string | number | null; gender?: string | null }>(
  player: T,
  overrides: Map<string, RosterPlayerOverride>,
  soopIdentityOverrides: Map<string, SoopIdentityOverride>
): T {
  const entityId = normalizeEntityIdForPlayer(player);
  const override = entityId ? overrides.get(entityId) : null;
  const wrId = extractWrId(player);
  const soopOverride = wrId && hasMixedEloboardIdentity(player) ? soopIdentityOverrides.get(wrId) : null;
  if (!override && !soopOverride) return player;
  const canonicalName = String(player.name || "").trim();
  const displayName = String(override?.display_name || "").trim();
  return {
    ...player,
    name: displayName || player.name,
    nickname:
      displayName && canonicalName && displayName !== canonicalName
        ? canonicalName
        : player.nickname,
    university: override?.university ?? player.university,
    tier: override?.tier ?? player.tier,
    race: override?.race ?? player.race,
    soop_id: soopOverride?.soop_id ?? player.soop_id,
  };
}

function applyRosterOverrides<T extends Partial<Player> & { eloboard_id?: string | number | null; gender?: string | null }>(players: T[]) {
  const overrides = loadRosterOverrides();
  const soopIdentityOverrides = loadSoopIdentityOverrides();
  return players.map((player) => applyRosterOverride(player, overrides, soopIdentityOverrides));
}

function loadSoopLiveSnapshotFile(filePath: string, cacheKey: "preview" | "generated") {
  const snapshots = new Map<string, SoopLivePreview>();
  let updatedAt: string | null = null;
  if (typeof window !== "undefined") return { snapshots, updatedAt };

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  if (!fs.existsSync(filePath)) {
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = null;
      cachedSoopLivePreview = snapshots;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = null;
      cachedSoopGeneratedSnapshot = snapshots;
      cachedSoopGeneratedSnapshotUpdatedAt = null;
    }
    return { snapshots, updatedAt };
  }

  try {
    const stat = fs.statSync(filePath);
    if (cacheKey === "preview" && cachedSoopLivePreviewMtimeMs === stat.mtimeMs) {
      return { snapshots: cachedSoopLivePreview, updatedAt: null };
    }
    if (cacheKey === "generated" && cachedSoopGeneratedSnapshotMtimeMs === stat.mtimeMs) {
      return { snapshots: cachedSoopGeneratedSnapshot, updatedAt: cachedSoopGeneratedSnapshotUpdatedAt };
    }
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = stat.mtimeMs;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = stat.mtimeMs;
    }
  } catch {
    if (cacheKey === "preview") {
      cachedSoopLivePreviewMtimeMs = null;
    } else {
      cachedSoopGeneratedSnapshotMtimeMs = null;
    }
  }

  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as SoopLiveSnapshotDoc;
    updatedAt = String(json?.updated_at || "").trim() || null;
    const channels = json && typeof json.channels === "object" ? json.channels : {};
    for (const [soopId, preview] of Object.entries(channels)) {
      const key = String(soopId || "").trim();
      if (!key || !preview || typeof preview !== "object") continue;
      snapshots.set(key, preview);
    }
  } catch {
    if (cacheKey === "preview") {
      cachedSoopLivePreview = snapshots;
    } else {
      cachedSoopGeneratedSnapshot = snapshots;
      cachedSoopGeneratedSnapshotUpdatedAt = updatedAt;
    }
    return { snapshots, updatedAt };
  }

  if (cacheKey === "preview") {
    cachedSoopLivePreview = snapshots;
  } else {
    cachedSoopGeneratedSnapshot = snapshots;
    cachedSoopGeneratedSnapshotUpdatedAt = updatedAt;
  }
  return { snapshots, updatedAt };
}

function loadSoopLivePreview() {
  const req = eval("require") as NodeRequire;
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "soop_live_preview.v1.json");
  return loadSoopLiveSnapshotFile(filePath, "preview").snapshots;
}

function loadSoopGeneratedLiveSnapshot() {
  const req = eval("require") as NodeRequire;
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "soop_live_snapshot.generated.v1.json");
  return loadSoopLiveSnapshotFile(filePath, "generated");
}

function isFreshGeneratedSnapshot(updatedAt: string | null) {
  const raw = String(updatedAt || "").trim();
  if (!raw) return false;
  const snapshotTime = new Date(raw);
  if (Number.isNaN(snapshotTime.getTime())) return false;
  const ageMs = Date.now() - snapshotTime.getTime();
  return ageMs >= 0 && ageMs <= SOOP_GENERATED_SNAPSHOT_MAX_AGE_MS;
}

function resolveSoopLiveEntry(soopId: string) {
  const previewEntry = loadSoopLivePreview().get(soopId);
  if (previewEntry) {
    return {
      entry: previewEntry,
      mode: "preview" as const,
      snapshotFresh: true,
    };
  }

  const generated = loadSoopGeneratedLiveSnapshot();
  const generatedEntry = generated.snapshots.get(soopId);
  if (generatedEntry) {
    return {
      entry: generatedEntry,
      mode: "generated" as const,
      snapshotFresh: isFreshGeneratedSnapshot(generated.updatedAt),
    };
  }

  return null;
}

function normalizeSoopAssetUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

function applySoopLivePreview<T extends Partial<Player> & { soop_id?: string | null }>(player: T): T {
  const soopId = String(player?.soop_id || "").trim();
  if (!soopId) return player;
  const resolved = resolveSoopLiveEntry(soopId);
  if (!resolved) return player;
  const preview = resolved.entry;

  const broadStartRaw = String(preview.broad_start || "").trim();
  const broadStart = broadStartRaw ? new Date(broadStartRaw.replace(" ", "T")) : null;
  const isFreshPreviewWindow =
    Boolean(preview.isLive) &&
    broadStart instanceof Date &&
    !Number.isNaN(broadStart.getTime()) &&
    Date.now() - broadStart.getTime() >= 0 &&
    Date.now() - broadStart.getTime() <= SOOP_PREVIEW_LIVE_WINDOW_MS;

  const hasExplicitSnapshot = true;
  const shouldApplyLivePreview =
    resolved.mode === "generated"
      ? resolved.snapshotFresh && Boolean(preview.isLive)
      : isFreshPreviewWindow || Boolean(preview.isLive);
  const fallbackIsLive = hasExplicitSnapshot ? false : player.is_live === true;
  const effectiveIsLive = shouldApplyLivePreview || fallbackIsLive;

  return {
    ...player,
    is_live: effectiveIsLive,
    broadcast_title: effectiveIsLive
      ? String(preview.title || "").trim() || player.broadcast_title
      : player.broadcast_title,
    live_thumbnail_url: effectiveIsLive
      ? normalizeSoopAssetUrl(preview.thumbnail) || player.live_thumbnail_url
      : null,
    live_viewers: effectiveIsLive ? String(preview.viewers || "").trim() || null : null,
    live_started_at: effectiveIsLive ? broadStartRaw || null : null,
    nickname: String(preview.nickname || "").trim() || player.nickname,
  };
}

function applySoopLivePreviews<T extends Partial<Player> & { soop_id?: string | null }>(players: T[]) {
  return players.map((player) => applySoopLivePreview(player));
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function loadSearchAliases(): Map<string, string[]> {
  const aliases = new Map<string, Set<string>>();
  if (typeof window !== "undefined") return new Map();

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const mappingPath = path.join(process.cwd(), "data", "metadata", "soop_channel_mappings.v1.json");
  const displayAliasPath = path.join(process.cwd(), "data", "metadata", "player_display_aliases.v1.json");

  const existingFiles = [mappingPath, displayAliasPath].filter((filePath) => fs.existsSync(filePath));
  if (!existingFiles.length) return new Map();

  try {
    const mtimeKey = existingFiles
      .map((filePath) => `${filePath}:${fs.statSync(filePath).mtimeMs}`)
      .join("|");
    const numericKey = Array.from(mtimeKey).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    if (cachedSearchAliasesMtimeMs === numericKey) {
      return cachedSearchAliases;
    }
    cachedSearchAliasesMtimeMs = numericKey;
  } catch {
    cachedSearchAliasesMtimeMs = null;
  }

  const pushAlias = (canonicalName: string, aliasName: string) => {
    const canonical = String(canonicalName || "").trim();
    const alias = String(aliasName || "").trim();
    if (!canonical || !alias || canonical === alias) return;
    const bucket = aliases.get(canonical) || new Set<string>();
    bucket.add(alias);
    aliases.set(canonical, bucket);
  };

  const readJson = <T,>(filePath: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
    } catch {
      return null;
    }
  };

  const mappingDoc = readJson<{ aliases?: Record<string, string> }>(mappingPath);
  const mappingAliases = mappingDoc && typeof mappingDoc.aliases === "object" ? mappingDoc.aliases : {};
  for (const [aliasName, canonicalName] of Object.entries(mappingAliases)) {
    pushAlias(String(canonicalName || ""), String(aliasName || ""));
  }

  const displayDoc = readJson<{ teams?: Record<string, Array<{ name?: string; display_name?: string }>> }>(displayAliasPath);
  const teams = displayDoc && typeof displayDoc.teams === "object" ? displayDoc.teams : {};
  for (const rows of Object.values(teams)) {
    for (const row of Array.isArray(rows) ? rows : []) {
      pushAlias(String(row?.name || ""), String(row?.display_name || ""));
    }
  }

  cachedSearchAliases = new Map(
    Array.from(aliases.entries()).map(([canonicalName, values]) => [canonicalName, Array.from(values)])
  );
  return cachedSearchAliases;
}

function getPlayerSearchAliases(player: Partial<Player>) {
  const canonicalName = String(player?.nickname || "").trim() || String(player?.name || "").trim();
  if (!canonicalName) return [];
  const aliases = loadSearchAliases();
  return aliases.get(canonicalName) || [];
}

export function isExactPlayerSearchMatch(player: Partial<Player>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  if (normalizeSearchText(player?.name) === normalizedQuery) return true;
  if (normalizeSearchText(player?.nickname) === normalizedQuery) return true;
  return getPlayerSearchAliases(player).some((alias) => normalizeSearchText(alias) === normalizedQuery);
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
    return applySoopLivePreview(
      applyRosterOverride(data, loadRosterOverrides(), loadSoopIdentityOverrides())
    );
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
    return player
      ? applySoopLivePreview(
          applyRosterOverride(player, loadRosterOverrides(), loadSoopIdentityOverrides())
        )
      : null;
  },

  /** 현재 방송 중인 선수들만 가져오기 */
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return applySoopLivePreviews(applyRosterOverrides(data || []));
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
  }
};
