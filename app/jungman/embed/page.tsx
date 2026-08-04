import type { Metadata } from "next";

import {
  buildJungmanHourDeltas,
  getJungmanState,
  isJungmanClosed,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTING_TEAMS,
} from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";
import { SITE_URL } from "@/lib/site-url";

import { JungmanAutoRefresh, JungmanCountdown, JungmanStandingsList, JungmanStatus } from "../JungmanClient";
import { JungmanEmbedHeight } from "./EmbedHeight";

// 원본(/jungman)과 같은 KV를 읽는다 — 재생성 주기가 갈라지면 같은 순간에 다른 순위를 보여준다
export const revalidate = 60;

export const metadata: Metadata = {
  title: "K-중만컵 투표 현황 (임베드)",
  description: "외부 사이트 iframe 삽입용 K-중만컵 인기투표 실시간 순위 화면.",
  // 내용이 /jungman과 같다 — 색인은 원본 하나로 몰아준다
  robots: { index: false, follow: false },
};

const EMBED_ROOT_ID = "jm-embed";

export default async function JungmanEmbedPage() {
  const { config, snapshots, latest, standings, isLive: inLiveWindow, degraded } = await getJungmanState();
  // 판정은 전부 서버에서 한 번 — 원본과 같은 규칙을 그대로 쓴다
  const closed = isJungmanClosed(config.voteCloseAt);
  const isLive = inLiveWindow && latest !== null && !closed;
  const autoCollect = config.autoCollect && !closed;
  const autoRefresh = config.autoCollect || snapshots.length > 0 || degraded;
  const seedTeam = JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE);
  const logos = Object.fromEntries(
    JUNGMAN_VOTING_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );

  return (
    // 배경은 사이트 팔레트 그대로 — 투명하게 두면 흰 배경 사이트에서 흰 글씨가 사라진다
    <div id={EMBED_ROOT_ID} className="bg-[#0b0f1a] px-3 py-3 text-[#e8ebf2]">
      {/* 마감 뒤에는 받아올 새 데이터가 없다 — 자동 갱신을 멈춘다 */}
      {closed ? null : autoRefresh ? <JungmanAutoRefresh /> : null}

      {/* 열 폭 상한은 원본 좌측 레일과 같은 이유 — 더 넓히면 한 행에서 팀명과 득표수가 갈라진다 */}
      <div className="mx-auto w-full max-w-[27rem]">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="shrink-0">
            <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[#d4a94a]">K-중만컵 인기투표</p>
            <h1 className="text-base font-black tracking-tight">투표 현황</h1>
          </div>
          {latest ? (
            <JungmanStatus closed={closed} isLive={isLive} revealedAt={latest.at} autoCollect={autoCollect} />
          ) : null}
          {/* degraded면 config가 기본값이라 마감 시각을 믿을 수 없다 — 카운트다운을 숨긴다 */}
          {degraded ? null : (
            <JungmanCountdown
              voteCloseAt={config.voteCloseAt}
              nextRevealAt={config.nextRevealAt}
              isLive={isLive}
              latestAt={latest?.at ?? null}
              autoCollect={autoCollect}
            />
          )}
        </header>

        {latest ? (
          <div className="mt-3">
            <JungmanStandingsList
              standings={standings}
              logos={logos}
              hourDeltas={buildJungmanHourDeltas(snapshots)}
              closed={closed}
              seedTeamName={seedTeam?.name ?? null}
            />
          </div>
        ) : (
          // 읽기 실패를 "아직 개표 전"으로 보여주면 집계가 사라진 것처럼 읽힌다 — 상태를 그대로 말한다
          <p className="mt-4 text-xs font-bold leading-relaxed text-[#7a8299]">
            {degraded
              ? "집계 데이터를 불러오지 못했습니다. 연결이 회복되면 자동으로 갱신됩니다."
              : "첫 개표 발표를 기다리고 있습니다."}
          </p>
        )}

        {/* 마감 순간 공지가 비공개로 바뀌면 마지막 몇 분의 추천이 우리 집계에 안 잡힌다 */}
        {closed ? (
          <p className="mt-3 flex items-center gap-2 text-[0.6875rem] font-bold text-[#7a8299]">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4a94a]" />
            집계 값은 참고용입니다. 최종 결과는 정중만님 공지를 확인해 주세요.
          </p>
        ) : null}

        {/* 임베드가 원본으로 유입되는 통로 — 지도·차트·상세는 여기에 다 있다 */}
        <a
          href={`${SITE_URL}/jungman`}
          target="_blank"
          rel="noopener"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-3 py-2 text-[0.6875rem] font-bold text-[#9fb6e0] transition-colors hover:border-[#d4a94a]/45 hover:text-[#d4a94a]"
        >
          실시간 현황 · star-hosaga.com
          <span aria-hidden>↗</span>
        </a>
      </div>

      <JungmanEmbedHeight targetId={EMBED_ROOT_ID} />
    </div>
  );
}
