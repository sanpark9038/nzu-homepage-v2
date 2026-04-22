"use client";

import { useEffect, useState } from "react";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";

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

export default function OpsControls({ readOnly = false }: { readOnly?: boolean }) {
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
    void loadStatus();
    void loadRules();
    const timer = setInterval(() => {
      void loadStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function run(mode: "full" | "smoke") {
    if (readOnly) {
      setMsg(getAdminWriteDisabledMessage("파이프라인 수동 실행"));
      return;
    }
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
        setMsg(json?.message || "실행에 실패했습니다.");
      } else {
        setMsg(mode === "full" ? "전체 파이프라인 실행을 시작했습니다." : "Smoke 실행을 시작했습니다.");
      }
      await loadStatus();
    } catch {
      setMsg("실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRules() {
    if (!rules) return;
    if (readOnly) {
      setMsg(getAdminWriteDisabledMessage("파이프라인 알림 규칙 수정"));
      return;
    }
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
      setMsg("알림 규칙을 저장했습니다.");
    } catch {
      setMsg("알림 규칙 저장에 실패했습니다.");
    } finally {
      setSavingRules(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-bold">실행 제어</h2>
      <div className="flex gap-2">
        <button
          onClick={() => run("full")}
          disabled={loading || readOnly}
          className="rounded bg-nzu-green px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          전체 실행
        </button>
        <button
          onClick={() => run("smoke")}
          disabled={loading || readOnly}
          className="rounded bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Smoke 실행(흑카데미)
        </button>
      </div>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          상태: {status?.state?.status || "idle"} {status?.state?.status === "running" ? `(pid ${status.state.pid})` : ""}
        </p>
        <p>마지막 스냅샷: {status?.latest_snapshot || "-"}</p>
        <p>마지막 알림: {status?.latest_alerts || "-"}</p>
      </div>

      <div className="space-y-2 border-t border-border pt-2">
        <h3 className="text-sm font-semibold">알림 규칙</h3>
        {rules ? (
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <label className="flex items-center justify-between gap-2">
              <span>no_new_matches 감지</span>
              <input
                type="checkbox"
                checked={rules.rules.no_new_matches_enabled}
                disabled={readOnly}
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
                disabled={readOnly}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    rules: { ...rules.rules, no_new_matches_severity: e.target.value },
                  })
                }
                className="rounded border border-border bg-card px-2 py-1"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">규칙을 불러오는 중입니다...</p>
        )}
        <button
          onClick={saveRules}
          disabled={savingRules || !rules || readOnly}
          className="rounded bg-zinc-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          규칙 저장
        </button>
      </div>
    </section>
  );
}
