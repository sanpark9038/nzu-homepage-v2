import type { CSSProperties } from "react";

import { JUNGMAN_MAP_BASE, JUNGMAN_MAP_DEFS, JUNGMAN_MAP_HEIGHT, JUNGMAN_MAP_WIDTH } from "./map-base";
import { formatVotes, type JungmanMarker } from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

const CARD = 44;
const HALF = CARD / 2;
/** 로고는 카드 테두리 색이 남을 만큼만 안쪽으로 */
const LOGO = CARD - 5;
const GAP = 5;
const CHIP_H = 32;
const CHIP_Y = HALF + GAP;

// 폰트 메트릭 없이 쓰는 근사 폭 — 칩이 글자를 자르지만 않으면 된다.
// ponytail: 한글 1em·영문 0.66em·숫자 0.55em 근사. 어긋나면 실측 폭 테이블로.
function textWidth(value: string, fontSize: number) {
  return [...value].reduce(
    (sum, char) =>
      sum + (/[가-힣]/.test(char) ? fontSize : /[A-Za-z]/.test(char) ? fontSize * 0.66 : fontSize * 0.55),
    0
  );
}

function subLabel(marker: JungmanMarker) {
  if (marker.seed) return "4시드 확보";
  if (marker.rank === null || marker.votes === null) return "개표 대기";
  return `${marker.rank}위 · ${formatVotes(marker.votes)}표`;
}

// 득표 비례 카드 글로우 — 개표 전(share null)은 균일.
function glowRadius(share: number | null) {
  return share === null ? 12 : Math.round((7 + 15 * share) * 10) / 10;
}

