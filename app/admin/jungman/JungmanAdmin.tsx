"use client";

import { useState } from "react";

import {
  formatVotes,
  JUNGMAN_ID_VIA,
  JUNGMAN_VOTING_TEAMS,
  type JungmanComment,
  type JungmanConfig,
  type JungmanSnapshot,
} from "@/lib/jungman";

type VoteInputs = Record<string, string>;
type Guesses = Record<string, { code: string; via: string }>;

/** 텍스트 신호는 걸린 별칭 그대로라 따옴표를 씌운다. 숲ID 근거는 문장이라 그대로 쓴다. */
function viaLabel(via: string): string {
  return via.startsWith(JUNGMAN_ID_VIA) ? via : `“${via}”`;
}

function guessMappingOf(guesses: Guesses): Record<string, string> {
  return Object.fromEntries(Object.entries(guesses).map(([commentNo, guess]) => [commentNo, guess.code]));
}

/** 저장된 매핑이 자동 추정보다 위 — 사람 판단을 덮지 않고, 이미 쓰인 팀에는 추정을 얹지 않는다. */
function fillWithGuesses(saved: Record<string, string>, guesses: Guesses): Record<string, string> {
  const next = { ...saved };
  const taken = new Set(Object.values(next));
  for (const [commentNo, guess] of Object.entries(guesses)) {
    if (next[commentNo] || taken.has(guess.code)) continue;
    next[commentNo] = guess.code;
    taken.add(guess.code);
  }
  return next;
}

