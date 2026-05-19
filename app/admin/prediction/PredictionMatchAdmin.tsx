"use client";

import { CheckCircle2, Copy, Download, EyeOff, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { TierBadge } from "@/components/ui/nzu-badges";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";
import {
  buildPredictionVoterCsv,
  buildPredictionVoterRows,
  filterPredictionVoterRows,
  paginatePredictionVoterRows,
  summarizePredictionVoters,
  type PredictionVoterFilter,
} from "@/lib/prediction-admin-voters";
import type {
  PredictionConfigMatch,
  PredictionEntryMatchupConfig,
  PredictionVoteRow,
} from "@/lib/prediction-store";
import { cn } from "@/lib/utils";

type PlayerOption = {
  id: string;
  name: string;
  nickname?: string | null;
  race: string | null;
  tier: string | null;
};

type TeamInfo = {
  teamCode: string;
  teamName: string;
  players: PlayerOption[];
};

type MatchType = "team" | "individual";
type TeamMode = "direct" | "existing";
type EntryOrderStatus = "unknown" | "confirmed";
type StatusFilter = "all" | "draft" | "open" | "closed" | "result";

const DEFAULT_MATCH_OFFSET_DAYS = 1;
const PLAYER_SEARCH_RESULT_LIMIT = 8;
const FORCE_DELETE_CONFIRMATION = "투표 포함 삭제";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function defaultMatchTitle(type: MatchType) {
  return type === "team" ? "새 팀전 예측" : "새 개인전 예측";
}

function normalizeClientTitle(value: unknown, type: MatchType) {
  if (value === null || value === undefined) return defaultMatchTitle(type);
  return String(value);
}

function normalizeSaveTitle(value: unknown, type: MatchType) {
  return normalizeText(value) || defaultMatchTitle(type);
}

function toKstDateTimeInput(value: string | undefined | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function fromKstDateTimeInput(value: string) {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  return `${datePart}T${timePart}:00+09:00`;
}

function defaultStartAt(matchCount: number) {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_MATCH_OFFSET_DAYS + matchCount);
  date.setHours(20, 0, 0, 0);
  return date.toISOString();
}

function closeAtForStart(startAt: string) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "";
  return new Date(start.getTime() - 30 * 60 * 1000).toISOString();
}

function normalizePlayerSlots(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item));
}

function compactPlayerIds(value: unknown) {
  return normalizePlayerSlots(value).filter(Boolean);
}

function normalizeMatchType(value: unknown): MatchType {
  return normalizeText(value).toLowerCase() === "individual" ? "individual" : "team";
}

function normalizeTeamMode(value: unknown): TeamMode {
  return normalizeText(value).toLowerCase() === "existing" ? "existing" : "direct";
}

function normalizeEntryOrderStatus(value: unknown): EntryOrderStatus {
  return normalizeText(value).toLowerCase() === "confirmed" ? "confirmed" : "unknown";
}

function normalizeEntryMatchups(value: unknown): PredictionEntryMatchupConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((row, index) => ({
    id: normalizeText((row as PredictionEntryMatchupConfig | null)?.id) || `matchup-${index + 1}`,
    label: normalizeText((row as PredictionEntryMatchupConfig | null)?.label),
    player_a_id: normalizeText((row as PredictionEntryMatchupConfig | null)?.player_a_id),
    player_b_id: normalizeText((row as PredictionEntryMatchupConfig | null)?.player_b_id),
  }));
}

function compactEntryMatchups(value: unknown) {
  return normalizeEntryMatchups(value)
    .filter((row) => normalizeText(row.player_a_id) || normalizeText(row.player_b_id))
    .map((row, index) => ({
      ...row,
      id: normalizeText(row.id) || `matchup-${index + 1}`,
      label: normalizeText(row.label) || `매치${index + 1}`,
    }));
}

function createEmptyMatch(type: MatchType, index: number): PredictionConfigMatch {
  const id = crypto.randomUUID();
  const startAt = defaultStartAt(index);
  return {
    id,
    match_type: type,
    team_mode: "direct",
    title: defaultMatchTitle(type),
    team_a_code: type === "team" ? `event-a-${id.slice(0, 8)}` : "",
    team_b_code: type === "team" ? `event-b-${id.slice(0, 8)}` : "",
    team_a_name: type === "team" ? "A팀" : "",
    team_b_name: type === "team" ? "B팀" : "",
    team_a_player_ids: [],
    team_b_player_ids: [],
    entry_order_status: "unknown",
    entry_matchups: [],
    start_at: startAt,
    start_time_tbd: false,
    close_at: closeAtForStart(startAt),
    status: "draft",
    result_team_code: null,
    result_published_at: null,
    display_order: index,
  };
}

function normalizeClientMatch(match: PredictionConfigMatch, index: number): PredictionConfigMatch {
  const startAt = normalizeText(match.start_at) || defaultStartAt(index);
  const type = normalizeMatchType(match.match_type);
  return {
    ...match,
    id: normalizeText(match.id) || crypto.randomUUID(),
    match_type: type,
    team_mode: type === "individual" ? "direct" : normalizeTeamMode(match.team_mode),
    title: normalizeClientTitle(match.title, type),
    start_at: startAt,
    start_time_tbd: match.start_time_tbd === true,
    close_at: normalizeText(match.close_at) || closeAtForStart(startAt),
    status: normalizeText(match.status) || "draft",
    team_a_player_ids: normalizePlayerSlots(match.team_a_player_ids),
    team_b_player_ids: normalizePlayerSlots(match.team_b_player_ids),
    entry_order_status: normalizeEntryOrderStatus(match.entry_order_status),
    entry_matchups: normalizeEntryMatchups(match.entry_matchups),
    display_order: match.display_order ?? index,
  };
}

function prepareMatchForSave(match: PredictionConfigMatch, index: number): PredictionConfigMatch {
  const type = normalizeMatchType(match.match_type);
  const teamAPlayers = compactPlayerIds(match.team_a_player_ids);
  const teamBPlayers = compactPlayerIds(match.team_b_player_ids);
  const playerA = teamAPlayers[0] || "";
  const playerB = teamBPlayers[0] || "";
  const prepared = normalizeClientMatch(
    {
      ...match,
      team_a_player_ids: type === "individual" ? teamAPlayers.slice(0, 1) : teamAPlayers,
      team_b_player_ids: type === "individual" ? teamBPlayers.slice(0, 1) : teamBPlayers,
      entry_matchups: type === "team" ? compactEntryMatchups(match.entry_matchups) : [],
    },
    index
  );
  prepared.title = normalizeSaveTitle(match.title, type);

  if (type === "individual") {
    prepared.team_mode = "direct";
    prepared.team_a_code = playerA ? `player:${playerA}` : "";
    prepared.team_b_code = playerB ? `player:${playerB}` : "";
  }

  return prepared;
}

