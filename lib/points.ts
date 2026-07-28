import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PublicAuthSession } from "@/lib/public-auth";

/** 서버 전용 — service role로 포인트 원장/잔액을 다룬다. 클라이언트에서 import 금지. */

export const SIGNUP_BONUS = 1000;
export const ATTENDANCE_REWARD = 100;

export const USER_POINTS_MISSING_TABLE_MESSAGE =
  "user_points 테이블이 없습니다. scripts/sql/create-user-points.sql 을 Supabase에서 실행해주세요.";

export type PointReason = "signup_bonus" | "attendance" | "bet_place" | "bet_refund" | "bet_payout";

export type PointLedgerEntry = {
  amount: number;
  reason: PointReason;
  refId: string;
  createdAt: string;
};

export type MyPoints = {
  balance: number;
  attendedToday: boolean;
  ledger: PointLedgerEntry[];
};

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  balance: number;
};

/** 예측 투표와 같은 키 포맷 — displayName은 바뀔 수 있으므로 키로 쓰지 않는다. */
export function getPointsVoterId(session: PublicAuthSession | null | undefined) {
  const provider = String(session?.provider || "").trim();
  const providerUserId = String(session?.providerUserId || "").trim();
  if (!provider || !providerUserId) throw new Error("points_login_required");
  return `${provider}:${providerUserId}`;
}

const KST_DATE_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 출석 멱등 키 — KST 자정 기준 YYYY-MM-DD. */
export function getKstDateKey(date: Date = new Date()) {
  return KST_DATE_KEY_FORMAT.format(date);
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "PGRST205" || error?.code === "PGRST202";
}

function isDuplicate(error: unknown) {
  return error instanceof Error && error.message.includes("user_point_duplicate");
}

/** 원장 기록 + 잔액 반영. 새 잔액을 돌려준다. 베팅(prediction-bets)도 이 문으로만 들어온다. */
export async function applyPointChange(
  voterId: string,
  displayName: string,
  amount: number,
  reason: PointReason,
  refId: string
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("apply_user_point_change", {
    p_voter_id: voterId,
    p_display_name: displayName,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: refId,
  });

  if (error) {
    if (isMissingTable(error)) throw new Error(USER_POINTS_MISSING_TABLE_MESSAGE);
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

export async function readBalance(voterId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_point_balances")
    .select("balance")
    .eq("voter_id", voterId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
  return data?.balance ?? 0;
}

/** 최초 1회 가입 보너스 → 오늘자 출석. 둘 다 원장 유니크 키로 멱등. */
export async function claimAttendance(voterId: string, displayName: string) {
  try {
    await applyPointChange(voterId, displayName, SIGNUP_BONUS, "signup_bonus", "signup");
  } catch (error) {
    if (!isDuplicate(error)) throw error;
  }

  try {
    const balance = await applyPointChange(
      voterId,
      displayName,
      ATTENDANCE_REWARD,
      "attendance",
      getKstDateKey()
    );
    return { ok: true, alreadyClaimed: false, balance, reward: ATTENDANCE_REWARD };
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    return { ok: true, alreadyClaimed: true, balance: await readBalance(voterId), reward: 0 };
  }
}

export async function getMyPoints(voterId: string): Promise<MyPoints> {
  const supabase = createSupabaseAdminClient();
  const today = getKstDateKey();

  const [balanceResult, ledgerResult, attendanceResult] = await Promise.all([
    supabase.from("user_point_balances").select("balance").eq("voter_id", voterId).maybeSingle(),
    supabase
      .from("user_point_ledger")
      .select("amount, reason, ref_id, created_at")
      .eq("voter_id", voterId)
      .order("created_at", { ascending: false })
      .limit(20),
    // 최근 20건 안에 출석이 남아있으리란 보장이 없어 별도로 확인한다 (유니크 인덱스 조회)
    supabase
      .from("user_point_ledger")
      .select("id")
      .eq("voter_id", voterId)
      .eq("reason", "attendance")
      .eq("ref_id", today)
      .maybeSingle(),
  ]);

  if (isMissingTable(balanceResult.error) || isMissingTable(ledgerResult.error)) {
    return { balance: 0, attendedToday: false, ledger: [] };
  }
  if (balanceResult.error) throw balanceResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  return {
    balance: balanceResult.data?.balance ?? 0,
    attendedToday: Boolean(attendanceResult.data),
    ledger: (ledgerResult.data ?? []).map((row) => ({
      amount: row.amount,
      reason: row.reason as PointReason,
      refId: row.ref_id,
      createdAt: row.created_at,
    })),
  };
}

/** 공개 응답 — voter_id는 절대 내보내지 않는다 (예측 계약과 동일 원칙). */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_point_balances")
    .select("display_name, balance")
    .order("balance", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return (data ?? []).map((row, index) => ({
    rank: index + 1,
    displayName: row.display_name || "익명",
    balance: row.balance,
  }));
}
