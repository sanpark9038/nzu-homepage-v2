import type { Metadata } from "next";

import JungmanMap from "@/components/jungman/JungmanMap";
import { buildJungmanFinalStandings, buildJungmanMarkers, JUNGMAN_TEAMS } from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";
import {
  buildJungmanGroupTables,
  JUNGMAN_STANDINGS_KEY,
  parseJungmanStandings,
} from "@/lib/jungman-standings";
import { getSetting } from "@/lib/site-settings";

import JungmanGroupTables from "./JungmanGroupTables";
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

const FINAL_DATE = "2026-09-19";

/** 그랜드 파이널까지 남은 날. 서버 시각이 UTC라도 한국 날짜를 기준으로 센다. */
function daysToFinal() {
  const todayKST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return Math.round((Date.parse(FINAL_DATE) - Date.parse(todayKST)) / 86_400_000);
}

export default async function JungmanPage() {
  // 읽기 실패는 getSetting이 던진다 — 빈 순위표를 정상 상태로 캐시하는 것보다 낫다
  const standings = parseJungmanStandings(await getSetting(JUNGMAN_STANDINGS_KEY));
  const tables = standings ? buildJungmanGroupTables(standings) : [];

  // 투표는 끝났다 — 득표는 공지 확정치(코드 상수)에서만 나오고, 지도도 같은 순위표를 읽는다
  const voteStandings = buildJungmanFinalStandings();
  const markers = buildJungmanMarkers(voteStandings);
  // 로고 파일 존재 확인은 fs — 서버에서 끝내고 경로만 내려준다.
  // 수술대 포함 전체 팀 — 결과의 시드 카드가 수술대 로고도 그린다.
  const logos = Object.fromEntries(
    JUNGMAN_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])
  );
  const dday = daysToFinal();

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-3 md:px-5 md:py-5">
        <section className={`${PANEL} mb-3 px-4 py-3 md:mb-4 md:px-5 md:py-4`}>
          <p className="hidden text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a] md:block">
            K-중만컵 · 조별리그
          </p>
          <h1 className="text-xl font-black tracking-tight md:mt-2 md:text-3xl">조별 순위</h1>
          <p className="mt-1.5 hidden text-sm text-[#7a8299] md:block">
            매치 승패 → 세트 득실 → 세트 승 → 동률팀 간 승자승 순으로 정렬합니다.
            <b className="font-bold text-[#e8ebf2]"> 점선 위가 8강 진출권</b>이고, 잔여는 남은 경기 수입니다.
          </p>
        </section>

        <JungmanGroupTables tables={tables} />

        <section className={`${PANEL} mt-3 px-4 py-4 md:mt-4 md:px-5 md:py-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black tracking-tight md:text-xl">대회 정보</h2>
            {/* 결승이 지나면 뱃지는 의미가 없다 — 그냥 안 그린다 */}
            {dday >= 0 ? (
              <span className="rounded bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black tabular-nums text-[#d4a94a]">
                {dday > 0 ? `D-${dday}` : "D-DAY"}
              </span>
            ) : null}
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
              <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">총상금</dt>
              <dd className="mt-2 font-bold text-[#e8ebf2]">
                3,500만원
                <span className="mt-1 block text-xs font-normal leading-relaxed text-[#7a8299]">
                  우승 3,000만원 + 챔피언 벨트 · 준우승 500만원
                </span>
              </dd>
            </div>
            <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
              <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">
                그랜드 파이널
              </dt>
              <dd className="mt-2 font-bold text-[#e8ebf2]">
                9/19(토) 상암 콜로세움
                <span className="mt-1 block text-xs font-normal leading-relaxed text-[#7a8299]">
                  월 · 화 · 수는 ASL 일정으로 미진행
                </span>
              </dd>
            </div>
            <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
              <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">진행 방식</dt>
              <dd className="mt-2 text-xs leading-relaxed text-[#7a8299]">
                4개조 × 3팀 = <b className="font-bold text-[#e8ebf2]">12팀</b> · 조 2위까지 8강.
                8강은 조 1위 ↔ 2위가 붙도록 추첨한 뒤 싱글 토너먼트로 치릅니다.
                <b className="font-bold text-[#e8ebf2]"> 전 경기 9전 5선승제</b>입니다.
              </dd>
            </div>
            <div className="rounded-2xl border border-[rgba(155,185,240,0.14)] bg-[rgba(10,15,28,0.6)] px-5 py-4">
              <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a]">순위 기준</dt>
              <dd className="mt-2 text-xs leading-relaxed text-[#7a8299]">
                매치 승패 → 세트 득실 → 세트 승리 수 → 동률팀 간 승자승
              </dd>
            </div>
          </dl>
        </section>

        {/* container-type은 지도 라벨 확대 기준 — SVG가 실제로 받은 폭을 JungmanMap의 @container가 읽는다 */}
        <section id="jm-map" className={`${PANEL} mt-3 p-3 md:mt-4 [container-type:inline-size]`}>
          <JungmanMap markers={markers} closed />
        </section>

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
          </div>
        </details>

        <p className="mt-4 px-1 text-[0.6875rem] text-[#7a8299]">지도 경계 데이터: 통계청</p>
      </main>
    </div>
  );
}
