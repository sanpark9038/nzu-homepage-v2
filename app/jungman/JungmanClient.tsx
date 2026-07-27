"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  formatVotes,
  jungmanIntervalLabel,
  jungmanSeoulTime,
  JUNGMAN_CONTEST_RATIO,
  JUNGMAN_SEED_CUT,
  JUNGMAN_WILDCARD_CUT,
  teamAccent,
  defaultJungmanRange,
  type JungmanRangeKey,
  type JungmanRankEvent,
  type JungmanSeries,
  type JungmanStanding,
} from "@/lib/jungman";

import { JungmanChartPanel, Segmented } from "./JungmanChart";

/** 시세판 정렬 — 순위순 기본, 급상승순은 1시간 증가량 내림차순 */
type SortKey = "rank" | "surge";

const LAST_SEEN_ROUND_KEY = "jungman:last-seen-round";
const ROLLUP_MS = 800;
// 수집이 3분 주기라 60초 갱신은 3번 중 2번이 같은 데이터를 다시 받는다.
const REFRESH_POLL_MS = 90_000;
const TICKER_MS = 10_000;
const TICKER_FADE_MS = 240;

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

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

/** 상단 바 한 칸 — 세로로 쌓지 않고 라벨·값을 한 줄로 눕힌다 */
type PillTone = "idle" | "gold" | "soon" | "urgent";

const PILL_TONE: Record<PillTone, { box: string; label: string; value: string }> = {
  idle: { box: "border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)]", label: "text-[#7a8299]", value: "text-[#e8ebf2]" },
  gold: { box: "border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)]", label: "text-[#d4a94a]", value: "text-[#e8ebf2]" },
  // 마감이 다가오면 같은 알약의 색과 라벨만 바뀐다 — 배너를 새로 띄우지 않는다
  soon: { box: "border-[#d4a94a]/50 bg-[rgba(212,169,74,0.10)]", label: "text-[#d4a94a]", value: "text-[#f7e3b5]" },
  urgent: { box: "border-[#e0705f]/60 bg-[rgba(224,112,95,0.12)]", label: "text-[#e0705f]", value: "text-[#ffd9d2]" },
};

function Pill({ label, value, tone = "gold" }: { label: string; value: ReactNode; tone?: PillTone }) {
  const style = PILL_TONE[tone];
  return (
    <div className={`flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 ${style.box}`}>
      <span className={`whitespace-nowrap text-[0.625rem] font-black uppercase tracking-[0.16em] ${style.label}`}>
        {label}
      </span>
      <span className={`whitespace-nowrap font-mono text-sm font-black tabular-nums ${style.value}`}>{value}</span>
    </div>
  );
}

/** 마감까지 남은 시간에 따라 같은 알약의 톤·라벨만 갈아끼운다 */
const SOON_MS = 6 * 60 * 60 * 1000;
const URGENT_MS = 60 * 60 * 1000;

function closingTone(msLeft: number): { tone: PillTone; label: string } {
  if (msLeft <= 0) return { tone: "idle", label: "투표 종료" };
  if (msLeft <= URGENT_MS) return { tone: "urgent", label: "마감 임박" };
  if (msLeft <= SOON_MS) return { tone: "soon", label: "마감 임박" };
  return { tone: "gold", label: "투표 마감까지" };
}

function CountdownPill({ label, targetIso, closedLabel }: { label: string; targetIso: string; closedLabel: string }) {
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
  const closing = now === null ? null : closingTone(Date.parse(targetIso) - now);
  return (
    <Pill
      label={closing?.label ?? label}
      value={now === null ? "--:--:--" : remaining || closedLabel}
      tone={closing?.tone ?? "gold"}
    />
  );
}

/**
 * 뷰어는 수집을 돌리지 않는다 — 수집은 서버 크론이 3분마다 한다.
 * 뷰어가 /api/jungman/collect를 때리면 쿨다운으로 스킵되는 호출마다 86KB 스냅샷을 읽어
 * 동시 시청자 수만큼 전송량이 곱해진다. 여기서는 최신 서버 렌더만 받아온다.
 */
export function JungmanAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      // 숨겨진 탭은 갱신하지 않는다 — 보이지 않는 화면을 위해 서버를 부를 이유가 없다
      if (document.hidden) return;
      router.refresh();
    }, REFRESH_POLL_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}

