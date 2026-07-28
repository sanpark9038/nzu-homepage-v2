"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import { TierBadge } from "@/components/ui/nzu-badges";
import { cn } from "@/lib/utils";

type MatchPlayer = {
  id: string;
  name: string;
  race: string | null;
  tier: string | null;
};

type MatchTeam = {
  teamCode: string;
  teamName: string;
  players: MatchPlayer[];
};

type EntryMatchup = {
  id: string;
  label: string;
  playerA: MatchPlayer | null;
  playerB: MatchPlayer | null;
};

type PredictionMatch = {
  id: string;
  matchType: "team" | "individual";
  teamMode: "existing" | "direct";
  title: string;
  startAt: string;
  startTimeTbd?: boolean;
  lockAt: string;
  status: "draft" | "open" | "closing_soon" | "closed" | "result_published" | "archived";
  resultTeamCode: string | null;
  resultPublishedAt: string | null;
  entryOrderStatus: "unknown" | "confirmed";
  entryMatchups: EntryMatchup[];
  teamA: MatchTeam;
  teamB: MatchTeam;
  totalTeamVotes: number;
  teamVotes: Record<string, number>;
};

type MyVoteState = Record<
  string,
  {
    teamCode?: string | null;
    playerId?: string | null;
    changeCount?: number;
  }
>;

type PredictionSession = {
  provider: string;
  displayName: string;
  avatarUrl?: string | null;
};

type BetPool = {
  matchId: string;
  teamCode: string;
  totalStake: number;
  betCount: number;
};

type MyBet = {
  matchId: string;
  teamCode: string;
  stake: number;
  status: "placed" | "won" | "lost" | "refunded";
  payout: number | null;
};

/** matchId → teamCode → 누적 스테이크 */
type BetPoolMap = Record<string, Record<string, number>>;

const BET_CHIPS = [100, 500, 1000];

function buildBetPoolMap(pools: BetPool[] | undefined | null): BetPoolMap {
  if (!Array.isArray(pools)) return {};
  return pools.reduce<BetPoolMap>((acc, row) => {
    const matchId = String(row.matchId || "");
    const teamCode = String(row.teamCode || "");
    if (!matchId || !teamCode) return acc;
    const teams = acc[matchId] || {};
    teams[teamCode] = (teams[teamCode] || 0) + Number(row.totalStake || 0);
    acc[matchId] = teams;
    return acc;
  }, {});
}

function formatPoints(value: number) {
  return Number(value || 0).toLocaleString("ko-KR");
}

/** 파리뮤추얼 예상 배당 = 총풀 / 해당 팀풀. 팀풀이 0이면 계산 불가. */
function formatOdds(totalPool: number, teamPool: number) {
  if (!teamPool) return "-";
  return (totalPool / teamPool).toFixed(1);
}

function mapBetError(code: string) {
  if (code === "points_insufficient") return "포인트가 부족합니다.";
  if (code === "bet_exists") return "이미 이 경기에 베팅했습니다.";
  if (code === "bet_invalid_stake") return "베팅 금액을 다시 확인해주세요.";
  if (code === "bet_invalid_team") return "먼저 승리할 팀을 선택해주세요.";
  return "베팅에 실패했습니다.";
}

