"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import LogoutButton from "../ops/LogoutButton";
import { Search, Target, Trash2, Crown, Plus, X } from "lucide-react";
import { TierBadge } from "@/components/ui/nzu-badges";


export const dynamic = "force-dynamic";

export default function TournamentManagementPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [dbPlayers, setDbPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlayerToRecruit, setSelectedPlayerToRecruit] = useState<any>(null);
  const [dbQuery, setDbQuery] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roster?source=db");
      const json = await res.json();
      
      if (json.ok) {
        setDbPlayers(json.players || []);
        if (json.tournament_teams) {
          setTeams(json.tournament_teams.map((team: any) => ({
            teamCode: team.code,
            teamName: team.name,
            captainPlayerId: team.captainPlayerId || "",
            players: (team.players || []).map((player: any) => ({
              id: player.id,
              name: player.name,
              race: player.race,
              tier: player.tier
            })),
            playerCount: team.player_count || 0
          })));
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
    
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recruit_player",
          player: selectedPlayerToRecruit,
          team_code: targetTeamCode
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
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_team_name",
          team_code: teamCode,
          team_name: newName
        })
      });
      if (res.ok) {
        setMessage("팀명이 업데이트되었습니다.");
        await loadData();
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const setTeamCaptain = async (teamCode: string, captainId: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_team_captain",
          team_code: teamCode,
          captain_player_id: captainId
        })
      });
      if (res.ok) {
        setMessage("팀장이 설정되었습니다.");
        await loadData();
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const removePlayer = async (slotCode: string, playerId: string, playerName: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_player_from_slot",
          player_id: playerId,
          slot_code: slotCode
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
          <div className="h-12 w-12 border-4 border-nzu-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-black text-white uppercase tracking-widest text-lg">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-8 selection:bg-nzu-green selection:text-black">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>
        
        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div className="flex items-center gap-6">
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">War Room <span className="text-nzu-green/60">OPS</span></h1>
            {selectedPlayerToRecruit && (
              <div className="flex items-center gap-4 bg-nzu-green px-6 py-3 rounded-2xl animate-in zoom-in-95 duration-300 shadow-[0_0_40px_rgba(30,215,96,0.3)]">
                <div className="text-xs font-black text-black uppercase tracking-widest">배정 대기:</div>
                <div className="text-xl font-black text-black uppercase">{selectedPlayerToRecruit.name}</div>
                <button onClick={() => setSelectedPlayerToRecruit(null)} className="ml-2 text-black/40 hover:text-black transition-colors">
                  <X size={24} />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
             <div className="relative group w-[400px]">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-nzu-green transition-all" size={24} />
                <input
                  value={dbQuery}
                  onChange={(e) => setDbQuery(e.target.value)}
                  placeholder="선수 검색 (이름, 닉네임)"
                  className="w-full h-16 bg-white/[0.03] border-2 border-white/5 rounded-2xl pl-16 pr-8 text-xl font-black text-white outline-none focus:border-nzu-green/30 transition-all placeholder:text-white/5"
                />
                {dbQuery.trim() && !selectedPlayerToRecruit && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-[100] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl max-h-[350px] overflow-y-auto custom-scrollbar p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {dbPlayers
                      .filter(p => (p.name || "").includes(dbQuery) || (p.nickname || "").includes(dbQuery))
                      .slice(0, 10)
                      .map(p => {
                        const isAlreadyInSomeTeam = teams.some(t => (t.players || []).some((pl: any) => String(pl.id) === String(p.id)));
                        return (
                          <div 
                            key={p.id} 
                            onClick={() => !isAlreadyInSomeTeam && setSelectedPlayerToRecruit(p)}
                            className={`flex items-center justify-between p-4 rounded-xl transition-all mb-1 cursor-pointer ${
                              isAlreadyInSomeTeam ? "opacity-30 grayscale cursor-not-allowed bg-white/5" : "bg-white/[0.03] hover:bg-nzu-green/10"
                            }`}
                          >
                            <div className="text-lg font-black text-white">{p.name} <span className="text-xs text-white/20 ml-2">{p.tier}</span></div>
                            {!isAlreadyInSomeTeam && <Plus size={20} className="text-nzu-green" />}
                          </div>
                        );
                      })}
                  </div>
                )}
             </div>
          </div>
        </div>



        {/* 2단: 팀 슬롯 그리드 현황 */}
        <section className="mb-12">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <div 
                key={team.teamCode} 
                className={`flex flex-col gap-4 rounded-3xl border-2 transition-all p-6 relative overflow-hidden ${
                  selectedPlayerToRecruit 
                  ? "border-nzu-green/50 bg-nzu-green/10 ring-4 ring-nzu-green/5 scale-[1.02]" 
                  : "bg-white/[0.02] border-white/5"
                }`}
              >
                {selectedPlayerToRecruit && (
                  <button 
                    onClick={() => recruitPlayer(team.teamCode)}
                    disabled={saving}
                    className="absolute inset-0 z-50 bg-nzu-green/10 flex flex-col items-center justify-center gap-4 group/assign hover:bg-nzu-green/20 transition-all duration-300 backdrop-blur-[2px]"
                  >
                    <div className="bg-nzu-green p-6 rounded-full shadow-[0_0_50px_rgba(30,215,96,0.4)] group-hover/assign:scale-110 transition-transform">
                       <Plus size={40} className="text-black stroke-[3px]" />
                    </div>
                    <div className="text-xl font-black text-white tracking-widest uppercase drop-shadow-lg">이 팀으로 즉시 영입</div>
                  </button>
                )}
                
                  <div className="flex flex-col gap-4 mt-2">
                    <div className="flex items-center justify-between group/captain gap-4">
                       <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus-within:border-nzu-green/50 focus-within:bg-nzu-green/5 transition-all">
                         <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">팀명 수정</div>
                         <input 
                           defaultValue={team.teamName}
                           onBlur={(e) => e.target.value !== team.teamName && updateTeamName(team.teamCode, e.target.value)}
                           className="bg-transparent text-3xl font-black text-white outline-none focus:text-nzu-green transition-all uppercase italic w-full"
                           placeholder="팀명"
                         />
                       </div>
                       <div className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 min-w-[140px] hover:border-amber-400/30 transition-all">
                          <Crown size={24} className={team.captainPlayerId ? "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]" : "text-white/10"} />
                          <div className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">팀장 선출</div>
                          <select
                            value={team.captainPlayerId || ""}
                            onChange={(e) => setTeamCaptain(team.teamCode, e.target.value)}
                            className="bg-transparent text-sm font-black text-white outline-none appearance-none cursor-pointer text-center w-full"
                          >
                            <option value="" className="bg-black">미지정</option>
                            {team.players.map((p: any) => (<option key={p.id} value={p.id} className="bg-black">{p.name}</option>))}
                          </select>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2 mt-6 min-h-[160px]">
                    {([...team.players].sort((a, b) => {
                      if (a.id === team.captainPlayerId) return -1;
                      if (b.id === team.captainPlayerId) return 1;
                      return 0;
                    })).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5 group/row hover:bg-white/10 transition-all shadow-lg">
                        <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg border ${
                             p.race?.startsWith('P') ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                             p.race?.startsWith('T') ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                             p.race?.startsWith('Z') ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                             'bg-white/5 border-white/10 text-white/40'
                           }`}>
                             {p.race?.[0] || '?'}
                           </div>
                           <div>
                             <div className="flex items-center gap-2">
                               <div className="text-xl font-black text-white leading-none">{p.name}</div>
                               {team.captainPlayerId === p.id && <Crown size={14} className="text-amber-400" />}
                             </div>
                             <div className="mt-1 flex gap-2">
                               <TierBadge tier={p.tier} size="xs" />
                             </div>
                           </div>
                        </div>
                        <button onClick={() => removePlayer(team.teamCode, p.id, p.name)} className="text-white/5 hover:text-red-500 transition-colors p-2">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>



        {message && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] px-12 py-6 bg-nzu-green text-black rounded-3xl text-xl font-black shadow-[0_30px_60px_rgba(30,215,96,0.4)] animate-in fade-in slide-in-from-bottom-10 duration-500 flex items-center gap-4">
            <Target size={24} />
            {message}
          </div>
        )}


      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 20px; 
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }
      `}</style>
    </main>
  );
}