function elapsedLabel(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}초 전 갱신`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}분 전 갱신` : `${Math.floor(minutes / 60)}시간 전 갱신`;
}

/**
 * 상단 갱신 상태. 차수는 3분 간격 수집에서는 의미가 없어 쓰지 않는다 —
 * LIVE면 초 단위 경과, 아니면 마지막 집계 시각(한국시간)만 알린다.
 */
function UpdateStatus({ isLive, latestAt }: { isLive: boolean; latestAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!isLive) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [isLive]);

  if (!isLive) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-3.5 py-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#7a8299]" />
        <span className="whitespace-nowrap font-mono text-sm font-black tabular-nums text-[#e8ebf2]">
          {jungmanSeoulTime(latestAt)} <span className="font-sans text-xs font-bold text-[#7a8299]">기준</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-[#e0705f]/45 bg-[rgba(224,112,95,0.08)] px-3.5 py-1.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0705f] opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e0705f]" />
      </span>
      <span className="text-[0.625rem] font-black uppercase tracking-[0.16em] text-[#e0705f]">LIVE</span>
      <span className="whitespace-nowrap text-sm font-black tabular-nums text-[#e8ebf2]">
        {now === null ? "집계 중" : elapsedLabel(now - Date.parse(latestAt))}
      </span>
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
    <div className="flex flex-wrap items-center gap-2">
      <CountdownPill label="투표 마감까지" targetIso={voteCloseAt} closedLabel="투표 마감" />
      {/* LIVE 표시는 상단 갱신 상태(UpdateStatus)가 맡는다 — 여기서 또 그리면 같은 말이 두 번 나온다 */}
      {live ? null : autoCollect ? (
        // 자동 수집 중이면 "발표 시각"이란 게 없다 — 잠깐 갱신이 끊겼을 뿐이니 대기로만 알린다.
        <Pill label="자동 집계" value={latestAt ? "갱신 대기 중" : "첫 집계 대기"} tone="idle" />
      ) : nextRevealAt ? (
        <CountdownPill label="다음 개표 발표까지" targetIso={nextRevealAt} closedLabel="발표 임박" />
      ) : null}
    </div>
  );
}

