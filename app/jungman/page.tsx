import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import { buildJungmanFinalStandings, buildJungmanMarkers, JUNGMAN_TEAMS } from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";
import {
  buildJungmanGroupTables,
  JUNGMAN_STANDINGS_KEY,
  parseJungmanStandings,
  sortJungmanMatches,
} from "@/lib/jungman-standings";
import { playerService } from "@/lib/player-service";
import { getSetting } from "@/lib/site-settings";

import JungmanCover from "./JungmanCover";
import JungmanGroupTables from "./JungmanGroupTables";
import JungmanMatchResults from "./JungmanMatchResults";
import JungmanResults from "./JungmanResults";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "K-중만컵 조별 순위",
  description:
    "K-중만컵 조별리그 순위표. 4개조 12팀의 승패 · 세트 득실 · 잔여 경기를 조별로 확인할 수 있습니다.",
  alternates: { canonical: "/jungman" },
  openGraph: {
    title: "K-중만컵 조별 순위 | 호사가 HOSAGA",
    description: "K-중만컵 조별리그 순위 — 승패, 세트 득실, 잔여 경기",
    url: "/jungman",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

export default async function JungmanPage() {
  // 읽기 실패는 getSetting이 던진다 — 빈 순위표를 정상 상태로 캐시하는 것보다 낫다
  const [standingsRaw, players] = await Promise.all([
    getSetting(JUNGMAN_STANDINGS_KEY),
    // 선수 DB를 못 읽어도 경기 결과는 이름만으로 그려져야 한다 — 페이지 전체를 죽이지 않는다
    playerService.getCachedPlayersList().catch(() => []),
  ]);
  const standings = parseJungmanStandings(standingsRaw);
  const tables = standings ? buildJungmanGroupTables(standings) : [];
  const matches = sortJungmanMatches(standings?.matches ?? []);

  // 투표는 끝났다 — 득표는 공지 확정치(코드 상수)에서만 나오고, 지도도 같은 순위표를 읽는다
  const voteStandings = buildJungmanFinalStandings();
  const markers = buildJungmanMarkers(voteStandings);
  // 로고 파일 존재 확인은 fs — 서버에서 끝내고 경로만 내려준다.
  // 수술대 포함 전체 팀 — 결과의 시드 카드가 수술대 로고도 그린다.
  const logos = Object.fromEntries(
    JUNGMAN_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-3 md:px-5 md:py-5">
        <JungmanCover />

        {/* 순위표를 설명하는 한 줄 — 패널을 씌우면 표가 또 아래로 밀린다 */}
        <p className="mb-2 px-1 text-xs font-bold text-[#e8ebf2] md:mb-2.5">
          조별 순위
          <span className="ml-2 hidden font-normal text-[#7a8299] md:inline">
            점선 위가 8강 진출권 · 매치 승패 → 세트 득실 → 세트 승 → 동률팀 간 승자승
          </span>
        </p>

        <JungmanGroupTables tables={tables} />

        {/* 경기가 없으면 섹션 자체를 그리지 않는다 — 조 편성만 있는 화면이 깨끗해야 한다 */}
        {matches.length ? <JungmanMatchResults matches={matches} players={players} /> : null}

        {/* 끝난 사건이라 접어둔다 — 기본 마커는 브라우저마다 달라서 직접 그린 화살표를 쓴다 */}
        <details className={`${PANEL} group mt-3 md:mt-4`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-black transition hover:text-[#d4a94a] md:px-5 md:py-4 md:text-base [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="text-[0.625rem] text-[#7a8299] transition-transform group-open:rotate-90"
            >
              ▶
            </span>
            인기투표 최종 결과
          </summary>
          <div className="px-3 pb-3 md:px-4 md:pb-4">
            <JungmanResults standings={voteStandings} logos={logos} />
            {/* 이 지도는 투표 순위(1위·2위) 칩을 그린다 — 제 자리는 투표 결과 옆이다.
                container-type은 지도 라벨 확대 기준 — SVG가 실제로 받은 폭을 JungmanMap의 @container가 읽는다 */}
            <div id="jm-map" className="mt-3 [container-type:inline-size]">
              <JungmanMap markers={markers} closed />
            </div>
          </div>
        </details>

        <p className="mt-4 px-1 text-[0.6875rem] text-[#7a8299]">지도 경계 데이터: 통계청</p>
      </main>
    </div>
  );
}
