"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type TouchEvent,
} from "react";

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
  JUNGMAN_GROUP_COLORS,
  JUNGMAN_MATCH_TIME,
  JUNGMAN_MILESTONES,
  JUNGMAN_PRIZE_DETAIL,
  JUNGMAN_PRIZE_TOTAL,
  JUNGMAN_TEAMS,
  jungmanDaysToFinal,
  jungmanLogoPath,
  jungmanTeamByName,
} from "@/lib/jungman";
import type {
  JungmanGroupTable,
  JungmanPlayerRank,
  JungmanStandingsGroup,
  JungmanStandingsMatch,
} from "@/lib/jungman-standings";

/** 중만컵 금색 — 조가 없는 팀(편성 발표 전)의 기본 마커 색 */
const GOLD = "#d4a94a";
/** 커버에서 조 하이라이트가 한 바퀴 도는 간격 */
const CYCLE_MS = 2400;
/** 마커 로고 반지름. 헤일로·팀명·조 배지 좌표가 전부 이 값에서 나온다 */
const MARKER_R = 23;

type DeckSlide = { key: "cover" | "standings"; label: string; ms: number };

/** 조 색(#RRGGBB)을 반투명으로. 머리글 그라디언트가 알파를 요구한다 — 새 색은 안 만든다 */
function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * 미디어 질의 구독. 서버 렌더에는 창이 없어 항상 false로 시작하고 하이드레이션 뒤에 진짜 값이 온다 —
 * useState+useEffect로 흉내 내면 하이드레이션 불일치를 스스로 만든다.
 */
function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