/** 헤드라인이 여러 개면 쌓지 않고 5초마다 갈아끼운다. 모션 최소화면 첫 문장 고정. */
function JungmanTicker({ headlines }: { headlines: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (headlines.length < 2) return;
    // 동작 줄이기 설정이라도 문장은 넘어가야 한다 — 그때는 페이드만 건너뛴다.
    // (여기서 통째로 멈추면 티커가 정지 화면이 된다)
    const reduced = prefersReducedMotion();

    let fade = 0;
    const timer = window.setInterval(() => {
      if (reduced) {
        setIndex((current) => (current + 1) % headlines.length);
        return;
      }
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
      onClick={() => setIndex((current) => (current + 1) % Math.max(1, headlines.length))}
      className="flex min-w-0 flex-1 basis-full cursor-pointer items-center gap-2.5 rounded-full border border-[#d4a94a]/25 bg-[rgba(212,169,74,0.06)] px-4 py-2 sm:basis-[16rem]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#d4a94a]" />
      <p
        className={`min-w-0 flex-1 truncate text-base font-black tracking-tight text-[#f2f5fb] sm:text-lg transition-opacity duration-200 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {headlines[index] ?? headlines[0]}
      </p>
      {headlines.length >= 3 ? (
        <span aria-hidden className="flex shrink-0 items-center gap-1">
          {headlines.map((headline, i) => (
            <span
              key={headline}
              className={`h-1 w-1 rounded-full bg-[#d4a94a] ${i === index ? "opacity-100" : "opacity-25"}`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function TeamLogo({ src, team, size }: { src: string | null; team: JungmanStanding["team"]; size: number }) {
  if (src) {
    // width/height를 박아 CLS를 막는다. next/image를 쓸 만큼 큰 이미지가 아니다.
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-contain"
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-[#0b0f1a]"
      style={{ width: size, height: size, fontSize: size * 0.34, backgroundColor: teamAccent(team) }}
    >
      {team.code}
    </span>
  );
}

/**
 * 1시간 변화 — 누적 득표라 증가만 나온다. 0이거나 기준 스냅샷이 없으면 회색 대시.
 * 숫자만 있으면 "39"가 득표인지 증가분인지 안 읽힌다 — 화살표로 변화량임을 못박는다.
 */
function HourDelta({ value }: { value: number | undefined }) {
  if (!value) return <span className="text-[0.6875rem] font-bold text-[#7a8299]">—</span>;
  return (
    <span className={`text-[0.6875rem] font-black tabular-nums ${value > 0 ? "text-[#8fd18f]" : "text-[#e0705f]"}`}>
      {value > 0 ? "▲" : "▼"} {formatVotes(Math.abs(value))}
    </span>
  );
}

function cutlineOf(rank: number | null) {
  if (rank === JUNGMAN_SEED_CUT) {
    return { label: "시드 확보선", tone: "border-[#d4a94a]/45", chip: "border-[#d4a94a]/50 text-[#d4a94a]" };
  }
  if (rank === JUNGMAN_WILDCARD_CUT) {
    return { label: "와일드카드 위험선", tone: "border-[#e0705f]/45", chip: "border-[#e0705f]/50 text-[#e0705f]" };
  }
  return null;
}

/** 좌측 시세판 한 행 — 순위·로고·팀명·득표수·1시간 변화. 클릭이 곧 팀 선택. */
function TickerRow({
  standing,
  logo,
  shown,
  hourDelta,
  selected,
  onSelect,
  onHover,
}: {
  standing: JungmanStanding;
  logo: string | null;
  shown: number;
  hourDelta: number | undefined;
  selected: boolean;
  onSelect: () => void;
  onHover: (code: string | null) => void;
}) {
  const leading = standing.rank === 1;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      onPointerEnter={() => onHover(standing.team.code)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(standing.team.code)}
      onBlur={() => onHover(null)}
      className={`grid w-full grid-cols-[1.5rem_1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-[#d4a94a] bg-[rgba(212,169,74,0.14)]"
          : leading
            ? "border-transparent border-l-4 border-l-[#d4a94a] bg-[rgba(212,169,74,0.07)]"
            : "border-transparent bg-[rgba(10,15,28,0.55)] hover:border-[rgba(155,185,240,0.22)]"
      }`}
    >
      <span
        className={`text-center text-base font-black tabular-nums ${
          standing.badge === "seed"
            ? "text-[#d4a94a]"
            : standing.badge === "wildcard"
              ? "text-[#e0705f]"
              : "text-[#e8ebf2]"
        }`}
      >
        {standing.rank}
      </span>

      <TeamLogo src={logo} team={standing.team} size={24} />

      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-bold text-[#e8ebf2]">{standing.team.name}</span>
        {standing.badge === "seed" ? (
          <span className="shrink-0 rounded bg-[#d4a94a]/15 px-1 py-px text-[0.625rem] font-black text-[#d4a94a]">
            시드
          </span>
        ) : null}
        {standing.badge === "wildcard" ? (
          <span className="shrink-0 rounded bg-[#e0705f]/15 px-1 py-px text-[0.625rem] font-black text-[#e0705f]">
            와카
          </span>
        ) : null}
        {standing.contested ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9fb6e0]" title="경합" /> : null}
      </span>

      <span className="flex flex-col items-end leading-tight">
        <span className="text-sm font-black tabular-nums text-[#e8ebf2]">{formatVotes(shown)}</span>
        <HourDelta value={hourDelta} />
      </span>
    </button>
  );
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${PANEL} p-4`}>
      <h2 className="text-[0.6875rem] font-black uppercase tracking-[0.18em] text-[#d4a94a]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs font-bold text-[#7a8299]">{label}</span>
      <span className="text-sm font-black tabular-nums text-[#e8ebf2]">{value}</span>
    </div>
  );
}

/**
 * 컷라인까지의 거리. 시드권이면 "쫓기는 표차", 밖이면 "따라잡아야 할 표차"다.
 * 방향을 섞으면 3위와 11위가 같은 문장으로 읽혀 거짓말이 된다.
 */
function cutlineGap(standings: JungmanStanding[], standing: JungmanStanding) {
  const at = (rank: number) => standings.find((entry) => entry.rank === rank);
  const votes = standing.votes || 0;
  const rank = standing.rank || standings.length;

  if (rank <= JUNGMAN_SEED_CUT) {
    const chaser = at(JUNGMAN_SEED_CUT + 1);
    return chaser
      ? { label: `${JUNGMAN_SEED_CUT + 1}위와 격차`, text: `${formatVotes(votes - (chaser.votes || 0))}표` }
      : null;
  }
  if (rank <= JUNGMAN_WILDCARD_CUT) {
    const seed = at(JUNGMAN_SEED_CUT);
    return seed ? { label: `${JUNGMAN_SEED_CUT}위까지`, text: `${formatVotes((seed.votes || 0) - votes)}표` } : null;
  }
  const safe = at(JUNGMAN_WILDCARD_CUT);
  return safe ? { label: `${JUNGMAN_WILDCARD_CUT}위까지`, text: `${formatVotes((safe.votes || 0) - votes)}표` } : null;
}

function ContestRow({
  label,
  upper,
  lower,
  tight,
}: {
  label: string;
  upper: JungmanStanding | undefined;
  lower: JungmanStanding | undefined;
  tight: number;
}) {
  if (!upper || !lower) return null;
  const gap = (upper.votes || 0) - (lower.votes || 0);
  const close = gap <= tight;
  // 경합 임계(1위 득표의 3%)를 최대폭으로 잡는다 — 바가 꽉 차면 안전, 짧을수록 아슬아슬.
  const fill = tight > 0 ? Math.min(1, gap / tight) : 1;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        close
          ? "border-[#e0705f]/45 bg-[rgba(224,112,95,0.07)]"
          : "border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.55)]"
      }`}
    >
      <p className="text-[0.625rem] font-black uppercase tracking-[0.16em] text-[#7a8299]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#e8ebf2]">
        {upper.rank}위 {upper.team.name} <span className="text-[#7a8299]">vs</span> {lower.rank}위 {lower.team.name}
      </p>
      <p className={`mt-0.5 text-sm font-black tabular-nums ${close ? "text-[#e0705f]" : "text-[#8fd18f]"}`}>
        {gap === 0 ? "동률" : `${formatVotes(gap)}표 차`}
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[rgba(155,185,240,0.14)]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            close ? "bg-[#e0705f]" : "bg-[#8fd18f]"
          }`}
          // 0%면 바가 아예 사라져 동률인지 미표기인지 구분이 안 된다 — 최소 심지를 남긴다
          style={{ width: `${Math.max(3, fill * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function JungmanDashboard({
  standings,
  round,
  revealedAt,
  isLive = false,
  logos = {},
  headlines = [],
  series,
  hourDeltas,
  bestRanks,
  rankEvents,
  seedTeamName,
  voteCloseAt,
  nextRevealAt,
  autoCollect = false,
  map,
}: {
  standings: JungmanStanding[];
  round: number;
  revealedAt: string;
  isLive?: boolean;
  /** 팀코드 → 로고 경로. 파일 존재 확인은 서버(fs)에서 끝내고 내려온다 */
  logos?: Record<string, string | null>;
  headlines?: string[];
  /** 1시간·6시간·전체 — 버킷은 서버가 끝내 내려준다 */
  series: JungmanSeries[];
  hourDeltas: Record<string, number>;
  bestRanks: Record<string, number>;
  rankEvents: JungmanRankEvent[];
  seedTeamName: string | null;
  voteCloseAt: string;
  nextRevealAt: string | null;
  autoCollect?: boolean;
  /** 지도는 서버 컴포넌트 — children으로 받아 88KB SVG를 클라이언트 번들에 넣지 않는다 */
  map: ReactNode;
}) {
  const [progress, setProgress] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"votes" | "rank">("votes");
  // 초반에는 1시간 봉이 한 점뿐이라 "전체"로 시작하면 빈 차트가 보인다 — 점이 있는 구간부터.
  const [range, setRange] = useState<JungmanRangeKey>(() => defaultJungmanRange(series));
  const [sort, setSort] = useState<SortKey>("rank");

  // 급상승순 — 1시간 증가량 내림차순. 동률이면 순위순으로 되돌아간다(자리가 흔들리지 않게).
  const listed = useMemo(() => {
    if (sort === "rank") return standings;
    return standings
      .slice()
      .sort(
        (a, b) =>
          (hourDeltas[b.team.code] || 0) - (hourDeltas[a.team.code] || 0) ||
          (a.rank || 0) - (b.rank || 0)
      );
  }, [standings, sort, hourDeltas]);

  const teams = useMemo(
    () => new Map(standings.map((standing) => [standing.team.code, standing.team])),
    [standings]
  );

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

  // hover는 일시 강조, 클릭 선택은 지속 강조 — hover가 끝나면 선택으로 되돌아온다
  useEffect(() => {
    pokeMap("data-active", hovered || selected);
  }, [hovered, selected]);

  // 지도 마커도 선택 입력이 된다. 서버 SVG라 리스너를 못 다니 래퍼에서 이벤트 위임으로 받는다.
  useEffect(() => {
    const element = document.getElementById("jm-map");
    if (!element) return;

    const onClick = (event: MouseEvent) => {
      const marker = (event.target as Element | null)?.closest?.("[data-team]");
      const code = marker?.getAttribute("data-team");
      // 수술대(투표 비대상)는 순위 데이터가 없다 — 선택 대상에서 뺀다
      if (!code || !teams.has(code)) return;
      setSelected((current) => (current === code ? null : code));
    };

    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [teams]);

  // 시세판 행·범례 칩·지도 마커가 모두 같은 토글을 쓴다 — 다시 누르면 선택 해제
  const selectTeam = (code: string) => setSelected((current) => (current === code ? null : code));

  const leaderVotes = standings[0]?.votes || 0;
  const tight = leaderVotes * JUNGMAN_CONTEST_RATIO;
  const detail = standings.find((standing) => standing.team.code === selected) ?? standings[0];
  const detailGap = detail ? cutlineGap(standings, detail) : null;

  // 리빌 롤업 — 새 차수를 처음 보는 사람에게만 직전 값에서 굴려 올린다
  const shownVotes = (standing: JungmanStanding) => {
    const target = standing.votes || 0;
    const from = standing.voteDelta === null ? 0 : target - standing.voteDelta;
    return Math.round(from + (target - from) * progress);
  };

  return (
    <>
      <header className={`${PANEL} flex flex-wrap items-center gap-3 px-4 py-3`}>
        <div className="shrink-0">
          <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[#d4a94a]">중만컵 인기투표</p>
          <h1 className="text-xl font-black tracking-tight">투표 현황</h1>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1">
          <UpdateStatus isLive={isLive} latestAt={revealedAt} />
          {/* 갱신이 멈춘 것처럼 보이는 순간을 위해 집계 주기를 밝힌다 — 주기는 수집 상수에서 온다 */}
          {autoCollect ? (
            <span className="pl-1 text-[0.625rem] font-bold text-[#7a8299]">
              {jungmanIntervalLabel()}마다 자동 집계
            </span>
          ) : null}
        </div>

        {headlines.length ? <JungmanTicker headlines={headlines} /> : <div className="flex-1" />}

        <JungmanCountdown
          voteCloseAt={voteCloseAt}
          nextRevealAt={nextRevealAt}
          isLive={isLive}
          latestAt={revealedAt}
          autoCollect={autoCollect}
        />
      </header>

      {/* 기본 트랙은 반드시 minmax(0,1fr) — grid-cols-1은 `1fr`(=minmax(auto,1fr))이라 지도 SVG의
          고유 폭이 트랙 최소치가 되고, 모바일에서 화면 밖으로 밀린다 */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_300px] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* 중앙 히어로 — 지도가 가장 크다 */}
        <section className={`${PANEL} min-w-0 p-2 lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:row-start-1`}>
          {map}
        </section>

        {/* 좌측 팀 시세판 */}
        <aside className="lg:col-start-1 lg:row-start-1 xl:col-start-1 xl:row-start-1 xl:row-span-3">
          <div className={`${PANEL} p-3 xl:sticky xl:top-4`}>
            <div className="px-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black tracking-tight text-[#e8ebf2]">득표 순위</h2>
                <Segmented
                  label="시세판 정렬"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { key: "rank" as SortKey, label: "순위순" },
                    { key: "surge" as SortKey, label: "급상승순" },
                  ]}
                />
              </div>
              <p className="mt-1.5 text-right text-[0.625rem] font-bold text-[#7a8299]">득표 · 1시간 변화</p>
            </div>

            <ol className="flex flex-col gap-1">
              {listed.map((standing) => {
                // 급상승순에서는 줄 순서가 순위와 다르다 — 컷라인 구분선을 그리면 거짓말이 된다
                const cutline = sort === "rank" ? cutlineOf(standing.rank) : null;
                return (
                  <li
                    key={standing.team.code}
                    className={cutline ? `relative border-b-2 border-dashed pb-3.5 ${cutline.tone}` : undefined}
                  >
                    <TickerRow
                      standing={standing}
                      logo={logos[standing.team.code] ?? null}
                      shown={shownVotes(standing)}
                      hourDelta={hourDeltas[standing.team.code]}
                      selected={selected === standing.team.code}
                      onSelect={() => selectTeam(standing.team.code)}
                      onHover={setHovered}
                    />
                    {cutline ? (
                      <span
                        className={`absolute bottom-[-0.55rem] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border bg-[#0d1322] px-2 py-0.5 text-[0.625rem] font-black ${cutline.chip}`}
                      >
                        {cutline.label}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {seedTeamName ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[#d4a94a]/45 bg-[rgba(212,169,74,0.08)] px-2.5 py-2">
                <span className="truncate text-sm font-bold text-[#e8ebf2]">{seedTeamName}</span>
                <span className="shrink-0 text-[0.625rem] font-black text-[#d4a94a]">4시드 확보</span>
              </div>
            ) : null}
          </div>
        </aside>

        {/* 차트 */}
        <section className={`${PANEL} p-4 lg:col-start-1 lg:row-start-3 xl:col-start-2 xl:row-start-2`}>
          <JungmanChartPanel
            series={series}
            selected={selected}
            onSelectTeam={selectTeam}
            mode={mode}
            onModeChange={setMode}
            range={range}
            onRangeChange={setRange}
          />
        </section>

        {/* 우측 상세 레일 */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-3 xl:col-start-3 xl:row-start-1 xl:row-span-3">
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            {detail ? (
              <RailCard title={selected ? "선택한 팀" : "선두"}>
                <div className="flex items-center gap-3">
                  <TeamLogo src={logos[detail.team.code] ?? null} team={detail.team} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-[#e8ebf2]">{detail.team.name}</p>
                    <p className="text-xs font-bold text-[#7a8299]">
                      현재 {detail.rank}위
                      {detail.badge === "seed" ? " · 시드권" : detail.badge === "wildcard" ? " · 와일드카드권" : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 font-mono text-3xl font-black tabular-nums text-[#e8ebf2]">
                  {formatVotes(detail.votes || 0)}
                  <span className="ml-1 text-base font-bold text-[#7a8299]">표</span>
                </p>
                <div className="mt-2 divide-y divide-[rgba(155,185,240,0.1)]">
                  <StatRow label="1시간 변화" value={<HourDelta value={hourDeltas[detail.team.code]} />} />
                  <StatRow label="최고 순위" value={`${bestRanks[detail.team.code] ?? detail.rank}위`} />
                  {detailGap ? <StatRow label={detailGap.label} value={detailGap.text} /> : null}
                </div>
              </RailCard>
            ) : null}

            <RailCard title="컷라인 상황판">
              <div className="flex flex-col gap-2">
                <ContestRow
                  label="시드 경합"
                  upper={standings.find((standing) => standing.rank === JUNGMAN_SEED_CUT)}
                  lower={standings.find((standing) => standing.rank === JUNGMAN_SEED_CUT + 1)}
                  tight={tight}
                />
                <ContestRow
                  label="와일드카드 경합"
                  upper={standings.find((standing) => standing.rank === JUNGMAN_WILDCARD_CUT)}
                  lower={standings.find((standing) => standing.rank === JUNGMAN_WILDCARD_CUT + 1)}
                  tight={tight}
                />
              </div>
            </RailCard>

            {rankEvents.length ? (
              <RailCard title="최근 순위 변동">
                <ol className="flex flex-col gap-2">
                  {rankEvents.map((event) => {
                    const team = teams.get(event.code);
                    return (
                      <li key={`${event.at}-${event.code}`} className="flex items-center gap-2.5 text-sm">
                        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-[#7a8299]">
                          {jungmanSeoulTime(event.at)}
                        </span>
                        {team ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: teamAccent(team) }}
                          />
                        ) : null}
                        <span className="min-w-0 truncate font-bold text-[#e8ebf2]">{event.name}</span>
                        <span className="ml-auto shrink-0 font-black text-[#8fd18f]">▲ {event.rank}위</span>
                      </li>
                    );
                  })}
                </ol>
              </RailCard>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
