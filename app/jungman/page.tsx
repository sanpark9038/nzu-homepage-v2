import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import JungmanSubNav from "@/components/jungman/JungmanSubNav";
import {
  buildJungmanBestRanks,
  buildJungmanFinalStandings,
  buildJungmanHeadlines,
  buildJungmanHourDeltas,
  buildJungmanMarkers,
  buildJungmanRankEvents,
  buildJungmanSeries,
  getJungmanState,
  isJungmanClosed,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTE_METHOD_LABEL,
  JUNGMAN_VOTE_PERIOD_LABEL,
} from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

import { JungmanAutoRefresh, JungmanCountdown, JungmanDashboard } from "./JungmanClient";
import JungmanResults from "./JungmanResults";

// 수집이 3분 주기라 그보다 자주 재생성해봐야 같은 데이터를 다시 읽을 뿐이다
export const revalidate = 60;

export const metadata: Metadata = {
  title: "중만컵 투표 결과",
  description:
    "중만컵 인기투표 최종 결과입니다. 1위 캄몬스타즈부터 11위까지 공식 득표수와 시드권, 연고지 지도를 확인할 수 있습니다.",
  alternates: { canonical: "/jungman" },
  openGraph: {
    title: "중만컵 투표 결과 | 호사가 HOSAGA",
    description: "중만컵 인기투표 최종 결과 — 공식 득표수, 시드권, 연고지 지도",
    url: "/jungman",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

export default async function JungmanPage() {
  const { config, snapshots, latest, standings: live, isLive: inLiveWindow, degraded } = await getJungmanState();
  const seedTeam = JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE);
  // 마감 판정도 서버에서 한 번만 — 클라이언트 시계로 종료 화면이 흔들리면 안 된다
  const closed = isJungmanClosed(config.voteCloseAt);
  // 마감 뒤에는 공지 확정치가 유일한 진실 — 우리 집계는 마감 직전 몇 분을 놓쳤다.
  // 지도까지 같은 순위표를 읽어야 두 화면이 다른 등수를 말하지 않는다.
  const standings = closed ? buildJungmanFinalStandings() : live;
  const markers = buildJungmanMarkers(standings);
  // LIVE 판정은 여기 한 곳에서만 — 카운트다운과 보드 배지가 서로 다른 조건을 쓰면 배지가 어긋난다
  const isLive = inLiveWindow && latest !== null && !closed;
  // 마감 뒤에는 수집기도 스스로 멈춘다 — "자동 집계" 안내가 남아 있으면 거짓말이 된다
  const autoCollect = config.autoCollect && !closed;
  // 마감 뒤 화면은 대시보드를 안 그린다 — 티커·추이는 계산할 이유가 없다
  const headlines = closed ? [] : buildJungmanHeadlines(snapshots, config.voteCloseAt);
  // 로고 파일 존재 확인은 fs — 서버에서 끝내고 보드(클라이언트)에는 경로만 내려준다.
  // 수술대 포함 전체 팀 — 결과 화면 시드 카드가 수술대 로고도 그린다(대시보드는 남는 키를 안 읽는다).
  const logos = Object.fromEntries(
    JUNGMAN_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );
  // 구간 버킷(1시간·6시간·전체)은 서버에서 끝낸다 — 클라이언트는 전환만 한다
  const series = closed ? [] : buildJungmanSeries(snapshots);
  // 자동 갱신은 autoCollect 하나에 매달면 안 된다 — 읽기가 실패한 순간 config가 기본값(false)이 되어
  // 스스로 회복할 유일한 수단까지 같이 사라진다. 회복이 필요한 상황이면 무조건 띄운다.
  const autoRefresh = config.autoCollect || snapshots.length > 0 || degraded;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-3 md:px-5 md:py-5">
        {/* 개표 전/후 두 갈래가 헤더를 각각 갖고 있다 — 탭은 갈래 위 한 곳에만 둔다 */}
        <JungmanSubNav activeHref="/jungman" />

        {/* 마감 뒤에는 받아올 새 데이터가 없다 — 자동 갱신을 멈춘다 */}
        {closed ? null : autoRefresh ? <JungmanAutoRefresh /> : null}

        {/* 마감 뒤에는 공지로 확정된 결과 한 장으로 굳는다. voteCloseAt이 미래로 바뀌면 아래 갈래로 돌아온다. */}
        {closed ? (
          <JungmanResults
            standings={standings}
            logos={logos}
            map={
              <div id="jm-map" className="[container-type:inline-size]">
                <JungmanMap markers={markers} closed={closed} />
              </div>
            }
          />
        ) : latest ? (
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
            autoCollect={autoCollect}
            closed={closed}
            // #jm-map은 선택·hover ↔ 마커 강조 연동의 앵커 — 대시보드가 data-active/data-reveal을 세팅한다.
            // container-type은 지도 라벨 확대 기준 — SVG가 실제로 받은 폭을 JungmanMap의 @container가 읽는다
            map={
              <div id="jm-map" className="[container-type:inline-size]">
                <JungmanMap markers={markers} closed={closed} />
              </div>
            }
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <section className={`${PANEL} px-4 py-4 md:p-6`}>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a] md:text-[0.6875rem]">
                중만컵 · 인기투표 개표 현황
              </p>
              {/* 읽기 실패를 "아직 개표 전"으로 보여주면 집계가 사라진 것처럼 읽힌다 — 상태를 그대로 말한다 */}
              <h1 className="mt-2 text-xl font-black tracking-tight md:text-3xl">
                {degraded ? "집계 데이터를 불러오지 못했습니다" : "첫 개표 발표를 기다리고 있습니다"}
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-[#7a8299] md:mt-3 md:text-sm">
                {degraded ? (
                  "곧 다시 시도합니다. 투표 기록은 그대로 있으며, 연결이 회복되면 이 화면이 자동으로 갱신됩니다."
                ) : (
                  <>
                    12개 대학 중 투표 대상은 <b className="font-bold text-[#e8ebf2]">11팀</b>, 수술대는 4시드를 확보해
                    투표에서 빠집니다. 12팀 전원 본선 진출(4개조) · 상위 3팀이 시드를 가져갑니다.
                  </>
                )}
              </p>
              {/* degraded면 config가 기본값이라 마감 시각·다음 개표를 믿을 수 없다 — 카운트다운을 숨긴다 */}
              {degraded ? null : (
                <div className="mt-5">
                  <JungmanCountdown
                    voteCloseAt={config.voteCloseAt}
                    nextRevealAt={config.nextRevealAt}
                    isLive={isLive}
                    latestAt={null}
                    autoCollect={autoCollect}
                  />
                </div>
              )}
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

            <section id="jm-map" className={`${PANEL} p-3 [container-type:inline-size]`}>
              <JungmanMap markers={markers} />
            </section>
          </div>
        )}

        <p className="mt-4 px-1 text-[0.6875rem] text-[#7a8299]">지도 경계 데이터: 통계청</p>
      </main>
    </div>
  );
}
