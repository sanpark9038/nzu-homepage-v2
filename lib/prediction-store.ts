import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isVercelDeployment as detectVercelDeployment } from "@/lib/admin-runtime";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import type { PublicAuthSession } from "@/lib/public-auth";

type PredictionMatchRow = Tables<"prediction_matches">;
type PredictionVoteRemoteRow = Tables<"prediction_votes">;
type PredictionVoteTotalRemoteRow = Database["public"]["Functions"]["prediction_visible_vote_totals"]["Returns"][number];
type PredictionMatchInsert = TablesInsert<"prediction_matches">;
type PredictionVoteInsert = TablesInsert<"prediction_votes">;

export type PredictionStoredStatus = "draft" | "open" | "closed" | "archived";
export type PredictionDerivedStatus = "draft" | "open" | "closing_soon" | "closed" | "result_published" | "archived";
export type PredictionMatchType = "team" | "individual";
export type PredictionTeamMode = "existing" | "direct";
export type PredictionEntryOrderStatus = "unknown" | "confirmed";

export type PredictionEntryMatchupConfig = {
  id?: string;
  label?: string;
  player_a_id?: string;
  player_b_id?: string;
};

export type PredictionConfigMatch = {
  id?: string;
  match_type?: PredictionMatchType | string;
  team_mode?: PredictionTeamMode | string;
  team_a_code?: string;
  team_a_name?: string | null;
  team_b_code?: string;
  team_b_name?: string | null;
  team_a_player_ids?: string[];
  team_b_player_ids?: string[];
  entry_order_status?: PredictionEntryOrderStatus | string;
  entry_matchups?: PredictionEntryMatchupConfig[];
  start_at?: string;
  start_time_tbd?: boolean;
  close_at?: string;
  title?: string;
  status?: PredictionStoredStatus | string;
  result_team_code?: string | null;
  result_published_at?: string | null;
  display_order?: number | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PredictionConfig = {
  schema_version?: string;
  updated_at?: string;
  description?: string;
  matches?: PredictionConfigMatch[];
};

export type PredictionVoteRow = {
  id?: string;
  voter_id: string;
  match_id: string;
  voter_provider?: string | null;
  voter_provider_user_id?: string | null;
  voter_display_name?: string | null;
  voter_avatar_url?: string | null;
  picked_team_code?: string | null;
  picked_player_id?: string | null;
  change_count?: number;
  created_at?: string | null;
  updated_at: string;
};

export type PredictionVoteTotalRow = {
  match_id: string;
  picked_team_code?: string | null;
  picked_player_id?: string | null;
  vote_count: number;
};

export type PredictionVoteDoc = {
  schema_version?: string;
  updated_at?: string;
  votes?: PredictionVoteRow[];
};

export type PredictionState = {
  matches: PredictionConfigMatch[];
  votes: PredictionVoteRow[];
  voteTotals?: PredictionVoteTotalRow[];
  source: "supabase" | "json";
  remote_enabled: boolean;
};

type PredictionStateLoadOptions = {
  matchIds?: string[];
  voteMatchIds?: string[];
  voterId?: string;
  includeVoteTotals?: boolean;
};

type WriteGuardInput = {
  hasRemoteEnv?: boolean;
  isVercelDeployment?: boolean;
};

type VoteValidationInput = {
  voterId: string;
  match: PredictionConfigMatch;
  pickedTeamCode?: string | null;
  pickedPlayerId?: string | null;
  existingVote?: PredictionVoteRow | null;
  now?: Date;
  enforceChangeLimit?: boolean;
};

const ROOT = process.cwd();
const PREDICTION_MATCHES_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "tournament_prediction_matches.v1.json"
);
const PREDICTION_VOTES_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "tournament_prediction_votes.v1.json"
);

const MAX_CHANGES_PER_MATCH = 1;
const CLOSING_SOON_MS = 30 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORED_STATUSES = new Set(["draft", "open", "closed", "archived"]);
const MATCH_TYPES = new Set(["team", "individual"]);
const TEAM_MODES = new Set(["existing", "direct"]);
const ENTRY_ORDER_STATUSES = new Set(["unknown", "confirmed"]);

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const item of value) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    rows.push(text);
  }
  return rows;
}

