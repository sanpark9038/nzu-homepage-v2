"use client";

import { useState } from "react";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";
import { TournamentHomeTeam } from "@/lib/tournament-home";

type Standings = {
  standings?: {
    teams?: Array<{ team_code: string; wins: number; losses: number }>;
    players?: Array<{ player_id: string; wins: number; losses: number }>;
  };
};

type Props = {
  teams: TournamentHomeTeam[];
  initialStandings: Standings;
  readOnly?: boolean;
};

export default function StandingAdmin({ teams, initialStandings, readOnly = false }: Props) {
  const [data, setData] = useState<Standings>(initialStandings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const updateTeam = (code: string, field: "wins" | "losses", val: number) => {
    const list = [...(data.standings?.teams || [])];
    const idx = list.findIndex((t) => t.team_code === code);
    if (idx >= 0) {
      list[idx] = { ...list[idx], [field]: val };
    } else {
      list.push({ team_code: code, wins: field === "wins" ? val : 0, losses: field === "losses" ? val : 0 });
    }
    setData({ ...data, standings: { ...data.standings, teams: list } });
  };

  const updatePlayer = (id: string, field: "wins" | "losses", val: number) => {
    const list = [...(data.standings?.players || [])];
    const idx = list.findIndex((p) => p.player_id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], [field]: val };
    } else {
      list.push({ player_id: id, wins: field === "wins" ? val : 0, losses: field === "losses" ? val : 0 });
    }
    setData({ ...data, standings: { ...data.standings, players: list } });
  };

  const handleSave = async () => {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("순위 저장"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/standings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setMessage("성공적으로 저장되었습니다.");
      } else {
        setMessage("저장 중 오류가 발생했습니다.");
      }
    } catch {
      setMessage("서버 연결 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="sticky top-0 z-20 flex justify-end bg-transparent py-4 backdrop-blur-sm">
        <button
          onClick={handleSave}
          disabled={saving || readOnly}
          className="rounded-xl bg-nzu-green px-8 py-3 text-xs font-black uppercase tracking-widest text-black shadow-lg transition-all hover:scale-105 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "순위 데이터 저장하기"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 text-center text-sm font-bold ${
            message.includes("성공")
              ? "border-nzu-green/30 bg-nzu-green/20 text-nzu-green"
              : "border-red-500/30 bg-red-500/20 text-red-500"
          }`}
        >
          {message}
        </div>
      )}

      <section>
        <h3 className="mb-6 text-xl font-black uppercase italic tracking-tighter text-white">팀 순위 관리</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const s = data.standings?.teams?.find((st) => st.team_code === t.teamCode) || { wins: 0, losses: 0 };
            return (
              <div key={t.teamCode} className="group rounded-3xl border border-white/10 bg-black/40 p-6">
                <div className="mb-3 text-xs font-black uppercase tracking-widest text-nzu-green opacity-60">{t.teamCode}</div>
                <div className="mb-6 text-lg font-bold tracking-tight text-white">{t.teamName}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-white/40">승리</label>
                    <input
                      type="number"
                      value={s.wins}
                      disabled={readOnly}
                      onChange={(e) => updateTeam(t.teamCode, "wins", parseInt(e.target.value) || 0)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-white/40">패배</label>
                    <input
                      type="number"
                      value={s.losses}
                      disabled={readOnly}
                      onChange={(e) => updateTeam(t.teamCode, "losses", parseInt(e.target.value) || 0)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-bold text-white"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-6 text-xl font-black uppercase italic tracking-tighter text-white">선수 개별 기록</h3>
        <div className="space-y-4">
          {teams.map((t) => (
            <div key={t.teamCode + "-players"} className="space-y-4">
              <div className="pt-4 text-sm font-black uppercase tracking-[0.2em] text-white/20">{t.teamName} 소속 선수</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {t.players.map((p) => {
                  const s = data.standings?.players?.find((sp) => sp.player_id === p.id) || { wins: 0, losses: 0 };
                  return (
                    <div
                      key={p.id}
                      className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 transition-all hover:border-nzu-green/30"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-4 text-xs font-black uppercase text-nzu-green/60">{p.race}</span>
                        <div>
                          <div className="text-sm font-bold text-white">{p.name}</div>
                          <div className="text-[10px] font-bold uppercase tracking-tight text-white/30">{p.university}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="W"
                          value={s.wins}
                          disabled={readOnly}
                          onChange={(e) => updatePlayer(p.id, "wins", parseInt(e.target.value) || 0)}
                          className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-sm font-black text-nzu-green"
                        />
                        <input
                          type="number"
                          placeholder="L"
                          value={s.losses}
                          disabled={readOnly}
                          onChange={(e) => updatePlayer(p.id, "losses", parseInt(e.target.value) || 0)}
                          className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-sm font-black text-white/40"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