const MAP_STYLE = `
  .jm-land{fill:#18223a;stroke:rgba(155,185,240,.22);stroke-width:.7;stroke-linejoin:round;}
  .jm-land.jm-b{fill:#1e2a45;}
  .jm-river-glow{fill:none;stroke:rgba(140,180,240,.34);stroke-width:18.5;stroke-linecap:round;}
  .jm-river{fill:none;stroke:#0c1730;stroke-width:14;stroke-linecap:round;}
  .jm-glyph path{fill:none;stroke:rgba(195,212,245,.30);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}
  .jm-grid{stroke:rgba(150,175,220,.07);stroke-width:1;}
  .jm-tick{fill:none;stroke:rgba(212,169,74,.34);stroke-width:1.6;}
  .jm-region{fill:#7a8299;opacity:.42;font-size:15px;letter-spacing:.16em;text-anchor:middle;}

  .jm-pin{fill:var(--a);opacity:.85;}
  .jm-lead{stroke:var(--a);stroke-width:1;stroke-opacity:.34;stroke-dasharray:3 3;}
  .jm-m{transition:transform .18s ease;cursor:default;}
  .jm-m:hover{transform:scale(1.07);}
  .jm-m .jm-card{fill:var(--c);stroke:rgba(226,236,255,.30);stroke-width:1.5;
    filter:drop-shadow(0 0 var(--g,12px) var(--a)) drop-shadow(0 4px 10px rgba(0,0,0,.55));}
  .jm-m .jm-logo-slot{fill:rgba(255,255,255,.10);stroke:rgba(255,255,255,.16);stroke-width:1;}
  .jm-m .jm-abbr{fill:#0b0f1a;font-size:13px;font-weight:800;letter-spacing:.03em;
    text-anchor:middle;dominant-baseline:central;}
  .jm-m.jm-dark .jm-abbr{fill:#eef2fa;}
  .jm-m .jm-chip{fill:rgba(10,15,28,.82);stroke:var(--a);stroke-opacity:.5;stroke-width:1;}
  .jm-m .jm-name{fill:#e8ebf2;font-size:13px;font-weight:600;text-anchor:middle;dominant-baseline:central;}
  .jm-m .jm-sub{font-size:11px;text-anchor:middle;dominant-baseline:central;}
  .jm-rank{fill:#d4a94a;font-weight:700;}
  .jm-dot,.jm-votes{fill:#7a8299;}
  .jm-m.jm-top3 .jm-chip{stroke:#d4a94a;stroke-opacity:.95;stroke-width:1.2;}
  .jm-m.jm-risk .jm-chip{stroke:#e0705f;stroke-opacity:.85;stroke-width:1.2;}
  .jm-m.jm-risk .jm-rank{fill:#e0705f;}
  .jm-m.jm-seed .jm-chip{fill:rgba(10,15,28,.9);stroke:#d4a94a;stroke-opacity:1;stroke-width:1.2;}
  .jm-m.jm-seed .jm-name{font-weight:700;}
  .jm-seed-sub{fill:#d4a94a;font-weight:700;letter-spacing:.02em;}

  .jm-spot{fill:url(#jm-spot);opacity:.7;animation:jm-pulse 3.6s ease-in-out infinite;}
  .jm-badge circle{fill:rgba(10,15,28,.92);stroke:rgba(155,185,240,.4);stroke-width:1;}
  .jm-badge text{fill:#9aa3b8;font-size:10.5px;font-weight:800;text-anchor:middle;dominant-baseline:central;}
  .jm-m.jm-top3 .jm-badge circle{fill:#d4a94a;stroke:#0b0f1a;stroke-width:1.5;}
  .jm-m.jm-risk .jm-badge circle{fill:#e0705f;stroke:#0b0f1a;stroke-width:1.5;}
  .jm-m.jm-top3 .jm-badge text,.jm-m.jm-risk .jm-badge text{fill:#0b0f1a;}
  .jm-delta{font-size:9.5px;font-weight:800;text-anchor:start;dominant-baseline:central;
    paint-order:stroke;stroke:rgba(8,12,22,.85);stroke-width:2.4;stroke-linejoin:round;}
  .jm-d-up{fill:#8fd18f;}
  .jm-d-down{fill:#e0705f;}
  .jm-m.jm-contested .jm-card{animation:jm-blink 1.6s ease-in-out infinite;}

  @keyframes jm-pulse{0%,100%{opacity:.5}50%{opacity:.95}}
  @keyframes jm-blink{0%,100%{stroke-opacity:1}50%{stroke-opacity:.25}}
  @keyframes jm-pop{0%{transform:scale(1)}45%{transform:scale(1.18)}100%{transform:scale(1)}}

  /* 보드 행 hover ↔ 지도 마커 강조. 래퍼(#jm-map)의 data-active를 클라이언트가 세팅한다. */
  #jm-map[data-active] .jm-m{opacity:.45;}
  /* fill-mode 없이 — 끝난 뒤 transform이 고정되면 hover·강조 확대가 죽는다 */
  #jm-map[data-reveal] .jm-m.jm-rise{animation:jm-pop .6s ease-out var(--d,0ms);}

  @media (prefers-reduced-motion:reduce){
    .jm-m{transition:none;}
    .jm-m:hover{transform:none;}
    .jm-spot,.jm-m.jm-contested .jm-card,#jm-map[data-reveal] .jm-m.jm-rise{animation:none;}
  }
`;

