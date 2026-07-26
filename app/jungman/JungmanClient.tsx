"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  formatVotes,
  JUNGMAN_CONTEST_RATIO,
  JUNGMAN_SEED_CUT,
  JUNGMAN_WILDCARD_CUT,
  teamAccent,
  type JungmanStanding,
} from "@/lib/jungman";

const LAST_SEEN_ROUND_KEY = "jungman:last-seen-round";
const ROLLUP_MS = 800;
const COLLECT_POLL_MS = 60_000;
const TICKER_MS = 5_000;
const TICKER_FADE_MS = 240;

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

/** 자동 수집 중인데 최근 갱신이 없을 때 — 발표 카운트다운 대신 상태만 알린다. */
function StaleRow({ latestAt }: { latestAt: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7a8299]" />
      <div>
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.22em] text-[#7a8299]">자동 집계</p>
        <p className="mt-1 text-sm font-bold text-[#e8ebf2]">
          {latestAt ? "갱신 대기 중" : "첫 집계를 기다리는 중"}
        </p>
      </div>
    </div>
  );
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
  autoCollect = false,
}: {
  voteCloseAt: string;
  nextRevealAt: string | null;
  isLive?: boolean;
  latestAt?: string | null;
  autoCollect?: boolean;
}) {
  const live = isLive && latestAt;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CountdownRow label="투표 마감까지" targetIso={voteCloseAt} closedLabel="투표 마감" />
      {live ? (
        <LiveRow latestAt={latestAt} />
      ) : autoCollect ? (
        // 자동 수집 중이면 "발표 시각"이란 게 없다 — 잠깐 갱신이 끊겼을 뿐이니 대기로만 알린다.
        <StaleRow latestAt={latestAt} />
      ) : nextRevealAt ? (
        <CountdownRow label="다음 개표 발표까지" targetIso={nextRevealAt} closedLabel="발표 임박" />
      ) : null}
    </div>
  );
}

/** 변화가 없으면 아무것도 찍지 않는다 — 12행 중 11행이 "— 0"이면 정작 변한 값이 안 보인다. */
function DeltaTag({ rankDelta, voteDelta }: { rankDelta: number | null; voteDelta: number | null }) {
  return (
    <>
      {rankDelta ? (
        <span className={`text-sm font-black ${rankDelta > 0 ? "text-[#8fd18f]" : "text-[#e0705f]"}`}>
          {rankDelta > 0 ? "▲" : "▼"}
          {Math.abs(rankDelta)}
        </span>
      ) : null}
      {voteDelta ? (
        <span className="text-xs font-bold text-[#7a8299]">
          {voteDelta > 0 ? `+${formatVotes(voteDelta)}` : formatVotes(voteDelta)}
        </span>
      ) : null}
    </>
  );
}

/**
 * 바로 위 순위와의 표차. 1위만 아래(2위)와의 격차를 본다.
 * 적색 강조는 contested 행이 아니라 "지금 보여주는 이 격차"가 근소할 때만 — 아래쪽 때문에 경합인 팀에
 * 위쪽과의 넉넉한 격차를 빨갛게 칠하면 거짓말이 된다.
 */
function gapLabel(standings: JungmanStanding[], index: number, threshold: number) {
  const other = index === 0 ? standings[1] : standings[index - 1];
  if (!other || other.rank === null) return { text: "", tight: false };

  const gap = Math.abs((standings[index].votes || 0) - (other.votes || 0));
  return {
    text: gap === 0 ? `${other.rank}위와 동률` : `${other.rank}위와 ${formatVotes(gap)}표 차`,
    tight: threshold > 0 && gap <= threshold,
  };
}

function TeamLogo({ src, team }: { src: string | null; team: JungmanStanding["team"] }) {
  if (src) {
    // width/height를 박아 CLS를 막는다. next/image를 쓸 만큼 큰 이미지가 아니다.
    return <img src={src} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-contain" />;
  }

  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full text-[0.5625rem] font-black text-[#0b0f1a]"
      style={{ backgroundColor: teamAccent(team) }}
    >
      {team.code}
    </span>
  );
}