function BetSection({
  match,
  pool,
  myBet,
  myBalance,
  myTeamCode,
  session,
  stake,
  busy,
  error,
  onSelectStake,
  onPlaceBet,
}: {
  match: PredictionMatch;
  pool: Record<string, number>;
  myBet: MyBet | null;
  myBalance: number;
  myTeamCode: string;
  session: PredictionSession | null;
  stake: number;
  busy: boolean;
  error: string;
  onSelectStake: (value: number) => void;
  onPlaceBet: () => void;
}) {
  const votingOpen = isVotingOpen(match);
  const teamAStake = pool[match.teamA.teamCode] || 0;
  const teamBStake = pool[match.teamB.teamCode] || 0;
  const totalPool = teamAStake + teamBStake;
  if (!votingOpen && !myBet && totalPool === 0) return null;

  const myBetTeamName =
    myBet && myBet.teamCode === match.teamB.teamCode ? match.teamB.teamName : match.teamA.teamName;

  return (
    <div className="border-t border-white/8 px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-medium">
        <span className="ui-label uppercase text-white/38">Point Pool</span>
        <span className="text-white/62">
          {match.teamA.teamName} {formatPoints(teamAStake)}P · 배당 {formatOdds(totalPool, teamAStake)}
        </span>
        <span className="text-white/20">/</span>
        <span className="text-white/62">
          {match.teamB.teamName} {formatPoints(teamBStake)}P · 배당 {formatOdds(totalPool, teamBStake)}
        </span>
      </div>

      {!session ? (
        <p className="mt-2 text-center text-xs font-medium text-white/45">
          포인트 베팅은 로그인 후 이용할 수 있습니다.{" "}
          <a href="/points" className="font-semibold text-nzu-green hover:underline">
            내 포인트
          </a>
        </p>
      ) : myBet ? (
        <p className="mt-2 text-center text-xs font-semibold text-cyan-100">
          내 베팅: {formatPoints(myBet.stake)}P · {myBetTeamName}
          {myBet.status === "won" ? ` · 적중 +${formatPoints(myBet.payout || 0)}P` : ""}
          {myBet.status === "lost" ? " · 미적중" : ""}
          {myBet.status === "refunded" ? " · 환불 완료" : ""}
        </p>
      ) : votingOpen ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-white/45">
            내 포인트 <strong className="text-nzu-green">{formatPoints(myBalance)}P</strong>
          </span>
          {BET_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onSelectStake(chip)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-bold transition",
                stake === chip
                  ? "border-nzu-green/60 bg-nzu-green/15 text-nzu-green"
                  : "border-white/12 bg-white/[0.045] text-white/62 hover:border-nzu-green/30 hover:text-white"
              )}
            >
              {chip}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={onPlaceBet}
            className="rounded-lg bg-nzu-green px-3.5 py-1.5 text-xs font-bold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            베팅
          </button>
          <a href="/points" className="ml-1 text-xs font-semibold text-white/45 hover:text-nzu-green">
            내 포인트
          </a>
        </div>
      ) : null}

      {session && votingOpen && !myBet && !myTeamCode ? (
        <p className="mt-1.5 text-center text-xs font-medium text-white/38">
          먼저 승리할 팀을 선택하면 포인트를 걸 수 있습니다.
        </p>
      ) : null}

      {error ? <p className="mt-1.5 text-center text-xs font-semibold text-red-200">{error}</p> : null}
    </div>
  );
}