export default function JungmanMap({ markers }: { markers: JungmanMarker[] }) {
  // 활성 팀 규칙은 속성값끼리 짝지을 수 없어 팀 수만큼 찍는다 (코드는 A-Z0-9뿐).
  const activeRules = markers
    .map(
      (marker) =>
        `#jm-map[data-active="${marker.code}"] .jm-m[data-team="${marker.code}"]{opacity:1;transform:scale(1.14);}`
    )
    .join("\n  ");

  return (
    <svg
      viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
      role="img"
      aria-label="중만컵 참가 13개 팀의 수도권 서부 연고지와 득표 현황 지도"
      className="block h-auto w-full rounded-lg"
    >
      <style>{`${MAP_STYLE}  ${activeRules}`}</style>
      <defs dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_DEFS }} />
      <defs>
        <clipPath id="jm-logo-clip">
          <rect x={-LOGO / 2} y={-LOGO / 2} width={LOGO} height={LOGO} rx={10} />
        </clipPath>
        <radialGradient id="jm-spot">
          <stop offset="0" stopColor="#d4a94a" stopOpacity=".75" />
          <stop offset=".45" stopColor="#d4a94a" stopOpacity=".28" />
          <stop offset="1" stopColor="#d4a94a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath="url(#jm-frame)">
        {/* 바다·시군구·광원·한강·랜드마크·그리드·지역 라벨 — 전부 정적 */}
        <g dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_BASE }} />

        {markers.map((marker) => {
          const style = { "--c": marker.color, "--a": marker.accent } as CSSProperties;
          const distance = Math.hypot(marker.x - marker.pinX, marker.y - marker.pinY);
          const k = distance > 24 ? (distance - 22) / distance : 0;

          return (
            <g key={`pin-${marker.code}`}>
              {k ? (
                <line
                  className="jm-lead"
                  x1={marker.pinX + (marker.x - marker.pinX) * (1 - k)}
                  y1={marker.pinY + (marker.y - marker.pinY) * (1 - k)}
                  x2={marker.pinX}
                  y2={marker.pinY}
                  style={style}
                />
              ) : null}
              <circle className="jm-pin" cx={marker.pinX} cy={marker.pinY} r={2.4} style={style} />
            </g>
          );
        })}

        {markers.map((marker) => {
          const sub = subLabel(marker);
          const width = Math.max(58, Math.round(Math.max(textWidth(marker.name, 13), textWidth(sub, 11)) + 18));
          const tone = marker.seed
            ? " jm-seed"
            : marker.badge === "seed"
              ? " jm-top3"
              : marker.badge === "wildcard"
                ? " jm-risk"
                : "";

          const rise = (marker.rankDelta || 0) > 0;
          const logo = jungmanLogoSrc(marker.code);

          return (
            <g key={marker.code} transform={`translate(${marker.x},${marker.y})`}>
              <g
                className={`jm-m${tone}${marker.dark ? " jm-dark" : ""}${
                  marker.contested ? " jm-contested" : ""
                }${rise ? " jm-rise" : ""}`}
                data-team={marker.code}
                style={
                  {
                    "--c": marker.color,
                    "--g": `${glowRadius(marker.voteShare)}px`,
                    "--d": `${((marker.rank || 1) - 1) * 45}ms`,
                  } as CSSProperties
                }
              >
                {marker.rank === 1 ? <circle className="jm-spot" r={58} /> : null}
                <rect className="jm-card" x={-HALF} y={-HALF} width={CARD} height={CARD} rx={12} />
                {logo ? (
                  // 로고가 카드를 채운다 — 32px로는 작아서 어느 팀인지 안 읽힌다.
                  <image
                    clipPath="url(#jm-logo-clip)"
                    href={logo}
                    x={-LOGO / 2}
                    y={-LOGO / 2}
                    width={LOGO}
                    height={LOGO}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <>
                    <rect className="jm-logo-slot" x={-16} y={-16} width={32} height={32} rx={9} />
                    <text className="jm-abbr" y={1}>
                      {marker.code}
                    </text>
                  </>
                )}
                <rect className="jm-chip" x={-width / 2} y={CHIP_Y} width={width} height={CHIP_H} rx={9} />
                <text className="jm-name" y={CHIP_Y + 11}>
                  {marker.name}
                </text>
                <text className="jm-sub" y={CHIP_Y + 24}>
                  {marker.seed ? (
                    <tspan className="jm-seed-sub">4시드 확보</tspan>
                  ) : marker.rank === null || marker.votes === null ? (
                    <tspan className="jm-votes">개표 대기</tspan>
                  ) : (
                    <>
                      <tspan className="jm-rank">{marker.rank}위</tspan>
                      <tspan className="jm-dot"> · </tspan>
                      <tspan className="jm-votes">{formatVotes(marker.votes)}표</tspan>
                    </>
                  )}
                </text>

                {marker.rank !== null && !marker.seed ? (
                  <g className="jm-badge">
                    <circle cx={-HALF} cy={-HALF} r={9.5} />
                    <text x={-HALF} y={-HALF + 0.5}>
                      {marker.rank}
                    </text>
                  </g>
                ) : null}

                {marker.rankDelta ? (
                  <text
                    className={`jm-delta ${marker.rankDelta > 0 ? "jm-d-up" : "jm-d-down"}`}
                    x={HALF + 2}
                    y={-HALF + 4}
                  >
                    {marker.rankDelta > 0 ? "▲" : "▼"}
                    {Math.abs(marker.rankDelta)}
                  </text>
                ) : null}
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
