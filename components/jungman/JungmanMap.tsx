import { existsSync } from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";

import { JUNGMAN_MAP_BASE, JUNGMAN_MAP_DEFS, JUNGMAN_MAP_HEIGHT, JUNGMAN_MAP_WIDTH } from "./map-base";
import { formatVotes, jungmanLogoPath, type JungmanMarker } from "@/lib/jungman";

// 404난 SVG <image>는 브라우저가 깨진 아이콘을 그린다 — 파일이 실제로 있을 때만 로고를 렌더.
// 서버 컴포넌트 전용이라 fs를 써도 된다.
function hasLogoFile(code: string) {
  return existsSync(path.join(process.cwd(), "public", jungmanLogoPath(code)));
}

const CARD = 44;
const HALF = CARD / 2;
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

const MAP_STYLE = `
  .jm-land{fill:#18223a;stroke:rgba(155,185,240,.22);stroke-width:.7;stroke-linejoin:round;}
  .jm-land.jm-b{fill:#1e2a45;}
  .jm-river-glow{fill:none;stroke:rgba(140,180,240,.34);stroke-width:18.5;stroke-linecap:round;}
  .jm-river{fill:none;stroke:#0c1730;stroke-width:14;stroke-linecap:round;}
  .jm-glyph path{fill:none;stroke:rgba(195,212,245,.30);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}
  .jm-grid{stroke:rgba(150,175,220,.07);stroke-width:1;}
  .jm-tick{fill:none;stroke:rgba(212,169,74,.34);stroke-width:1.6;}
  .jm-region{fill:#7a8299;opacity:.42;font-size:15px;letter-spacing:.16em;text-anchor:middle;}

  .jm-pin{fill:var(--c);opacity:.85;}
  .jm-lead{stroke:var(--c);stroke-width:1;stroke-opacity:.34;stroke-dasharray:3 3;}
  .jm-m{transition:transform .18s ease;cursor:default;}
  .jm-m:hover{transform:scale(1.07);}
  .jm-m .jm-card{fill:var(--c);stroke:rgba(226,236,255,.30);stroke-width:1.5;
    filter:drop-shadow(0 0 12px var(--c)) drop-shadow(0 4px 10px rgba(0,0,0,.55));}
  .jm-m .jm-logo-slot{fill:rgba(255,255,255,.10);stroke:rgba(255,255,255,.16);stroke-width:1;}
  .jm-m .jm-abbr{fill:#0b0f1a;font-size:13px;font-weight:800;letter-spacing:.03em;
    text-anchor:middle;dominant-baseline:central;}
  .jm-m.jm-dark .jm-abbr{fill:#eef2fa;}
  .jm-m .jm-chip{fill:rgba(10,15,28,.82);stroke:var(--c);stroke-opacity:.5;stroke-width:1;}
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
  @media (prefers-reduced-motion:reduce){
    .jm-m{transition:none;}
    .jm-m:hover{transform:none;}
  }
`;

export default function JungmanMap({ markers }: { markers: JungmanMarker[] }) {
  return (
    <svg
      viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
      role="img"
      aria-label="중만컵 참가 13개 팀의 수도권 서부 연고지와 득표 현황 지도"
      className="block h-auto w-full rounded-lg"
    >
      <style>{MAP_STYLE}</style>
      <defs dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_DEFS }} />

      <g clipPath="url(#jm-frame)">
        {/* 바다·시군구·광원·한강·랜드마크·그리드·지역 라벨 — 전부 정적 */}
        <g dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_BASE }} />

        {markers.map((marker) => {
          const style = { "--c": marker.color } as CSSProperties;
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

          return (
            <g key={marker.code} transform={`translate(${marker.x},${marker.y})`}>
              <g
                className={`jm-m${tone}${marker.dark ? " jm-dark" : ""}`}
                style={{ "--c": marker.color } as CSSProperties}
              >
                <rect className="jm-card" x={-HALF} y={-HALF} width={CARD} height={CARD} rx={12} />
                <rect className="jm-logo-slot" x={-16} y={-16} width={32} height={32} rx={9} />
                {hasLogoFile(marker.code) ? (
                  <image
                    href={jungmanLogoPath(marker.code)}
                    x={-16}
                    y={-16}
                    width={32}
                    height={32}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <text className="jm-abbr" y={1}>
                    {marker.code}
                  </text>
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
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