function formatRemaining(lockAt: string, nowMs: number) {
  const diff = new Date(lockAt).getTime() - nowMs;
  if (diff <= 0) return "마감";

  const totalMinutes = Math.max(1, Math.floor(diff / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return String(days) + "일 " + String(hours) + "시간";
  if (hours > 0) return String(hours) + "시간 " + String(minutes) + "분";
  return String(minutes) + "분";
}

function formatMatchStatus(match: PredictionMatch, nowMs: number | null) {
  if (match.status === "result_published") return "결과 공개";
  if (match.status === "closed") return "마감";
  if (nowMs === null) return match.status === "closing_soon" ? "마감 임박" : "투표 중";
  if (match.status === "closing_soon") return "마감 임박 " + formatRemaining(match.lockAt, nowMs);
  if (match.status === "draft") return "준비 중";
  return "투표 중";
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatDateOnlyLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatStartLabel(match: PredictionMatch) {
  return match.startTimeTbd ? `${formatDateOnlyLabel(match.startAt)} 시간 미정` : formatDateTimeLabel(match.startAt);
}

function formatDeadlineLabel(lockAt: string) {
  return formatDateTimeLabel(lockAt);
}

function formatPercent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function isVotingOpen(match: PredictionMatch) {
  return match.status === "open" || match.status === "closing_soon";
}

function isResultPublished(match: PredictionMatch) {
  return match.status === "result_published" && Boolean(match.resultTeamCode);
}

function mapVoteError(message: string) {
  if (message === "prediction_login_required") return "로그인 후 투표할 수 있습니다.";
  if (message === "prediction_change_limit_reached") return "예측 변경은 한 번만 가능합니다.";
  if (message === "prediction_vote_closed") return "이미 마감된 예측입니다.";
  if (message === "invalid_team_pick") return "선택할 수 없는 항목입니다.";
  return "투표 저장에 실패했습니다.";
}

function MatchTypeBadge({ type }: { type: PredictionMatch["matchType"] }) {
  return (
    <span
      className={cn(
        "ui-label inline-flex items-center justify-center rounded-full border px-2.5 py-0.5",
        type === "team"
          ? "border-violet-300/45 bg-violet-500/15 text-violet-100"
          : "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
      )}
    >
      {type === "team" ? "팀전" : "개인전"}
    </span>
  );
}

function MatchMetaItem({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="ui-subtle-surface flex min-h-[54px] items-center justify-between gap-3 border-white/8 px-4 py-2 md:border-r md:last:border-r-0">
      <span className="ui-label uppercase">{label}</span>
      <strong className={cn("ui-value", accent ? "text-nzu-green" : "")}>{value}</strong>
    </div>
  );
}

function PlayerLine({ player }: { player: MatchPlayer | null }) {
  if (!player) return <span className="text-white/35">선수 미정</span>;
  return (
    <span className="flex min-w-0 items-center justify-center gap-2">
      <span className="truncate font-semibold text-white">{player.name}</span>
      <RaceLetterBadge race={player.race || "T"} size="sm" />
      <TierBadge tier={player.tier || "미정"} size="xs" />
    </span>
  );
}

function IndividualMatchupLine({ match }: { match: PredictionMatch }) {
  const leftPlayer = match.teamA.players[0] || null;
  const rightPlayer = match.teamB.players[0] || null;

  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-white/65">
      <PlayerLine player={leftPlayer} />
      <span className="ui-label text-white/36">VS</span>
      <PlayerLine player={rightPlayer} />
    </div>
  );
}

function PickButton({
  team,
  votes,
  totalVotes,
  selected,
  winner,
  canVote,
  busy,
  onPick,
}: {
  team: MatchTeam;
  votes: number;
  totalVotes: number;
  selected: boolean;
  winner: boolean;
  canVote: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const percent = formatPercent(votes, totalVotes);
  return (
    <button
      type="button"
      disabled={!canVote || busy}
      onClick={onPick}
      className={cn(
        "flex min-h-[68px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-center transition-all",
        winner
          ? "border-nzu-green/60 bg-nzu-green/14 text-white"
          : selected
            ? "border-cyan-300/50 bg-cyan-500/12 text-white"
            : !canVote
              ? "cursor-default border-white/10 bg-white/[0.04] text-white/70"
              : "border-white/10 bg-white/[0.04] text-white/85 hover:-translate-y-0.5 hover:border-nzu-green/40 hover:bg-white/[0.065]"
      )}
    >
      <strong className="ui-value leading-tight md:text-lg">{team.teamName} 승리</strong>
      <span className="ui-label mt-1 text-white/72">
        {percent}% · {votes.toLocaleString("ko-KR")}표
      </span>
      {selected ? <span className="mt-1 text-xs font-semibold text-cyan-100">내 선택</span> : null}
      {winner ? <span className="mt-1 text-xs font-semibold text-nzu-green">공개 결과</span> : null}
    </button>
  );
}

export function TournamentPredictionClient({
  initialMatches,
  initialMyVotes = {},
  initialSession = null,
  initialBetPools = [],
}: {
  initialMatches: PredictionMatch[];
  initialMyVotes?: MyVoteState;
  initialSession?: PredictionSession | null;
  initialBetPools?: BetPool[];
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [session, setSession] = useState<PredictionSession | null>(initialSession);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<MyVoteState>(initialMyVotes);
  const [message, setMessage] = useState("");
  const [betPools, setBetPools] = useState<BetPoolMap>(() => buildBetPoolMap(initialBetPools));
  const [myBets, setMyBets] = useState<Record<string, MyBet>>({});
  const [myBalance, setMyBalance] = useState(0);
  const [betStakes, setBetStakes] = useState<Record<string, number>>({});
  const [betErrors, setBetErrors] = useState<Record<string, string>>({});
  const [pendingVote, setPendingVote] = useState<{ match: PredictionMatch; team: MatchTeam } | null>(null);
  const [expandedEntryMatchIds, setExpandedEntryMatchIds] = useState<Set<string>>(() => new Set());
  const confirmVoteButtonRef = useRef<HTMLButtonElement | null>(null);

  const matchMap = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);

  useEffect(() => {
    if (session) setMessage("");
  }, [session]);

  useEffect(() => {
    setMyVotes((prev) => {
      const next: MyVoteState = {};
      for (const [matchId, vote] of Object.entries(prev)) {
        const match = matchMap.get(matchId);
        if (!match) continue;
        const validTeam =
          !vote.teamCode ||
          vote.teamCode === match.teamA.teamCode ||
          vote.teamCode === match.teamB.teamCode;
        if (validTeam) next[matchId] = vote;
      }
      return next;
    });
  }, [matchMap]);

  useEffect(() => {
    setNowMs(Date.now());
    const tick = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const refreshViewerState = async () => {
      const res = await fetch("/api/prediction?scope=viewer", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        myVotes?: MyVoteState;
        session?: PredictionSession | null;
        betPools?: BetPool[];
        myBets?: Record<string, MyBet>;
        myBalance?: number;
      };
      if (json.myVotes && typeof json.myVotes === "object") setMyVotes(json.myVotes);
      if ("session" in json) setSession(json.session || null);
      if (Array.isArray(json.betPools)) setBetPools(buildBetPoolMap(json.betPools));
      if (json.myBets && typeof json.myBets === "object") setMyBets(json.myBets);
      if (typeof json.myBalance === "number") setMyBalance(json.myBalance);
    };

    void refreshViewerState();
    const interval = window.setInterval(refreshViewerState, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!pendingVote) return;
    confirmVoteButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingVote(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingVote]);

  function requestVoteConfirmation(match: PredictionMatch, team: MatchTeam) {
    if (!isVotingOpen(match) || !session) return;
    if (myVotes[match.id]?.teamCode === team.teamCode) return;
    setPendingVote({ match, team });
  }

  function toggleEntryMatchups(matchId: string) {
    setExpandedEntryMatchIds((current) => {
      const next = new Set(current);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }

  function applyBetPayload(json: {
    betPools?: BetPool[];
    myBets?: Record<string, MyBet>;
    myBalance?: number;
  }) {
    if (Array.isArray(json.betPools)) setBetPools(buildBetPoolMap(json.betPools));
    if (json.myBets && typeof json.myBets === "object") setMyBets(json.myBets);
    if (typeof json.myBalance === "number") setMyBalance(json.myBalance);
  }

  /** 베팅은 투표와 같은 문(POST /api/prediction)으로 나간다 — 이미 고른 팀에 스테이크만 얹는 것. */
  async function submitBet(matchId: string) {
    const target = matchMap.get(matchId);
    if (!target || !isVotingOpen(target) || !session) return;

    const teamCode = myVotes[matchId]?.teamCode || "";
    if (!teamCode) {
      setBetErrors((prev) => ({ ...prev, [matchId]: mapBetError("bet_invalid_team") }));
      return;
    }

    setBusyKey(`${matchId}:bet`);
    setBetErrors((prev) => ({ ...prev, [matchId]: "" }));

    try {
      const res = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          picked_team_code: teamCode,
          stake: betStakes[matchId] || BET_CHIPS[0],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionMatch[];
        myVotes?: MyVoteState;
        betPools?: BetPool[];
        myBets?: Record<string, MyBet>;
        myBalance?: number;
        betError?: string;
        message?: string;
      };

      if (!res.ok || json.ok === false) throw new Error(json.message || "bet_failed");
      if (Array.isArray(json.matches)) setMatches(json.matches);
      if (json.myVotes && typeof json.myVotes === "object") setMyVotes(json.myVotes);
      applyBetPayload(json);
      if (json.betError) setBetErrors((prev) => ({ ...prev, [matchId]: mapBetError(json.betError || "") }));
    } catch (error) {
      setBetErrors((prev) => ({
        ...prev,
        [matchId]: mapBetError(error instanceof Error ? error.message : ""),
      }));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitVote(matchId: string, teamCode: string) {
    const target = matchMap.get(matchId);
    if (!target || !isVotingOpen(target)) return;
    if (!session) {
      setMessage("로그인 후 투표할 수 있습니다.");
      return;
    }

    const busy = `${matchId}:${teamCode}`;
    setBusyKey(busy);
    setMessage("");
    const previousMatches = matches;
    const previousMyVotes = myVotes;

    try {
      const previousVote = myVotes[matchId] || {};
      if (previousVote.teamCode === teamCode) {
        setBusyKey(null);
        return;
      }

      setMyVotes((prev) => ({
        ...prev,
        [matchId]: { ...previousVote, teamCode },
      }));

      setMatches((prevMatches) =>
        prevMatches.map((match) => {
          if (match.id !== matchId) return match;

          const teamVotes = { ...match.teamVotes };
          let totalTeamVotes = match.totalTeamVotes;
          const prevTeamCode = previousVote.teamCode || null;

          if (prevTeamCode && teamVotes[prevTeamCode] !== undefined) {
            teamVotes[prevTeamCode] = Math.max(0, teamVotes[prevTeamCode] - 1);
          } else {
            totalTeamVotes += 1;
          }
          if (teamVotes[teamCode] !== undefined) teamVotes[teamCode] += 1;

          return {
            ...match,
            totalTeamVotes,
            teamVotes,
          };
        })
      );

      const res = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          picked_team_code: teamCode,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionMatch[];
        myVotes?: MyVoteState;
        session?: PredictionSession | null;
        betPools?: BetPool[];
        myBets?: Record<string, MyBet>;
        myBalance?: number;
        message?: string;
      };

      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "failed_to_save_vote");
      }
      if (Array.isArray(json.matches)) setMatches(json.matches);
      if (json.myVotes && typeof json.myVotes === "object") setMyVotes(json.myVotes);
      if ("session" in json) setSession(json.session || null);
      applyBetPayload(json);
    } catch (error) {
      setMatches(previousMatches);
      setMyVotes(previousMyVotes);
      setMessage(mapVoteError(error instanceof Error ? error.message : ""));
    } finally {
      setBusyKey(null);
    }
  }

  if (matches.length === 0) {
    return (
      <section className="hosaga-card px-5 py-8 text-center text-sm font-medium text-white/45">
        등록된 승부예측이 없습니다.
      </section>
    );
  }

  return (
    <>
      <section className="space-y-3" aria-hidden={pendingVote ? "true" : undefined}>
        {!session ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/58">
            <span>{message || "로그인 후 승부예측에 참여할 수 있습니다. 투표 현황과 결과는 누구나 확인할 수 있습니다."}</span>
            <a
              href="/api/auth/soop/start?next=/prediction"
              className="rounded-lg bg-nzu-green px-4 py-2 text-xs font-bold text-black transition hover:brightness-110"
            >
              LOGIN
            </a>
          </div>
        ) : message ? (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
            {message}
          </div>
        ) : null}

        {matches.map((match) => {
          const canVote = Boolean(session) && isVotingOpen(match);
          const myVote = myVotes[match.id] || {};
          const leftVotes = match.teamVotes[match.teamA.teamCode] || 0;
          const rightVotes = match.teamVotes[match.teamB.teamCode] || 0;
          const leftSelected = myVote.teamCode === match.teamA.teamCode;
          const rightSelected = myVote.teamCode === match.teamB.teamCode;
          const leftWinner = isResultPublished(match) && match.resultTeamCode === match.teamA.teamCode;
          const rightWinner = isResultPublished(match) && match.resultTeamCode === match.teamB.teamCode;
          const winnerName = leftWinner ? match.teamA.teamName : rightWinner ? match.teamB.teamName : "";
          const hasMyPick = Boolean(myVote.teamCode);
          const isCorrect = hasMyPick && myVote.teamCode === match.resultTeamCode;
          const hasEntryMatchups = match.matchType === "team" && match.entryMatchups.length > 0;
          const isEntryExpanded = expandedEntryMatchIds.has(match.id);
          const entryMatchupPanelId = `entry-matchups-${match.id}`;

          return (
            <article key={match.id} className="ui-surface overflow-hidden rounded-xl border border-white/8">
              <div className="grid border-b border-white/8 md:grid-cols-3">
                <MatchMetaItem label="경기 시작" value={formatStartLabel(match)} accent />
                <MatchMetaItem label="마감" value={formatDeadlineLabel(match.lockAt)} />
                <MatchMetaItem label="총 투표" value={`${match.totalTeamVotes.toLocaleString("ko-KR")}표`} />
              </div>

              <div className="grid gap-2 p-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(260px,340px)_minmax(0,0.95fr)] lg:items-center">
                <PickButton
                  team={match.teamA}
                  votes={leftVotes}
                  totalVotes={match.totalTeamVotes}
                  selected={leftSelected}
                  winner={leftWinner}
                  canVote={canVote}
                  busy={busyKey !== null}
                  onPick={() => requestVoteConfirmation(match, match.teamA)}
                />

                <div className="flex min-h-[88px] flex-col items-center justify-center rounded-xl bg-black/18 px-3 py-2 text-center">
                  <MatchTypeBadge type={match.matchType} />
                  <h2 className="ui-card-title mt-2 leading-snug md:text-xl">{match.title}</h2>
                  {match.matchType === "team" ? (
                    <p className="mt-0.5 text-xs font-medium text-white/45">최종 승리팀만 예측합니다.</p>
                  ) : (
                    <IndividualMatchupLine match={match} />
                  )}
                  <span
                    className={cn(
                      "ui-label mt-2 rounded-full px-2.5 py-0.5",
                      match.status === "closing_soon"
                        ? "bg-amber-400/15 text-amber-100"
                        : isVotingOpen(match)
                          ? "bg-nzu-green/12 text-nzu-green"
                          : "bg-white/[0.06] text-white/62"
                    )}
                  >
                    {formatMatchStatus(match, nowMs)}
                  </span>
                </div>

                <PickButton
                  team={match.teamB}
                  votes={rightVotes}
                  totalVotes={match.totalTeamVotes}
                  selected={rightSelected}
                  winner={rightWinner}
                  canVote={canVote}
                  busy={busyKey !== null}
                  onPick={() => requestVoteConfirmation(match, match.teamB)}
                />
              </div>

              <BetSection
                match={match}
                pool={betPools[match.id] || {}}
                myBet={myBets[match.id] || null}
                myBalance={myBalance}
                myTeamCode={myVote.teamCode || ""}
                session={session}
                stake={betStakes[match.id] || BET_CHIPS[0]}
                busy={busyKey !== null}
                error={betErrors[match.id] || ""}
                onSelectStake={(value) => setBetStakes((prev) => ({ ...prev, [match.id]: value }))}
                onPlaceBet={() => void submitBet(match.id)}
              />

              {isResultPublished(match) ? (
                <div
                  className={cn(
                    "mx-4 mb-4 rounded-xl border px-4 py-3 text-center text-sm font-semibold",
                    hasMyPick
                      ? isCorrect
                        ? "border-nzu-green/30 bg-nzu-green/10 text-nzu-green"
                        : "border-red-300/25 bg-red-500/10 text-red-200"
                      : "border-white/10 bg-white/[0.035] text-white/58"
                  )}
                >
                  실제 결과는 {winnerName} 승리입니다.{" "}
                  {hasMyPick ? (isCorrect ? "내 예측이 적중했습니다." : "내 예측은 빗나갔습니다.") : "투표 기록이 없습니다."}
                </div>
              ) : null}

              {hasEntryMatchups ? (
                <div className="border-t border-white/8 px-4 pb-4 pt-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2 max-md:w-full">
                      <h3 className="text-sm font-semibold text-white">엔트리 매치업 안내</h3>
                      <span className="ui-label rounded-full border border-white/12 bg-white/[0.045] px-2.5 py-1 text-white/58">
                        {match.entryOrderStatus === "confirmed" ? "경기 순서 확정" : "경기 순서 미정"}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-expanded={isEntryExpanded}
                      aria-controls={entryMatchupPanelId}
                      onClick={() => toggleEntryMatchups(match.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-nzu-green/30 hover:text-white max-md:mx-auto"
                    >
                      <span>{isEntryExpanded ? "접기" : "상세보기"}</span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={cn("transition-transform", isEntryExpanded ? "rotate-180" : "")}
                      />
                    </button>
                  </div>
                  {isEntryExpanded ? (
                    <div id={entryMatchupPanelId} className="mx-auto max-w-3xl space-y-2">
                      {match.entryMatchups.map((row, index) => (
                        <div
                          key={row.id || index}
                          className="grid grid-cols-[84px_minmax(0,1fr)_38px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 max-md:grid-cols-1"
                        >
                          <strong className="rounded-lg bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold text-white">
                            {row.label || `매치${index + 1}`}
                          </strong>
                          <PlayerLine player={row.playerA} />
                          <span className="text-center text-xs font-semibold text-white/35">VS</span>
                          <PlayerLine player={row.playerB} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {pendingVote ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prediction-confirm-title"
            className="hosaga-card w-full max-w-sm p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <h2 id="prediction-confirm-title" className="text-lg font-bold text-white">
              {pendingVote.team.teamName} 승리로 예측할까요?
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-white/58">
              예측 변경은 마감 전 한 번만 가능합니다.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.08]"
                onClick={() => setPendingVote(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-nzu-green px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65"
                disabled={busyKey !== null}
                ref={confirmVoteButtonRef}
                onClick={() => {
                  void submitVote(pendingVote.match.id, pendingVote.team.teamCode);
                  setPendingVote(null);
                }}
              >
                예측 확정
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
