import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import {
  buildJungmanHeadlines,
  buildJungmanMarkers,
  formatVotes,
  getJungmanState,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTE_METHOD_LABEL,
  JUNGMAN_VOTE_PERIOD_LABEL,
  JUNGMAN_VOTING_TEAMS,
  type JungmanSnapshot,
  teamAccent,
} from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

import { JungmanAutoCollect, JungmanBoard, JungmanCountdown } from "./JungmanClient";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "중만컵 투표 현황",
  description: "중만컵 인기투표 차수별 개표 현황 — 연고지 지도, 득표 순위, 추이",
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

/** 12개 선을 전부 진하게 그리면 아무것도 안 읽힌다 — 상위 이만큼만 살리고 나머지는 배경으로 */
const TREND_FOCUS = 5;
/** 마지막 점 라벨 최소 세로 간격 */
const LABEL_GAP = 12;

/** 최신 스냅샷 득표 내림차순 — 선 굵기·라벨·범례 순서가 전부 이걸 따른다 */
function rankTeamsByLatest(latest: JungmanSnapshot) {
  return JUNGMAN_VOTING_TEAMS.slice().sort(
    (a, b) => (latest.votes[b.code] || 0) - (latest.votes[a.code] || 0)
  );
}

function TrendChart({ snapshots }: { snapshots: JungmanSnapshot[] }) {
  const width = 760;
  const height = 300;
  const padLeft = 52;
  const padRight = 58; // 마지막 점 오른쪽 약칭 라벨 자리
  const padTop = 18;
  const padBottom = 30;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  const maxVotes = Math.max(
    1,
    ...snapshots.flatMap((snapshot) => JUNGMAN_VOTING_TEAMS.map((team) => snapshot.votes[team.code] || 0))
  );

  const x = (index: number) => padLeft + (innerWidth * index) / Math.max(1, snapshots.length - 1);
  const y = (votes: number) => padTop + innerHeight * (1 - votes / maxVotes);

  const last = snapshots[snapshots.length - 1];
  const ranked = rankTeamsByLatest(last);
  const focus = ranked.slice(0, TREND_FOCUS);
  const focusCodes = new Set(focus.map((team) => team.code));
  // 상위 팀을 뒤에 그려 위로 올린다
  const drawOrder = [...ranked.slice(TREND_FOCUS), ...focus];

  // 마지막 값이 붙어 있으면 라벨이 겹친다 — 아래에서 위로 최소 간격을 강제한다
  const labels = focus
    .map((team) => ({ team, y: y(last.votes[team.code] || 0) }))
    .sort((a, b) => b.y - a.y);
  let ceiling = Infinity;
  for (const label of labels) {
    label.y = Math.max(padTop + 5, Math.min(label.y, ceiling - LABEL_GAP));
    ceiling = label.y;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="차수별 팀 득표 추이"
      className="block h-auto w-full"
    >
      {[0, 0.5, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1={padLeft}
            y1={padTop + innerHeight * ratio}
            x2={width - padRight}
            y2={padTop + innerHeight * ratio}
            stroke="rgba(155,185,240,0.12)"
          />
          <text
            x={padLeft - 10}
            y={padTop + innerHeight * ratio + 4}
            textAnchor="end"
            fontSize="11"
            fill="#7a8299"
          >
            {formatVotes(Math.round(maxVotes * (1 - ratio)))}
          </text>
        </g>
      ))}

      {/* 실시간 수집이면 차수가 수백 개까지 늘어난다 — 라벨은 8개 안쪽으로 솎는다 */}
      {snapshots.map((snapshot, index) =>
        index % Math.ceil(snapshots.length / 8) === 0 || index === snapshots.length - 1 ? (
          <text key={snapshot.round} x={x(index)} y={height - 10} textAnchor="middle" fontSize="11" fill="#7a8299">
            {snapshot.round}차
          </text>
        ) : null
      )}

      {drawOrder.map((team) => {
        const points = snapshots.map((snapshot, index) => `${x(index)},${y(snapshot.votes[team.code] || 0)}`);
        const lead = focusCodes.has(team.code);

        return (
          <g key={team.code}>
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke={teamAccent(team)}
              strokeWidth={lead ? 2.2 : 1.2}
              strokeOpacity={lead ? 1 : 0.35}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(snapshots.length - 1)}
              cy={y(last.votes[team.code] || 0)}
              r={lead ? 4 : 2.6}
              fill={teamAccent(team)}
              fillOpacity={lead ? 1 : 0.45}
              stroke="#0b0f1a"
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {labels.map((label) => (
        <text
          key={label.team.code}
          x={x(snapshots.length - 1) + 8}
          y={label.y + 3.5}
          fontSize="11"
          fontWeight="800"
          fill={teamAccent(label.team)}
        >
          {label.team.code}
        </text>
      ))}
    </svg>
  );
}

export default async function JungmanPage() {
  const { config, snapshots, latest, standings, isLive: inLiveWindow } = await getJungmanState();
  const markers = buildJungmanMarkers(standings);
  const seedTeam = JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE);
  // LIVE 판정은 여기 한 곳에서만 — 카운트다운과 보드 배지가 서로 다른 조건을 쓰면 배지가 어긋난다
  const isLive = inLiveWindow && latest !== null;
  const headlines = buildJungmanHeadlines(snapshots);
  // 로고 파일 존재 확인은 fs — 서버에서 끝내고 보드(클라이언트)에는 경로만 내려준다
  const logos = Object.fromEntries(
    JUNGMAN_VOTING_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-8">
        <header className={`${PANEL} p-6`}>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">
            중만컵 · 인기투표 개표 현황
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">중만컵 투표 현황</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#7a8299]">
            13개 대학 중 투표 대상은 <b className="font-bold text-[#e8ebf2]">12팀</b>, 수술대는 4시드를 확보해 투표에서
            빠집니다. 상위 3팀 시드 · 하위 2팀 와일드카드전.
          </p>

          <div className="mt-5">
            <JungmanCountdown
              voteCloseAt={config.voteCloseAt}
              nextRevealAt={config.nextRevealAt}
              isLive={isLive}
              latestAt={latest?.at ?? null}
              autoCollect={config.autoCollect}
            />
          </div>
        </header>

        {config.autoCollect ? <JungmanAutoCollect /> : null}

        {/* id는 보드 hover ↔ 마커 강조 연동의 앵커 — JungmanClient가 data-active/data-reveal을 세팅한다 */}
        <section id="jm-map" className={`${PANEL} p-3`}>
          <JungmanMap markers={markers} />
        </section>

        {latest ? (
          <JungmanBoard
            standings={standings}
            round={latest.round}
            revealedAt={latest.at}
            isLive={isLive}
            logos={logos}
            headlines={headlines}
          />
        ) : (
          <section className={`${PANEL} p-6`}>
            <h2 className="text-xl font-black tracking-tight">첫 개표 발표를 기다리고 있습니다</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">투표 기간</dt>
                <dd className="mt-2 font-bold text-[#e8ebf2]">{JUNGMAN_VOTE_PERIOD_LABEL}</dd>
              </div>
              <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">투표 방식</dt>
                <dd className="mt-2 font-bold text-[#e8ebf2]">{JUNGMAN_VOTE_METHOD_LABEL}</dd>
              </div>
            </dl>
          </section>
        )}

        {seedTeam ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d4a94a]/45 bg-[rgba(212,169,74,0.08)] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#d4a94a] px-3 py-1 text-[0.6875rem] font-black tracking-[0.1em] text-[#0b0f1a]">
                4시드
              </span>
              <span className="font-bold text-[#e8ebf2]">{seedTeam.name}</span>
            </div>
            <span className="text-xs font-bold text-[#d4a94a]">투표 없이 4시드 확보 — 순위 집계 제외</span>
          </div>
        ) : null}

        {latest && snapshots.length >= 2 ? (
          <section className={`${PANEL} p-6`}>
            <h2 className="text-xl font-black tracking-tight">차수별 득표 추이</h2>
            <div className="mt-4">
              <TrendChart snapshots={snapshots.slice(-40)} />
            </div>
            {/* 범례도 그래프와 같은 순서 — 진하게 그린 상위 팀이 앞에 온다 */}
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {rankTeamsByLatest(latest).map((team, index) => (
                <li
                  key={team.code}
                  className={`flex items-center gap-2 text-xs font-bold ${
                    index < TREND_FOCUS ? "text-[#e8ebf2]" : "text-[#7a8299]"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: teamAccent(team), opacity: index < TREND_FOCUS ? 1 : 0.4 }}
                  />
                  {team.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="px-1 text-[0.6875rem] text-[#7a8299]">지도 경계 데이터: 통계청</p>
      </main>
    </div>
  );
}
