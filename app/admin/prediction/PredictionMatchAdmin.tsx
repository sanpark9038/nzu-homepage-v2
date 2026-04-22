"use client";

import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";
import { PredictionConfigMatch } from "@/lib/tournament-prediction";
import { cn } from "@/lib/utils";

type TeamInfo = {
  teamCode: string;
  teamName: string;
};

function toKstDateTimeInput(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function fromKstDateTimeInput(value: string) {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  return `${datePart}T${timePart}:00+09:00`;
}

export function PredictionMatchAdmin({
  initialMatches,
  teams,
  readOnly = false,
}: {
  initialMatches: PredictionConfigMatch[];
  teams: TeamInfo[];
  readOnly?: boolean;
}) {
  const [matches, setMatches] = useState<PredictionConfigMatch[]>(initialMatches);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleChange = (index: number, field: keyof PredictionConfigMatch, value: string) => {
    const next = [...matches];
    next[index] = { ...next[index], [field]: value };
    setMatches(next);
  };

  const handleSave = async () => {
    if (readOnly) {
      setStatus({ type: "error", message: getAdminWriteDisabledMessage("예측 경기 설정 수정") });
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      setStatus({ type: "success", message: "성공적으로 저장되었습니다." });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "저장 중 오류가 발생했습니다." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {matches.map((match, idx) => (
          <div
            key={match.id || idx}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-sm transition-all hover:bg-white/[0.04]"
          >
            <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-black uppercase tracking-widest text-nzu-green">Match {idx + 1}</span>
              <span className="text-[10px] font-bold text-white/30">{match.id}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/50">Team A</label>
                <select
                  value={match.team_a_code || ""}
                  disabled={readOnly}
                  onChange={(e) => handleChange(idx, "team_a_code", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-nzu-green/50 focus:outline-none"
                >
                  <option value="">팀 선택</option>
                  {teams.map((t) => (
                    <option key={t.teamCode} value={t.teamCode}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/50">Team B</label>
                <select
                  value={match.team_b_code || ""}
                  disabled={readOnly}
                  onChange={(e) => handleChange(idx, "team_b_code", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-nzu-green/50 focus:outline-none"
                >
                  <option value="">팀 선택</option>
                  {teams.map((t) => (
                    <option key={t.teamCode} value={t.teamCode}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/50">Match Title</label>
                <input
                  type="text"
                  value={match.title || ""}
                  disabled={readOnly}
                  onChange={(e) => handleChange(idx, "title", e.target.value)}
                  placeholder="예: 6강 1경기"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-nzu-green/50 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/50">Start Date/Time</label>
                <input
                  type="datetime-local"
                  value={toKstDateTimeInput(match.start_at)}
                  disabled={readOnly}
                  onChange={(e) => {
                    handleChange(idx, "start_at", fromKstDateTimeInput(e.target.value));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white [color-scheme:dark] focus:border-nzu-green/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-8 flex items-center justify-between rounded-2xl border border-nzu-green/20 bg-black/80 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {status && (
            <div
              className={cn(
                "flex items-center gap-2 text-xs font-bold",
                status.type === "success" ? "text-nzu-green" : "text-red-400"
              )}
            >
              {status.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {status.message}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || readOnly}
          className="flex items-center gap-2 rounded-xl bg-nzu-green px-6 py-3 text-sm font-black uppercase tracking-widest text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          <Save size={16} />
          {isSaving ? "저장 중..." : "설정 저장하기"}
        </button>
      </div>
    </div>
  );
}
