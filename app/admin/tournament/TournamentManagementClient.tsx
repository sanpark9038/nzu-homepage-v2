"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminReadonlyNotice } from "@/components/admin/AdminReadonlyNotice";
import { AdminNav } from "@/components/admin/AdminNav";
import LogoutButton from "../ops/LogoutButton";
import { Search, Target, Trash2, Crown, Plus, X } from "lucide-react";
import { TierBadge } from "@/components/ui/nzu-badges";
import { TOURNAMENT_TEAM_SIZE } from "@/lib/tournament-constants";

type TournamentPagePlayer = {
  id: string;
  name: string;
  nickname?: string | null;
  race?: string | null;
  tier?: string | null;
  is_placeholder?: boolean;
};

type TournamentPageTeam = {
  teamCode: string;
  teamName: string;
  captainPlayerId: string;
  players: TournamentPagePlayer[];
  playerCount: number;
};

type TournamentTeamsResponse = {
  ok: boolean;
  players?: TournamentPagePlayer[];
  tournament_teams?: Array<{
    code: string;
    name: string;
    captainPlayerId?: string;
    player_count?: number;
    players?: TournamentPagePlayer[];
  }>;
  message?: string;
};

export default function TournamentManagementClient({ readOnly = false }: { readOnly?: boolean }) {
  const [teams, setTeams] = useState<TournamentPageTeam[]>([]);
  const [dbPlayers, setDbPlayers] = useState<TournamentPagePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlayerToRecruit, setSelectedPlayerToRecruit] =
    useState<TournamentPagePlayer | null>(null);
  const [dbQuery, setDbQuery] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roster?source=db");
      const json = (await res.json()) as TournamentTeamsResponse;

      if (json.ok) {
        setDbPlayers(json.players || []);
        if (json.tournament_teams) {
          setTeams(
            json.tournament_teams.map((team) => ({
              teamCode: team.code,
              teamName: team.name,
              captainPlayerId: team.captainPlayerId || "",
              players: (team.players || []).map((player) => ({
                id: player.id,
                name: player.name,
                race: player.race,
                tier: player.tier,
                is_placeholder: player.is_placeholder,
              })),
              playerCount: team.player_count || 0,
            }))
          );
        }
      }
    } catch (error) {
      console.error("Failed to load tournament data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const recruitPlayer = async (targetTeamCode: string) => {
    if (!selectedPlayerToRecruit) return;
    const targetTeam = teams.find((team) => team.teamCode === targetTeamCode);
    if (targetTeam && targetTeam.players.length >= TOURNAMENT_TEAM_SIZE) {
      setMessage(`참가팀은 최대 ${TOURNAMENT_TEAM_SIZE}명까지 구성할 수 있습니다.`);
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    if (readOnly) {
      setMessage("현재 배포 환경에서는 토너먼트 팀을 읽기 전용으로만 확인할 수 있습니다.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recruit_player",
          player: selectedPlayerToRecruit,
          team_code: targetTeamCode,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage(`${selectedPlayerToRecruit.name} 선수를 영입했습니다!`);
        setSelectedPlayerToRecruit(null);
        setDbQuery("");
        await loadData();
      } else {
        setMessage(json.message || "영입 실패");
      }
    } catch {
      setMessage("영입 중 오류 발생");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateTeamName = async (teamCode: string, newName: string) => {
    if (readOnly) {
      setMessage("현재 배포 환경에서는 토너먼트 팀명을 수정할 수 없습니다.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_team_name",
          team_code: teamCode,
          team_name: newName,
        }),
      });
      if (res.ok) {
        setMessage("팀명이 업데이트되었습니다.");
        await loadData();
      } else {
        const json = await res.json();
        setMessage(json.message || "팀명 수정 실패");
      }
    } catch {
      setMessage("팀명 수정 중 오류 발생");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const setTeamCaptain = async (teamCode: string, captainId: string) => {
    if (readOnly) {
      setMessage("현재 배포 환경에서는 토너먼트 팀장을 수정할 수 없습니다.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_team_captain",
          team_code: teamCode,
          captain_player_id: captainId,
        }),
      });
      if (res.ok) {
        setMessage("팀장이 설정되었습니다.");
        await loadData();
      } else {
        const json = await res.json();
        setMessage(json.message || "팀장 설정 실패");
      }
    } catch {
      setMessage("팀장 설정 중 오류 발생");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const removePlayer = async (slotCode: string, playerId: string, playerName: string) => {
    if (readOnly) {
      setMessage("현재 배포 환경에서는 토너먼트 선수를 방출할 수 없습니다.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_player_from_slot",
          player_id: playerId,
          slot_code: slotCode,
        }),
      });
      if (res.ok) {
        setMessage(`${playerName} 선수가 방출되었습니다.`);
        await loadData();
      } else {
        const json = await res.json();
        setMessage(json.message || "방출 실패");
      }
    } catch {
      setMessage("방출 중 오류 발생");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-nzu-green border-t-transparent mx-auto mb-4" />
          <p className="text-lg font-black uppercase tracking-widest text-white">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground selection:bg-nzu-green selection:text-black">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>
        {readOnly ? (
          <AdminReadonlyNotice body="현재 배포 환경에서는 토너먼트 팀을 읽기 전용으로만 확인할 수 있습니다. 실제 영입, 방출, 팀명, 팀장 수정은 관리자 저장소가 활성화된 운영 경로에서 진행해주세요." />
        ) : null}

        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div className="flex items-center gap-6">
            <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">
              War Room <span className="text-nzu-green/60">OPS</span>
            </h1>
            {selectedPlayerToRecruit && (
              <div className="flex items-center gap-4 rounded-2xl bg-nzu-green px-6 py-3 shadow-[0_0_40px_rgba(30,215,96,0.3)] animate-in zoom-in-95 duration-300">
                <div className="text-xs font-black uppercase tracking-widest text-black">배정 대기:</div>
                <div className="text-xl font-black uppercase text-black">{selectedPlayerToRecruit.name}</div>
                <button
                  onClick={() => setSelectedPlayerToRecruit(null)}
                  className="ml-2 text-black/40 transition-colors hover:text-black"
                  aria-label="배정 대기 해제"
                >
                  <X size={24} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="group relative w-[400px]">
              <Search
                className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 transition-all group-focus-within:text-nzu-green"
                size={24}
              />
              <input
                value={dbQuery}
                onChange={(e) => setDbQuery(e.target.value)}
                placeholder="선수 검색 (이름, 닉네임)"
                className="h-16 w-full rounded-2xl border-2 border-white/5 bg-white/[0.03] pl-16 pr-8 text-xl font-black text-white outline-none transition-all placeholder:text-white/5 focus:border-nzu-green/30"
              />
              {dbQuery.trim() && !selectedPlayerToRecruit && (
                <div className="custom-scrollbar absolute left-0 right-0 top-full z-[100] mt-2 max-h-[350px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                  {dbPlayers
                    .filter((p) => (p.name || "").includes(dbQuery) || (p.nickname || "").includes(dbQuery))
                    .slice(0, 10)
                    .map((p) => {
                      const isAlreadyInSomeTeam = teams.some((team) =>
                        (team.players || []).some((player) => String(player.id) === String(p.id))
                      );
                      return (
                        <div
                          key={p.id}
                          onClick={() => !readOnly && !isAlreadyInSomeTeam && setSelectedPlayerToRecruit(p)}
                          className={`mb-1 flex cursor-pointer items-center justify-between rounded-xl p-4 transition-all ${
                            readOnly || isAlreadyInSomeTeam
                              ? "cursor-not-allowed bg-white/5 opacity-30 grayscale"
                              : "bg-white/[0.03] hover:bg-nzu-green/10"
                          }`}
                        >
                          <div className="text-lg font-black text-white">
                            {p.name} <span className="ml-2 text-xs text-white/20">{p.tier}</span>
                          </div>
                          {!isAlreadyInSomeTeam && <Plus size={20} className="text-nzu-green" />}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="mb-12">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              const isTeamFull = team.players.length >= TOURNAMENT_TEAM_SIZE;

              return (
                <div
                  key={team.teamCode}
                  className={`relative flex flex-col gap-4 overflow-hidden rounded-3xl border-2 p-6 transition-all ${
                    selectedPlayerToRecruit && !isTeamFull
                      ? "scale-[1.02] border-nzu-green/50 bg-nzu-green/10 ring-4 ring-nzu-green/5"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  {selectedPlayerToRecruit && (
                    <button
                      onClick={() => recruitPlayer(team.teamCode)}
                      disabled={saving || readOnly || isTeamFull}
                      className="group/assign absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-nzu-green/10 backdrop-blur-[2px] transition-all duration-300 hover:bg-nzu-green/20 disabled:cursor-not-allowed disabled:bg-black/55"
                    >
                      <div className="rounded-full bg-nzu-green p-6 shadow-[0_0_50px_rgba(30,215,96,0.4)] transition-transform group-hover/assign:scale-110 group-disabled/assign:bg-white/15">
                        <Plus size={40} className="stroke-[3px] text-black" />
                      </div>
                      <div className="text-xl font-black uppercase tracking-widest text-white drop-shadow-lg">
                        {isTeamFull ? `${TOURNAMENT_TEAM_SIZE}명 구성 완료` : "이 팀으로 배정"}
                      </div>
                    </button>
                  )}

                  <div className="mt-2 flex flex-col gap-4">
                    <div className="group/captain flex items-center justify-between gap-4">
                      <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 transition-all focus-within:border-nzu-green/50 focus-within:bg-nzu-green/5">
                        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                          팀명 설정
                        </div>
                        <input
                          defaultValue={team.teamName}
                          onBlur={(e) =>
                            !readOnly &&
                            e.target.value !== team.teamName &&
                            updateTeamName(team.teamCode, e.target.value)
                          }
                          disabled={readOnly}
                          className="w-full bg-transparent text-3xl font-black uppercase italic text-white outline-none transition-all focus:text-nzu-green"
                          placeholder="팀명"
                        />
                      </div>
                      <div className="flex min-w-[140px] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-all hover:border-amber-400/30">
                        <Crown
                          size={24}
                          className={
                            team.captainPlayerId
                              ? "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]"
                              : "text-white/10"
                          }
                        />
                        <div className="text-[9px] font-black uppercase leading-none tracking-widest text-white/20">
                          팀장 선수
                        </div>
                        <select
                          value={team.captainPlayerId || ""}
                          onChange={(e) => setTeamCaptain(team.teamCode, e.target.value)}
                          disabled={readOnly}
                          className="w-full cursor-pointer appearance-none bg-transparent text-center text-sm font-black text-white outline-none"
                        >
                          <option value="" className="bg-black">
                            미지정
                          </option>
                          {team.players.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.is_placeholder} className="bg-black">
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 min-h-[160px] space-y-2">
                    {[...team.players]
                      .sort((a, b) => {
                        if (a.id === team.captainPlayerId) return -1;
                        if (b.id === team.captainPlayerId) return 1;
                        return 0;
                      })
                      .map((p) => (
                        <div
                          key={p.id}
                          className="group/row flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] p-3 shadow-lg transition-all hover:bg-white/10"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-black ${
                                p.race?.startsWith("P")
                                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                                  : p.race?.startsWith("T")
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                    : p.race?.startsWith("Z")
                                      ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
                                      : "border-white/10 bg-white/5 text-white/40"
                              }`}
                            >
                              {p.race?.[0] || "?"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-xl font-black leading-none text-white">{p.name}</div>
                                {team.captainPlayerId === p.id && (
                                  <Crown size={14} className="text-amber-400" />
                                )}
                              </div>
                              <div className="mt-1 flex gap-2">
                                <TierBadge tier={p.tier || ""} size="xs" />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removePlayer(team.teamCode, p.id, p.name)}
                            disabled={saving || readOnly || p.is_placeholder}
                            className="p-2 text-white/5 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={`${p.name} 방출`}
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {message && (
          <div className="fixed bottom-12 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-3xl bg-nzu-green px-12 py-6 text-xl font-black text-black shadow-[0_30px_60px_rgba(30,215,96,0.4)] animate-in fade-in slide-in-from-bottom-10 duration-500">
            <Target size={24} />
            {message}
          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border: 3px solid rgba(0, 0, 0, 0);
          border-radius: 20px;
          background-clip: padding-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </main>
  );
}