function normalizeMatchType(value: unknown): PredictionMatchType {
  const type = normalizeText(value).toLowerCase();
  return MATCH_TYPES.has(type) ? (type as PredictionMatchType) : "team";
}

function normalizeTeamMode(value: unknown): PredictionTeamMode {
  const mode = normalizeText(value).toLowerCase();
  return TEAM_MODES.has(mode) ? (mode as PredictionTeamMode) : "existing";
}

function normalizeEntryOrderStatus(value: unknown): PredictionEntryOrderStatus {
  const status = normalizeText(value).toLowerCase();
  return ENTRY_ORDER_STATUSES.has(status) ? (status as PredictionEntryOrderStatus) : "unknown";
}

function normalizeEntryMatchups(value: unknown): PredictionEntryMatchupConfig[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<PredictionEntryMatchupConfig[]>((rows, row, index) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const playerAId = normalizeText(item.player_a_id);
    const playerBId = normalizeText(item.player_b_id);
    if (!playerAId && !playerBId) return rows;
    rows.push({
        id: normalizeText(item.id) || `matchup-${index + 1}`,
        label: normalizeText(item.label),
        player_a_id: playerAId,
        player_b_id: playerBId,
    });
    return rows;
  }, []);
}

export function validatePredictionMatchForSave(match: PredictionConfigMatch) {
  const seen = new Set<string>();
  const playerIds = [
    ...(Array.isArray(match.team_a_player_ids) ? match.team_a_player_ids : []),
    ...(Array.isArray(match.team_b_player_ids) ? match.team_b_player_ids : []),
  ];

  for (const item of playerIds) {
    const id = normalizeText(item);
    if (!id) continue;
    if (seen.has(id)) {
      throw new Error("duplicate_prediction_player");
    }
    seen.add(id);
  }

  return true;
}

function normalizeStoredStatus(value: unknown): PredictionStoredStatus {
  const status = normalizeText(value).toLowerCase();
  return STORED_STATUSES.has(status) ? (status as PredictionStoredStatus) : "open";
}

