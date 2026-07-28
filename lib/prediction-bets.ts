import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { applyPointChange, readBalance } from "@/lib/points";
import { hasPredictionRemoteEnv } from "@/lib/prediction-store";

/**
 * 서버 전용 — 승부예측 포인트 베팅. 클라이언트에서 import 금지.
 *
 * 포인트 이동은 전부 apply_user_point_change(원장) 를 거친다. prediction_bets 는 베팅 내역과
 * 정산 상태만 들고 있으므로, 이 파일이 죽어도 포인트 잔액은 원장에서 복구 가능하다.
 * 테이블/RPC 가 아직 없으면(PGRST205/PGRST202) 조용히 no-op — SQL 실행 전에도 사이트는 살아있어야 한다.
 */

export const BET_MIN = 100;
export const BET_STEP = 100;
export const BET_MAX = 5000;

export type PredictionBetStatus = "placed" | "won" | "lost" | "refunded";

export type PredictionBet = {
  matchId: string;
  teamCode: string;
  stake: number;
  status: PredictionBetStatus;
  payout: number | null;
};

export type PredictionBetPool = {
  matchId: string;
  teamCode: string;
  totalStake: number;
  betCount: number;
};

export type PredictionMatchResultRow = {
  id: string;
  result_team_code: string | null;
  result_published_at: string | null;
};

type StakedBet = { stake: number; team_code: string };

function isMissingTable(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST205" || error?.code === "PGRST202";
}

function isDuplicateLedgerEntry(error: unknown) {
  return error instanceof Error && error.message.includes("user_point_duplicate");
}

