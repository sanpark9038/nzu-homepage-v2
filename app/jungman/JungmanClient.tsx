"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatVotes, type JungmanStanding } from "@/lib/jungman";

const LAST_SEEN_ROUND_KEY = "jungman:last-seen-round";
const ROLLUP_MS = 800;
const COLLECT_POLL_MS = 60_000;

// 지도는 서버 컴포넌트(88KB SVG)라 상태를 공유하지 않는다 — 래퍼 속성만 찔러 CSS가 처리하게 한다.
function pokeMap(attribute: "data-active" | "data-reveal", value: string | null) {
  const map = document.getElementById("jm-map");
  if (!map) return;
  if (value === null) map.removeAttribute(attribute);
  else map.setAttribute(attribute, value);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatRemaining(targetIso: string, now: number) {
  const ms = Date.parse(targetIso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const clock = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return days > 0 ? `${days}일 ${clock}` : clock;
}

function CountdownRow({ label, targetIso, closedLabel }: { label: string; targetIso: string; closedLabel: string }) {
  // 마운트 전에는 시계를 그리지 않는다 — 서버/클라이언트 시각차 하이드레이션 미스매치 방지
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const remaining = now === null ? null : formatRemaining(targetIso, now);

  return (
    <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black tabular-nums text-[#e8ebf2]">
        {now === null ? "--:--:--" : remaining || closedLabel}
      </p>
    </div>
  );
}

/** 별도 cron 없이 /jungman을 보고 있는 사람이 수집을 돌린다. 서버가 쿨다운으로 막으니 폭주는 무해. */
export function JungmanAutoCollect() {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    const run = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch("/api/jungman/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = await res.json();
        if (!stopped && json?.ok) router.refresh();
      } catch {
        // 수집 실패는 조용히 넘긴다 — 다음 주기에 다시 시도한다
      } finally {
        inFlight = false;
      }
    };

    void run();
    const timer = window.setInterval(run, COLLECT_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}

function elapsedLabel(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}초 전 갱신`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}분 전 갱신` : `${Math.floor(minutes / 60)}시간 전 갱신`;
}

function LiveRow({ latestAt }: { latestAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e0705f]/40 bg-[rgba(224,112,95,0.08)] px-5 py-4">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0705f] opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e0705f]" />
      </span>
      <div>
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.22em] text-[#e0705f]">LIVE</p>
        <p className="mt-1 text-sm font-bold tabular-nums text-[#e8ebf2]">
          {now === null ? "집계 중" : elapsedLabel(now - Date.parse(latestAt))}
        </p>
      </div>
    </div>
  );
}

export function JungmanCountdown({
  voteCloseAt,
  nextRevealAt,
  isLive = false,
  latestAt = null,
}: {
  voteCloseAt: string;
  nextRevealAt: string | null;
  isLive?: boolean;
  latestAt?: string | null;
}) {
  const live = isLive && latestAt;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CountdownRow label="투표 마감까지" targetIso={voteCloseAt} closedLabel="투표 마감" />
      {live ? (
        <LiveRow latestAt={latestAt} />
      ) : nextRevealAt ? (
        <CountdownRow label="다음 개표 발표까지" targetIso={nextRevealAt} closedLabel="발표 임박" />
      ) : null}
    </div>
  );
}

function DeltaTag({ rankDelta, voteDelta }: { rankDelta: number | null; voteDelta: number | null }) {
  if (rankDelta === null && voteDelta === null) return null;

  const rankTone = !rankDelta ? "text-[#7a8299]" : rankDelta > 0 ? "text-[#5fd0a0]" : "text-[#e0705f]";
  const rankText = !rankDelta ? "—" : `${rankDelta > 0 ? "▲" : "▼"}${Math.abs(rankDelta)}`;

  return (
    <span className="flex items-baseline justify-end gap-2 tabular-nums">
      <span className={`text-sm font-black ${rankTone}`}>{rankText}</span>
      {voteDelta === null ? null : (
        <span className="text-xs font-bold text-[#7a8299]">
          {voteDelta > 0 ? `+${formatVotes(voteDelta)}` : formatVotes(voteDelta)}
        </span>
      )}
    </span>
  );
}