function isArchived(match: PredictionConfigMatch) {
  return match.status === "archived" || Boolean(match.archived_at);
}

function isResultPublished(match: PredictionConfigMatch) {
  return Boolean(match.result_team_code && match.result_published_at);
}

function statusLabel(match: PredictionConfigMatch) {
  if (isArchived(match)) return "숨김";
  if (isResultPublished(match)) return "결과 공개";
  if (match.status === "open") return "투표 중";
  if (match.status === "closed") return "마감";
  return "임시저장";
}

function filterMatches(match: PredictionConfigMatch, filter: StatusFilter, showArchived: boolean) {
  if (!showArchived && isArchived(match)) return false;
  if (filter === "all") return true;
  if (filter === "result") return isResultPublished(match);
  if (filter === "draft") return match.status === "draft";
  if (filter === "open") return match.status === "open";
  if (filter === "closed") return match.status === "closed" && !isResultPublished(match);
  return true;
}

function formatAdminDate(value: string | undefined | null) {
  if (!value) return "시간 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

function getPlayer(playerMap: Map<string, PlayerOption>, playerId?: string | null) {
  return playerId ? playerMap.get(playerId) || null : null;
}

function getSelectedTeamPlayers(playerMap: Map<string, PlayerOption>, playerIds: unknown) {
  const selectedPlayers: PlayerOption[] = [];
  const seen = new Set<string>();

  for (const playerId of normalizePlayerSlots(playerIds)) {
    const player = getPlayer(playerMap, playerId);
    if (!player || seen.has(player.id)) continue;
    selectedPlayers.push(player);
    seen.add(player.id);
  }

  return selectedPlayers;
}

function findPlayerByText(players: PlayerOption[], value: string) {
  const query = normalizeText(value).toLowerCase();
  if (!query) return null;

  const exact = players.find((player) => {
    const names = [player.id, player.name, player.nickname]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    return names.includes(query);
  });
  if (exact) return exact;

  return (
    players.find((player) => {
      const names = [player.name, player.nickname].filter(Boolean).map((item) => String(item).toLowerCase());
      return names.some((name) => name.includes(query));
    }) || null
  );
}

function getPlayerSearchResults(players: PlayerOption[], value: string) {
  const query = normalizeText(value).toLowerCase();
  if (!query) return [];

  return players
    .filter((player) => {
      const searchValues = [player.id, player.name, player.nickname, player.race, player.tier]
        .filter(Boolean)
        .map((item) => String(item).toLowerCase());
      return searchValues.some((item) => item.includes(query));
    })
    .slice(0, PLAYER_SEARCH_RESULT_LIMIT);
}

function getTeamName(teams: TeamInfo[], teamCode?: string | null) {
  return teams.find((team) => team.teamCode === teamCode)?.teamName || "";
}

function assertNoDuplicatePlayers(match: PredictionConfigMatch, playerMap: Map<string, PlayerOption>) {
  const seen = new Set<string>();
  for (const id of [...compactPlayerIds(match.team_a_player_ids), ...compactPlayerIds(match.team_b_player_ids)]) {
    if (seen.has(id)) {
      const playerName = playerMap.get(id)?.name || id;
      throw new Error(
        `같은 예측 안에서는 같은 선수를 한 번만 등록할 수 있습니다. 중복 선수: ${playerName}`
      );
    }
    seen.add(id);
  }
}

function TypeBadge({ type }: { type: MatchType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-black",
        type === "team"
          ? "border-violet-300/45 bg-violet-500/15 text-violet-100"
          : "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
      )}
    >
      {type === "team" ? "팀전" : "개인전"}
    </span>
  );
}

function PlayerMeta({ player }: { player: PlayerOption | null }) {
  if (!player) return <span className="text-xs font-bold text-white/32">선수 선택 전</span>;
  return (
    <span className="flex items-center justify-center gap-1.5">
      <RaceLetterBadge race={player.race || "T"} size="sm" />
      <TierBadge tier={player.tier || "미정"} size="xs" />
    </span>
  );
}

