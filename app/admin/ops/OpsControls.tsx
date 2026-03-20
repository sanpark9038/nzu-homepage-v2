"use client";

import { useEffect, useState } from "react";

type ApiStatus = {
  ok: boolean;
  state: {
    pid: number;
    started_at: string;
    status: "running" | "finished";
    mode: string;
    teams: string;
    log_path: string;
    finished_at?: string;
  } | null;
  latest_snapshot?: string | null;
  latest_alerts?: string | null;
};

type RuleDoc = {
  schema_version: string;
  updated_at: string;
  blocking_severities: string[];
  rules: {
    pipeline_failure_severity: string;
    zero_record_players_severity: string;
    negative_delta_matches_severity: string;
    roster_size_changed_severity: string;
    no_new_matches_enabled: boolean;
    no_new_matches_severity: string;
  };
};

export default function OpsControls() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [rules, setRules] = useState<RuleDoc | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/admin/pipeline/status", { cache: "no-store" });
    const json = (await res.json()) as ApiStatus;
    setStatus(json);
  }

  async function loadRules() {
    const res = await fetch("/api/admin/pipeline/rules", { cache: "no-store" });
    const json = await res.json();
    setRules(json?.rules || null);
  }

  useEffect(() => {
    loadStatus();
    loadRules();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, []);

  async function run(mode: "full" | "smoke") {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.message || "실행 실패");
      } else {
        setMsg(mode === "full" ? "전체 파이프라인 실행 시작됨" : "smoke 실행 시작됨");
      }
      await loadStatus();
    } catch {
      setMsg("실행 중 오류 발생");
    } finally {
      setLoading(false);
    }
  }

  async function saveRules() {
    if (!rules) return;
    setSavingRules(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/pipeline/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const json = await res.json();
      setRules(json?.rules || rules);
      setMsg("알림 규칙 저장 완료");
    } catch {
      setMsg("알림 규칙 저장 실패");
    } finally {
      setSavingRules(false);
    }
  }

  return (
    <section className="border border-border rounded-lg p-4 bg-card space-y-3">
      <h2 className="font-bold">Run Controls</h2>
      <div className="flex gap-2">
        <button
          onClick={() => run("full")}
          disabled={loading}
          className="px-3 py-2 rounded bg-nzu-green text-white text-sm font-bold disabled:opacity-50"
        >
          전체 실행
        </button>
        <button
          onClick={() => run("smoke")}
          disabled={loading}
          className="px-3 py-2 rounded bg-zinc-700 text-white text-sm font-bold disabled:opacity-50"
        >
          Smoke 실행(흑카데미)
        </button>
      </div>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          상태: {status?.state?.status || "idle"}{" "}
          {status?.state?.status === "running" ? `(pid ${status.state.pid})` : ""}
        </p>
        <p>마지막 스냅샷: {status?.latest_snapshot || "-"}</p>
        <p>마지막 알림: {status?.latest_alerts || "-"}</p>
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <h3 className="font-semibold text-sm">Alert Rules</h3>
        {rules ? (
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span>no_new_matches 감지</span>
              <input
                type="checkbox"
                checked={rules.rules.no_new_matches_enabled}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    rules: { ...rules.rules, no_new_matches_enabled: e.target.checked },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>no_new_matches severity</span>
              <select
                value={rules.rules.no_new_matches_severity}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    rules: { ...rules.rules, no_new_matches_severity: e.target.value },
                  })
                }
                className="bg-card border border-border rounded px-2 py-1"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">규칙 로딩 중...</p>
        )}
        <button
          onClick={saveRules}
          disabled={savingRules || !rules}
          className="px-3 py-2 rounded bg-zinc-700 text-white text-sm font-bold disabled:opacity-50"
        >
          규칙 저장
        </button>
      </div>
    </section>
  );
}
