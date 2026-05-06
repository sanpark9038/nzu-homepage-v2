import type { PredictionConfigMatch, PredictionVoteRow } from "@/lib/prediction-store";

export type PredictionVoterResult = "pending" | "correct" | "wrong";
export type PredictionVoterFilter = "all" | "team_a" | "team_b" | "correct" | "wrong";

export type PredictionVoterRow = {
  voterId: string;
  matchId: string;
  displayName: string;
  fixedId: string;
  pickSide: "team_a" | "team_b" | "unknown";
  pickedTeamCode: string;
  pickLabel: string;
  result: PredictionVoterResult;
  resultLabel: string;
  updatedAt: string;
  changeCount: number;
};

export type PredictionVoterSummary = {
  total: number;
  teamA: number;
  teamB: number;
  pending: number;
  correct: number;
  wrong: number;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function getTeamLabel(match: PredictionConfigMatch, side: "a" | "b") {
  if (side === "a") return normalizeText(match.team_a_name) || normalizeText(match.team_a_code) || "A";
  return normalizeText(match.team_b_name) || normalizeText(match.team_b_code) || "B";
}

function getResultLabel(result: PredictionVoterResult) {
  if (result === "correct") return "적중";
  if (result === "wrong") return "실패";
  return "결과 전";
}

export function getPredictionVoteFixedId(vote: PredictionVoteRow) {
  const providerUserId = normalizeText(vote.voter_provider_user_id);
  if (providerUserId) return providerUserId;
  const voterId = normalizeText(vote.voter_id);
  const [, fallbackId] = voterId.split(":", 2);
  return fallbackId || voterId || "-";
}

export function getPredictionVoteDisplayName(vote: PredictionVoteRow) {
  return normalizeText(vote.voter_display_name) || "-";
}

export function getPredictionVotePickLabel(match: PredictionConfigMatch, vote: PredictionVoteRow) {
  if (vote.picked_team_code === match.team_a_code) return getTeamLabel(match, "a");
  if (vote.picked_team_code === match.team_b_code) return getTeamLabel(match, "b");
  return "선택 없음";
}

export function getPredictionVoteResult(match: PredictionConfigMatch, vote: PredictionVoteRow): PredictionVoterResult {
  if (!match.result_team_code || !match.result_published_at) return "pending";
  return vote.picked_team_code === match.result_team_code ? "correct" : "wrong";
}

export function buildPredictionVoterRows(match: PredictionConfigMatch, votes: PredictionVoteRow[]) {
  const matchId = normalizeText(match.id);
  return votes
    .filter((vote) => !matchId || vote.match_id === matchId)
    .map((vote): PredictionVoterRow => {
      const result = getPredictionVoteResult(match, vote);
      const pickSide =
        vote.picked_team_code === match.team_a_code
          ? "team_a"
          : vote.picked_team_code === match.team_b_code
            ? "team_b"
            : "unknown";
      return {
        voterId: normalizeText(vote.voter_id),
        matchId: normalizeText(vote.match_id),
        displayName: getPredictionVoteDisplayName(vote),
        fixedId: getPredictionVoteFixedId(vote),
        pickSide,
        pickedTeamCode: normalizeText(vote.picked_team_code),
        pickLabel: getPredictionVotePickLabel(match, vote),
        result,
        resultLabel: getResultLabel(result),
        updatedAt: normalizeText(vote.updated_at),
        changeCount: Number.isFinite(vote.change_count) ? Number(vote.change_count) : 0,
      };
    });
}

export function summarizePredictionVoters(
  match: PredictionConfigMatch,
  votes: PredictionVoteRow[]
): PredictionVoterSummary {
  const rows = buildPredictionVoterRows(match, votes);
  return rows.reduce<PredictionVoterSummary>(
    (summary, row) => {
      summary.total += 1;
      if (row.pickedTeamCode === match.team_a_code) summary.teamA += 1;
      if (row.pickedTeamCode === match.team_b_code) summary.teamB += 1;
      if (row.result === "correct") summary.correct += 1;
      else if (row.result === "wrong") summary.wrong += 1;
      else summary.pending += 1;
      return summary;
    },
    { total: 0, teamA: 0, teamB: 0, pending: 0, correct: 0, wrong: 0 }
  );
}

export function filterPredictionVoterRows(
  rows: PredictionVoterRow[],
  options: { query?: string; filter?: PredictionVoterFilter }
) {
  const query = normalizeText(options.query).toLowerCase();
  const filter = options.filter || "all";

  return rows.filter((row) => {
    if (filter === "team_a" && row.pickSide !== "team_a") return false;
    if (filter === "team_b" && row.pickSide !== "team_b") return false;
    if (filter === "correct" && row.result !== "correct") return false;
    if (filter === "wrong" && row.result !== "wrong") return false;
    if (query) {
      const haystack = [row.displayName, row.fixedId, row.voterId, row.pickLabel].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function paginatePredictionVoterRows(rows: PredictionVoterRow[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safePage = Math.max(1, Math.floor(page));
  return rows.slice((safePage - 1) * safePageSize, safePage * safePageSize);
}

function escapeCsvCell(value: unknown) {
  const text = normalizeText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildPredictionVoterCsv(rows: PredictionVoterRow[]) {
  const header = ["닉네임", "SOOP 고정 ID", "선택", "결과", "투표 시간", "변경 횟수"];
  const body = rows.map((row) =>
    [
      row.displayName,
      row.fixedId,
      row.pickLabel,
      row.resultLabel,
      row.updatedAt,
      String(row.changeCount),
    ]
      .map(escapeCsvCell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
