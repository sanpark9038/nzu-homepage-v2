import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import {
  buildJungmanBestRanks,
  buildJungmanHeadlines,
  buildJungmanHourDeltas,
  buildJungmanMarkers,
  buildJungmanRankEvents,
  buildJungmanSeries,
  getJungmanState,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTE_METHOD_LABEL,
  JUNGMAN_VOTE_PERIOD_LABEL,
  JUNGMAN_VOTING_TEAMS,
} from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

import { JungmanAutoRefresh, JungmanCountdown, JungmanDashboard } from "./JungmanClient";

// 수집이 3분 주기라 그보다 자주 재생성해봐야 같은 데이터를 다시 읽을 뿐이다
export const revalidate = 60;

export const metadata: Metadata = {
  title: "중만컵 투표 현황",
  description: "중만컵 인기투표 차수별 개표 현황 — 연고지 지도, 득표 순위, 추이",
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

export default async function JungmanPage() {
  const { config, snapshots, latest, standings, isLive: inLiveWindow } = await getJungmanState();
  const markers = buildJungmanMarkers(standings);
  const seedTeam = JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE);
  // LIVE 판정은 여기 한 곳에서만 — 카운트다운과 보드 배지가 서로 다른 조건을 쓰면 배지가 어긋난다
  const isLive = inLiveWindow && latest !== null;
  const headlines = buildJungmanHeadlines(snapshots, config.voteCloseAt);
  // 로고 파일 존재 확인은 fs — 서버에서 끝내고 보드(클라이언트)에는 경로만 내려준다
  const logos = Object.fromEntries(
    JUNGMAN_VOTING_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );
  // 구간 버킷(1시간·6시간·전체)은 서버에서 끝낸다 — 클라이언트는 전환만 한다
  const series = buildJungmanSeries(snapshots);

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-5 md:px-5">
        {config.autoCollect ? <JungmanAutoRefresh /> : null}

        {latest ? (
          <JungmanDashboard
            standings={standings}
            round={latest.round}
            revealedAt={latest.at}
            isLive={isLive}
            logos={logos}
            headlines={headlines}
            series={series}
            hourDeltas={buildJungmanHourDeltas(snapshots)}
            bestRanks={buildJungmanBestRanks(snapshots)}
            rankEvents={buildJungmanRankEvents(snapshots)}
            seedTeamName={seedTeam?.name ?? null}
            voteCloseAt={config.voteCloseAt}
            nextRevealAt={config.nextRevealAt}
            autoCollect={config.autoCollect}
            // #jm-map은 선택·hover ↔ 마커 강조 연동의 앵커 — 대시보드가 data-active/data-reveal을 세팅한다
            map={
              <div id="jm-map">
                <JungmanMap markers={markers} />
              </div>
            }
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <section className={`${PANEL} p-6`}>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">
                중만컵 · 인기투표 개표 현황
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">첫 개표 발표를 기다리고 있습니다</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#7a8299]">
                13개 대학 중 투표 대상은 <b className="font-bold text-[#e8ebf2]">12팀</b>, 수술대는 4시드를 확보해
                투표에서 빠집니다. 상위 3팀 시드 · 하위 2팀 와일드카드전.
              </p>
              <div className="mt-5">
                <JungmanCountdown
                  voteCloseAt={config.voteCloseAt}
                  nextRevealAt={config.nextRevealAt}
                  isLive={isLive}
                  latestAt={null}
                  autoCollect={config.autoCollect}
                />
              </div>
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

            <section id="jm-map" className={`${PANEL} p-3`}>
              <JungmanMap markers={markers} />
            </section>
          </div>
        )}

        <p className="mt-4 px-1 text-[0.6875rem] text-[#7a8299]">지도 경계 데이터: 통계청</p>
      </main>
    </div>
  );
}
