"use client";

import { useMemo, useState } from "react";

type TeamCaptainPlayer = {
  id: string;
  name: string;
  isCaptain?: boolean;
};

type TeamCaptainTeam = {
  teamCode: string;
  teamName: string;
  captainPlayerId: string | null;
  players: TeamCaptainPlayer[];
};

export default function TeamCaptainEditor({ teams }: { teams: TeamCaptainTeam[] }) {
  const initialSelections = useMemo(
    () =>
      Object.fromEntries(
        teams.map((team) => [team.teamCode, team.captainPlayerId || ""])
      ) as Record<string, string>,
    [teams]
  );

  const [selectedCaptains, setSelectedCaptains] = useState<Record<string, string>>(initialSelections);
  const [savingTeamCode, setSavingTeamCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  async function saveCaptain(teamCode: string) {
    setSavingTeamCode(teamCode);
    setMessage("");

    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_team_captain",
          team_code: teamCode,
          captain_player_id: selectedCaptains[teamCode] || "",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "저장 실패");
      }

      setMessage("팀장 설정이 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSavingTeamCode(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-black tracking-tight text-foreground">팀장 지정</h2>
        <p className="text-sm text-muted-foreground">
          각 팀에서 팀장을 한 명 지정하면 홈에서 팀장 배지가 보이고 카드가 맨 앞에 정렬됩니다.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {teams.map((team) => (
          <div key={team.teamCode} className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Team
                </div>
                <div className="mt-1 text-lg font-black tracking-tight text-foreground">
                  {team.teamName}
                </div>
              </div>
              <div className="text-xs font-bold text-muted-foreground">
                선수 {team.players.length}명
              </div>
            </div>

            <div className="mt-4">
              <select
                value={selectedCaptains[team.teamCode] || ""}
                onChange={(e) =>
                  setSelectedCaptains((prev) => ({
                    ...prev,
                    [team.teamCode]: e.target.value,
                  }))
                }
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:border-nzu-green"
              >
                <option value="">팀장 미지정</option>
                {team.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {team.players.map((player) => {
                const isSelected = (selectedCaptains[team.teamCode] || "") === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() =>
                      setSelectedCaptains((prev) => ({
                        ...prev,
                        [team.teamCode]: player.id,
                      }))
                    }
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-black tracking-tight transition-all",
                      isSelected
                        ? "border-amber-300/45 bg-amber-300/15 text-amber-100"
                        : "border-border bg-background text-muted-foreground hover:border-nzu-green/30 hover:text-foreground",
                    ].join(" ")}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => saveCaptain(team.teamCode)}
              disabled={savingTeamCode === team.teamCode}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-nzu-green bg-nzu-green px-4 text-sm font-black tracking-tight text-black transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingTeamCode === team.teamCode ? "저장 중..." : "팀장 저장"}
            </button>
          </div>
        ))}
      </div>

      {message ? <div className="mt-4 text-sm font-semibold text-muted-foreground">{message}</div> : null}
    </section>
  );
}
