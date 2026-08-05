import {
  JUNGMAN_MAP_BASE,
  JUNGMAN_MAP_DEFS,
  JUNGMAN_MAP_HEIGHT,
  JUNGMAN_MAP_WIDTH,
} from "@/components/jungman/map-base";
// 대회 정보와 D-day 계산은 lib/jungman.ts 한 곳에 산다 — 홈 커버 덱이 같은 값을 그린다
import {
  JUNGMAN_FINAL_NOTE,
  JUNGMAN_FINAL_PLACE,
  JUNGMAN_FORMAT_LINE,
  JUNGMAN_PRIZE_DETAIL,
  JUNGMAN_PRIZE_TOTAL,
  jungmanDaysToFinal as daysToFinal,
} from "@/lib/jungman";

// 지형 레이어에 필요한 최소 규칙만. 투표 지도 컴포넌트의 <style>은 문서 전역이라 얻어걸리지만,
// 그쪽이 접힘 안으로 옮겨간 뒤라 의존하면 조용히 깨진다 — 배경은 자기 몫만 들고 있는다.
const COVER_MAP_STYLE = `
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
 * /jungman 커버. 대회 정보를 지도 위에 얹어 한 화면으로 접는다.
 * 높이를 일부러 낮게 잡는다 — 이 페이지의 주인공은 바로 아래 조별 순위표다.
 */
export default function JungmanCover() {
  const dday = daysToFinal();

  return (
    <section className="relative mb-3 overflow-hidden rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)] md:mb-4">
      {/* 지형만 깔린 장식 지도. 모바일에서는 더 밖으로 빼 글자 자리를 남긴다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-[-30%] w-[120%] opacity-[0.38] sm:right-[-12%] sm:w-[76%] md:right-[-2%] md:w-[58%]"
      >
        <svg
          viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
        >
          <style>{COVER_MAP_STYLE}</style>
          {/* defs id가 아래 투표 지도와 겹치지만 정의가 같아 어느 쪽이 이겨도 결과가 같다 */}
          <defs dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_DEFS }} />
          <g clipPath="url(#jm-frame)" dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_BASE }} />
        </svg>
      </div>

      {/* 스크림 — blur는 지도 선을 뭉개서 금지. 어두운 그라디언트로만 글자를 띄운다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0b0f1a_0%,rgba(11,15,26,0.93)_42%,rgba(11,15,26,0.30)_100%)]"
      />

      <div className="relative flex min-h-[168px] flex-col justify-center px-4 py-4 md:min-h-[236px] md:px-6 md:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">K-중만컵</h1>
          {/* 결승이 지나면 뱃지는 의미가 없다 — 그냥 안 그린다 */}
          {dday >= 0 ? (
            <span className="rounded bg-[#d4a94a]/15 px-2 py-0.5 text-[0.6875rem] font-black tabular-nums text-[#d4a94a]">
              {dday > 0 ? `D-${dday}` : "D-DAY"}
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 text-xs font-bold text-[#d4a94a] md:mt-2 md:text-sm">{JUNGMAN_FORMAT_LINE}</p>

        <dl className="mt-3 grid gap-2 text-sm md:mt-5 md:max-w-[34rem] md:grid-cols-2 md:gap-4">
          <div>
            <dt className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#7a8299]">총상금</dt>
            <dd className="mt-0.5 font-bold text-[#e8ebf2]">
              {JUNGMAN_PRIZE_TOTAL}
              <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
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
              <span className="mt-0.5 block text-xs font-normal leading-relaxed text-[#7a8299]">
                {JUNGMAN_FINAL_NOTE}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
