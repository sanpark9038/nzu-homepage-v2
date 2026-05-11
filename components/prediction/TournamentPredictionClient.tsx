"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function formatRemaining(lockAt: string, nowMs: number) {
  const diff = new Date(lockAt).getTime() - nowMs;
  if (diff <= 0) return "마감";

  const totalMinutes = Math.max(1, Math.floor(diff / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function formatMatchStatus(match: PredictionMatch, nowMs: number | null) {
  if (match.status === "result_published") return "결과 공개";
  if (match.status === "closed") return "마감";
  if (nowMs === null) return match.status === "closing_soon" ? "마감 임박" : "투표 중";
  if (match.status === "closing_soon") return `마감 임박 ${formatRemaining(match.lockAt, nowMs)}`;
  if (match.status === "draft") return "준비 중";
  return `마감까지 ${formatRemaining(match.lockAt, nowMs)}`;
}

function formatDateLabel(startAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(startAt));
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

function PlayerLine({ player }: { player: MatchPlayer | null }) {
  if (!player) return <span className="text-white/35">선수 미정</span>;
  return (
    <span className="flex min-w-0 items-center justify-center gap-2">
      <span className="truncate font-black text-white">{player.name}</span>
      <RaceLetterBadge race={player.race || "T"} size="sm" />
      <TierBadge tier={player.tier || "미정"} size="xs" />
    </span>
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
        "flex min-h-[118px] flex-col items-center justify-center rounded-xl border px-4 py-4 text-center transition-all",
        winner
          ? "border-nzu-green/60 bg-nzu-green/14 text-white"
          : selected
            ? "border-cyan-300/50 bg-cyan-500/12 text-white"
            : !canVote
              ? "cursor-default border-white/10 bg-white/[0.04] text-white/70"
              : "border-white/10 bg-white/[0.04] text-white/85 hover:-translate-y-0.5 hover:border-nzu-green/40 hover:bg-white/[0.065]"
      )}
    >
      <strong className="text-xl font-black leading-tight md:text-2xl">{team.teamName} 승리</strong>
      <span className="mt-2 text-sm font-black text-white/72">
        {percent}% · {votes.toLocaleString("ko-KR")}표
      </span>
      {selected ? <span className="mt-1 text-xs font-black text-cyan-100">내 선택</span> : null}
      {winner ? <span className="mt-1 text-xs font-black text-nzu-green">공개 결과</span> : null}
    </button>
  );
}

export function TournamentPredictionClient({
  initialMatches,
  initialMyVotes = {},
  initialSession = null,
}: {
  initialMatches: PredictionMatch[];
  initialMyVotes?: MyVoteState;
  initialSession?: PredictionSession | null;
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [session, setSession] = useState<PredictionSession | null>(initialSession);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<MyVoteState>(initialMyVotes);
  const [message, setMessage] = useState("");
  const [pendingVote, setPendingVote] = useState<{ match: PredictionMatch; team: MatchTeam } | null>(null);
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
    const refresh = async () => {
      const res = await fetch("/api/prediction", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        matches?: PredictionMatch[];
        myVotes?: MyVoteState;
        session?: PredictionSession | null;
      };
      if (Array.isArray(json.matches)) setMatches(json.matches);
      if (json.myVotes && typeof json.myVotes === "object") setMyVotes(json.myVotes);
      if ("session" in json) setSession(json.session || null);
    };

    void refresh();
    const interval = window.setInterval(refresh, 60000);
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
        message?: string;
      };

      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "failed_to_save_vote");
      }
      if (Array.isArray(json.matches)) setMatches(json.matches);
      if (json.myVotes && typeof json.myVotes === "object") setMyVotes(json.myVotes);
      if ("session" in json) setSession(json.session || null);
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
      <section className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-8 text-center text-sm font-bold text-white/50">
        등록된 승부예측이 없습니다.
      </section>
    );
  }

  return (
    <>
      <section className="space-y-3" aria-hidden={pendingVote ? "true" : undefined}>
        {!session ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/62">
            <span>{message || "로그인 후 승부예측에 참여할 수 있습니다. 투표율과 결과는 누구나 확인할 수 있습니다."}</span>
            <a
              href="/api/auth/soop/start?next=/prediction"
              className="rounded-lg bg-nzu-green px-4 py-2 text-xs font-black text-black transition hover:brightness-110"
            >
              LOGIN
            </a>
          </div>
        ) : message ? (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
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

          return (
            <article
              key={match.id}
              className="overflow-hidden rounded-xl border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.94),rgba(6,10,11,0.9))] shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
            >
              <div className="border-b border-white/8 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-white/44">
                  <span>{formatDateLabel(match.startAt)}</span>
                  <span>
                    총 {match.totalTeamVotes.toLocaleString("ko-KR")}표 · {formatMatchStatus(match, nowMs)}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] lg:items-stretch">
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

                <div className="flex min-h-[118px] flex-col items-center justify-center rounded-xl bg-black/12 px-4 py-4 text-center">
                  <MatchTypeBadge type={match.matchType} />
                  <h2 className="mt-3 text-xl font-black text-white">{match.title}</h2>
                  <p className="mt-1 text-sm font-bold text-white/45">
                    {match.matchType === "team"
                      ? "최종 승리팀만 예측합니다."
                      : `${match.teamA.teamName} vs ${match.teamB.teamName}`}
                  </p>
                  <span
                    className={cn(
                      "mt-3 rounded-full px-3 py-1 text-xs font-black",
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

              {isResultPublished(match) ? (
                <div
                  className={cn(
                    "mx-4 mb-4 rounded-xl border px-4 py-3 text-center text-sm font-black",
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

              {match.matchType === "team" && match.entryMatchups.length > 0 ? (
                <div className="border-t border-white/8 px-4 pb-4 pt-3">
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-center">
                    <h3 className="text-sm font-black text-white">엔트리 매치업 안내</h3>
                    <span className="rounded-full border border-white/12 bg-white/[0.045] px-2.5 py-1 text-[11px] font-black text-white/58">
                      {match.entryOrderStatus === "confirmed" ? "경기 순서 확정" : "경기 순서 미정"}
                    </span>
                  </div>
                  <div className="mx-auto max-w-3xl space-y-2">
                    {match.entryMatchups.map((row, index) => (
                      <div
                        key={row.id || index}
                        className="grid grid-cols-[84px_minmax(0,1fr)_38px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 max-md:grid-cols-1"
                      >
                        <strong className="rounded-lg bg-white/[0.06] px-3 py-2 text-center text-sm font-black text-white">
                          {row.label || `매치${index + 1}`}
                        </strong>
                        <PlayerLine player={row.playerA} />
                        <span className="text-center text-xs font-black text-white/38">VS</span>
                        <PlayerLine player={row.playerB} />
                      </div>
                    ))}
                  </div>
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
            className="w-full max-w-sm rounded-xl border border-white/12 bg-[#101819] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <h2 id="prediction-confirm-title" className="text-lg font-black text-white">
              {pendingVote.team.teamName} 승리로 예측할까요?
            </h2>
            <p className="mt-3 text-sm font-bold leading-6 text-white/62">
              예측 변경은 마감 전 한 번만 가능합니다.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-black text-white/72 transition hover:bg-white/[0.08]"
                onClick={() => setPendingVote(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-nzu-green px-4 py-2 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65"
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
