import Link from "next/link";

import {
  JUNGMAN_MAP_BASE,
  JUNGMAN_MAP_DEFS,
  JUNGMAN_MAP_HEIGHT,
  JUNGMAN_MAP_WIDTH,
} from "@/components/jungman/map-base";
import {
  JUNGMAN_FINAL_NOTE,
  JUNGMAN_FINAL_PLACE,
  JUNGMAN_FORMAT_LINE,
  JUNGMAN_PRIZE_DETAIL,
  JUNGMAN_PRIZE_TOTAL,
  jungmanDaysToFinal,
} from "@/lib/jungman";

// 지형 레이어 최소 규칙. JungmanCover와 같은 값이지만 그쪽 <style>은 /jungman 문서에만 있다 —
// 배경은 자기 몫을 들고 있어야 다른 페이지에 실려도 안 깨진다.
const DECK_MAP_STYLE = `
  .jm-land{fill:#18223a;stroke:rgba(155,185,240,.22);stroke-width:.7;stroke-linejoin:round;}
  .jm-land.jm-b{fill:#1e2a45;}
  .jm-river-glow{fill:none;stroke:rgba(140,180,240,.34);stroke-width:18.5;stroke-linecap:round;}
  .jm-river{fill:none;stroke:#0c1730;stroke-width:14;stroke-linecap:round;}
  .jm-glyph path{fill:none;stroke:rgba(195,212,245,.30);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}
  .jm-grid{stroke:rgba(150,175,220,.07);stroke-width:1;}
  .jm-tick{fill:none;stroke:rgba(212,169,74,.34);stroke-width:1.6;}
  .jm-region{fill:#7a8299;opacity:.42;font-size:15px;letter-spacing:.16em;text-anchor:middle;}
`;

/**
 * 홈 히어로의 세 번째 선택지 — 관리자가 "커버 덱"을 고르면 이미지·영상 대신 이 화면이 h-[100svh] 칸을 채운다.
 * 문구는 관리자 값(titleLines)을 그대로 쓰고, 대회 정보는 lib/jungman.ts 상수 하나에서만 온다.
 */
export default function HomeHeroDeck({ titleLines }: { titleLines: string[] }) {
  const dday = jungmanDaysToFinal();

  return (
    <>
      <div aria-hidden className="absolute inset-0 bg-[#060a08]" />

      {/* 지형만 깔린 장식 지도 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.36]">
        <svg
          viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
        >
          <style>{DECK_MAP_STYLE}</style>
          {/* defs id(jm-sea·jm-frame)는 문서 전역이다. 홈에는 다른 지도가 없어 지금은 안전하지만,
              언젠가 홈에 JungmanMap을 얹으면 같은 id가 두 벌 생긴다(정의가 같아 결과는 같다). */}
          <defs dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_DEFS }} />
          <g clipPath="url(#jm-frame)" dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_BASE }} />
        </svg>
      </div>

      {/* 스크림 — blur는 지도 선을 뭉개서 금지. 어두운 그라디언트로만 글자를 띄운다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,8,0.72)_0%,rgba(6,10,8,0.42)_34%,rgba(6,10,8,0.88)_100%)]"
      />

      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col justify-between gap-6 px-4 pb-8 pt-14 md:px-8 md:pb-12 md:pt-20 lg:px-6 xl:px-0">
        <h1 className="text-[2.35rem] font-black leading-[0.92] tracking-[-0.07em] text-white drop-shadow-[0_18px_44px_rgba(0,0,0,0.34)] md:text-[4.4rem] lg:text-[5.4rem]">
          {titleLines.map((line, index) => (
            <span key={`${index}-${line}`} className="block overflow-hidden">
              <span
                className="block [animation:heroTitleLift_720ms_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{ willChange: "transform, opacity", animationDelay: `${1000 + index * 320}ms` }}
              >
                {line}
              </span>
            </span>
          ))}
        </h1>

        <div className="flex flex-col gap-4">
          {/* 카드는 불투명하게 — 반투명이면 지도 선이 글자를 뚫는다 */}
          <div className="rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[#101728] px-4 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] md:px-6 md:py-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-black tracking-tight text-white md:text-2xl">K-중만컵</p>
              {/* 결승이 지나면 뱃지는 의미가 없다 — 그냥 안 그린다 */}
              {dday >= 0 ? (
                <span className="rounded bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black tabular-nums text-[#d4a94a]">
                  {dday > 0 ? `D-${dday}` : "D-DAY"}
                </span>
              ) : null}
            </div>

            <p className="mt-1.5 text-xs font-bold text-[#d4a94a] md:text-sm">{JUNGMAN_FORMAT_LINE}</p>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 md:mt-4 md:gap-4">
              <div>
                <dt className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]">총상금</dt>
                <dd className="mt-0.5 font-bold text-[#e8ebf2]">
                  {JUNGMAN_PRIZE_TOTAL}
                  {/* 좁은 화면에서는 부연을 접는다 — 100svh 안에서 스크롤이 생기면 실패다 */}
                  <span className="mt-0.5 hidden text-xs font-normal leading-relaxed text-[#7a8299] sm:block">
                    {JUNGMAN_PRIZE_DETAIL}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]">
                  그랜드 파이널
                </dt>
                <dd className="mt-0.5 font-bold text-[#e8ebf2]">
                  {JUNGMAN_FINAL_PLACE}
                  <span className="mt-0.5 hidden text-xs font-normal leading-relaxed text-[#7a8299] sm:block">
                    {JUNGMAN_FINAL_NOTE}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link
              href="/jungman"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-nzu-green px-6 text-sm font-black tracking-tight text-black transition-transform duration-200 hover:-translate-y-0.5"
            >
              K-중만컵 순위
            </Link>
            <Link
              href="/prediction"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/40 px-6 text-sm font-black tracking-tight text-white transition-colors duration-200 hover:border-white/28 hover:bg-black/60"
            >
              승부예측
            </Link>
            <Link
              href="/schedule"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/40 px-6 text-sm font-black tracking-tight text-white transition-colors duration-200 hover:border-white/28 hover:bg-black/60"
            >
              일정
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