/** 헤드라인이 여러 개면 쌓지 않고 5초마다 갈아끼운다. 모션 최소화면 첫 문장 고정. */
function JungmanTicker({ headlines }: { headlines: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (headlines.length < 2 || prefersReducedMotion()) return;

    let fade = 0;
    const timer = window.setInterval(() => {
      setVisible(false);
      fade = window.setTimeout(() => {
        setIndex((current) => (current + 1) % headlines.length);
        setVisible(true);
      }, TICKER_FADE_MS);
    }, TICKER_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(fade);
    };
  }, [headlines.length]);

  return (
    <div
      aria-live="polite"
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#d4a94a]/25 bg-[rgba(212,169,74,0.06)] px-4 py-2.5"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#d4a94a]" />
      <p
        className={`min-w-0 text-sm font-bold leading-snug text-[#e8ebf2] transition-opacity duration-200 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {headlines[index] ?? headlines[0]}
      </p>
    </div>
  );
}

export function JungmanBoard({
  standings,
  round,
  revealedAt,
  isLive = false,
  logos = {},
  headlines = [],
}: {
  standings: JungmanStanding[];
  round: number;
  revealedAt: string;
  isLive?: boolean;
  /** 팀코드 → 로고 경로. 파일 존재 확인은 서버(fs)에서 끝내고 내려온다 */
  logos?: Record<string, string | null>;
  headlines?: string[];
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
      {headlines.length ? <JungmanTicker headlines={headlines} /> : null}

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
        {standings.map((standing, index) => {
          const target = standing.votes || 0;
          const from = standing.voteDelta === null ? 0 : target - standing.voteDelta;
          const shown = Math.round(from + (target - from) * progress);
          const barPercent = leaderVotes > 0 ? Math.max(2, (shown / leaderVotes) * 100) : 2;
          const leading = standing.rank === 1;
          const gap = gapLabel(standings, index, leaderVotes * JUNGMAN_CONTEST_RATIO);
          const cutline =
            standing.rank === JUNGMAN_SEED_CUT
              ? { label: "시드 확보선", tone: "border-[#d4a94a]/45", chip: "border-[#d4a94a]/50 text-[#d4a94a]" }
              : standing.rank === JUNGMAN_WILDCARD_CUT
                ? {
                    label: "와일드카드 위험선",
                    tone: "border-[#e0705f]/45",
                    chip: "border-[#e0705f]/50 text-[#e0705f]",
                  }
                : null;

          return (
            <li
              key={standing.team.code}
              className={cutline ? `relative border-b-2 border-dashed pb-4 ${cutline.tone}` : undefined}
            >
              <div
                className={`grid grid-cols-[2.25rem_1.75rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-3 py-3 sm:gap-x-3 sm:px-4 ${
                  leading
                    ? "border-l-4 border-[#d4a94a] bg-[rgba(212,169,74,0.07)]"
                    : "bg-[rgba(10,15,28,0.55)]"
                }`}
                onPointerEnter={() => pokeMap("data-active", standing.team.code)}
                onPointerLeave={() => pokeMap("data-active", null)}
              >
                <span
                  className={`font-black tabular-nums ${leading ? "text-2xl" : "text-lg"} ${
                    standing.badge === "seed"
                      ? "text-[#d4a94a]"
                      : standing.badge === "wildcard"
                        ? "text-[#e0705f]"
                        : "text-[#e8ebf2]"
                  }`}
                >
                  {standing.rank}
                </span>

                <TeamLogo src={logos[standing.team.code] ?? null} team={standing.team} />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                      style={{ width: `${barPercent}%`, backgroundColor: teamAccent(standing.team) }}
                    />
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-base font-black tabular-nums text-[#e8ebf2]">{formatVotes(shown)}표</p>
                  <div className="mt-0.5 flex flex-wrap items-baseline justify-end gap-x-2 tabular-nums">
                    <DeltaTag rankDelta={standing.rankDelta} voteDelta={standing.voteDelta} />
                    <span
                      className={`text-[0.625rem] font-bold ${gap.tight ? "text-[#e0705f]" : "text-[#7a8299]"}`}
                    >
                      {gap.text}
                    </span>
                  </div>
                </div>
              </div>

              {cutline ? (
                <span
                  className={`absolute bottom-[-0.6rem] left-1/2 -translate-x-1/2 rounded-full border bg-[#0d1322] px-2.5 py-0.5 text-[0.625rem] font-black tracking-[0.06em] ${cutline.chip}`}
                >
                  {cutline.label}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