function postUrlOf(config: JungmanConfig) {
  return config.titleNo ? `https://www.sooplive.com/station/${config.soopId}/post/${config.titleNo}` : "";
}

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
  const [postUrl, setPostUrl] = useState(() => postUrlOf(initialConfig));
  const [comments, setComments] = useState<JungmanComment[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>(() => initialConfig.mapping);
  const [guesses, setGuesses] = useState<Guesses>({});

  const last = snapshots[snapshots.length - 1] ?? null;
  const nextRound = (last?.round || 0) + 1;

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
      if (json.config?.mapping) setMapping(json.config.mapping);
      setMessage(json.message || "저장했습니다.");
      return json as {
        snapshots: JungmanSnapshot[];
        config: JungmanConfig;
        comments?: JungmanComment[];
        guesses?: Guesses;
      };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadComments() {
    const result = await send({ action: "fetch-comments", postUrl });
    if (result?.comments) {
      const next = result.guesses || {};
      setComments(result.comments);
      setGuesses(next);
      setMapping(fillWithGuesses(result.config.mapping, next));
      setPostUrl(postUrlOf(result.config));
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

  const mappedTeams = new Set(Object.values(mapping));

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-xl font-black tracking-tight text-white">숲 댓글 자동 수집</h2>
            <p className="text-sm text-white/55">
              공지글 댓글의 추천수를 그대로 득표로 가져옵니다. 켜두면 /jungman을 보고 있는 사람이 있는 동안 3분
              간격으로 자동 갱신되고, 페이지는 LIVE 모드로 바뀝니다.
            </p>
          </div>
          <button
            onClick={() => send({ action: "set-auto-collect", autoCollect: !config.autoCollect })}
            disabled={loading}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black disabled:opacity-50 ${
              config.autoCollect
                ? "bg-nzu-green text-black"
                : "border border-white/15 bg-background text-white/70"
            }`}
          >
            자동 수집 {config.autoCollect ? "ON" : "OFF"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-[18rem] flex-1 space-y-2">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-white/40">공지 글 주소</span>
            <input
              type="url"
              value={postUrl}
              onChange={(event) => setPostUrl(event.target.value)}
              placeholder="https://www.sooplive.com/station/ititit/post/202453919"
              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm font-bold text-white"
            />
          </label>
          <button
            onClick={loadComments}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white disabled:opacity-50"
          >
            댓글 불러오기
          </button>
          <button
            onClick={() => send({ action: "collect-now" })}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-background px-4 text-sm font-black text-white disabled:opacity-50"
          >
            지금 수집
          </button>
        </div>

        {comments.length ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-background/60 px-4 py-3">
              <p className="text-sm font-bold text-white/70">
                {JUNGMAN_VOTING_TEAMS.length}팀 중 {Object.keys(guesses).length}팀 자동 인식 · 미지정{" "}
                {comments.filter((comment) => !mapping[comment.commentNo]).length}건
              </p>
              <button
                onClick={() => setMapping(guessMappingOf(guesses))}
                disabled={loading || !Object.keys(guesses).length}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 bg-background px-3 text-sm font-black text-white disabled:opacity-50"
              >
                자동 추정으로 채우기
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {comments.map((comment) => (
                <li
                  key={comment.commentNo}
                  className="grid grid-cols-[7rem_4rem_minmax(0,1fr)_9rem] items-center gap-3 rounded-xl border border-white/10 bg-background/80 px-4 py-2.5"
                >
                  <span className="truncate text-sm font-bold text-white">{comment.nick}</span>
                  <span className="text-sm font-black tabular-nums text-nzu-green">{comment.likes}표</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/55">{comment.text.slice(0, 40)}</p>
                    {guesses[comment.commentNo] && mapping[comment.commentNo] === guesses[comment.commentNo].code ? (
                      <p className="truncate text-xs font-bold text-nzu-green/70">
                        자동 추정 · {viaLabel(guesses[comment.commentNo].via)}
                      </p>
                    ) : null}
                  </div>
                  <select
                    value={mapping[comment.commentNo] || ""}
                    onChange={(event) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (event.target.value) next[comment.commentNo] = event.target.value;
                        else delete next[comment.commentNo];
                        return next;
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-background px-2 py-1.5 text-sm font-bold text-white"
                  >
                    <option value="">미지정</option>
                    {JUNGMAN_VOTING_TEAMS.map((team) => (
                      <option key={team.code} value={team.code}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>

            <button
              onClick={() => send({ action: "save-mapping", mapping })}
              disabled={loading}
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-black text-black disabled:opacity-50"
            >
              매핑 저장 ({mappedTeams.size}/{JUNGMAN_VOTING_TEAMS.length}팀)
            </button>
          </>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm font-bold text-white/45">
            {Object.keys(mapping).length
              ? `저장된 매핑 ${Object.keys(mapping).length}건이 있습니다. 수정하려면 댓글을 불러오세요.`
              : "공지 글 주소를 넣고 댓글을 불러온 뒤, 각 총장 댓글에 팀을 지정하세요."}
          </p>
        )}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-white">{nextRound}차 개표 입력 (수동 폴백)</h2>
          <p className="text-sm text-white/55">
            11팀 누적 득표수를 입력합니다. 수술대는 4시드 확보로 투표에서 빠집니다. 발표 시각은 저장한 시각으로
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

      {/* 투표는 끝났다. 차수별 기록 1518건은 저장만 차지하고 아무도 안 본다 —
          목록을 걷어내고 마지막 결과 한 줄만 남긴다. 되돌리기 버튼은 오입력 대비로 유지. */}
      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white">개표 결과</h2>
            <p className="text-sm text-white/55">
              {last
                ? `${last.round}차 · ${new Date(last.at).toLocaleString("ko-KR")} 기준`
                : "아직 저장된 개표 결과가 없습니다."}
            </p>
          </div>
          {last ? (
            <span className="text-lg font-black text-white">합계 {formatVotes(snapshotTotal(last))}표</span>
          ) : null}
        </div>

        {last ? (
          <button
            onClick={deleteLast}
            disabled={loading}
            className={`mt-4 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black disabled:opacity-50 ${
              pendingDelete
                ? "border border-red-300/60 bg-red-500/20 text-red-100"
                : "border border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {pendingDelete ? "한 번 더 삭제" : "마지막 차수 삭제"}
          </button>
        ) : null}
      </section>

      {message ? <p className="text-sm font-bold text-white/75">{message}</p> : null}
    </div>
  );
}