/** balance >= 0 check 위반이 잔액 부족의 신호다 (RPC 가 그대로 전파한다). */
function isInsufficientBalance(error: unknown) {
  return error instanceof Error && /balance_check|violates check constraint/.test(error.message);
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

/**
 * 파리뮤추얼 정산 — 순수 함수. 승자는 원금 + (패자풀을 지분대로 나눈 몫)을 받는다.
 * 패자풀이 0이면 몫도 0이라 원금만 돌아가고, 승자가 없으면 전원 lost 다.
 * floor 때문에 지급 합계는 항상 총풀 이하 (남는 포인트는 소멸).
 */
export function computeBetSettlement<T extends StakedBet>(
  bets: T[],
  resultTeamCode: string | null | undefined
): Array<{ bet: T; status: "won" | "lost"; payout: number }> {
  const winnerCode = normalizeText(resultTeamCode);
  const winners = winnerCode ? bets.filter((bet) => normalizeText(bet.team_code) === winnerCode) : [];
  const winnerPool = winners.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const totalPool = bets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const loserPool = totalPool - winnerPool;

  return bets.map((bet) => {
    const stake = Number(bet.stake || 0);
    if (!winnerPool || normalizeText(bet.team_code) !== winnerCode) {
      return { bet, status: "lost" as const, payout: 0 };
    }
    return { bet, status: "won" as const, payout: stake + Math.floor((stake * loserPool) / winnerPool) };
  });
}

export function validateBetStake(stake: unknown) {
  const amount = Number(stake);
  if (!Number.isInteger(amount) || amount < BET_MIN || amount > BET_MAX || amount % BET_STEP !== 0) {
    throw new Error("bet_invalid_stake");
  }
  return amount;
}

async function readPlacedBets(matchId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prediction_bets")
    .select("id, voter_id, team_code, stake")
    .eq("match_id", matchId)
    .eq("status", "placed");

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data || [];
}

/**
 * 베팅 등록. 순서가 중요하다 — 포인트를 먼저 빼고 베팅 행을 넣는다.
 * 반대로 하면 insert 성공 후 차감 실패 시 공짜 베팅이 남는다.
 */
export async function placeBet(input: {
  voterId: string;
  displayName: string;
  matchId: string;
  teamCode: string;
  stake: number;
}) {
  if (!hasPredictionRemoteEnv()) return null;

  const voterId = normalizeText(input.voterId);
  const matchId = normalizeText(input.matchId);
  const teamCode = normalizeText(input.teamCode);
  const stake = validateBetStake(input.stake);
  if (!voterId || !matchId) throw new Error("bet_invalid_request");
  if (!teamCode) throw new Error("bet_invalid_team");

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("prediction_bets")
    .select("id")
    .eq("voter_id", voterId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (readError) {
    if (isMissingTable(readError)) return null;
    throw readError;
  }
  if (existing) throw new Error("bet_exists");

  let balance = 0;
  try {
    balance = await applyPointChange(voterId, input.displayName, -stake, "bet_place", matchId);
  } catch (error) {
    if (isDuplicateLedgerEntry(error)) throw new Error("bet_exists");
    if (isInsufficientBalance(error)) throw new Error("points_insufficient");
    throw error;
  }

  const { error: insertError } = await supabase.from("prediction_bets").insert({
    voter_id: voterId,
    match_id: matchId,
    team_code: teamCode,
    stake,
  });

  if (insertError) {
    // 롤백. bet_place 를 지우는 대신 bet_refund 로 되돌려 넣는다 — 원장은 append-only 이고
    // 같은 (voter, reason, ref) 로는 두 번 못 들어가므로 반대 사유가 유일한 되돌리기 수단이다.
    await applyPointChange(voterId, input.displayName, stake, "bet_refund", matchId).catch(() => {});
    throw insertError;
  }

  return { matchId, teamCode, stake, balance };
}

/** 투표를 바꾸면 베팅도 따라간다. 정산 전(placed)에만. */
export async function moveBetTeam(input: { voterId: string; matchId: string; teamCode: string }) {
  if (!hasPredictionRemoteEnv()) return;
  const voterId = normalizeText(input.voterId);
  const matchId = normalizeText(input.matchId);
  const teamCode = normalizeText(input.teamCode);
  if (!voterId || !matchId || !teamCode) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("prediction_bets")
    .update({ team_code: teamCode, updated_at: new Date().toISOString() })
    .eq("voter_id", voterId)
    .eq("match_id", matchId)
    .eq("status", "placed");

  if (error && !isMissingTable(error)) throw error;
}

/** 저장 전후 비교용 스냅샷 — 결과가 "새로 공개됐는지"는 delta 로만 알 수 있다. */
export async function readMatchResultSnapshot(): Promise<PredictionMatchResultRow[]> {
  if (!hasPredictionRemoteEnv()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prediction_matches")
    .select("id, result_team_code, result_published_at");

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data || [];
}

/**
 * result_published_at 이 null → 값 으로 넘어간 경기만 정산한다.
 *
 * ponytail: 정산은 단방향이다. 관리자가 결과를 취소하거나 다른 팀으로 고쳐도 이미 나간 배당은
 * 회수하지 않는다 (원장이 append-only 이고 되돌리기는 사람 손이 더 안전하다).
 * 되돌리기가 필요해지면 'bet_payout' 을 상쇄하는 관리자 화면을 따로 만들 것.
 */
export async function settleNewlyPublishedMatches(
  before: PredictionMatchResultRow[],
  after: PredictionMatchResultRow[]
) {
  if (!hasPredictionRemoteEnv()) return [];
  const publishedBefore = new Set(
    before.filter((row) => normalizeText(row.result_published_at)).map((row) => normalizeText(row.id))
  );
  const targets = after.filter(
    (row) =>
      normalizeText(row.result_published_at) &&
      normalizeText(row.result_team_code) &&
      !publishedBefore.has(normalizeText(row.id))
  );

  const settled: string[] = [];
  for (const match of targets) {
    try {
      await settleMatch(normalizeText(match.id), normalizeText(match.result_team_code));
      settled.push(normalizeText(match.id));
    } catch (error) {
      // 한 경기가 실패해도 나머지는 정산한다. 실패분은 재공개(취소 후 재공개) 때 다시 시도된다.
      console.error("[prediction-bets] settle failed", match.id, error);
    }
  }
  return settled;
}

async function settleMatch(matchId: string, resultTeamCode: string) {
  const bets = await readPlacedBets(matchId);
  if (!bets || bets.length === 0) return;

  const supabase = createSupabaseAdminClient();
  for (const row of computeBetSettlement(bets, resultTeamCode)) {
    if (row.status === "won" && row.payout > 0) {
      try {
        // 멱등: (voter_id, 'bet_payout', match_id) 유니크라 재정산해도 두 번 지급되지 않는다
        await applyPointChange(row.bet.voter_id, "", row.payout, "bet_payout", matchId);
      } catch (error) {
        if (!isDuplicateLedgerEntry(error)) throw error;
      }
    }
    const { error } = await supabase
      .from("prediction_bets")
      .update({
        status: row.status,
        payout: row.payout,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.bet.id);
    if (error) throw error;
  }
}

/**
 * 강제 삭제 전 전액 환불. 경기 행이 지워지면 FK cascade 로 베팅 행도 사라지지만,
 * 환불 기록은 원장에 남으므로 잔액은 맞는다.
 */
export async function refundBetsForMatch(matchId: string) {
  if (!hasPredictionRemoteEnv()) return 0;
  const id = normalizeText(matchId);
  if (!id) return 0;

  const bets = await readPlacedBets(id);
  if (!bets || bets.length === 0) return 0;

  const supabase = createSupabaseAdminClient();
  let refunded = 0;
  for (const bet of bets) {
    try {
      await applyPointChange(bet.voter_id, "", bet.stake, "bet_refund", id);
      refunded += 1;
    } catch (error) {
      if (!isDuplicateLedgerEntry(error)) {
        console.error("[prediction-bets] refund failed", bet.id, error);
        continue;
      }
    }
    await supabase
      .from("prediction_bets")
      .update({ status: "refunded", payout: bet.stake, updated_at: new Date().toISOString() })
      .eq("id", bet.id);
  }
  return refunded;
}

/** 공개 응답용 — voter_id 는 나가지 않는다. */
export async function getBetPools(matchIds?: string[]): Promise<PredictionBetPool[]> {
  if (!hasPredictionRemoteEnv()) return [];
  const supabase = createSupabaseAdminClient();
  const ids = Array.isArray(matchIds) ? matchIds.map(normalizeText).filter(Boolean) : [];
  const { data, error } = await supabase.rpc("prediction_bet_pools", {
    match_ids: ids.length > 0 ? ids : null,
  });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : []).map((row) => ({
    matchId: normalizeText(row.match_id),
    teamCode: normalizeText(row.team_code),
    totalStake: Number(row.total_stake || 0),
    betCount: Number(row.bet_count || 0),
  }));
}

export async function getMyBets(voterId: string): Promise<Record<string, PredictionBet>> {
  if (!hasPredictionRemoteEnv()) return {};
  const id = normalizeText(voterId);
  if (!id) return {};

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prediction_bets")
    .select("match_id, team_code, stake, status, payout")
    .eq("voter_id", id);

  if (error) {
    if (isMissingTable(error)) return {};
    throw error;
  }
  return (data || []).reduce<Record<string, PredictionBet>>((acc, row) => {
    acc[normalizeText(row.match_id)] = {
      matchId: normalizeText(row.match_id),
      teamCode: normalizeText(row.team_code),
      stake: Number(row.stake || 0),
      status: row.status as PredictionBetStatus,
      payout: row.payout === null ? null : Number(row.payout),
    };
    return acc;
  }, {});
}

export async function getMyBalance(voterId: string) {
  if (!hasPredictionRemoteEnv()) return 0;
  const id = normalizeText(voterId);
  if (!id) return 0;
  try {
    return await readBalance(id);
  } catch {
    return 0;
  }
}