function parseTime(value: unknown) {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function defaultCloseAt(startAt: string) {
  const startMs = parseTime(startAt);
  if (!startMs) return new Date().toISOString();
  return new Date(startMs - CLOSING_SOON_MS).toISOString();
}

function normalizeDisplayOrder(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function remoteId(value: unknown) {
  const id = normalizeText(value);
  return UUID_RE.test(id) ? id : randomUUID();
}

export function hasPredictionRemoteEnv() {
  return Boolean(
    normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
  );
}

export function assertPredictionWriteAllowed(input: WriteGuardInput = {}) {
  const hasRemoteEnv = input.hasRemoteEnv ?? hasPredictionRemoteEnv();
  const isVercelDeployment = input.isVercelDeployment ?? detectVercelDeployment();
  if (!hasRemoteEnv && isVercelDeployment) {
    throw new Error("prediction_supabase_required");
  }
  return true;
}

export function getPredictionVoterId(session: PublicAuthSession | null | undefined) {
  const provider = normalizeText(session?.provider);
  const providerUserId = normalizeText(session?.providerUserId);
  if (!provider || !providerUserId) {
    throw new Error("prediction_login_required");
  }
  return `${provider}:${providerUserId}`;
}

export function getPredictionVoteIdentity(session: PublicAuthSession | null | undefined) {
  return {
    voter_id: getPredictionVoterId(session),
    voter_provider: normalizeText(session?.provider) || null,
    voter_provider_user_id: normalizeText(session?.providerUserId) || null,
    voter_display_name: normalizeText(session?.displayName) || null,
    voter_avatar_url: normalizeNullableText(session?.avatarUrl),
  };
}

export function assertPredictionMatchCanBeDeleted(
  state: Pick<PredictionState, "matches" | "votes">,
  matchId: string
) {
  const normalizedMatchId = normalizeText(matchId);
  if (!state.matches.some((match) => normalizeText(match.id) === normalizedMatchId)) {
    throw new Error("prediction_match_not_found");
  }
  if (state.votes.some((vote) => normalizeText(vote.match_id) === normalizedMatchId)) {
    throw new Error("prediction_delete_has_votes");
  }
  return true;
}

export function removePredictionMatchAndVotes(
  state: Pick<PredictionState, "matches" | "votes">,
  matchId: string
) {
  const normalizedMatchId = normalizeText(matchId);
  if (!state.matches.some((match) => normalizeText(match.id) === normalizedMatchId)) {
    throw new Error("prediction_match_not_found");
  }
  return {
    matches: state.matches.filter((match) => normalizeText(match.id) !== normalizedMatchId),
    votes: state.votes.filter((vote) => normalizeText(vote.match_id) !== normalizedMatchId),
  };
}

export function getPredictionMyVotes(votes: PredictionVoteRow[], voterId: string) {
  const normalizedVoterId = normalizeText(voterId);
  if (!normalizedVoterId) return {};
  return votes
    .filter((vote) => vote.voter_id === normalizedVoterId)
    .reduce<Record<string, { teamCode?: string | null; playerId?: string | null }>>((acc, vote) => {
      const matchId = normalizeText(vote.match_id);
      if (!matchId) return acc;
      acc[matchId] = {
        teamCode: normalizeNullableText(vote.picked_team_code),
        playerId: normalizeNullableText(vote.picked_player_id),
      };
      return acc;
    }, {});
}

export function readPredictionConfig(): PredictionConfig {
  return readJson<PredictionConfig>(PREDICTION_MATCHES_PATH, { matches: [] });
}

export function readPredictionVotes() {
  const doc = readJson<PredictionVoteDoc>(PREDICTION_VOTES_PATH, { votes: [] });
  return Array.isArray(doc.votes) ? doc.votes : [];
}

function writePredictionVotes(rows: PredictionVoteRow[]) {
  writeJson(PREDICTION_VOTES_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description: "Public tournament prediction votes keyed by signed public auth session.",
    votes: rows,
  });
}

function writePredictionMatches(rows: PredictionConfigMatch[]) {
  const config = readPredictionConfig();
  writeJson(PREDICTION_MATCHES_PATH, {
    ...config,
    updated_at: new Date().toISOString(),
    matches: rows.map((match, index) => normalizeMatchConfig(match, index)),
  });
}

export function updatePredictionMatches(matches: PredictionConfigMatch[]) {
  writePredictionMatches(
    matches.map((match) => {
      validatePredictionMatchForSave(match);
      return match;
    })
  );
}

function normalizeMatchConfig(match: PredictionConfigMatch, index: number): PredictionConfigMatch {
  const startAt = normalizeText(match.start_at) || new Date().toISOString();
  const teamACode = normalizeText(match.team_a_code);
  const teamBCode = normalizeText(match.team_b_code);
  const title = normalizeText(match.title) || `${teamACode} vs ${teamBCode}`;
  return {
    id: normalizeText(match.id) || randomUUID(),
    match_type: normalizeMatchType(match.match_type),
    team_mode: normalizeTeamMode(match.team_mode),
    team_a_code: teamACode,
    team_a_name: normalizeNullableText(match.team_a_name),
    team_b_code: teamBCode,
    team_b_name: normalizeNullableText(match.team_b_name),
    team_a_player_ids: normalizeTextArray(match.team_a_player_ids),
    team_b_player_ids: normalizeTextArray(match.team_b_player_ids),
    entry_order_status: normalizeEntryOrderStatus(match.entry_order_status),
    entry_matchups: normalizeEntryMatchups(match.entry_matchups),
    start_at: startAt,
    start_time_tbd: match.start_time_tbd === true,
    close_at: normalizeText(match.close_at) || defaultCloseAt(startAt),
    title,
    status: normalizeStoredStatus(match.status),
    result_team_code: normalizeNullableText(match.result_team_code),
    result_published_at: normalizeNullableText(match.result_published_at),
    display_order: normalizeDisplayOrder(match.display_order, index),
    archived_at: normalizeNullableText(match.archived_at),
    created_at: normalizeNullableText(match.created_at),
    updated_at: new Date().toISOString(),
  };
}

function remoteMatchToConfig(row: PredictionMatchRow): PredictionConfigMatch {
  return {
    id: row.id,
    match_type: normalizeMatchType(row.match_type),
    team_mode: normalizeTeamMode(row.team_mode),
    team_a_code: row.team_a_code,
    team_a_name: row.team_a_name,
    team_b_code: row.team_b_code,
    team_b_name: row.team_b_name,
    team_a_player_ids: normalizeTextArray(row.team_a_player_ids),
    team_b_player_ids: normalizeTextArray(row.team_b_player_ids),
    entry_order_status: normalizeEntryOrderStatus(row.entry_order_status),
    entry_matchups: normalizeEntryMatchups(row.entry_matchups),
    start_at: row.start_at,
    start_time_tbd: row.start_time_tbd,
    close_at: row.close_at,
    title: row.title,
    status: normalizeStoredStatus(row.status),
    result_team_code: row.result_team_code,
    result_published_at: row.result_published_at,
    display_order: row.display_order,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function remoteVoteToLocal(row: PredictionVoteRemoteRow): PredictionVoteRow {
  return {
    id: row.id,
    voter_id: row.voter_id,
    match_id: row.match_id,
    voter_provider: row.voter_provider,
    voter_provider_user_id: row.voter_provider_user_id,
    voter_display_name: row.voter_display_name,
    voter_avatar_url: row.voter_avatar_url,
    picked_team_code: row.picked_team_code,
    picked_player_id: row.picked_player_id,
    change_count: row.change_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function remoteVoteTotalToLocal(row: PredictionVoteTotalRemoteRow): PredictionVoteTotalRow {
  return {
    match_id: String(row.match_id || ""),
    picked_team_code: row.picked_team_code,
    picked_player_id: row.picked_player_id,
    vote_count: Number(row.vote_count || 0),
  };
}

function scopedState(state: PredictionState, options: PredictionStateLoadOptions = {}): PredictionState {
  const matchIds = new Set(normalizeTextArray(options.matchIds));
  const voteMatchIds = new Set(normalizeTextArray(options.voteMatchIds));
  const voterId = normalizeText(options.voterId);

  return {
    ...state,
    matches:
      matchIds.size > 0
        ? state.matches.filter((match) => matchIds.has(normalizeText(match.id)))
        : state.matches,
    votes: state.votes.filter((vote) => {
      if (voteMatchIds.size > 0 && !voteMatchIds.has(normalizeText(vote.match_id))) return false;
      if (voterId && normalizeText(vote.voter_id) !== voterId) return false;
      return true;
    }),
  };
}

async function readRemotePredictionState(options: PredictionStateLoadOptions = {}): Promise<PredictionState> {
  const supabase = createSupabaseAdminClient();
  const matchIds = normalizeTextArray(options.matchIds);
  const voteMatchIds = normalizeTextArray(options.voteMatchIds);
  const voterId = normalizeText(options.voterId);
  const includeVoteTotals = options.includeVoteTotals === true;

  let matchQuery = supabase
    .from("prediction_matches")
    .select("*")
    .is("archived_at", null);
  if (matchIds.length > 0) {
    matchQuery = matchQuery.in("id", matchIds);
  }
  const { data: matches, error: matchError } = await matchQuery
    .order("display_order", { ascending: true })
    .order("start_at", { ascending: true });

  if (matchError) throw matchError;
  const visibleMatchIds = Array.isArray(matches)
    ? matches.map((row) => normalizeText(row.id)).filter(Boolean)
    : [];

  let voteTotals: PredictionVoteTotalRow[] | undefined;
  let shouldReadAllVotes = !includeVoteTotals;

  if (includeVoteTotals) {
    const rpcMatchIds = matchIds.length > 0 ? matchIds : null;
    const { data: totals, error: totalsError } = await supabase.rpc("prediction_visible_vote_totals", {
      match_ids: rpcMatchIds,
    });
    if (totalsError) {
      shouldReadAllVotes = true;
    } else {
      voteTotals = Array.isArray(totals) ? totals.map(remoteVoteTotalToLocal) : [];
    }
  }

  let votes: PredictionVoteRemoteRow[] = [];
  const effectiveVoteMatchIds =
    voteMatchIds.length > 0 ? voteMatchIds : includeVoteTotals && voterId ? visibleMatchIds : [];
  const shouldReadScopedVotes =
    Boolean(voterId && (!includeVoteTotals || effectiveVoteMatchIds.length > 0)) || voteMatchIds.length > 0;
  if (shouldReadAllVotes || shouldReadScopedVotes) {
    let voteQuery = supabase
      .from("prediction_votes")
      .select("*");
    if (!shouldReadAllVotes && effectiveVoteMatchIds.length > 0) {
      voteQuery = voteQuery.in("match_id", effectiveVoteMatchIds);
    }
    if (!shouldReadAllVotes && voterId) {
      voteQuery = voteQuery.eq("voter_id", voterId);
    }
    const { data, error: voteError } = await voteQuery
      .order("updated_at", { ascending: false });

    if (voteError) throw voteError;
    votes = Array.isArray(data) ? data : [];
  }

  return {
    matches: Array.isArray(matches) ? matches.map(remoteMatchToConfig) : [],
    votes: votes.map(remoteVoteToLocal),
    voteTotals,
    source: "supabase",
    remote_enabled: true,
  };
}

function readLocalPredictionState(options: PredictionStateLoadOptions = {}): PredictionState {
  return scopedState({
    matches: Array.isArray(readPredictionConfig().matches) ? readPredictionConfig().matches || [] : [],
    votes: readPredictionVotes(),
    voteTotals: undefined,
    source: "json",
    remote_enabled: hasPredictionRemoteEnv(),
  }, options);
}

export async function loadPredictionState(options: PredictionStateLoadOptions = {}): Promise<PredictionState> {
  if (hasPredictionRemoteEnv()) {
    try {
      return await readRemotePredictionState(options);
    } catch {
      return readLocalPredictionState(options);
    }
  }
  return readLocalPredictionState(options);
}

function matchToRemoteRow(match: PredictionConfigMatch, index: number): PredictionMatchInsert {
  const normalized = normalizeMatchConfig(match, index);
  return {
    id: remoteId(normalized.id),
    title: normalizeText(normalized.title) || "Prediction Match",
    match_type: normalizeMatchType(normalized.match_type),
    team_mode: normalizeTeamMode(normalized.team_mode),
    team_a_code: normalizeText(normalized.team_a_code),
    team_a_name: normalizeNullableText(normalized.team_a_name),
    team_b_code: normalizeText(normalized.team_b_code),
    team_b_name: normalizeNullableText(normalized.team_b_name),
    team_a_player_ids: normalizeTextArray(normalized.team_a_player_ids),
    team_b_player_ids: normalizeTextArray(normalized.team_b_player_ids),
    entry_order_status: normalizeEntryOrderStatus(normalized.entry_order_status),
    entry_matchups: normalizeEntryMatchups(normalized.entry_matchups),
    start_at: normalizeText(normalized.start_at) || new Date().toISOString(),
    start_time_tbd: normalized.start_time_tbd === true,
    close_at: normalizeText(normalized.close_at) || defaultCloseAt(normalized.start_at || ""),
    status: normalizeStoredStatus(normalized.status),
    result_team_code: normalizeNullableText(normalized.result_team_code),
    result_published_at: normalizeNullableText(normalized.result_published_at),
    display_order: normalizeDisplayOrder(normalized.display_order, index),
    archived_at: normalizeNullableText(normalized.archived_at),
    updated_at: new Date().toISOString(),
  };
}

async function saveRemotePredictionMatches(matches: PredictionConfigMatch[]) {
  const supabase = createSupabaseAdminClient();
  const rows = matches
    .map((match, index) => {
      validatePredictionMatchForSave(match);
      return matchToRemoteRow(match, index);
    })
    .filter((row) => row.team_a_code && row.team_b_code);
  if (rows.length === 0) return;

  const { error } = await supabase.from("prediction_matches").upsert(rows, {
    onConflict: "id",
  });
  if (error) throw error;
}

export async function savePredictionMatches(matches: PredictionConfigMatch[]) {
  assertPredictionWriteAllowed();
  if (hasPredictionRemoteEnv()) {
    await saveRemotePredictionMatches(matches);
    return;
  }
  updatePredictionMatches(matches);
}

function deleteLocalPredictionMatch(matchId: string) {
  const state = readLocalPredictionState();
  assertPredictionMatchCanBeDeleted(state, matchId);
  const normalizedMatchId = normalizeText(matchId);
  writePredictionMatches(
    state.matches.filter((match) => normalizeText(match.id) !== normalizedMatchId)
  );
}

function deleteLocalPredictionMatchWithVotes(matchId: string) {
  const state = readLocalPredictionState();
  const next = removePredictionMatchAndVotes(state, matchId);
  writePredictionMatches(next.matches);
  writePredictionVotes(next.votes);
}

async function deleteRemotePredictionMatch(matchId: string) {
  const normalizedMatchId = normalizeText(matchId);
  const supabase = createSupabaseAdminClient();

  const { data: matches, error: matchError } = await supabase
    .from("prediction_matches")
    .select("id")
    .eq("id", normalizedMatchId)
    .limit(1);
  if (matchError) throw matchError;
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error("prediction_match_not_found");
  }

  const { data: votes, error: voteError } = await supabase
    .from("prediction_votes")
    .select("id")
    .eq("match_id", normalizedMatchId)
    .limit(1);
  if (voteError) throw voteError;
  if (Array.isArray(votes) && votes.length > 0) {
    throw new Error("prediction_delete_has_votes");
  }

  const { error } = await supabase
    .from("prediction_matches")
    .delete()
    .eq("id", normalizedMatchId);
  if (error) throw error;
}

async function deleteRemotePredictionMatchWithVotes(matchId: string) {
  const normalizedMatchId = normalizeText(matchId);
  const supabase = createSupabaseAdminClient();

  const { data: matches, error: matchError } = await supabase
    .from("prediction_matches")
    .select("id")
    .eq("id", normalizedMatchId)
    .limit(1);
  if (matchError) throw matchError;
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error("prediction_match_not_found");
  }

  const { error: voteDeleteError } = await supabase
    .from("prediction_votes")
    .delete()
    .eq("match_id", normalizedMatchId);
  if (voteDeleteError) throw voteDeleteError;

  const { error } = await supabase
    .from("prediction_matches")
    .delete()
    .eq("id", normalizedMatchId);
  if (error) throw error;
}

export async function deletePredictionMatch(matchId: string) {
  assertPredictionWriteAllowed();
  if (hasPredictionRemoteEnv()) {
    await deleteRemotePredictionMatch(matchId);
    return;
  }
  deleteLocalPredictionMatch(matchId);
}

export async function deletePredictionMatchWithVotes(matchId: string) {
  assertPredictionWriteAllowed();
  if (hasPredictionRemoteEnv()) {
    await deleteRemotePredictionMatchWithVotes(matchId);
    return;
  }
  deleteLocalPredictionMatchWithVotes(matchId);
}

export function derivePredictionMatchStatus(
  match: PredictionConfigMatch,
  now: Date = new Date()
): PredictionDerivedStatus {
  const status = normalizeStoredStatus(match.status);
  if (status === "archived") return "archived";
  if (normalizeText(match.result_team_code) && normalizeText(match.result_published_at)) {
    return "result_published";
  }
  if (status === "draft") return "draft";
  if (status === "closed") return "closed";

  const closeMs = parseTime(match.close_at || defaultCloseAt(match.start_at || ""));
  const nowMs = now.getTime();
  if (closeMs && closeMs <= nowMs) return "closed";
  if (closeMs && closeMs - nowMs <= CLOSING_SOON_MS) return "closing_soon";
  return "open";
}

export function validatePredictionVote(input: VoteValidationInput) {
  const voterId = normalizeText(input.voterId);
  const matchId = normalizeText(input.match.id);
  if (!voterId || !matchId) throw new Error("voter_id and match_id are required");

  const status = derivePredictionMatchStatus(input.match, input.now || new Date());
  if (status !== "open" && status !== "closing_soon") {
    throw new Error("prediction_vote_closed");
  }

  const teamCode = normalizeNullableText(input.pickedTeamCode);
  if (
    teamCode &&
    teamCode !== normalizeText(input.match.team_a_code) &&
    teamCode !== normalizeText(input.match.team_b_code)
  ) {
    throw new Error("invalid_team_pick");
  }

  const playerId = normalizeNullableText(input.pickedPlayerId);
  const selectedPlayerIds = new Set([
    ...normalizeTextArray(input.match.team_a_player_ids),
    ...normalizeTextArray(input.match.team_b_player_ids),
  ]);
  if (playerId && selectedPlayerIds.size > 0 && !selectedPlayerIds.has(playerId)) {
    throw new Error("invalid_player_pick");
  }

  const existingVote = input.existingVote || null;
  const willChangeExisting = Boolean(
    existingVote &&
      ((existingVote.picked_team_code || null) !== teamCode ||
        (existingVote.picked_player_id || null) !== playerId)
  );
  const changeCount = Number(existingVote?.change_count || 0);
  const enforceChangeLimit = input.enforceChangeLimit ?? process.env.NODE_ENV === "production";

  if (enforceChangeLimit && existingVote && willChangeExisting && changeCount >= MAX_CHANGES_PER_MATCH) {
    throw new Error("prediction_change_limit_reached");
  }

  return {
    voter_id: voterId,
    match_id: matchId,
    picked_team_code: teamCode,
    picked_player_id: playerId,
    change_count: existingVote ? (willChangeExisting ? changeCount + 1 : changeCount) : 0,
    updated_at: new Date().toISOString(),
  };
}

function upsertLocalPredictionVote(next: PredictionVoteRow) {
  const votes = readPredictionVotes();
  const existingIndex = votes.findIndex(
    (row) => row.voter_id === next.voter_id && row.match_id === next.match_id
  );

  if (existingIndex >= 0) {
    votes[existingIndex] = {
      ...votes[existingIndex],
      ...next,
    };
  } else {
    votes.push(next);
  }

  writePredictionVotes(votes);
}

async function upsertRemotePredictionVote(next: PredictionVoteRow) {
  const supabase = createSupabaseAdminClient();
  const row: PredictionVoteInsert = {
    voter_id: next.voter_id,
    match_id: next.match_id,
    voter_provider: next.voter_provider || null,
    voter_provider_user_id: next.voter_provider_user_id || null,
    voter_display_name: next.voter_display_name || null,
    voter_avatar_url: next.voter_avatar_url || null,
    picked_team_code: next.picked_team_code || null,
    picked_player_id: next.picked_player_id || null,
    change_count: Number(next.change_count || 0),
    updated_at: next.updated_at,
  };
  const { error } = await supabase.from("prediction_votes").upsert(row, {
    onConflict: "voter_id,match_id",
  });
  if (error) throw error;
}

export async function upsertPredictionVote(input: {
  voterId: string;
  matchId: string;
  voterSession?: PublicAuthSession | null | undefined;
  pickedTeamCode?: string | null | undefined;
  pickedPlayerId?: string | null | undefined;
}) {
  assertPredictionWriteAllowed();
  const matchId = normalizeText(input.matchId);
  const state = await loadPredictionState({
    matchIds: [matchId],
    voteMatchIds: [matchId],
    voterId: normalizeText(input.voterId),
  });
  const match = state.matches.find((row) => normalizeText(row.id) === matchId);
  if (!match) throw new Error("prediction_match_not_found");

  const existingVote =
    state.votes.find((row) => row.voter_id === normalizeText(input.voterId) && row.match_id === matchId) || null;
  const nextPickedTeamCode =
    input.pickedTeamCode === undefined
      ? existingVote?.picked_team_code || null
      : input.pickedTeamCode;
  const nextPickedPlayerId =
    input.pickedPlayerId === undefined
      ? existingVote?.picked_player_id || null
      : input.pickedPlayerId;

  const validated = validatePredictionVote({
    voterId: input.voterId,
    match,
    pickedTeamCode: nextPickedTeamCode,
    pickedPlayerId: nextPickedPlayerId,
    existingVote,
  });
  const identity = input.voterSession
    ? getPredictionVoteIdentity(input.voterSession)
    : {
        voter_id: normalizeText(input.voterId),
        voter_provider: existingVote?.voter_provider || null,
        voter_provider_user_id: existingVote?.voter_provider_user_id || null,
        voter_display_name: existingVote?.voter_display_name || null,
        voter_avatar_url: existingVote?.voter_avatar_url || null,
      };
  const next: PredictionVoteRow = {
    ...validated,
    ...identity,
    voter_id: validated.voter_id,
  };

  if (hasPredictionRemoteEnv()) {
    await upsertRemotePredictionVote(next);
  } else {
    upsertLocalPredictionVote(next);
  }
}