function PlayerSearchInput({
  id,
  label,
  player,
  players,
  onSelect,
}: {
  id: string;
  label: string;
  player: PlayerOption | null;
  players: PlayerOption[];
  onSelect: (player: PlayerOption | null) => void;
}) {
  const playerKey = player?.id || "";
  const [queryState, setQueryState] = useState({ playerKey, query: player?.name || "" });
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const query = queryState.playerKey === playerKey ? queryState.query : player?.name || "";
  const resultsId = `${id}-results`;
  const visibleResults = useMemo(
    () => (isResultsOpen ? getPlayerSearchResults(players, query) : []),
    [isResultsOpen, players, query]
  );
  const activeResult = visibleResults[activeResultIndex] || null;
  const activeResultId = activeResult ? `${resultsId}-${activeResult.id}` : undefined;

  const setQuery = (query: string) => {
    setQueryState({ playerKey, query });
    setActiveResultIndex(0);
  };

  const resetQueryToSelectedPlayer = () => {
    setQuery(player?.name || "");
    setIsResultsOpen(false);
  };

  const selectPlayer = (next: PlayerOption | null) => {
    onSelect(next);
    setQuery(next?.name || "");
    setIsResultsOpen(false);
  };

  const commit = () => {
    const value = normalizeText(query);
    if (!value) {
      selectPlayer(null);
      return;
    }
    const next = findPlayerByText(players, value);
    if (next) {
      selectPlayer(next);
      return;
    }
    const isExactQueryMatch = Boolean(next);
    if (!isExactQueryMatch) {
      resetQueryToSelectedPlayer();
      return;
    }
  };

  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)_128px_58px] items-center gap-2 rounded-lg border border-white/8 bg-black/24 p-2 max-md:grid-cols-1">
      <strong className="text-center text-sm font-black text-white/78">{label}</strong>
      <div className="relative min-w-0">
        <input
          value={query}
          role="combobox"
          aria-controls={visibleResults.length > 0 ? resultsId : undefined}
          aria-activedescendant={activeResultId}
          aria-expanded={visibleResults.length > 0}
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsResultsOpen(Boolean(normalizeText(event.target.value)));
          }}
          onFocus={() => setIsResultsOpen(Boolean(normalizeText(query)))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!visibleResults.length) return;
              setIsResultsOpen(true);
              setActiveResultIndex((current) => Math.min(current + 1, visibleResults.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!visibleResults.length) return;
              setIsResultsOpen(true);
              setActiveResultIndex((current) => Math.max(current - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const activeResult = visibleResults[activeResultIndex];
              if (activeResult) {
                selectPlayer(activeResult);
                return;
              }
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setIsResultsOpen(false);
            }
          }}
          placeholder="선수 이름 검색"
          className="h-12 w-full min-w-0 rounded-lg border border-white/10 bg-black/35 px-3 text-center text-base font-black text-white outline-none placeholder:text-white/25 focus:border-nzu-green/45"
        />
        {visibleResults.length > 0 ? (
          <div
            id={resultsId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-lg border border-white/12 bg-zinc-950/98 shadow-2xl shadow-black/45"
          >
            {visibleResults.map((option, index) => (
              <button
                key={option.id}
                id={`${resultsId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={index === activeResultIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectPlayer(option);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.075]",
                  index === activeResultIndex ? "bg-white/[0.075]" : ""
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white">{option.name}</span>
                  {option.nickname ? (
                    <span className="block truncate text-xs font-bold text-white/45">{option.nickname}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <RaceLetterBadge race={option.race || "T"} size="sm" />
                  <TierBadge tier={option.tier || "미정"} size="xs" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <PlayerMeta player={player} />
      <button
        type="button"
        onClick={() => {
          selectPlayer(null);
        }}
        className="h-10 rounded-lg border border-white/10 bg-white/[0.035] text-xs font-black text-white/55 transition hover:border-white/20 hover:text-white"
      >
        비우기
      </button>
    </div>
  );
}

function EntryMatchupPlayerSelect({
  id,
  label,
  sideLabel,
  player,
  players,
  onSelect,
}: {
  id: string;
  label: string;
  sideLabel: string;
  player: PlayerOption | null;
  players: PlayerOption[];
  onSelect: (player: PlayerOption | null) => void;
}) {
  const selectedPlayer = player && players.some((option) => option.id === player.id) ? player : null;

  return (
    <label className="block min-w-0 rounded-lg border border-white/8 bg-black/22 p-3">
      <span className="block text-xs font-black text-white/48">{label}</span>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <select
          id={id}
          value={selectedPlayer?.id || ""}
          disabled={players.length === 0}
          onChange={(event) => {
            const next = players.find((option) => option.id === event.target.value) || null;
            onSelect(next);
          }}
          className="h-12 w-full min-w-0 rounded-lg border border-white/10 bg-black/35 px-3 text-base font-black text-white outline-none transition focus:border-nzu-green/45 disabled:cursor-not-allowed disabled:text-white/28"
        >
          <option value="">{players.length === 0 ? `${sideLabel}팀 선수 추가 후 선택` : `${sideLabel}팀 선수 선택`}</option>
          {players.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} · {option.race || "-"} · {option.tier || "미정"}
            </option>
          ))}
        </select>
        <PlayerMeta player={selectedPlayer} />
      </div>
    </label>
  );
}

export function PredictionMatchAdmin({
  initialMatches,
  initialVotes,
  teams,
  players,
  readOnly = false,
}: {
  initialMatches: PredictionConfigMatch[];
  initialVotes: PredictionVoteRow[];
  teams: TeamInfo[];
  players: PlayerOption[];
  readOnly?: boolean;
}) {
  const initialRows = initialMatches.map((match, index) => normalizeClientMatch(match, index));
  const [matches, setMatches] = useState<PredictionConfigMatch[]>(initialRows);
  const [votes, setVotes] = useState<PredictionVoteRow[]>(initialVotes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRows.find((match) => !isArchived(match))?.id || initialRows[0]?.id || null
  );
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isVoterModalOpen, setIsVoterModalOpen] = useState(false);
  const [voterQuery, setVoterQuery] = useState("");
  const [voterFilter, setVoterFilter] = useState<PredictionVoterFilter>("all");
  const [voterPage, setVoterPage] = useState(1);

  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const visibleMatches = useMemo(
    () =>
      matches
        .map((match, index) => ({ ...match, display_order: index }))
        .filter((match) => filterMatches(match, filter, showArchived)),
    [filter, matches, showArchived]
  );
  const selectedMatch =
    matches.find((match) => match.id === selectedId) || visibleMatches[0] || matches[0] || null;
  const selectedMatchType = normalizeMatchType(selectedMatch?.match_type);
  const selectedTeamMode = normalizeTeamMode(selectedMatch?.team_mode);
  const selectedVotes = useMemo(
    () => votes.filter((vote) => vote.match_id === selectedMatch?.id),
    [selectedMatch?.id, votes]
  );
  const selectedTeamAName = selectedMatch?.team_a_name || selectedMatch?.team_a_code || "A";
  const selectedTeamBName = selectedMatch?.team_b_name || selectedMatch?.team_b_code || "B";
  const voterRows = useMemo(
    () => (selectedMatch ? buildPredictionVoterRows(selectedMatch, selectedVotes) : []),
    [selectedMatch, selectedVotes]
  );
  const voterSummary = useMemo(
    () => (selectedMatch ? summarizePredictionVoters(selectedMatch, selectedVotes) : null),
    [selectedMatch, selectedVotes]
  );
  const filteredVoterRows = useMemo(
    () => filterPredictionVoterRows(voterRows, { query: voterQuery, filter: voterFilter }),
    [voterFilter, voterQuery, voterRows]
  );
  const voterPageSize = 50;
  const voterPageCount = Math.max(1, Math.ceil(filteredVoterRows.length / voterPageSize));
  const currentVoterPage = Math.min(voterPage, voterPageCount);
  const pagedVoterRows = useMemo(
    () => paginatePredictionVoterRows(filteredVoterRows, currentVoterPage, voterPageSize),
    [currentVoterPage, filteredVoterRows]
  );
  const getMatchVoteCount = (matchId?: string | null) =>
    votes.filter((vote) => vote.match_id === matchId).length;

  const updateMatchById = (matchId: string, patch: Partial<PredictionConfigMatch>) => {
    setMatches((current) =>
      current.map((match, index) =>
        match.id === matchId ? normalizeClientMatch({ ...match, ...patch }, index) : match
      )
    );
  };

  const updateSelected = (patch: Partial<PredictionConfigMatch>) => {
    if (!selectedMatch?.id) return;
    updateMatchById(selectedMatch.id, patch);
  };

  const addMatch = (type: MatchType) => {
    setMatches((current) => {
      const nextMatch = createEmptyMatch(type, current.length);
      setSelectedId(nextMatch.id || null);
      return [...current, nextMatch];
    });
  };

  const duplicateMatch = (match: PredictionConfigMatch) => {
    const id = crypto.randomUUID();
    const copy = normalizeClientMatch(
      {
        ...match,
        id,
        title: `${match.title || "예측"} 복사본`,
        status: "draft",
        result_team_code: null,
        result_published_at: null,
        archived_at: null,
      },
      matches.length
    );
    setMatches((current) => [...current, copy]);
    setSelectedId(id);
  };

  const updatePlayerSlot = (side: "a" | "b", slotIndex: number, player: PlayerOption | null) => {
    if (!selectedMatch) return;
    const key = side === "a" ? "team_a_player_ids" : "team_b_player_ids";
    const rows = normalizePlayerSlots(selectedMatch[key]);
    if (player) rows[slotIndex] = player.id;
    else rows.splice(slotIndex, 1);

    const patch: Partial<PredictionConfigMatch> = { [key]: rows } as Partial<PredictionConfigMatch>;
    if (selectedMatchType === "individual") {
      if (side === "a") {
        patch.team_a_code = player ? `player:${player.id}` : "";
        patch.team_a_name = player?.name || "";
      } else {
        patch.team_b_code = player ? `player:${player.id}` : "";
        patch.team_b_name = player?.name || "";
      }
    }
    updateSelected(patch);
  };

  const addPlayerSlot = (side: "a" | "b") => {
    if (!selectedMatch) return;
    const key = side === "a" ? "team_a_player_ids" : "team_b_player_ids";
    updateSelected({ [key]: [...normalizePlayerSlots(selectedMatch[key]), ""] } as Partial<PredictionConfigMatch>);
  };

  const setExistingTeam = (side: "a" | "b", teamCode: string) => {
    const team = teams.find((item) => item.teamCode === teamCode);
    const patch =
      side === "a"
        ? {
            team_a_code: teamCode,
            team_a_name: team?.teamName || "",
            team_a_player_ids: team?.players.map((player) => player.id) || [],
          }
        : {
            team_b_code: teamCode,
            team_b_name: team?.teamName || "",
            team_b_player_ids: team?.players.map((player) => player.id) || [],
          };
    updateSelected(patch);
  };

  const updateMatchup = (
    matchupIndex: number,
    patch: Partial<Pick<PredictionEntryMatchupConfig, "player_a_id" | "player_b_id">>
  ) => {
    if (!selectedMatch) return;
    const rows = normalizeEntryMatchups(selectedMatch.entry_matchups);
    rows[matchupIndex] = {
      id: rows[matchupIndex]?.id || `matchup-${matchupIndex + 1}`,
      label: rows[matchupIndex]?.label || `매치${matchupIndex + 1}`,
      ...rows[matchupIndex],
      ...patch,
    };
    updateSelected({ entry_matchups: rows });
  };

  const removeMatchup = (matchupIndex: number) => {
    if (!selectedMatch) return;
    const rows = normalizeEntryMatchups(selectedMatch.entry_matchups);
    rows.splice(matchupIndex, 1);
    updateSelected({ entry_matchups: rows });
  };

  const setEntryOrderStatus = (entryOrderStatus: EntryOrderStatus) => {
    updateSelected({ entry_order_status: entryOrderStatus });
  };

  const handleSave = async (statusOverride?: "draft" | "open" | "closed") => {
    if (readOnly) {
      setStatus({ type: "error", message: getAdminWriteDisabledMessage("prediction admin") });
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      const matchesToSave = matches.map((match, index) => {
        const next = prepareMatchForSave(
          {
            ...match,
            status: match.id === selectedMatch?.id && statusOverride ? statusOverride : match.status,
          },
          index
        );
        assertNoDuplicatePlayers(next, playerMap);
        return next;
      });
      const res = await fetch("/api/admin/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches: matchesToSave }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionConfigMatch[];
        votes?: PredictionVoteRow[];
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "예측 저장에 실패했습니다.");
      }
      if (Array.isArray(json.matches)) {
        const next = json.matches.map((match, index) => normalizeClientMatch(match, index));
        setMatches(next);
        setSelectedId(selectedMatch?.id || next[0]?.id || null);
      }
      if (Array.isArray(json.votes)) setVotes(json.votes);
      setStatus({ type: "success", message: "승부예측이 등록되었습니다. 공개 페이지에서 바로 확인할 수 있습니다." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "예측 저장에 실패했습니다.";
      setStatus({
        type: "error",
        message:
          message === "duplicate_prediction_player"
            ? "같은 예측 안에서는 같은 선수를 한 번만 등록할 수 있습니다."
            : message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (match: PredictionConfigMatch) => {
    if (readOnly) {
      setStatus({ type: "error", message: getAdminWriteDisabledMessage("prediction admin") });
      return;
    }
    if (!match.id) return;
    const title = match.title || "선택한 예측";
    const ok = window.confirm(`${title} 예측을 완전히 삭제할까요? 투표가 있는 예측은 삭제되지 않습니다.`);
    if (!ok) return;

    setIsSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/prediction", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: match.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionConfigMatch[];
        votes?: PredictionVoteRow[];
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "예측 삭제에 실패했습니다.");
      }
      const nextMatches = Array.isArray(json.matches)
        ? json.matches.map((row, index) => normalizeClientMatch(row, index))
        : matches.filter((row) => row.id !== match.id);
      setMatches(nextMatches);
      if (Array.isArray(json.votes)) setVotes(json.votes);
      setSelectedId((current) => (current === match.id ? nextMatches[0]?.id || null : current));
      setStatus({ type: "success", message: "예측을 삭제했습니다." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "예측 삭제에 실패했습니다.";
      setStatus({
        type: "error",
        message:
          message === "prediction_delete_has_votes"
            ? "이미 투표가 있는 예측은 삭제할 수 없습니다. 숨기기를 사용해 주세요."
            : message === "prediction_match_not_found"
              ? "이미 삭제되었거나 찾을 수 없는 예측입니다."
              : message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWithVotes = async (match: PredictionConfigMatch) => {
    if (readOnly) {
      setStatus({ type: "error", message: getAdminWriteDisabledMessage("prediction admin") });
      return;
    }
    if (!match.id) return;

    const title = match.title || "예측";
    const voteCount = getMatchVoteCount(match.id);
    const typed = window.prompt(
      `${title} 예측과 연결된 투표 ${voteCount.toLocaleString("ko-KR")}개를 모두 삭제합니다.\n삭제 문구를 정확히 입력해야 진행됩니다: ${FORCE_DELETE_CONFIRMATION}`
    );
    if (typed !== FORCE_DELETE_CONFIRMATION) {
      setStatus({ type: "error", message: "삭제 문구를 정확히 입력하지 않아 취소했습니다." });
      return;
    }

    setIsSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/prediction", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: match.id,
          delete_votes: true,
          confirm_text: FORCE_DELETE_CONFIRMATION,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionConfigMatch[];
        votes?: PredictionVoteRow[];
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "예측과 투표 삭제에 실패했습니다.");
      }
      const nextMatches = Array.isArray(json.matches)
        ? json.matches.map((row, index) => normalizeClientMatch(row, index))
        : matches.filter((row) => row.id !== match.id);
      setMatches(nextMatches);
      if (Array.isArray(json.votes)) setVotes(json.votes);
      setSelectedId((current) => (current === match.id ? nextMatches[0]?.id || null : current));
      setStatus({ type: "success", message: "예측과 연결된 투표를 완전히 삭제했습니다." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "예측과 투표 삭제에 실패했습니다.";
      setStatus({
        type: "error",
        message:
          message === "prediction_force_delete_confirmation_required"
            ? "삭제 문구를 정확히 입력해야 합니다."
            : message === "prediction_match_not_found"
              ? "이미 삭제되었거나 찾을 수 없는 예측입니다."
              : message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const publishResult = (teamCode: string) => {
    updateSelected({
      status: "closed",
      result_team_code: teamCode,
      result_published_at: new Date().toISOString(),
    });
  };

  const downloadVoterCsv = () => {
    const csv = buildPredictionVoterCsv(filteredVoterRows);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prediction-voters-${selectedMatch?.id || "match"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyVoterFixedId = async (fixedId: string) => {
    if (!fixedId || fixedId === "-") return;
    try {
      await navigator.clipboard.writeText(fixedId);
      setStatus({ type: "success", message: "SOOP 고정 ID를 복사했습니다." });
    } catch {
      setStatus({ type: "error", message: "SOOP 고정 ID 복사에 실패했습니다." });
    }
  };

  const renderTeamEditor = (side: "a" | "b") => {
    if (!selectedMatch) return null;
    const isA = side === "a";
    const title = isA ? "A팀" : "B팀";
    const code = isA ? selectedMatch.team_a_code : selectedMatch.team_b_code;
    const name = isA ? selectedMatch.team_a_name : selectedMatch.team_b_name;
    const playerIds = normalizePlayerSlots(isA ? selectedMatch.team_a_player_ids : selectedMatch.team_b_player_ids);
    const rows = playerIds.length > 0 ? playerIds : [""];

    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <h4 className="mb-3 text-center text-base font-black text-white">{title}</h4>
        {selectedMatchType === "team" && selectedTeamMode === "existing" ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-center text-xs font-black text-white/55">기존 팀 선택</span>
            <select
              value={code || ""}
              onChange={(event) => setExistingTeam(side, event.target.value)}
              className="h-12 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-center text-base font-black text-white outline-none focus:border-nzu-green/45"
            >
              <option value="">팀 선택</option>
              {teams.map((team) => (
                <option key={team.teamCode} value={team.teamCode}>
                  {team.teamName}
                </option>
              ))}
            </select>
          </label>
        ) : selectedMatchType === "team" ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-center text-xs font-black text-white/55">팀 이름</span>
            <input
              value={name || ""}
              onChange={(event) =>
                updateSelected(isA ? { team_a_name: event.target.value } : { team_b_name: event.target.value })
              }
              className="h-12 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-center text-base font-black text-white outline-none focus:border-nzu-green/45"
            />
          </label>
        ) : null}

        <div className="space-y-2.5">
          {rows.map((playerId, playerIndex) => (
            <PlayerSearchInput
              key={`${selectedMatch.id}-${side}-${playerIndex}-${playerId || "empty"}`}
              id={`${selectedMatch.id}-${side}-${playerIndex}`}
              label={selectedMatchType === "individual" ? (isA ? "선수 A" : "선수 B") : `선수 ${playerIndex + 1}`}
              player={getPlayer(playerMap, playerId)}
              players={players}
              onSelect={(player) => updatePlayerSlot(side, playerIndex, player)}
            />
          ))}
        </div>

        {selectedMatchType === "team" ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => addPlayerSlot(side)}
              className="rounded-lg border border-nzu-green/30 bg-nzu-green/10 px-3 py-2 text-xs font-black text-nzu-green transition hover:bg-nzu-green/15"
            >
              선수 추가
            </button>
            {selectedTeamMode === "existing" && code ? (
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/55">
                {getTeamName(teams, code)} 명단을 불러왔습니다.
              </span>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  };

  const matchups = normalizeEntryMatchups(selectedMatch?.entry_matchups);
  const matchupRows = matchups.length > 0 ? matchups : [{ id: "matchup-1", player_a_id: "", player_b_id: "" }];
  const teamAEntryPlayers = getSelectedTeamPlayers(playerMap, selectedMatch?.team_a_player_ids);
  const teamBEntryPlayers = getSelectedTeamPlayers(playerMap, selectedMatch?.team_b_player_ids);
  const entryOrderStatus = normalizeEntryOrderStatus(selectedMatch?.entry_order_status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-white/42">Prediction Board</div>
          <h2 className="mt-1 text-xl font-black text-white">예측 목록과 편집</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addMatch("team")}
            className="inline-flex items-center gap-2 rounded-lg bg-nzu-green px-3 py-2 text-sm font-black text-black transition hover:brightness-110"
          >
            <Plus size={16} />
            팀전 만들기
          </button>
          <button
            type="button"
            onClick={() => addMatch("individual")}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-white transition hover:border-white/20"
          >
            <Plus size={16} />
            개인전 만들기
          </button>
        </div>
      </div>

      {status ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-bold",
            status.type === "success"
              ? "border-nzu-green/20 bg-nzu-green/10 text-nzu-green"
              : "border-red-400/25 bg-red-500/10 text-red-300"
          )}
        >
          {status.message}
          {status.type === "success" && status.message.includes("승부예측이 등록되었습니다") ? (
            <a href="/prediction" className="ml-3 inline-flex text-white underline underline-offset-4">
              승부예측 페이지 보기
            </a>
          ) : null}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "전체"],
              ["draft", "임시저장"],
              ["open", "투표 중"],
              ["closed", "마감"],
              ["result", "결과 공개"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as StatusFilter)}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-black transition",
                  filter === key ? "bg-nzu-green text-black" : "bg-white/[0.04] text-white/55 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-black transition",
              showArchived
                ? "border-nzu-green/30 bg-nzu-green/10 text-nzu-green"
                : "border-white/10 bg-white/[0.04] text-white/65"
            )}
          >
            숨김 포함 보기
          </button>
        </div>

        <div className="divide-y divide-white/8">
          {visibleMatches.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-bold text-white/42">
              표시할 예측이 없습니다.
            </div>
          ) : (
            visibleMatches.map((match) => {
              const type = normalizeMatchType(match.match_type);
              const isSelected = match.id === selectedMatch?.id;
              return (
                <div
                  key={match.id}
                  className={cn(
                    "grid grid-cols-[92px_minmax(0,1fr)_112px_112px_220px] items-center gap-3 px-4 py-3 max-lg:grid-cols-1",
                    isSelected ? "bg-nzu-green/7" : "hover:bg-white/[0.025]"
                  )}
                >
                  <button type="button" onClick={() => setSelectedId(match.id || null)} className="justify-self-start">
                    <TypeBadge type={type} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedId(match.id || null)}
                    className="min-w-0 text-left"
                  >
                    <strong className="block truncate text-base font-black text-white">
                      {match.title || "제목 없음"}
                    </strong>
                    <span className="mt-1 block truncate text-sm font-bold text-white/42">
                      {match.team_a_name || match.team_a_code || "A"} vs {match.team_b_name || match.team_b_code || "B"}
                    </span>
                  </button>
                  <span className="text-sm font-black text-white/70">{formatAdminDate(match.start_at)}</span>
                  <span className="w-fit rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-white/65">
                    {statusLabel(match)}
                  </span>
                  <span className="flex flex-wrap justify-end gap-1 max-lg:justify-start">
                    <button
                      type="button"
                      onClick={() => setSelectedId(match.id || null)}
                      className="rounded-lg bg-nzu-green px-2.5 py-1.5 text-xs font-black text-black"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateMatch(match)}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-black text-white/72"
                    >
                      <Copy size={13} className="mr-1 inline-block" />
                      복제
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleDelete(match)}
                      className="rounded-lg border border-red-300/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-black text-red-100 disabled:opacity-45"
                    >
                      <Trash2 size={13} className="mr-1 inline-block" />
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMatchById(match.id || "", { status: "archived", archived_at: new Date().toISOString() })}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-black text-white/72"
                    >
                      숨기기
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {selectedMatch ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-white">새 예측 만들기</h3>
                  <p className="mt-1 text-sm font-bold text-white/42">
                    팀전은 최종 승리팀만 예측하고, 세부 매치업은 안내 정보로 표시합니다.
                  </p>
                </div>
                <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-black/35">
                  {(["team", "individual"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        updateSelected({
                          match_type: type,
                          team_mode: "direct",
                          title: selectedMatch.title || (type === "team" ? "새 팀전 예측" : "새 개인전 예측"),
                          entry_matchups: type === "team" ? selectedMatch.entry_matchups : [],
                        })
                      }
                      className={cn(
                        "px-4 py-2 text-sm font-black transition",
                        selectedMatchType === type ? "bg-nzu-green text-black" : "text-white/55 hover:text-white"
                      )}
                    >
                      {type === "team" ? "팀전" : "개인전"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-1 block text-sm font-black text-white/65">경기 제목</span>
                  <input
                    value={selectedMatch.title || ""}
                    onChange={(event) => updateSelected({ title: event.target.value })}
                    placeholder="예: 중장전 1경기"
                    className="h-12 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-base font-black text-white outline-none placeholder:text-white/25 focus:border-nzu-green/45"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-black text-white/65">경기 시작</span>
                  <input
                    type="datetime-local"
                    value={toKstDateTimeInput(selectedMatch.start_at)}
                    onChange={(event) => {
                      const startAt = fromKstDateTimeInput(event.target.value);
                      updateSelected({ start_at: startAt, close_at: closeAtForStart(startAt) });
                    }}
                    className="h-12 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-white outline-none [color-scheme:dark] focus:border-nzu-green/45"
                  />
                  <span className="mt-2 flex items-center gap-2 text-xs font-black text-white/60">
                    <input
                      type="checkbox"
                      checked={selectedMatch.start_time_tbd === true}
                      onChange={(event) => updateSelected({ start_time_tbd: event.target.checked })}
                      className="size-4 accent-nzu-green"
                    />
                    경기 시간 미정
                  </span>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-black text-white/65">투표 마감</span>
                  <input
                    type="datetime-local"
                    value={toKstDateTimeInput(selectedMatch.close_at)}
                    onChange={(event) => updateSelected({ close_at: fromKstDateTimeInput(event.target.value) })}
                    className="h-12 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-white outline-none [color-scheme:dark] focus:border-nzu-green/45"
                  />
                </label>
              </div>

              {selectedMatchType === "team" ? (
                <div>
                  <h3 className="mb-2 text-base font-black text-white">팀 구성 방식</h3>
                  <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-white/10 bg-black/35">
                    {(["direct", "existing"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateSelected({ team_mode: mode })}
                        className={cn(
                          "px-4 py-2 text-sm font-black transition",
                          selectedTeamMode === mode ? "bg-nzu-green text-black" : "text-white/55 hover:text-white"
                        )}
                      >
                        {mode === "direct" ? "팀 직접입력" : "기존 팀 사용"}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-white/42">
                    직접입력 팀은 이 이벤트에만 쓰는 단발성 팀입니다. 홈페이지의 공식 소속 정보와는 분리됩니다.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {renderTeamEditor("a")}
                {renderTeamEditor("b")}
              </div>

              {selectedMatchType === "team" ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-center">
                    <h3 className="text-base font-black text-white">엔트리 매치업 안내</h3>
                    <span className="rounded-full border border-white/12 bg-white/[0.045] px-2.5 py-1 text-[11px] font-black text-white/58">
                      {normalizeEntryOrderStatus(selectedMatch.entry_order_status) === "confirmed"
                        ? "경기 순서 확정"
                        : "경기 순서 미정"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {matchupRows.map((row, matchupIndex) => (
                      <div
                        key={row.id || matchupIndex}
                        className="grid gap-3 rounded-xl border border-white/10 bg-black/24 p-3 md:grid-cols-[120px_minmax(0,1fr)_48px_minmax(0,1fr)_84px] md:items-center"
                      >
                        <strong className="flex h-full min-h-16 items-center justify-center rounded-lg bg-white/[0.055] px-3 py-3 text-center text-sm font-black text-white">
                          {row.label || `매치${matchupIndex + 1}`}
                        </strong>
                        <EntryMatchupPlayerSelect
                          id={`${selectedMatch.id}-entry-a-${matchupIndex}`}
                          label={selectedTeamAName}
                          sideLabel="A"
                          player={getPlayer(playerMap, row.player_a_id)}
                          players={teamAEntryPlayers}
                          onSelect={(player) => updateMatchup(matchupIndex, { player_a_id: player?.id || "" })}
                        />
                        <span className="text-center text-xs font-black text-white/40">VS</span>
                        <EntryMatchupPlayerSelect
                          id={`${selectedMatch.id}-entry-b-${matchupIndex}`}
                          label={selectedTeamBName}
                          sideLabel="B"
                          player={getPlayer(playerMap, row.player_b_id)}
                          players={teamBEntryPlayers}
                          onSelect={(player) => updateMatchup(matchupIndex, { player_b_id: player?.id || "" })}
                        />
                        <button
                          type="button"
                          onClick={() => removeMatchup(matchupIndex)}
                          className="h-12 rounded-lg border border-white/10 bg-white/[0.035] text-xs font-black text-white/55 transition hover:border-red-300/25 hover:text-red-200"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelected({
                          entry_matchups: [
                            ...matchupRows,
                            { id: `matchup-${matchupRows.length + 1}`, label: `매치${matchupRows.length + 1}`, player_a_id: "", player_b_id: "" },
                          ],
                        })
                      }
                      className="rounded-lg border border-nzu-green/30 bg-nzu-green/10 px-3 py-2 text-xs font-black text-nzu-green"
                    >
                      매치업 추가
                    </button>
                    <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      <button
                        type="button"
                        aria-pressed={entryOrderStatus === "unknown"}
                        onClick={() => setEntryOrderStatus("unknown")}
                        className={cn(
                          "px-3 py-2 text-xs font-black transition",
                          entryOrderStatus === "unknown" ? "bg-nzu-green text-black" : "text-white/65 hover:text-white"
                        )}
                      >
                        순서 미정
                      </button>
                      <button
                        type="button"
                        aria-pressed={entryOrderStatus === "confirmed"}
                        onClick={() => setEntryOrderStatus("confirmed")}
                        className={cn(
                          "border-l border-white/10 px-3 py-2 text-xs font-black transition",
                          entryOrderStatus === "confirmed" ? "bg-nzu-green text-black" : "text-white/65 hover:text-white"
                        )}
                      >
                        순서 확정
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="h-fit rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <h3 className="mb-3 text-base font-black text-white">공개 전 확인</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="text-white/45">예측 종류</dt>
                <dd className="font-black text-white">{selectedMatchType === "team" ? "팀전" : "개인전"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="text-white/45">공개 상태</dt>
                <dd className="font-black text-white">{statusLabel(selectedMatch)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="text-white/45">사용자 투표</dt>
                <dd className="font-black text-white">로그인 후 가능</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="text-white/45">투표 변경</dt>
                <dd className="font-black text-white">마감 전 1회</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">대진</dt>
                <dd className="max-w-[160px] truncate text-right font-black text-white">
                  {selectedTeamAName} vs {selectedTeamBName}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-white">투표자 확인</h4>
                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-black text-white/55">
                  {(voterSummary?.total || 0).toLocaleString("ko-KR")}명
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/8 bg-white/[0.035] p-2">
                  <span className="block text-[11px] font-bold text-white/42">{selectedTeamAName}</span>
                  <strong className="text-base font-black text-white">
                    {(voterSummary?.teamA || 0).toLocaleString("ko-KR")}표
                  </strong>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/[0.035] p-2">
                  <span className="block text-[11px] font-bold text-white/42">{selectedTeamBName}</span>
                  <strong className="text-base font-black text-white">
                    {(voterSummary?.teamB || 0).toLocaleString("ko-KR")}표
                  </strong>
                </div>
                {selectedMatch.result_team_code && selectedMatch.result_published_at ? (
                  <>
                    <div className="rounded-lg border border-nzu-green/20 bg-nzu-green/10 p-2">
                      <span className="block text-[11px] font-bold text-nzu-green/75">적중</span>
                      <strong className="text-base font-black text-nzu-green">
                        {(voterSummary?.correct || 0).toLocaleString("ko-KR")}명
                      </strong>
                    </div>
                    <div className="rounded-lg border border-red-300/20 bg-red-500/10 p-2">
                      <span className="block text-[11px] font-bold text-red-200/75">실패</span>
                      <strong className="text-base font-black text-red-100">
                        {(voterSummary?.wrong || 0).toLocaleString("ko-KR")}명
                      </strong>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 rounded-lg border border-white/8 bg-white/[0.025] p-2">
                    <span className="block text-[11px] font-bold text-white/42">결과 상태</span>
                    <strong className="text-sm font-black text-white/70">
                      결과 공개 전에는 적중 여부를 계산하지 않습니다.
                    </strong>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setVoterPage(1);
                  setIsVoterModalOpen(true);
                }}
                className="mt-3 w-full rounded-lg border border-nzu-green/30 bg-nzu-green/10 px-3 py-2 text-sm font-black text-nzu-green transition hover:bg-nzu-green/15"
              >
                투표자 상세 보기
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={isSaving || readOnly}
                onClick={() => void handleSave("draft")}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white disabled:opacity-45"
              >
                <Save className="mr-2 inline-block" size={16} />
                임시저장
              </button>
              <button
                type="button"
                disabled={isSaving || readOnly}
                onClick={() => void handleSave("open")}
                className="rounded-lg bg-nzu-green px-4 py-3 text-sm font-black text-black disabled:opacity-45"
              >
                <CheckCircle2 className="mr-2 inline-block" size={16} />
                투표 시작
              </button>
              <button
                type="button"
                disabled={isSaving || readOnly}
                onClick={() => void handleSave("closed")}
                className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100 disabled:opacity-45"
              >
                마감하기
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <h4 className="mb-2 text-sm font-black text-white">결과 공개</h4>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => publishResult(selectedMatch.team_a_code || "")}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-white disabled:opacity-45"
                >
                  {selectedTeamAName} 승리 공개
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => publishResult(selectedMatch.team_b_code || "")}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-white disabled:opacity-45"
                >
                  {selectedTeamBName} 승리 공개
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => updateSelected({ result_team_code: null, result_published_at: null })}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-black text-white/60 disabled:opacity-45"
                >
                  결과 공개 취소
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={readOnly}
              onClick={() => updateSelected({ status: "archived", archived_at: new Date().toISOString() })}
              className="mt-3 w-full rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 disabled:opacity-45"
            >
              <EyeOff className="mr-2 inline-block" size={16} />
              숨기기
            </button>
            <button
              type="button"
              disabled={readOnly || isSaving}
              onClick={() => void handleDelete(selectedMatch)}
              className="mt-2 w-full rounded-lg border border-red-300/25 bg-black/20 px-4 py-3 text-sm font-black text-red-100 disabled:opacity-45"
            >
              <Trash2 className="mr-2 inline-block" size={16} />
              완전 삭제
            </button>
            <button
              type="button"
              disabled={readOnly || isSaving}
              onClick={() => void handleDeleteWithVotes(selectedMatch)}
              className="mt-2 w-full rounded-lg border border-red-500/35 bg-red-600/15 px-4 py-3 text-sm font-black text-red-100 disabled:opacity-45"
            >
              <Trash2 className="mr-2 inline-block" size={16} />
              투표 포함 완전 삭제
            </button>
          </aside>
        </section>
      ) : (
        <section className="rounded-xl border border-white/10 bg-white/[0.035] px-5 py-10 text-center">
          <p className="text-sm font-bold text-white/50">아직 예측이 없습니다.</p>
          <button
            type="button"
            onClick={() => addMatch("team")}
            className="mt-4 rounded-lg bg-nzu-green px-4 py-2 text-sm font-black text-black"
          >
            팀전 만들기
          </button>
        </section>
      )}

      {isVoterModalOpen && selectedMatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/12 bg-[#0f1715] shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-white/40">Voter Detail</p>
                <h3 className="mt-1 text-xl font-black text-white">{selectedMatch.title || "예측"} 투표자 상세</h3>
                <p className="mt-1 text-sm font-bold text-white/45">
                  SOOP 고정 ID와 닉네임을 기준으로 확인하고 CSV로 내려받을 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVoterModalOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/70 transition hover:text-white"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-white/10 p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <label className="relative block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
                  />
                  <input
                    value={voterQuery}
                    onChange={(event) => {
                      setVoterQuery(event.target.value);
                      setVoterPage(1);
                    }}
                    placeholder="닉네임 또는 SOOP 고정 ID 검색"
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/28 pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-nzu-green/45"
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadVoterCsv}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-nzu-green/30 bg-nzu-green/10 px-4 text-sm font-black text-nzu-green transition hover:bg-nzu-green/15"
                >
                  <Download size={16} />
                  CSV 다운로드
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["all", "전체"],
                  ["team_a", `${selectedTeamAName} 선택`],
                  ["team_b", `${selectedTeamBName} 선택`],
                  ["correct", "적중"],
                  ["wrong", "실패"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setVoterFilter(key as PredictionVoterFilter);
                      setVoterPage(1);
                    }}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-black transition",
                      voterFilter === key
                        ? "bg-nzu-green text-black"
                        : "border border-white/10 bg-white/[0.04] text-white/62 hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                  <span className="block text-[11px] font-bold text-white/40">검색 결과</span>
                  <strong className="text-white">{filteredVoterRows.length.toLocaleString("ko-KR")}명</strong>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                  <span className="block text-[11px] font-bold text-white/40">전체 투표</span>
                  <strong className="text-white">{(voterSummary?.total || 0).toLocaleString("ko-KR")}명</strong>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                  <span className="block text-[11px] font-bold text-white/40">표시 단위</span>
                  <strong className="text-white">{voterPageSize.toLocaleString("ko-KR")}명씩</strong>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="min-w-[860px] overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[1.2fr_1.25fr_1fr_90px_150px_86px] gap-3 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/45">
                  <span>닉네임</span>
                  <span>SOOP 고정 ID</span>
                  <span>선택</span>
                  <span>결과</span>
                  <span>투표 시간</span>
                  <span className="text-right">변경</span>
                </div>
                {pagedVoterRows.length === 0 ? (
                  <div className="px-3 py-10 text-center text-sm font-bold text-white/42">
                    조건에 맞는 투표자가 없습니다.
                  </div>
                ) : (
                  <div className="divide-y divide-white/8">
                    {pagedVoterRows.map((row) => (
                      <div
                        key={`${row.voterId}-${row.matchId}`}
                        className="grid grid-cols-[1.2fr_1.25fr_1fr_90px_150px_86px] items-center gap-3 px-3 py-3 text-sm"
                      >
                        <strong className="truncate font-black text-white">{row.displayName}</strong>
                        <span className="flex min-w-0 items-center gap-2">
                          <code className="min-w-0 truncate rounded-md border border-white/10 bg-black/28 px-2 py-1 text-xs font-black text-nzu-green">
                            {row.fixedId}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copyVoterFixedId(row.fixedId)}
                            className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-white/55 transition hover:text-white"
                            aria-label="SOOP 고정 ID 복사"
                          >
                            <Copy size={13} />
                          </button>
                        </span>
                        <span className="truncate font-bold text-white/72">{row.pickLabel}</span>
                        <span
                          className={cn(
                            "w-fit rounded-full px-2 py-1 text-xs font-black",
                            row.result === "correct"
                              ? "bg-nzu-green/15 text-nzu-green"
                              : row.result === "wrong"
                                ? "bg-red-500/15 text-red-200"
                                : "bg-white/[0.06] text-white/50"
                          )}
                        >
                          {row.resultLabel}
                        </span>
                        <span className="font-bold text-white/55">{formatAdminDate(row.updatedAt)}</span>
                        <span className="text-right font-black text-white/70">{row.changeCount.toLocaleString("ko-KR")}회</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
              <p className="text-sm font-bold text-white/45">
                {currentVoterPage.toLocaleString("ko-KR")} / {voterPageCount.toLocaleString("ko-KR")} 페이지
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentVoterPage <= 1}
                  onClick={() => setVoterPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-white disabled:opacity-35"
                >
                  이전
                </button>
                <button
                  type="button"
                  disabled={currentVoterPage >= voterPageCount}
                  onClick={() => setVoterPage((page) => Math.min(voterPageCount, page + 1))}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-white disabled:opacity-35"
                >
                  다음
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
