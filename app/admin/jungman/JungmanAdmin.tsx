"use client";

import { useState } from "react";

import {
  formatVotes,
  JUNGMAN_VOTING_TEAMS,
  type JungmanConfig,
  type JungmanSnapshot,
} from "@/lib/jungman";

type VoteInputs = Record<string, string>;

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

// datetime-local 값은 브라우저 로컬 시각 — 서버(UTC)가 다시 해석하지 않도록 여기서 ISO로 굳힌다.
function toIso(localValue: string) {
  const trimmed = localValue.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function votesFromSnapshot(snapshot: JungmanSnapshot | null): VoteInputs {
  return Object.fromEntries(
    JUNGMAN_VOTING_TEAMS.map((team) => [team.code, String(snapshot?.votes[team.code] ?? 0)])
  );
}

function snapshotTotal(snapshot: JungmanSnapshot) {
  return JUNGMAN_VOTING_TEAMS.reduce((sum, team) => sum + (snapshot.votes[team.code] || 0), 0);
}

export default function JungmanAdmin({
  initialConfig,
  initialSnapshots,
}: {
  initialConfig: JungmanConfig;
  initialSnapshots: JungmanSnapshot[];
}) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [config, setConfig] = useState(initialConfig);
  const [votes, setVotes] = useState<VoteInputs>(() =>
    votesFromSnapshot(initialSnapshots[initialSnapshots.length - 1] || null)
  );
  const [voteCloseAt, setVoteCloseAt] = useState(() => toLocalInput(initialConfig.voteCloseAt));
  const [nextRevealAt, setNextRevealAt] = useState(() => toLocalInput(initialConfig.nextRevealAt));
  const [pendingDelete, setPendingDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const nextRound = (snapshots[snapshots.length - 1]?.round || 0) + 1;

  async function send(payload: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/jungman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "저장에 실패했습니다.");

      setSnapshots(json.snapshots || []);
      setConfig(json.config);
      setMessage(json.message || "저장했습니다.");
      return json as { snapshots: JungmanSnapshot[]; config: JungmanConfig };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshot() {
    const result = await send({ action: "save-snapshot", votes });
    if (result) setVotes(votesFromSnapshot(result.snapshots[result.snapshots.length - 1] || null));
  }

  async function saveConfig() {
    const close = toIso(voteCloseAt);
    if (!close) {
      setMessage("투표 마감 시각을 입력해주세요.");
      return;
    }
    await send({ action: "save-config", voteCloseAt: close, nextRevealAt: toIso(nextRevealAt) });
  }

  async function deleteLast() {
    if (!pendingDelete) {
      setPendingDelete(true);
      setMessage("같은 버튼을 한 번 더 누르면 마지막 차수가 삭제됩니다.");
      return;
    }
    setPendingDelete(false);
    const result = await send({ action: "delete-last-snapshot" });
    if (result) setVotes(votesFromSnapshot(result.snapshots[result.snapshots.length - 1] || null));
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-white">{nextRound}차 개표 입력</h2>
          <p className="text-sm text-white/55">
            12팀 누적 득표수를 입력합니다. 수술대는 4시드 확보로 투표에서 빠집니다. 발표 시각은 저장한 시각으로
            자동 기록됩니다.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {JUNGMAN_VOTING_TEAMS.map((team) => (
            <label key={team.code} className="flex items-center gap-3">
              <span className="flex w-28 shrink-0 items-center gap-2 text-sm font-bold text-white/80">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                {team.name}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={votes[team.code] ?? ""}
                onChange={(event) =>
                  setVotes((prev) => ({ ...prev, [team.code]: event.target.value.replace(/[^0-9]/g, "") }))
                }
                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm font-bold text-white"
              />
            </label>
          ))}
        </div>

        <button
          onClick={saveSnapshot}
          disabled={loading}
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-black text-black disabled:opacity-50"
        >
          {nextRound}차로 저장
        </button>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-white">일정 설정</h2>
          <p className="text-sm text-white/55">
            공개 페이지 카운트다운에 쓰입니다. 다음 개표 시각을 비우면 해당 카운트다운은 숨겨집니다.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-white/40">투표 마감</span>
            <input
              type="datetime-local"
              value={voteCloseAt}
              onChange={(event) => setVoteCloseAt(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm font-bold text-white"
            />
          </label>
          <label className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-white/40">다음 개표 발표</span>
            <input
              type="datetime-local"
              value={nextRevealAt}
              onChange={(event) => setNextRevealAt(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm font-bold text-white"
            />
          </label>
        </div>

        <button
          onClick={saveConfig}
          disabled={loading}
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-black text-black disabled:opacity-50"
        >
          일정 저장
        </button>
        <p className="mt-3 text-xs font-bold text-white/40">
          현재 저장값 — 마감 {new Date(config.voteCloseAt).toLocaleString("ko-KR")} / 다음 개표{" "}
          {config.nextRevealAt ? new Date(config.nextRevealAt).toLocaleString("ko-KR") : "없음"}
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white">개표 기록</h2>
            <p className="text-sm text-white/55">오입력은 마지막 차수를 지우고 다시 저장하면 됩니다.</p>
          </div>
          <button
            onClick={deleteLast}
            disabled={loading || snapshots.length === 0}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black disabled:opacity-50 ${
              pendingDelete
                ? "border border-red-300/60 bg-red-500/20 text-red-100"
                : "border border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {pendingDelete ? "한 번 더 삭제" : "마지막 차수 삭제"}
          </button>
        </div>

        <ul className="mt-5 space-y-2">
          {snapshots
            .slice()
            .reverse()
            .map((snapshot) => (
              <li
                key={snapshot.round}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 bg-background/80 px-4 py-3"
              >
                <span className="text-sm font-black text-white">{snapshot.round}차</span>
                <span className="text-sm font-bold text-white/60">
                  {new Date(snapshot.at).toLocaleString("ko-KR")}
                </span>
                <span className="text-sm font-bold text-white/80">합계 {formatVotes(snapshotTotal(snapshot))}표</span>
              </li>
            ))}
        </ul>

        {snapshots.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm font-bold text-white/45">
            아직 저장된 개표 기록이 없습니다.
          </p>
        ) : null}
      </section>

      {message ? <p className="text-sm font-bold text-white/75">{message}</p> : null}
    </div>
  );
}
