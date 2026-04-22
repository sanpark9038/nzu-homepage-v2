"use client";

import { useState } from "react";
import { Save, CheckCircle2, AlertCircle, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

type TeamInfo = {
  teamCode: string;
  teamName: string;
};

export default function TeamNameEditor({ initialTeams }: { initialTeams: TeamInfo[] }) {
  const [teams, setTeams] = useState<TeamInfo[]>(initialTeams);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleNameChange = (code: string, newName: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.teamCode === code ? { ...t, teamName: newName } : t))
    );
  };

  const saveTeamName = async (teamCode: string) => {
    const team = teams.find((t) => t.teamCode === teamCode);
    if (!team) return;

    setSavingCode(teamCode);
    setStatus(null);

    try {
      const res = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_team_name",
          team_code: teamCode,
          team_name: team.teamName,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "저장 실패");

      setStatus({ type: "success", message: `${team.teamName} 저장 완료!` });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "오류 발생" });
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-nzu-green/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Edit3 size={16} className="text-nzu-green" />
          <h2 className="text-xl font-black tracking-tight text-foreground uppercase">대회 팀명 관리</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          대회에 표시될 공식 팀명을 설정합니다. 홈, 승부예측, 일정, 순위 페이지에 즉시 반영됩니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative">
        {teams.map((team) => (
          <div key={team.teamCode} className="group rounded-xl border border-border/60 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-nzu-green/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                {team.teamCode}
              </span>
              {savingCode === team.teamCode && (
                <span className="text-[10px] font-bold text-nzu-green animate-pulse">저장 중...</span>
              )}
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={team.teamName}
                onChange={(e) => handleNameChange(team.teamCode, e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold text-foreground outline-none transition-all focus:border-nzu-green/50 focus:ring-1 focus:ring-nzu-green/20"
                placeholder="팀명 입력"
              />
              
              <button
                type="button"
                onClick={() => saveTeamName(team.teamCode)}
                disabled={savingCode !== null}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-nzu-green text-black text-xs font-black uppercase tracking-widest transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              >
                <Save size={12} />
                저장
              </button>
            </div>
          </div>
        ))}
      </div>

      {status && (
        <div className={cn(
          "mt-6 flex items-center gap-2 text-xs font-bold px-4 py-3 rounded-lg border animate-in fade-in slide-in-from-bottom-2",
          status.type === "success" 
            ? "bg-nzu-green/10 border-nzu-green/20 text-nzu-green" 
            : "bg-red-500/10 border-red-500/20 text-red-400"
        )}>
          {status.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {status.message}
        </div>
      )}
    </section>
  );
}
