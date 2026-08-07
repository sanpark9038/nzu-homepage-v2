import type { Metadata } from "next";

import JungmanCalendar from "@/app/jungman/JungmanCalendar";
import { RaceLetterBadge } from "@/components/ui/race-letter-badge";
import {
  ASL_DRAW_DATE,
  ASL_FINAL_DATE,
  ASL_GROUPS,
  ASL_MAPS,
  ASL_MATCH_TIME,
  ASL_OPENING_DATE,
  ASL_PRIZE_DETAIL,
  ASL_PRIZE_MAIN,
  ASL_ROUND_NOTE,
  ASL_ROUNDS,
  ASL_SEASON,
  ASL_SEEDS,
  ASL_VENUE_NOTE,
  aslDaysToOpening,
  aslNextBroadcast,
  formatAslDate,
  type AslPlayer,
} from "@/lib/asl";
import { JUNGMAN_STANDINGS_KEY, parseJungmanStandings } from "@/lib/jungman-standings";
import { getSetting } from "@/lib/site-settings";

// 달력이 K-중만컵 일정(KV)을 곁들인다 — 더 이상 완전 정적이 아니다
export const revalidate = 60;

export const metadata: Metadata = {
  title: "ASL 시즌22",
  description:
    "ASL 시즌22 소개. 24강 조 편성 · 16강 시드 · 조지명식 · 라운드 진행 방식 · 사용 맵을 한 화면에서 확인할 수 있습니다.",
  alternates: { canonical: "/asl" },
  openGraph: {
    title: "ASL 시즌22 | 호사가 HOSAGA",
    description: "ASL 시즌22 — 24강 조 편성, 16강 시드, 진행 방식, 사용 맵",
    url: "/asl",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";
const LABEL = "text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]";

/** 이름 + 종족 배지 한 줄. 배지는 사이트 공용 컴포넌트를 그대로 쓴다 */
function PlayerLine({ player }: { player: AslPlayer }) {
  return (
    <li className="flex items-center gap-2">
      <RaceLetterBadge race={player.race} size="sm" />
      <span className="truncate text-sm font-bold text-[#e8ebf2]">{player.name}</span>
    </li>
  );
}

export default async function AslPage() {
  const dday = aslDaysToOpening();
  const next = aslNextBroadcast();
  // 달력의 회색 줄일 뿐이다 — KV를 못 읽는다고 ASL 소개 페이지가 죽으면 안 된다
  const standings = parseJungmanStandings(
    await getSetting(JUNGMAN_STANDINGS_KEY).catch(() => null)
  );

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1200px] px-3 py-3 md:px-5 md:py-5">
        {/* ── 커버 ── */}
        <section className={`${PANEL} mb-3 md:mb-4`}>
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight md:text-4xl">{ASL_SEASON}</h1>
                {/* 개막이 지나면 뱃지는 의미가 없다 — 그냥 안 그린다 */}
                {dday >= 0 ? (
                  <span className="rounded bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black tabular-nums text-[#d4a94a]">
                    {dday > 0 ? `D-${dday}` : "D-DAY"}
                  </span>
                ) : null}
              </div>

              <p className="mt-1.5 text-xs font-bold text-[#d4a94a] md:mt-2 md:text-sm">
                {formatAslDate(ASL_OPENING_DATE)} 개막 · {formatAslDate(ASL_FINAL_DATE)} 결승 · 저녁 7시
                생방송
              </p>
              <p className="mt-1 text-[0.6875rem] text-[#7a8299] md:text-xs">{ASL_VENUE_NOTE}</p>
            </div>

            <dl className="grid gap-2 text-sm md:grid-cols-2 md:gap-4">
              <div>
                <dt className={LABEL}>총상금</dt>
                <dd className="mt-0.5 font-bold text-[#e8ebf2]">
                  {ASL_PRIZE_MAIN}
                  <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
                    {ASL_PRIZE_DETAIL}
                  </span>
                </dd>
              </div>
              <div>
                <dt className={LABEL}>다음 방송</dt>
                <dd className="mt-0.5 font-bold text-[#e8ebf2]">
                  {next ? (
                    <>
                      {formatAslDate(next.date)} {ASL_MATCH_TIME}
                      <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
                        {next.label}
                      </span>
                    </>
                  ) : (
                    <span className="font-normal text-[#7a8299]">조지명식 이후 일정 미공개</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ── 일정 ── 넓은 화면만. 폰에서는 커버의 "다음 방송"이 그 역할을 한다 */}
        <div className="hidden md:block">
          <JungmanCalendar matches={standings?.matches ?? []} variant="asl" />
        </div>

        {/* ── 24강 조 편성 ── */}
        <p className="mb-2 mt-3 px-1 text-xs font-bold text-[#e8ebf2] md:mb-2.5 md:mt-4">
          24강 조 편성
          <span className="ml-2 hidden font-normal text-[#7a8299] md:inline">
            4인 1조 × 6개조 · 조별 2명이 16강에 오른다
          </span>
        </p>

        <div className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
          {ASL_GROUPS.map((group) => (
            <section key={group.name} className={`${PANEL} px-4 py-3 md:px-5 md:py-4`}>
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-base font-black text-[#e8ebf2] md:text-lg">{group.name}</span>
                <span className="text-[0.6875rem] font-bold tabular-nums text-[#7a8299] md:text-xs">
                  {formatAslDate(group.date)} {ASL_MATCH_TIME}
                </span>
              </p>
              <ul className="mt-2 grid gap-1.5 md:mt-3">
                {group.players.map((player) => (
                  <PlayerLine key={player.name} player={player} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* ── 16강 시드 · 조지명식 ── */}
        <div className="mt-2 grid gap-2 md:mt-3 md:grid-cols-2 md:gap-3">
          <section className={`${PANEL} px-4 py-3 md:px-5 md:py-4`}>
            <p className="flex items-baseline justify-between gap-2">
              <span className={LABEL}>16강 시드 — 전 대회 4강</span>
              <span className="text-[0.6875rem] font-bold text-[#d4a94a] md:text-xs">16강 직행</span>
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 md:mt-3">
              {ASL_SEEDS.map((player) => (
                <PlayerLine key={player.name} player={player} />
              ))}
            </ul>
          </section>

          <section className={`${PANEL} px-4 py-3 md:px-5 md:py-4`}>
            <p className={LABEL}>조지명식</p>
            <p className="mt-2 text-base font-black text-[#e8ebf2] md:mt-3 md:text-lg">
              {formatAslDate(ASL_DRAW_DATE)} {ASL_MATCH_TIME}
              <span className="ml-2 align-middle text-[0.6875rem] font-black text-[#d4a94a]">LIVE</span>
            </p>
            <p className="mt-1 text-[0.6875rem] text-[#7a8299] md:text-xs">
              24강을 통과한 12명과 시드 4명이 16강 조를 짠다
            </p>
          </section>
        </div>

        {/* ── 진행 방식 ── */}
        <p className="mb-2 mt-3 px-1 text-xs font-bold text-[#e8ebf2] md:mb-2.5 md:mt-4">진행 방식</p>
        <section className={`${PANEL} px-4 py-3 md:px-5 md:py-4`}>
          <dl className="grid gap-1.5 md:gap-2">
            {ASL_ROUNDS.map((round) => (
              <div
                key={round.round}
                className="grid grid-cols-[3rem_1fr] items-baseline gap-2 md:grid-cols-[4rem_1fr]"
              >
                <dt className="text-sm font-black text-[#d4a94a]">{round.round}</dt>
                <dd className="text-[0.8125rem] font-bold leading-relaxed text-[#e8ebf2] md:text-sm">
                  {round.format}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[0.6875rem] text-[#7a8299] md:mt-3 md:text-xs">{ASL_ROUND_NOTE}</p>
        </section>

        {/* ── 맵 ── */}
        <p className="mb-2 mt-3 px-1 text-xs font-bold text-[#e8ebf2] md:mb-2.5 md:mt-4">맵</p>
        <section className={`${PANEL} px-4 py-3 md:px-5 md:py-4`}>
          <ul className="flex flex-wrap gap-1.5 md:gap-2">
            {ASL_MAPS.map((map) => (
              <li
                key={map.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(155,185,240,0.14)] bg-[rgba(11,15,26,0.55)] px-3 py-1.5 text-[0.8125rem] font-bold text-[#e8ebf2]"
              >
                {map.name}
                {map.fresh ? (
                  <span className="rounded bg-[#d4a94a]/15 px-1 py-px text-[0.625rem] font-black text-[#d4a94a]">
                    신규
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