export function JungmanBoard({
  standings,
  round,
  revealedAt,
  isLive = false,
}: {
  standings: JungmanStanding[];
  round: number;
  revealedAt: string;
  isLive?: boolean;
}) {
  const [progress, setProgress] = useState(1);
  const [isFreshRound, setIsFreshRound] = useState(false);

  useEffect(() => {
    let seen = 0;
    try {
      seen = Number(window.localStorage.getItem(LAST_SEEN_ROUND_KEY)) || 0;
      window.localStorage.setItem(LAST_SEEN_ROUND_KEY, String(round));
    } catch {
      // 프라이빗 모드 등 localStorage 차단 — 연출만 포기하고 숫자는 그대로 보여준다
      return;
    }

    if (seen >= round) return;
    setIsFreshRound(true);
    pokeMap("data-reveal", "1");
    if (prefersReducedMotion()) return;

    setProgress(0);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(time: number) {
      const ratio = Math.min(1, (time - start) / ROLLUP_MS);
      setProgress(1 - Math.pow(1 - ratio, 3));
      if (ratio < 1) frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [round]);

  const leaderVotes = standings[0]?.votes || 0;

  return (
    <section className="rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-black tracking-tight text-[#e8ebf2]">
          <span
            className={`mr-2 rounded-full px-3 py-1 text-[0.75rem] font-black tracking-[0.1em] ${
              isLive
                ? "border border-[#e0705f]/60 text-[#e0705f]"
                : isFreshRound
                  ? "bg-[#d4a94a] text-[#0b0f1a]"
                  : "border border-[#d4a94a]/50 text-[#d4a94a]"
            }`}
          >
            {isLive ? "실시간 집계" : `${round}차 개표 발표`}
          </span>
          득표 순위
        </h2>
        <p className="text-xs font-bold text-[#7a8299]">
          {isLive ? "갱신" : "발표"}{" "}
          {new Date(revealedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>

      <ol className="mt-5 flex flex-col gap-2">
        {standings.map((standing) => {
          const target = standing.votes || 0;
          const from = standing.voteDelta === null ? 0 : target - standing.voteDelta;
          const shown = Math.round(from + (target - from) * progress);
          const barPercent = leaderVotes > 0 ? Math.max(2, (shown / leaderVotes) * 100) : 2;

          return (
            <li
              key={standing.team.code}
              className={
                standing.rank === 3
                  ? "border-b-2 border-dashed border-[#d4a94a]/45 pb-3"
                  : standing.rank === 10
                    ? "border-b-2 border-dashed border-[#e0705f]/45 pb-3"
                    : undefined
              }
            >
              <div
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[rgba(10,15,28,0.55)] px-4 py-3"
                onPointerEnter={() => pokeMap("data-active", standing.team.code)}
                onPointerLeave={() => pokeMap("data-active", null)}
              >
                <span
                  className={`text-lg font-black tabular-nums ${
                    standing.badge === "seed"
                      ? "text-[#d4a94a]"
                      : standing.badge === "wildcard"
                        ? "text-[#e0705f]"
                        : "text-[#e8ebf2]"
                  }`}
                >
                  {standing.rank}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-[#e8ebf2]">{standing.team.name}</span>
                    {standing.badge === "seed" ? (
                      <span className="rounded-full bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black text-[#d4a94a]">
                        시드권
                      </span>
                    ) : null}
                    {standing.badge === "wildcard" ? (
                      <span className="rounded-full bg-[#e0705f]/15 px-2 py-0.5 text-[0.6875rem] font-black text-[#e0705f]">
                        와일드카드권
                      </span>
                    ) : null}
                    {standing.contested ? (
                      <span className="rounded-full bg-[rgba(155,185,240,0.12)] px-2 py-0.5 text-[0.6875rem] font-black text-[#9fb6e0]">
                        경합
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(155,185,240,0.1)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barPercent}%`, backgroundColor: standing.team.color }}
                    />
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-base font-black tabular-nums text-[#e8ebf2]">{formatVotes(shown)}표</p>
                  <DeltaTag rankDelta={standing.rankDelta} voteDelta={standing.voteDelta} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