// 날짜 조각 조립 — /jungman의 일정·경기 결과와 같은 규칙. 언젠가 lib으로 합칠 자리다.
const DECK_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "2026-08-08" → "8/8(토)" */
function formatDeckDate(date: string): string {
  const parts = DECK_DATE.formatToParts(new Date(`${date}T00:00:00+09:00`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** 한국 날짜 기준 남은 날. 브라우저 시계가 어느 지역이든 같은 숫자가 나온다 */
function daysToKST(date: string): number {
  const todayKST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return Math.round((Date.parse(date) - Date.parse(todayKST)) / 86_400_000);
}

/** 지난 날짜는 D-day를 안 그린다 — 결과가 안 들어온 경기에 거짓 숫자를 붙이지 않는다 */
function ddayLabel(date: string): string {
  const dday = daysToKST(date);
  if (dday < 0) return "";
  return dday === 0 ? "오늘" : dday === 1 ? "내일" : `D-${dday}`;
}

/**
 * 상금 상수는 한 줄 문자열이다. 배지는 "우승 …" / "준우승 …" 두 줄로 나눠 보여야 해서 구분자로 쪼갠다.
 * 구분자가 없으면 통째로 첫 줄에 둔다 — 상수 문구가 바뀌어도 글자가 사라지지는 않는다.
 */
function splitPrizeDetail(detail: string): { win: string; winExtra: string; runner: string } {
  const parts = detail.split(/\s*[·/]\s*/).filter(Boolean);
  const runner = parts.length > 1 ? parts[parts.length - 1] : "";
  const head = parts.length > 1 ? parts.slice(0, -1).join(" · ") : detail;
  const [win, winExtra = ""] = head.split(/\s*\+\s*/);
  return { win, winExtra, runner };
}

const DECK_STYLE = `
  .jm-land{fill:#18223a;stroke:rgba(155,185,240,.22);stroke-width:.7;stroke-linejoin:round;}
  .jm-land.jm-b{fill:#1e2a45;}
  .jm-river-glow{fill:none;stroke:rgba(140,180,240,.34);stroke-width:18.5;stroke-linecap:round;}
  .jm-river{fill:none;stroke:#0c1730;stroke-width:14;stroke-linecap:round;}
  .jm-glyph path{fill:none;stroke:rgba(195,212,245,.30);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}
  .jm-grid{stroke:rgba(150,175,220,.07);stroke-width:1;}
  .jm-tick{fill:none;stroke:rgba(212,169,74,.34);stroke-width:1.6;}
  .jm-region{fill:#7a8299;opacity:.42;font-size:15px;letter-spacing:.16em;text-anchor:middle;}

  /* 무대 — 정보는 왼쪽 기둥, 지도는 오른쪽 */
  .hd-stage{position:relative;z-index:4;height:100%;display:flex;flex-direction:column;
    padding:clamp(14px,2.6vh,26px) clamp(18px,3.4vw,56px) clamp(14px,2.4vh,24px);}

  /* 지형과 마커는 같은 상자·같은 viewBox를 써야 좌표가 정확히 겹친다 — 위치 규칙은 .hd-map 한 벌뿐 */
  .hd-map{position:absolute;right:1%;top:50%;transform:translateY(-50%);
    width:min(1340px,64vw);max-height:70svh;height:auto;
    transition:opacity .5s ease,right .5s ease,width .5s ease;}
  .hd-base{opacity:.92;
    -webkit-mask-image:radial-gradient(ellipse 74% 82% at 50% 50%,#000 44%,transparent 96%);
    mask-image:radial-gradient(ellipse 74% 82% at 50% 50%,#000 44%,transparent 96%);}
  /* 순위표가 폭을 먹으니 지도를 오른쪽으로 밀어낸다 */
  .hd-deck[data-slide="standings"] .hd-map{right:-16%;width:min(1120px,58vw);opacity:.3;}

  /* 스크림 — 글자가 있는 왼쪽만 누르고 오른쪽 지도는 밝게 남긴다 */
  .hd-scrim{position:absolute;inset:0;z-index:2;pointer-events:none;
    background:
      linear-gradient(100deg,rgba(4,9,7,.86) 0%,rgba(4,9,7,.5) 24%,rgba(4,9,7,.1) 50%,transparent 70%),
      linear-gradient(180deg,rgba(4,9,7,.4),transparent 18%,transparent 72%,rgba(4,9,7,.68));}

  /* 왼쪽 정보 기둥 */
  .hd-stack{width:clamp(340px,47vw,790px);display:flex;flex-direction:column;}
  .hd-kicker{font-size:clamp(11px,1.1vw,15px);letter-spacing:.2em;font-weight:900;
    color:#2BE39B;width:100%;margin-bottom:2px;}
  .hd-tophead{display:flex;align-items:center;gap:clamp(12px,1.6vw,24px);flex-wrap:wrap;
    margin-bottom:clamp(12px,2.4vh,26px);}
  .hd-title{font-size:clamp(32px,4.6vw,72px);line-height:.94;font-weight:900;letter-spacing:-.03em;
    color:#fff;text-shadow:0 10px 34px rgba(0,0,0,.6);}
  .hd-title em{font-style:normal;color:#d4a94a;}

  /* 상금 배지 */
  .hd-prize{margin-left:auto;display:flex;align-items:center;gap:clamp(9px,.9vw,15px);
    padding:clamp(9px,1.3vh,16px) clamp(15px,1.4vw,26px);border-radius:16px;
    background:linear-gradient(135deg,rgba(201,168,76,.22),rgba(201,168,76,.06));
    border:1px solid rgba(201,168,76,.5);box-shadow:0 16px 44px rgba(0,0,0,.45);}
  .hd-prize-cap{font-size:clamp(10px,.92vw,14px);letter-spacing:.12em;font-weight:800;
    color:rgba(201,168,76,.82);}
  .hd-prize-sum{font-size:clamp(22px,2.6vw,44px);font-weight:900;color:#d4a94a;line-height:1;}
  .hd-prize-detail{border-left:1px solid rgba(201,168,76,.35);padding-left:clamp(9px,.9vw,15px);}
  .hd-prize-win{font-size:clamp(11px,1.05vw,16px);font-weight:800;color:#F0E2BC;}
  .hd-prize-win span{font-size:.88em;color:rgba(240,226,188,.7);}
  .hd-prize-run{font-size:clamp(10px,.92vw,14px);font-weight:700;color:rgba(201,168,76,.8);}

  /* 조 범례 — 4줄 세로. 배경은 불투명해야 지도 선이 글자를 뚫지 않는다 */
  .hd-aleg{display:flex;flex-direction:column;gap:clamp(7px,1.1vh,13px);}
  .hd-agrp{display:flex;align-items:center;gap:clamp(8px,.9vw,14px);text-align:left;
    padding:clamp(8px,1.2vh,14px) clamp(11px,1vw,18px);border-radius:14px;
    background:rgba(9,17,14,.9);border:1px solid rgba(255,255,255,.09);
    box-shadow:0 12px 32px rgba(0,0,0,.4);
    transition:border-color .22s ease,background .22s ease,box-shadow .22s ease;}
  .hd-agrp:hover{border-color:rgba(255,255,255,.2);}
  .hd-agrp.is-on{border-color:var(--c);background:rgba(9,17,14,.97);
    box-shadow:0 0 0 1px var(--c),0 16px 40px rgba(0,0,0,.5);}
  .hd-aname{font-size:clamp(15px,1.5vw,24px);font-weight:900;color:var(--c);flex:0 0 auto;min-width:2.4em;}
  .hd-alogos{display:flex;align-items:center;gap:clamp(5px,.55vw,9px);flex:1;}
  .hd-alogo{width:clamp(26px,2.5vw,42px);height:clamp(26px,2.5vw,42px);object-fit:contain;
    opacity:.55;filter:grayscale(.6);transition:opacity .22s ease,filter .22s ease;}
  .hd-agrp.is-on .hd-alogo{opacity:1;filter:none;}
  .hd-acount{font-size:clamp(10px,.85vw,12px);color:#7a8299;font-weight:700;letter-spacing:.06em;}

  .hd-cap{margin-top:clamp(6px,1vh,10px);font-size:clamp(11px,1.05vw,15px);color:#9FBCAC;font-weight:700;}

  /* 다가오는 경기 — 조 범례와 같은 감각. 배경은 불투명해야 지도 선이 글자를 뚫지 않는다 */
  .hd-up{margin-top:clamp(8px,1.4vh,16px);display:flex;flex-direction:column;gap:clamp(5px,.7vh,9px);}
  .hd-upt{font-size:clamp(10px,.85vw,12px);letter-spacing:.1em;font-weight:900;color:#7a8299;}
  .hd-upr{display:flex;align-items:center;gap:clamp(7px,.8vw,13px);
    padding:clamp(6px,.85vh,10px) clamp(11px,1vw,18px);border-radius:14px;
    background:rgba(9,17,14,.9);border:1px solid rgba(255,255,255,.09);
    box-shadow:0 12px 32px rgba(0,0,0,.4);}
  .hd-upd{font-size:clamp(11px,1.05vw,16px);font-weight:900;color:#d4a94a;
    font-variant-numeric:tabular-nums;flex:0 0 auto;min-width:3.2em;}
  .hd-upw{font-size:clamp(10.5px,.95vw,14px);font-weight:700;color:#9FBCAC;
    font-variant-numeric:tabular-nums;flex:0 0 auto;}
  .hd-upm{display:flex;align-items:center;gap:clamp(4px,.45vw,8px);min-width:0;}
  .hd-uplogo{width:clamp(18px,1.6vw,26px);height:clamp(18px,1.6vw,26px);object-fit:contain;flex:0 0 auto;}
  .hd-upn{font-size:clamp(11px,1vw,15px);font-weight:800;color:#fff;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .hd-upvs{font-size:clamp(9px,.8vw,12px);font-weight:900;color:#7a8299;flex:0 0 auto;}

  /* 라운드 일정 — 결승만 금색으로 남기고 8강·4강은 담백하게 */
  .hd-ms{margin-top:clamp(10px,1.8vh,20px);display:flex;flex-direction:column;gap:clamp(6px,.9vh,11px);}
  .hd-msr{display:flex;align-items:center;gap:clamp(8px,1vw,16px);
    padding:clamp(6px,.9vh,11px) clamp(12px,1.2vw,22px);border-radius:14px;
    background:rgba(9,17,14,.9);border:1px solid rgba(255,255,255,.09);}
  .hd-msd{font-size:clamp(13px,1.3vw,20px);font-weight:900;line-height:1;color:#9FBCAC;
    font-variant-numeric:tabular-nums;flex:0 0 auto;min-width:3.6em;}
  .hd-msl{font-size:clamp(13px,1.25vw,19px);font-weight:900;color:#fff;flex:0 0 auto;min-width:2.4em;}
  .hd-msn{font-size:clamp(10.5px,1vw,15px);color:#9FBCAC;font-weight:600;min-width:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  /* 결승 — 예전 그랜드 파이널 블록의 금색 강조를 그대로 이어받는다 */
  .hd-msr.is-final{padding:clamp(9px,1.4vh,17px) clamp(14px,1.3vw,24px);border-radius:18px;
    background:linear-gradient(120deg,rgba(201,168,76,.16),rgba(201,168,76,.04));
    border-color:rgba(201,168,76,.42);box-shadow:0 16px 40px rgba(0,0,0,.42);}
  .hd-msr.is-final .hd-msd{font-size:clamp(26px,3.2vw,50px);color:#d4a94a;}
  .hd-msr.is-final .hd-msl{font-size:clamp(14px,1.35vw,21px);}
  .hd-gf-chip{font-size:clamp(9px,.8vw,11px);font-weight:900;letter-spacing:.1em;flex:0 0 auto;
    background:#d4a94a;color:#04120c;border-radius:999px;padding:.25em .7em;}
  .hd-note{margin-top:clamp(6px,1vh,10px);font-size:clamp(10.5px,.95vw,13px);color:#7a8299;}

  /* 마커는 지도를 다시 그리지 않고 켜지고 꺼지기만 한다 */
  .hd-m{transition:all .45s ease;}
  .hd-halo{fill:#0b111f;stroke:var(--c);stroke-width:2.5;transition:r .45s ease;}
  .hd-logo{opacity:.28;filter:grayscale(.82) brightness(.85);transition:opacity .45s ease,filter .45s ease;}
  .hd-m.is-dim .hd-logo{opacity:.42;filter:grayscale(.6) brightness(.9);}
  .hd-m.is-on .hd-logo{opacity:1;filter:none;}
  .hd-name{opacity:0;font-size:15px;font-weight:800;fill:#cfd6e6;text-anchor:middle;
    paint-order:stroke;stroke:rgba(4,9,7,.72);stroke-width:3;stroke-linejoin:round;
    transition:opacity .45s ease,font-size .45s ease,fill .45s ease;}
  .hd-m.is-dim .hd-name{opacity:.42;}
  .hd-m.is-on .hd-name{opacity:1;fill:#fff;font-size:19px;}
  .hd-badge-c{opacity:0;fill:var(--c);transition:opacity .45s ease;}
  .hd-badge-t{opacity:0;font:900 14px sans-serif;fill:#04120c;text-anchor:middle;transition:opacity .45s ease;}
  .hd-m.is-dim .hd-badge-c{opacity:.62;}
  .hd-m.is-dim .hd-badge-t{opacity:.75;}
  .hd-m.is-on .hd-badge-c,.hd-m.is-on .hd-badge-t{opacity:1;}

  /* 진행바는 CSS 애니메이션이다. width를 매 프레임 바꾸면 레이아웃이 다시 계산된다 */
  @keyframes hdBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  .hd-bar{animation-name:hdBar;animation-timing-function:linear;animation-fill-mode:forwards;}

  /* ── 슬라이드 2: 조별 순위 ──
     행 높이를 화면 높이에서 뽑는다. transform 축소는 레이아웃 높이를 안 줄여 표가 잘린다. */
  .stand{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:center;
    width:clamp(340px,76vw,1500px);}
  .sthd{display:flex;align-items:baseline;gap:clamp(10px,1.4vw,20px);flex-wrap:wrap;}
  .sth2{font-size:clamp(26px,3.6vw,54px);line-height:.96;color:#fff;font-weight:900;}
  .sth2 em{font-style:normal;color:#2BE39B;}
  .stsort{font-size:clamp(11px,1.05vw,15px);color:#9FBCAC;font-weight:700;}

  .standbody{margin-top:clamp(8px,1.4vh,18px);display:grid;
    grid-template-columns:minmax(0,1.14fr) minmax(0,.82fr) minmax(0,.78fr);
    gap:clamp(12px,1.6vw,30px);align-items:start;}
  /* 경기가 0건이면 곁 패널을 아예 안 만든다 — 빈 패널 대신 표가 전체 폭을 쓴다 */
  .standbody.is-solo{grid-template-columns:minmax(0,1fr);}

  /* 13 = 4조 × (머리 .8 + 3행) 에 여백을 얹은 값. 이 나눗셈이 A조가 안 잘리는 근거다 */
  .stwrap{--rowh:min(calc(55svh / 13),58px);display:flex;flex-direction:column;gap:clamp(7px,1.1vh,15px);}
  .gblock{border-radius:14px;overflow:hidden;background:rgba(9,17,14,.93);
    border:1px solid rgba(255,255,255,.09);box-shadow:0 16px 40px rgba(0,0,0,.42);}
  .gbhead,.trow3{display:grid;align-items:center;
    grid-template-columns:minmax(0,1fr) 3.2em 3.2em 4.4em 4.8em;
    gap:clamp(6px,.7vw,14px);padding:0 clamp(12px,1.2vw,22px);}
  .gbhead{min-height:calc(var(--rowh) * .8);border-bottom:1px solid rgba(255,255,255,.09);
    background:linear-gradient(90deg,var(--c26),transparent 60%);}
  .gbname{font-size:clamp(17px,1.8vw,31px);color:var(--c);line-height:1;font-weight:900;}
  .gbsub{font-size:.4em;color:#7a8299;letter-spacing:.06em;font-weight:700;}
  .gbcol{font-size:clamp(10px,.88vw,13.5px);font-weight:800;color:#7a8299;text-align:right;}

  .trow3{min-height:var(--rowh);position:relative;border-top:1px solid rgba(255,255,255,.05);}
  .gbhead + .trow3{border-top:none;}
  /* 8강 진출선 — 2위 아래 */
  .trow3.is-cut{border-bottom:2px dashed rgba(43,227,155,.45);}
  .trow3.is-top::before{content:"";position:absolute;left:0;top:18%;bottom:18%;width:3px;
    border-radius:99px;background:var(--c);}
  .tteam{display:flex;align-items:center;gap:clamp(6px,.6vw,11px);min-width:0;}
  .trank{font-size:clamp(11px,.95vw,14px);font-weight:900;color:#7a8299;
    font-variant-numeric:tabular-nums;min-width:1.1em;}
  .tlogo{width:clamp(19px,1.7vw,28px);height:clamp(19px,1.7vw,28px);object-fit:contain;flex:0 0 auto;}
  .tname{font-size:clamp(12px,1.15vw,18px);font-weight:800;color:#fff;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .tnum{font-size:clamp(12px,1.1vw,17px);font-weight:800;color:#cfd6e6;text-align:right;
    font-variant-numeric:tabular-nums;}
  .tnum.is-up{color:#2BE39B;}
  .tnum.is-dn{color:#e0574a;}
  .tnum.is-mut{color:#7a8299;}

  /* 곁 패널 — 경기 결과 · 개인 순위 */
  .stpanel{border-radius:14px;overflow:hidden;background:rgba(9,17,14,.93);
    border:1px solid rgba(255,255,255,.09);box-shadow:0 16px 40px rgba(0,0,0,.42);}
  .stpht{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
    padding:clamp(9px,1.3vh,15px) clamp(11px,1vw,18px);
    font-size:clamp(12px,1.15vw,17px);color:#2BE39B;font-weight:800;letter-spacing:.06em;
    border-bottom:1px solid rgba(255,255,255,.09);background:rgba(43,227,155,.08);}
  .stphs{font-size:.72em;color:#7a8299;letter-spacing:.04em;font-weight:700;}

  .mrow{display:flex;align-items:center;gap:clamp(6px,.7vw,12px);
    padding:clamp(6px,.9vh,11px) clamp(11px,1vw,18px);border-top:1px solid rgba(255,255,255,.05);}
  .stpht + .mrow{border-top:none;}
  .mchip{font-size:clamp(9px,.78vw,11px);font-weight:900;border-radius:999px;padding:.22em .6em;flex:0 0 auto;}
  .mchip.is-w{background:#2BE39B;color:#04120c;}
  .mchip.is-l{background:rgba(224,87,74,.9);color:#04120c;}
  .mlogo{width:clamp(20px,1.8vw,30px);height:clamp(20px,1.8vw,30px);object-fit:contain;flex:0 0 auto;}
  .mtxt{font-size:clamp(10px,.9vw,13px);font-weight:800;color:#cfd6e6;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .is-lost{opacity:.42;filter:grayscale(.6);}
  .mscore{font-size:clamp(13px,1.2vw,19px);font-weight:900;color:#fff;
    font-variant-numeric:tabular-nums;letter-spacing:.04em;}
  .mdate{margin-left:auto;font-size:clamp(9px,.78vw,11.5px);color:#7a8299;font-weight:700;flex:0 0 auto;}

  .prow{display:flex;align-items:center;gap:clamp(5px,.6vw,10px);
    padding:clamp(4px,.7vh,9px) clamp(11px,1vw,18px);border-top:1px solid rgba(255,255,255,.05);}
  .stpht + .prow{border-top:none;}
  .prank{font-size:clamp(10px,.85vw,13px);font-weight:900;color:#7a8299;
    font-variant-numeric:tabular-nums;min-width:1.4em;}
  .plogo{width:clamp(16px,1.4vw,23px);height:clamp(16px,1.4vw,23px);object-fit:contain;flex:0 0 auto;}
  .pname{font-size:clamp(11px,1vw,15px);font-weight:800;color:#fff;flex:1;min-width:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .prec{font-size:clamp(9px,.82vw,12px);font-weight:700;color:#9FBCAC;
    font-variant-numeric:tabular-nums;flex:0 0 auto;}
  .ppct{font-size:clamp(10px,.88vw,13px);font-weight:900;color:#2BE39B;
    font-variant-numeric:tabular-nums;flex:0 0 auto;}

  /* 좁은 화면에서는 2단이 성립하지 않는다 — 지도를 더 밀고 정보 기둥을 전체폭으로 떨어뜨린다 */
  @media (max-width:767px){
    .hd-map{right:-30%;width:min(1100px,150vw);}
    .hd-deck[data-slide="standings"] .hd-map{right:-46%;}
    .hd-stack{width:100%;}
    .hd-name,.hd-badge-c,.hd-badge-t{display:none;}
    .hd-prize{margin-left:0;}
    /* 세로가 짧은 화면에서 라운드 일정 3줄은 커버를 넘긴다 — 결승 한 줄만 남긴다 */
    .hd-msr:not(.is-final){display:none;}
    /* 3단이 성립 안 하는 폭이다 — 조별 순위만 남긴다 */
    .stand{width:100%;}
    .stpanel{display:none;}

    /* 폰에서는 산수(--rowh)가 안 맞는다 — 머리글이 접히면 계산에 없던 높이가 생겨 표가 잘린다.
       남은 높이를 4개조가 그냥 나눠 갖게 해서 어떤 기기에서도 넘치지 않게 한다.
       그러려면 .stand → .standbody → .stwrap 로 높이가 끊기지 않고 내려가야 한다:
       .standbody는 .stand(flex column)의 자식이라 flex로 늘리고,
       .stwrap은 그 grid의 자식이라 flex가 안 먹으므로 height:100%로 받는다.
       align-items:start를 stretch로 바꾸지 않으면 grid 행이 내용 높이로 쪼그라든다. */
    .standbody{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);
      flex:1 1 auto;min-height:0;align-items:stretch;margin-top:6px;}
    .stwrap{height:100%;min-height:0;gap:6px;}
    .gblock{flex:1 1 0;min-height:0;display:flex;flex-direction:column;}
    .gbhead{flex:0 0 auto;min-height:0;padding-top:5px;padding-bottom:5px;}
    .trow3{flex:1 1 0;min-height:0;}
    /* 잔여 열을 접는다 — 폰 폭에서 5열은 팀 이름 자리를 뺏는다 */
    .gbhead,.trow3{grid-template-columns:minmax(0,1fr) 2.4em 2.4em 3.4em;gap:8px;padding:0 11px;}
    .gbcol.is-last,.tnum.is-last{display:none;}
    /* "3팀 풀리그"가 세 줄로 접혀 머리글 높이를 밀어올렸다 */
    .gbsub{display:none;}
    /* 정렬 기준 한 줄이 두 줄로 접혀 표 자리를 먹는다 */
    .stsort{display:none;}
    .sth2{font-size:clamp(19px,5.2vw,26px);}
    .gbname{font-size:15px;}
    .tname{font-size:12px;}
    .tnum{font-size:12px;}
    .tlogo{width:17px;height:17px;}
  }
  /* 커버 높이에 못 들어가는 화면에서는 곁가지를 접는다 */
  @media (max-width:639px),(max-height:620px){
    .hd-kicker,.hd-cap2{display:none;}
    /* 다가오는 경기도 한 줄만 — 두 블록이 같이 늘어나면 커버가 잘린다 */
    .hd-up .hd-upr:nth-of-type(2){display:none;}
  }

  @media (prefers-reduced-motion:reduce){
    /* 자동 넘김은 진행바의 animationend가 몰고 간다 — 애니메이션을 끄면 자동 넘김도 함께 멈춘다 */
    .hd-bar{animation:none;}
    .hd-track{display:none;}
    .hd-m,.hd-slide,.hd-map{transition:none;}
  }
`;

export default function HomeHeroDeck({
  // titleLines는 app/page.tsx와의 prop 계약이라 받기만 한다 — 커버 디자인에 없는 요소라 그리지 않는다
  groups = [],
  tables = [],
  matches = [],
  upcoming = [],
  playerRanks = [],
}: {
  titleLines: string[];
  /** 조 편성 — 커버 범례와 지도 하이라이트가 같은 값을 읽는다 */
  groups?: JungmanStandingsGroup[];
  /** 조별 순위표. 비면 순위 슬라이드를 아예 만들지 않는다 */
  tables?: JungmanGroupTable[];
  /** 최신순으로 이미 정렬된 경기. 비면 곁 패널 두 칸을 안 만든다 */
  matches?: JungmanStandingsMatch[];
  /** 가까운 날짜부터 정렬된 예정 경기. 비면 커버의 "다가오는 경기" 블록을 안 만든다 */
  upcoming?: JungmanStandingsMatch[];
  playerRanks?: JungmanPlayerRank[];
}) {
  const prize = splitPrizeDetail(JUNGMAN_PRIZE_DETAIL);
  // 경기가 0건이면 곁 패널은 빈 상자다 — 만들지 않고 표를 전체 폭으로 편다
  const hasMatches = matches.length > 0;

  // 조 편성이 없으면 덱은 커버 한 장이다 — 빈 슬라이드를 자리만 잡아두지 않는다
  const slides = useMemo<DeckSlide[]>(
    () => [
      { key: "cover", label: "대회 조편성", ms: 11500 },
      ...(tables.length ? ([{ key: "standings", label: "조별 순위", ms: 9500 }] as DeckSlide[]) : []),
    ],
    [tables.length]
  );

  const [index, setIndex] = useState(0);
  // 한 번이라도 직접 넘기면 자동 넘김을 영구히 끈다 — 모바일엔 호버가 없어 멈출 방법이 이것뿐이다
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const motionOff = useMedia("(prefers-reduced-motion: reduce)");
  // 터치 기기에서 mouseenter만 오고 mouseleave가 안 오면 자동 넘김이 영영 멈춘다 — 호버 있는 기기에서만 단다
  const canHover = useMedia("(hover: hover)");

  const multi = slides.length > 1;
  const autoOn = auto && multi && !motionOff;
  const slide = slides[index] ?? slides[0];

  const go = useCallback(
    (next: number) => {
      setAuto(false);
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    // 포커스가 덱에 있을 때만 온다 — 화살표로 페이지를 스크롤하던 사람을 뺏지 않는다
    event.preventDefault();
    go(index + (event.key === "ArrowRight" ? 1 : -1));
  };

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !multi) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    // 세로로 더 움직였으면 스크롤 의도다 — 슬라이드로 가로채지 않는다
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(touch.clientY - start.y)) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  // 커버에서만 조가 한 칸씩 돈다. 순위 슬라이드는 전체를 켠다.
  const onCover = slide.key === "cover" && groups.length > 0;
  const activeGroup = onCover ? (pinned ?? cycle % groups.length) : -1;

  useEffect(() => {
    if (!onCover || pinned !== null || motionOff || groups.length < 2) return;
    const timer = setInterval(() => setCycle((value) => value + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [onCover, pinned, motionOff, groups.length]);

  // 팀명은 관리자 손입력이라 별칭으로 찾는다. 못 찾은 이름은 로고 없이 넘어간다.
  const groupOf = useMemo(() => {
    const byCode = new Map<string, number>();
    groups.forEach((group, gi) => {
      for (const name of group.teams) {
        const team = jungmanTeamByName(name);
        if (team) byCode.set(team.code, gi);
      }
    });
    return byCode;
  }, [groups]);

  const legend = useMemo(
    () =>
      groups.map((group, gi) => ({
        name: group.name,
        color: JUNGMAN_GROUP_COLORS[gi % JUNGMAN_GROUP_COLORS.length],
        count: group.teams.length,
        logos: group.teams.flatMap((name) => {
          const team = jungmanTeamByName(name);
          return team ? [{ code: team.code, name: team.name, src: jungmanLogoPath(team.code) }] : [];
        }),
      })),
    [groups]
  );

  // 커버는 코앞의 두 경기만 말한다 — 전체 일정은 /jungman이 그린다
  const nextMatches = useMemo(
    () =>
      upcoming.slice(0, 2).map((match, mi) => {
        const home = jungmanTeamByName(match.home);
        const away = jungmanTeamByName(match.away);
        return {
          key: `${match.date ?? ""}-${match.home}-${match.away}`,
          // D-day는 맨 앞 경기에만 — 두 줄 다 붙이면 어느 쪽이 코앞인지 안 보인다
          dday: mi === 0 && match.date ? ddayLabel(match.date) : "",
          when: match.date ? `${formatDeckDate(match.date)} ${JUNGMAN_MATCH_TIME}` : JUNGMAN_MATCH_TIME,
          home: match.home,
          away: match.away,
          homeSrc: home ? jungmanLogoPath(home.code) : null,
          awaySrc: away ? jungmanLogoPath(away.code) : null,
        };
      }),
    [upcoming]
  );

  // 지난 라운드는 뺀다. 결승 D-day만 lib 함수를 그대로 써서 /jungman 커버와 숫자를 맞춘다
  const milestones = useMemo(
    () =>
      JUNGMAN_MILESTONES.map((milestone) => {
        const offline = "offline" in milestone && milestone.offline;
        return {
          label: milestone.label,
          note: offline ? JUNGMAN_FINAL_PLACE : milestone.note,
          offline,
          dday: offline ? jungmanDaysToFinal() : daysToKST(milestone.date),
        };
      }).filter((milestone) => milestone.dday >= 0),
    []
  );

  const pin = (gi: number) => {
    // 범례를 누른 사람은 그 조를 보고 있다 — 순환도 자동 넘김도 여기서 멈춘다
    setPinned(gi === pinned ? null : gi);
    setAuto(false);
  };

  return (
    <div
      className="hd-deck absolute inset-0 isolate overflow-hidden bg-[#05090b] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d4a94a]"
      data-slide={slide.key}
      role="region"
      aria-roledescription="슬라이드 덱"
      aria-label="K-중만컵 커버"
      tabIndex={multi ? 0 : -1}
      onKeyDown={onKeyDown}
      onMouseEnter={canHover ? () => setPaused(true) : undefined}
      onMouseLeave={canHover ? () => setPaused(false) : undefined}
    >
      <style>{DECK_STYLE}</style>

      {/* 지형 지도. 마커와 같은 상자·같은 viewBox·같은 preserveAspectRatio라 좌표가 정확히 겹친다.
          slice가 아니라 meet인 이유: slice는 세로가 긴 화면에서 좌우를 잘라 인천·경기 동부 마커가 사라진다. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <svg
          viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="hd-map hd-base"
        >
          {/* defs id(jm-sea·jm-frame)는 문서 전역이다. 홈에는 다른 지도가 없어 지금은 안전하지만,
              언젠가 홈에 JungmanMap을 얹으면 같은 id가 두 벌 생긴다(정의가 같아 결과는 같다). */}
          <defs dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_DEFS }} />
          <g clipPath="url(#jm-frame)" dangerouslySetInnerHTML={{ __html: JUNGMAN_MAP_BASE }} />
        </svg>
      </div>

      {/* 스크림 — blur는 지도 선을 뭉개서 금지. 왼쪽만 눌러 오른쪽 지도는 밝게 남긴다 */}
      <div aria-hidden className="hd-scrim" />

      {/* 마커는 스크림 위 — 아래에 두면 켜진 조까지 같이 어두워진다 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        <svg
          viewBox={`0 0 ${JUNGMAN_MAP_WIDTH} ${JUNGMAN_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="hd-map hd-mk"
        >
          <defs>
            {/* hd- 접두사 — 위 지형 defs(jm-)와 문서 전역 id를 다투지 않게 */}
            <clipPath id="hd-logo-clip">
              <circle r={MARKER_R} />
            </clipPath>
          </defs>
          {JUNGMAN_TEAMS.map((team) => {
            const gi = groupOf.get(team.code);
            const color = gi === undefined ? GOLD : JUNGMAN_GROUP_COLORS[gi % JUNGMAN_GROUP_COLORS.length];
            // 조 편성이 없거나 순위 슬라이드면 전체를 켠다
            const on = activeGroup < 0 || gi === activeGroup;
            const state = on ? "is-on" : gi === undefined ? "" : "is-dim";
            return (
              <g
                key={team.code}
                className={`hd-m ${state}`}
                // pinX/pinY는 투표 지도에서 득표 칩이 안 겹치게 가운데로 끌어당긴 보정값이다.
                // 덱은 칩이 없으니 원래 대학 위치(x,y)를 쓴다 — pin을 쓰면 JSA·BGM·흑카데미·HM이 뭉친다.
                transform={`translate(${team.x},${team.y})`}
                style={{ "--c": color } as CSSProperties}
              >
                <circle className="hd-halo" r={on ? 30 : 26} />
                <image
                  className="hd-logo"
                  clipPath="url(#hd-logo-clip)"
                  href={jungmanLogoPath(team.code)}
                  x={-MARKER_R}
                  y={-MARKER_R}
                  width={MARKER_R * 2}
                  height={MARKER_R * 2}
                  preserveAspectRatio="xMidYMid meet"
                />
                <text className="hd-name" y={MARKER_R + 17}>
                  {team.name}
                </text>
                {gi === undefined ? null : (
                  <>
                    <circle className="hd-badge-c" cx={MARKER_R * 0.8} cy={-MARKER_R * 0.8} r={11} />
                    <text className="hd-badge-t" x={MARKER_R * 0.8} y={-MARKER_R * 0.8 + 5}>
                      {(groups[gi]?.name ?? "").trim().charAt(0)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="hd-stage">
        <div className="flex justify-end">
          <span className="rounded-full border border-white/12 bg-black/50 px-3 py-1 text-[0.625rem] font-black tracking-[0.14em] text-[#cfd6e6]">
            {slide.label}
          </span>
        </div>

        <div
          className="relative min-h-0 flex-1"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={onTouchEnd}
        >
          {slides.map((entry, i) => (
            <div
              key={entry.key}
              // inert 없이 aria-hidden만 주면 숨은 슬라이드의 버튼이 탭 순서에 남는다
              aria-hidden={i !== index}
              inert={i !== index}
              className={`hd-slide absolute inset-0 overflow-hidden transition-opacity duration-500 ${
                i === index ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {entry.key === "cover" ? (
                <div className="flex h-full flex-col justify-center">
                  <div className="hd-stack">
                    <p className="hd-kicker">2026 시즌 · 스타크래프트 대학대전 · 12개 대학</p>

                    <div className="hd-tophead">
                      <h1 className="hd-title">
                        K-<em>중만컵</em>
                      </h1>
                      <div className="hd-prize">
                        <div>
                          <p className="hd-prize-cap">총 상금</p>
                          <p className="hd-prize-sum">{JUNGMAN_PRIZE_TOTAL}</p>
                        </div>
                        <div className="hd-prize-detail">
                          <p className="hd-prize-win">
                            {prize.win}
                            {prize.winExtra ? <span> + {prize.winExtra}</span> : null}
                          </p>
                          {prize.runner ? <p className="hd-prize-run">{prize.runner}</p> : null}
                        </div>
                      </div>
                    </div>

                    {legend.length ? (
                      <div className="hd-aleg">
                        {legend.map((group, gi) => {
                          const on = gi === activeGroup;
                          return (
                            <button
                              key={group.name}
                              type="button"
                              onClick={() => pin(gi)}
                              aria-pressed={pinned === gi}
                              aria-label={`${group.name} ${group.count}팀 지도에서 보기`}
                              className={`hd-agrp${on ? " is-on" : ""}`}
                              style={{ "--c": group.color } as CSSProperties}
                            >
                              <span className="hd-aname">{group.name}</span>
                              <span className="hd-alogos">
                                {group.logos.map((logo) => (
                                  <Image
                                    key={logo.code}
                                    src={logo.src}
                                    alt={logo.name}
                                    width={42}
                                    height={42}
                                    className="hd-alogo shrink-0"
                                  />
                                ))}
                              </span>
                              <span className="hd-acount">{group.count}팀</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* 예정 경기가 없으면 블록을 통째로 안 그린다 — 빈 상자를 자리만 잡아두지 않는다 */}
                    {nextMatches.length ? (
                      <div className="hd-up">
                        <p className="hd-upt">다가오는 경기</p>
                        {nextMatches.map((match) => (
                          <div key={match.key} className="hd-upr">
                            <span suppressHydrationWarning className="hd-upd">
                              {match.dday}
                            </span>
                            <span className="hd-upw">{match.when}</span>
                            {/* 좌우는 홈·원정 자리로 고정한다 */}
                            <span className="hd-upm">
                              {match.homeSrc ? (
                                <Image src={match.homeSrc} alt="" width={26} height={26} className="hd-uplogo" />
                              ) : null}
                              <span className="hd-upn">{match.home}</span>
                              <span className="hd-upvs">vs</span>
                              <span className="hd-upn">{match.away}</span>
                              {match.awaySrc ? (
                                <Image src={match.awaySrc} alt="" width={26} height={26} className="hd-uplogo" />
                              ) : null}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <p className="hd-cap">{JUNGMAN_FORMAT_LINE}</p>
                    <p className="hd-cap hd-cap2">8강은 조 1위 ↔ 2위가 붙도록 추첨 후 싱글 토너먼트</p>

                    {/* 지난 라운드가 없으면(대회 종료) 블록도 사라진다.
                        날짜 계산은 렌더 시각 기준이라 자정을 걸치면 하이드레이션 값이 다를 수 있다 */}
                    {milestones.length ? (
                      <div className="hd-ms">
                        {milestones.map((milestone) => (
                          <div
                            key={milestone.label}
                            className={`hd-msr${milestone.offline ? " is-final" : ""}`}
                          >
                            <span suppressHydrationWarning className="hd-msd">
                              {milestone.dday > 0 ? `D-${milestone.dday}` : "D-DAY"}
                            </span>
                            <span className="hd-msl">{milestone.label}</span>
                            <span className="hd-msn">{milestone.note}</span>
                            {milestone.offline ? <span className="hd-gf-chip">오프라인</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <p className="hd-note">{JUNGMAN_FINAL_NOTE}</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col justify-center">
                  <div className="stand">
                    <div className="sthd">
                      <h2 className="sth2">
                        K-중만컵 <em>조별 순위</em>
                      </h2>
                      <p className="stsort">
                        매치 승패 → 세트 득실 → 세트 승 → 승자승 · 점선 위쪽이 8강 진출권
                      </p>
                    </div>

                    <div className={`standbody${hasMatches ? "" : " is-solo"}`}>
                      <div className="stwrap">
                        {tables.map((table, gi) => {
                          const color = JUNGMAN_GROUP_COLORS[gi % JUNGMAN_GROUP_COLORS.length];
                          const style = { "--c": color, "--c26": alpha(color, 0.26) } as CSSProperties;
                          return (
                            <div key={table.name} className="gblock" style={style}>
                              <div className="gbhead">
                                <span className="gbname">
                                  {table.name} <span className="gbsub">{table.rows.length}팀 풀리그</span>
                                </span>
                                <span className="gbcol">승</span>
                                <span className="gbcol">패</span>
                                <span className="gbcol">세트 득실</span>
                                {/* 잔여는 좁은 화면에서 접는 열 — 목업도 폰에서 이 열을 뺀다 */}
                                <span className="gbcol is-last">잔여</span>
                              </div>
                              {table.rows.map((row, ri) => {
                                const team = jungmanTeamByName(row.team);
                                return (
                                  <div
                                    key={row.team}
                                    // 마지막 행이 2위면 진출선을 안 긋는다 — 표 바닥에 점선만 남는다
                                    className={`trow3${ri < 2 ? " is-top" : ""}${
                                      ri === 1 && ri < table.rows.length - 1 ? " is-cut" : ""
                                    }`}
                                  >
                                    <span className="tteam">
                                      <span className="trank">{ri + 1}</span>
                                      {team ? (
                                        <Image
                                          src={jungmanLogoPath(team.code)}
                                          alt=""
                                          width={28}
                                          height={28}
                                          className="tlogo"
                                        />
                                      ) : null}
                                      <span className="tname">{row.team}</span>
                                    </span>
                                    <span className="tnum">{row.wins}</span>
                                    <span className="tnum">{row.losses}</span>
                                    <span
                                      className={`tnum ${
                                        row.setDiff > 0 ? "is-up" : row.setDiff < 0 ? "is-dn" : "is-mut"
                                      }`}
                                    >
                                      {row.setDiff > 0 ? `+${row.setDiff}` : row.setDiff}
                                    </span>
                                    <span className={`tnum is-last${row.remaining ? "" : " is-mut"}`}>
                                      {row.remaining || "종료"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>

                      {/* 경기가 0건이면 아래 두 패널은 존재하지 않는다 */}
                      {hasMatches ? (
                        <div className="stpanel">
                          <p className="stpht">경기 결과</p>
                          {matches.slice(0, 5).map((match, mi) => {
                            const homeWon = match.homeSets > match.awaySets;
                            const home = jungmanTeamByName(match.home);
                            const away = jungmanTeamByName(match.away);
                            return (
                              <div key={`${match.date ?? ""}-${match.home}-${match.away}-${mi}`} className="mrow">
                                {/* 홈 기준 승패. 좌우는 홈·원정 자리로 고정한다 */}
                                <span className={`mchip ${homeWon ? "is-w" : "is-l"}`}>{homeWon ? "승" : "패"}</span>
                                <span className={homeWon ? undefined : "is-lost"}>
                                  {home ? (
                                    <Image
                                      src={jungmanLogoPath(home.code)}
                                      alt={match.home}
                                      width={30}
                                      height={30}
                                      className="mlogo"
                                    />
                                  ) : (
                                    <span className="mtxt">{match.home}</span>
                                  )}
                                </span>
                                <span className="mscore">
                                  {match.homeSets} : {match.awaySets}
                                </span>
                                <span className={homeWon ? "is-lost" : undefined}>
                                  {away ? (
                                    <Image
                                      src={jungmanLogoPath(away.code)}
                                      alt={match.away}
                                      width={30}
                                      height={30}
                                      className="mlogo"
                                    />
                                  ) : (
                                    <span className="mtxt">{match.away}</span>
                                  )}
                                </span>
                                {match.date ? <span className="mdate">{match.date.slice(5)}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {hasMatches ? (
                        <div className="stpanel">
                          <p className="stpht">
                            개인 순위 <span className="stphs">TOP 10 · 다승 → 승률 순</span>
                          </p>
                          {playerRanks.slice(0, 10).map((rank, pi) => {
                            const team = jungmanTeamByName(rank.team);
                            return (
                              <div key={rank.name} className="prow">
                                <span className="prank">{pi + 1}</span>
                                {team ? (
                                  <Image
                                    src={jungmanLogoPath(team.code)}
                                    alt={rank.team}
                                    width={23}
                                    height={23}
                                    className="plogo"
                                  />
                                ) : null}
                                <span className="pname">{rank.name}</span>
                                <span className="prec">
                                  {rank.wins}승 {rank.losses}패
                                </span>
                                <span className="ppct">
                                  {Math.round((rank.wins / (rank.wins + rank.losses)) * 100)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-4 md:gap-3">
          <Link
            href="/jungman"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-nzu-green px-5 text-sm font-black tracking-tight text-black transition-transform duration-200 hover:-translate-y-0.5 md:px-6"
          >
            K-중만컵 순위
          </Link>
          <Link
            href="/prediction"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/40 px-5 text-sm font-black tracking-tight text-white transition-colors duration-200 hover:border-white/28 hover:bg-black/60 md:px-6"
          >
            승부예측
          </Link>
          <Link
            href="/schedule"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/40 px-5 text-sm font-black tracking-tight text-white transition-colors duration-200 hover:border-white/28 hover:bg-black/60 md:px-6"
          >
            일정
          </Link>

          {/* 슬라이드가 한 장뿐이면 넘길 것이 없다 — 화살표·점·진행바를 통째로 감춘다 */}
          {multi ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="이전 슬라이드"
                onClick={() => go(index - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-black/40 text-sm text-white transition-colors hover:border-white/28 hover:bg-black/60"
              >
                ‹
              </button>
              <div className="flex items-center gap-1.5 px-1">
                {slides.map((entry, i) => (
                  <button
                    key={entry.key}
                    type="button"
                    aria-label={`${entry.label} 슬라이드로 이동`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === index ? "w-5 bg-[#d4a94a]" : "w-1.5 bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="다음 슬라이드"
                onClick={() => go(index + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-black/40 text-sm text-white transition-colors hover:border-white/28 hover:bg-black/60"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {autoOn ? (
        <div aria-hidden className="hd-track pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-white/10">
          <div
            // key로 다시 마운트해 애니메이션을 처음부터 돌린다
            key={index}
            className="hd-bar h-full origin-left bg-[#d4a94a]"
            style={{ animationDuration: `${slide.ms}ms`, animationPlayState: paused ? "paused" : "running" }}
            onAnimationEnd={() => setIndex((i) => (i + 1) % slides.length)}
          />
        </div>
      ) : null}
    </div>
  );
}
