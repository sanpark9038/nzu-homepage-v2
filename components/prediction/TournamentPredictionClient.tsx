"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Crown } from "lucide-react";
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

type PredictionMatch = {
  id: string;
  title: string;
  startAt: string;
  lockAt: string;
  teamA: MatchTeam;
  teamB: MatchTeam;
  totalTeamVotes: number;
  totalMvpVotes: number;
  teamVotes: Record<string, number>;
  mvpVotes: Record<string, number>;
};

const STORAGE_KEY = "nzu.prediction.voter_id.v1";
const MY_VOTES_KEY = "nzu.prediction.my_votes.v1";

type MyVoteState = Record<
  string,
  {
    teamCode?: string | null;
    playerId?: string | null;
  }
>;

function getOrCreateVoterId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `voter-${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(STORAGE_KEY, next);
  return next;
}

function formatRemaining(lockAt: string, nowMs: number) {
  const diff = new Date(lockAt).getTime() - nowMs;
  if (diff <= 0) return "투표 마감";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
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

export function TournamentPredictionClient({ initialMatches }: { initialMatches: PredictionMatch[] }) {
  const [matches, setMatches] = useState(initialMatches);
  const [expandedMatchId, setExpandedMatchId] = useState(initialMatches[0]?.id || null);
  const [voterId, setVoterId] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<MyVoteState>({});

  useEffect(() => {
    setVoterId(getOrCreateVoterId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(MY_VOTES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MyVoteState;
      setMyVotes(parsed || {});
    } catch {
      setMyVotes({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MY_VOTES_KEY, JSON.stringify(myVotes));
  }, [myVotes]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const res = await fetch("/api/prediction", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { matches?: PredictionMatch[] };
      if (Array.isArray(json.matches)) {
        setMatches(json.matches);
      }
    };
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, []);

  const matchMap = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);

  async function submitVote(matchId: string, payload: { teamCode?: string; playerId?: string }) {
    const target = matchMap.get(matchId);
    if (!target) return;
    if (!voterId) return;
    if (new Date(target.lockAt).getTime() <= nowMs) return;

    const busy = `${matchId}:${payload.teamCode || payload.playerId || "vote"}`;
    setBusyKey(busy);
    const previousMatches = matches;
    const previousMyVotes = myVotes;

    try {
      const previousVote = myVotes[matchId] || {};
      const nextVote = {
        teamCode: payload.teamCode ?? previousVote.teamCode ?? null,
        playerId: payload.playerId ?? previousVote.playerId ?? null,
      };

      setMyVotes((prev) => ({
        ...prev,
        [matchId]: nextVote,
      }));

      setMatches((prevMatches) =>
        prevMatches.map((match) => {
          if (match.id !== matchId) return match;

          const teamVotes = { ...match.teamVotes };
          const mvpVotes = { ...match.mvpVotes };
          let totalTeamVotes = match.totalTeamVotes;
          let totalMvpVotes = match.totalMvpVotes;

          if (payload.teamCode) {
            const prevTeamCode = previousVote.teamCode || null;
            if (prevTeamCode && teamVotes[prevTeamCode] !== undefined) {
              teamVotes[prevTeamCode] = Math.max(0, teamVotes[prevTeamCode] - 1);
            } else {
              totalTeamVotes += 1;
            }
            if (teamVotes[payload.teamCode] !== undefined) {
              teamVotes[payload.teamCode] += 1;
            }
          }

          if (payload.playerId) {
            const prevPlayerId = previousVote.playerId || null;
            if (prevPlayerId && mvpVotes[prevPlayerId] !== undefined) {
              mvpVotes[prevPlayerId] = Math.max(0, mvpVotes[prevPlayerId] - 1);
            } else {
              totalMvpVotes += 1;
            }
            if (mvpVotes[payload.playerId] !== undefined) {
              mvpVotes[payload.playerId] += 1;
            }
          }

          return {
            ...match,
            totalTeamVotes,
            totalMvpVotes,
            teamVotes,
            mvpVotes,
          };
        })
      );

      const requestBody: Record<string, string> = {
        voter_id: voterId,
        match_id: matchId,
      };

      if (payload.teamCode) {
        requestBody.picked_team_code = payload.teamCode;
      }

      if (payload.playerId) {
        requestBody.picked_player_id = payload.playerId;
      }

      const res = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matches?: PredictionMatch[];
      };
      if (!res.ok || json.ok === false) {
        throw new Error("failed to save vote");
      }
      if (Array.isArray(json.matches)) {
        setMatches(json.matches);
      }
    } catch {
      setMatches(previousMatches);
      setMyVotes(previousMyVotes);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="space-y-3">
      {matches.map((match) => {
        const isLocked = new Date(match.lockAt).getTime() <= nowMs;
        const isExpanded = expandedMatchId === match.id;
        const leftVotes = match.teamVotes[match.teamA.teamCode] || 0;
        const rightVotes = match.teamVotes[match.teamB.teamCode] || 0;
        const leftPercent = formatPercent(leftVotes, match.totalTeamVotes);
        const rightPercent = formatPercent(rightVotes, match.totalTeamVotes);
        return (
          <article
            key={match.id}
            className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.92),rgba(6,10,11,0.88))] shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
          >
            <div
              className="cursor-pointer px-5 py-3"
              onClick={() => setExpandedMatchId((prev) => (prev === match.id ? null : match.id))}
            >
              <div className="flex items-center justify-between gap-3 text-[14px] font-black tracking-tight text-white/60">
                <div>{formatDateLabel(match.startAt)}</div>
                <div className={cn(isLocked ? "text-white/40" : "text-nzu-green")}>
                  {formatRemaining(match.lockAt, nowMs)}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <button
                  type="button"
                  disabled={isLocked || busyKey !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void submitVote(match.id, { teamCode: match.teamA.teamCode });
                    setExpandedMatchId(match.id);
                  }}
                  className={cn(
                    "rounded-[1.1rem] border px-3 py-3 text-center transition-all",
                    isLocked
                      ? "cursor-default border-white/8 bg-white/[0.03] text-white/60"
                      : "cursor-pointer border-white/10 bg-white/[0.03] text-white/82 hover:-translate-y-0.5 hover:border-nzu-green/35 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <div className="truncate text-[1.12rem] font-bold tracking-tight opacity-75">{match.teamA.teamName}</div>
                  <div className="mt-1 text-[1.75rem] font-black tracking-tighter text-white">{leftPercent}%</div>
                </button>

                <div className="px-1 text-[1rem] font-black tracking-[0.12em] text-white/20">VS</div>

                <button
                  type="button"
                  disabled={isLocked || busyKey !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void submitVote(match.id, { teamCode: match.teamB.teamCode });
                    setExpandedMatchId(match.id);
                  }}
                  className={cn(
                    "rounded-[1.1rem] border px-3 py-3 text-center transition-all",
                    isLocked
                      ? "cursor-default border-white/8 bg-white/[0.03] text-white/60"
                      : "cursor-pointer border-white/10 bg-white/[0.03] text-white/82 hover:-translate-y-0.5 hover:border-nzu-green/35 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <div className="truncate text-[1.12rem] font-bold tracking-tight opacity-75">{match.teamB.teamName}</div>
                  <div className="mt-1 text-[1.75rem] font-black tracking-tighter text-white">{rightPercent}%</div>
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-full bg-white/6">
                <div className="flex h-2 w-full">
                  <div
                    className="bg-nzu-green transition-all"
                    style={{ width: `${Math.max(leftPercent, leftVotes > 0 ? 6 : 0)}%` }}
                  />
                  <div
                    className="bg-white/24 transition-all"
                    style={{ width: `${Math.max(rightPercent, rightVotes > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[12px] font-bold text-white/38">
                <div>
                  {isLocked ? "투표 마감" : "팀 카드를 눌러 승리팀 선택"}
                </div>
                <div className="flex items-center gap-1">
                  <span>선수 보기</span>
                  <ChevronDown
                    size={15}
                    className={cn("transition-transform", isExpanded ? "rotate-180" : "")}
                  />
                </div>
              </div>
            </div>

            {isExpanded ? (
              <div className="border-t border-white/6 bg-black/15 px-5 py-5">
                <div className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
                  <Crown size={13} />
                  경기 다승왕 예상
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {[match.teamA, match.teamB].map((team) => (
                    <section key={team.teamCode} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                      <div className="mb-3 text-sm font-black tracking-tight text-white">{team.teamName}</div>
                      <div className="space-y-2.5">
                        {team.players.map((player) => {
                          const votes = match.mvpVotes[player.id] || 0;
                          const percent = formatPercent(votes, match.totalMvpVotes);
                          return (
                            <button
                              key={player.id}
                              type="button"
                              disabled={isLocked || busyKey !== null}
                              onClick={() => void submitVote(match.id, { playerId: player.id })}
                              className={cn(
                                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1rem] border px-3 py-3 text-left transition-all",
                                isLocked
                                  ? "cursor-default border-white/8 bg-black/15"
                                  : "cursor-pointer border-white/10 bg-black/15 hover:border-nzu-green/30 hover:bg-white/[0.04]"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="truncate text-[15px] font-black tracking-tight text-white">
                                    {player.name}
                                  </div>
                                  <RaceLetterBadge race={player.race || "R"} size="sm" />
                                  <TierBadge tier={player.tier || "미정"} size="xs" />
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black tracking-tight text-white">{percent}%</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="mt-4 rounded-[1rem] border border-white/8 bg-white/[0.02] px-4 py-3 text-[12px] font-bold text-white/42">
                  {isLocked
                    ? "투표는 마감되었고 현재 결과만 확인할 수 있습니다."
                    : "경기 시작 30분 전까지만 승리팀과 다승왕 선택을 바꿀 수 있습니다."}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
