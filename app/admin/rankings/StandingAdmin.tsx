"use client";

import { useState } from "react";
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
};

export default function StandingAdmin({ teams, initialStandings }: Props) {
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
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/standings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setMessage("성공적으로 저장되었습니다!");
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
      <div className="flex justify-end sticky top-0 z-20 py-4 bg-transparent backdrop-blur-sm">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-nzu-green text-black font-black uppercase tracking-widest text-xs rounded-xl shadow-lg hover:scale-105 transition-all disabled:opacity-50"
        >
          {saving ? "저장 중..." : "순위 데이터 저장하기"}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-center text-sm font-bold ${message.includes("성공") ? "bg-nzu-green/20 text-nzu-green border border-nzu-green/30" : "bg-red-500/20 text-red-500 border border-red-500/30"}`}>
          {message}
        </div>
      )}

      {/* 팀 순위 입력 */}
      <section>
        <h3 className="text-xl font-black italic uppercase tracking-tighter mb-6 text-white">팀 순위 관리</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((t) => {
            const s = data.standings?.teams?.find((st) => st.team_code === t.teamCode) || { wins: 0, losses: 0 };
            return (
              <div key={t.teamCode} className="p-6 bg-black/40 border border-white/10 rounded-3xl group">
                <div className="text-xs font-black text-nzu-green uppercase tracking-widest mb-3 opacity-60">{t.teamCode}</div>
                <div className="text-lg font-bold text-white mb-6 tracking-tight">{t.teamName}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">승리</label>
                    <input
                      type="number"
                      value={s.wins}
                      onChange={(e) => updateTeam(t.teamCode, "wins", parseInt(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">패배</label>
                    <input
                      type="number"
                      value={s.losses}
                      onChange={(e) => updateTeam(t.teamCode, "losses", parseInt(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 선수 순위 입력 */}
      <section>
        <h3 className="text-xl font-black italic uppercase tracking-tighter mb-6 text-white">선수 개별 기록</h3>
        <div className="space-y-4">
          {teams.map((t) => (
            <div key={t.teamCode + "-players"} className="space-y-4">
              <div className="text-sm font-black text-white/20 uppercase tracking-[0.2em] pt-4">{t.teamName} 소속 선수</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {t.players.map((p) => {
                  const s = data.standings?.players?.find((sp) => sp.player_id === p.id) || { wins: 0, losses: 0 };
                  return (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl group transition-all hover:border-nzu-green/30">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black text-nzu-green/60 uppercase w-4">{p.race}</span>
                        <div>
                          <div className="text-sm font-bold text-white">{p.name}</div>
                          <div className="text-[10px] text-white/30 font-bold uppercase tracking-tight">{p.university}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="W"
                          value={s.wins}
                          onChange={(e) => updatePlayer(p.id, "wins", parseInt(e.target.value) || 0)}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-sm font-black text-nzu-green"
                        />
                        <input
                          type="number"
                          placeholder="L"
                          value={s.losses}
                          onChange={(e) => updatePlayer(p.id, "losses", parseInt(e.target.value) || 0)}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-sm font-black text-white/40"
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
