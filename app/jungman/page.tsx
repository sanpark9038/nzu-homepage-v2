import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import { buildJungmanFinalStandings, buildJungmanMarkers, JUNGMAN_TEAMS } from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";
import {
  buildJungmanGroupTables,
  buildJungmanPlayerRanks,
  buildJungmanScenarios,
  JUNGMAN_STANDINGS_KEY,
  type JungmanScenario,
  parseJungmanStandings,
  sortJungmanMatches,
  upcomingJungmanMatches,
} from "@/lib/jungman-standings";
import { playerService } from "@/lib/player-service";
import { getSetting } from "@/lib/site-settings";
import { parseTierFreeze, TIER_FREEZE_KEY } from "@/lib/tier-freeze";

import JungmanCalendar from "./JungmanCalendar";
import JungmanCover from "./JungmanCover";
import JungmanGroupTables from "./JungmanGroupTables";
import JungmanMatchResults from "./JungmanMatchResults";
import JungmanPlayerRanks from "./JungmanPlayerRanks";
import JungmanResults from "./JungmanResults";
import JungmanSchedule from "./JungmanSchedule";

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
  const [standingsRaw, players, freeze] = await Promise.all([
    getSetting(JUNGMAN_STANDINGS_KEY),
    // 선수 DB를 못 읽어도 경기 결과는 이름만으로 그려져야 한다 — 페이지 전체를 죽이지 않는다
    playerService.getCachedPlayersList().catch(() => []),
    // 대회 기간에는 동결 티어가 공식이다. 동결 KV 하나 때문에 순위 페이지가 죽으면 안 되니
    // 읽기 실패는 catch로 삼키고 미동결(배지 없음)로 떨어진다.
    getSetting(TIER_FREEZE_KEY)
      .then(parseTierFreeze)
      .catch((error) => {
        console.error("failed to load tier freeze", error);
        return null;
      }),
  ]);
  const standings = parseJungmanStandings(standingsRaw);
  const tables = standings ? buildJungmanGroupTables(standings) : [];
  // 진출/탈락 확정 여부 — 남은 경기를 전수 조사한 결과다(조당 최대 1,000가지)
  const scenarios = standings
    ? buildJungmanScenarios(standings)
    : new Map<string, JungmanScenario[]>();
  const matches = sortJungmanMatches(standings?.matches ?? []);
  const upcoming = upcomingJungmanMatches(standings?.matches ?? []);
  // 선수 전적은 세트에서 나온다 — 세트를 안 적은 경기만 있으면 빈 배열이다
  const playerRanks = buildJungmanPlayerRanks(standings?.matches ?? []);

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
        <JungmanCover upcoming={upcoming} />

        {/* 순위표를 설명하는 한 줄 — 패널을 씌우면 표가 또 아래로 밀린다 */}
        <p className="mb-2 px-1 text-xs font-bold text-[#e8ebf2] md:mb-2.5">
          조별 순위
          <span className="ml-2 hidden font-normal text-[#7a8299] md:inline">
            점선 위가 8강 진출권 · 매치 승패 → 세트 득실 → 세트 승 → 동률팀 간 승자승
          </span>
        </p>

        {/* 예정 경기까지 넘긴다 — 팀을 누르면 '남은 경기'가 펼쳐져야 한다(sortJungmanMatches는 끝난 것만 남긴다) */}
        <JungmanGroupTables
          tables={tables}
          matches={standings?.matches ?? []}
          scenarios={scenarios}
        />

        {/* 아직 안 치른 경기가 위, 치른 경기가 아래 — 시간 순서가 자연스럽다.
            넓은 화면은 달력(월·화·수가 비는 리듬이 보인다), 폰은 목록.
            분기는 CSS로만 한다 — JS로 폭을 재면 하이드레이션이 흔들린다 */}
        {standings?.matches.length ? (
          <>
            <div className="hidden md:block">
              <JungmanCalendar matches={standings?.matches ?? []} />
            </div>
            <div className="md:hidden">
              <JungmanSchedule matches={upcoming} />
            </div>
          </>
        ) : null}

        {/* 경기가 없으면 섹션 자체를 그리지 않는다 — 조 편성만 있는 화면이 깨끗해야 한다.
            결과가 주인공이라 왼쪽을 넓게, 개인 순위가 곁에 선다. 폰에서는 세로로 쌓인다.
            여백은 이 grid만 준다 — [&>*]:mt-0이 자식이 가진 mt를 눌러 이중 여백을 막는다 */}
        {matches.length ? (
          <div
            className={`mt-3 grid grid-cols-1 gap-3 md:mt-4 md:gap-4 [&>*]:mt-0 ${
              // 개인 순위가 없으면(세트를 안 적은 경기뿐) 결과가 전체 폭을 쓴다 — 빈 열을 남기지 않는다
              playerRanks.length ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""
            }`}
          >
            <JungmanMatchResults matches={matches} players={players} />
            <JungmanPlayerRanks ranks={playerRanks} players={players} freeze={freeze} />
          </div>
        ) : null}

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
