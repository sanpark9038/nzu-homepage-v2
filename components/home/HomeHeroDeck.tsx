"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
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
  JungmanScenario,
  JungmanStandingsGroup,
  JungmanStandingsMatch,
} from "@/lib/jungman-standings";

/** 중만컵 금색 — 조가 없는 팀(편성 발표 전)의 기본 마커 색 */
const GOLD = "#d4a94a";
/** 조를 모르는 경기의 색. 모르는 조 이름에 조 색을 붙이면 거짓말이 된다 */
const NO_GROUP = "#7a8299";
/** 마커 로고 반지름. 헤일로·팀명·조 배지 좌표가 전부 이 값에서 나온다 */
const MARKER_R = 23;
/** 달력 요일 머리글 겸 요일 인덱스 사전 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SEOUL_WEEKDAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });

/** "2026-08-08" → "8/8(토)" */
function formatDeckDate(date: string): string {
  const parts = DECK_DATE.formatToParts(new Date(`${date}T00:00:00+09:00`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}(${part("weekday")})`;
}

/** "2026-08-01" → 0(일)~6(토). 지역 시간 게터로 요일을 뽑으면 브라우저 시간대에 따라 칸이 하루씩 밀린다 */
function weekdayOf(date: string): number {
  return WEEKDAYS.indexOf(SEOUL_WEEKDAY.format(new Date(`${date}T00:00:00+09:00`)));
}

/** "2026-08" 한 달의 날 수. 윤년만 따지면 되는 산수라 Date를 다시 부르지 않는다 */
function daysInMonth(ym: string): number {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  if (month !== 2) return MONTH_DAYS[month - 1];
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

/** 조 색은 이름 첫 글자로 잡는다 — /jungman 커버와 같은 규칙(서버 컴포넌트라 import는 못 한다) */
function groupColor(group: string): string {
  const index = "ABCD".indexOf(group.trim().charAt(0).toUpperCase());
  return index < 0 ? NO_GROUP : JUNGMAN_GROUP_COLORS[index];
}

/** 한국 날짜 기준 남은 날. 브라우저 시계가 어느 지역이든 같은 숫자가 나온다 */
function daysToKST(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(SEOUL_YMD.format(new Date()))) / 86_400_000);
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

/**
 * 고른 팀의 곁 패널 맨 위 한 줄. 짧은 순서대로 먼저 걸린다.
 * 문구는 /jungman의 JungmanGroupTables와 한 글자도 다르면 안 된다(두 화면이 갈라진다).
 */
function scenarioLine(s: JungmanScenario | undefined): string | null {
  if (!s) return null;
  if (s.clinched) return "8강 진출 확정";
  if (s.eliminated) return "탈락 확정";
  if (s.winClinches && s.lossEliminates) return "다음 경기에서 이기면 진출, 지면 탈락";
  if (s.winClinches) return "다음 경기를 이기면 진출 확정";
  if (s.lossEliminates) return "다음 경기를 지면 탈락";
  return null;
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
  /* 홈에서만 네비바가 fixed라 히어로 위에 뜬다(Navbar.tsx의 isHome 분기).
     예전 사진 히어로는 글자를 아래에 몰아 안 겹쳤지만 덱은 위에서 시작한다 — 그만큼 비워둔다. */
  .hd-stage{position:relative;z-index:4;height:100%;display:flex;flex-direction:column;
    padding:calc(64px + clamp(8px,1.4vh,18px)) clamp(18px,3.4vw,56px) clamp(14px,2.4vh,24px);}

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
  /* 커버 글자 칸. 모자라면 여기만 스크롤한다 — overscroll-contain이라 다 내려도 페이지가 안 딸려간다.
     스크롤바는 지도 위에 흰 줄을 그으므로 감춘다(휠·터치·키보드는 그대로 된다). */
  .hd-scroll{height:100%;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;
    scrollbar-width:none;-ms-overflow-style:none;}
  .hd-scroll::-webkit-scrollbar{width:0;height:0;}
  .hd-stack{width:clamp(340px,47vw,790px);display:flex;flex-direction:column;margin-block:auto;}

  /* 압축 헤더 — 제목 · D-day · 상금이 한 줄. 자리는 아래 일정이 쓴다 */
  .hd-tophead{display:flex;align-items:baseline;gap:clamp(8px,1.2vw,18px);flex-wrap:wrap;
    margin-bottom:clamp(6px,1.2vh,14px);}
  .hd-title{font-size:clamp(26px,3.4vw,52px);line-height:.94;font-weight:900;letter-spacing:-.03em;
    color:#fff;text-shadow:0 10px 34px rgba(0,0,0,.6);}
  .hd-title em{font-style:normal;color:#d4a94a;}
  .hd-dday{font-size:clamp(11px,1.05vw,16px);font-weight:900;color:#d4a94a;border-radius:999px;
    padding:.18em .7em;background:rgba(212,169,74,.14);font-variant-numeric:tabular-nums;}
  .hd-prize{font-size:clamp(10.5px,.95vw,14px);font-weight:700;color:#7a8299;}
  .hd-prize b{color:#d4a94a;font-weight:900;}

  /* 커버 달력 — 점만 찍는 작은 달력. /jungman의 큰 달력은 칸마다 경기 카드라 여기 안 들어간다.
     배경은 불투명해야 지도 선이 날짜를 뚫지 않는다 */
  .hd-cal{margin-top:clamp(6px,1vh,12px);padding:clamp(8px,1.2vh,14px) clamp(10px,1vw,16px);
    border-radius:14px;background:rgba(9,17,14,.9);border:1px solid rgba(255,255,255,.09);
    box-shadow:0 12px 32px rgba(0,0,0,.4);}
  .hd-cmt{display:flex;gap:6px;margin-bottom:5px;}
  .hd-cmb{font-size:clamp(10px,.9vw,13px);font-weight:900;color:#7a8299;padding:.18em .7em;
    border-radius:999px;border:1px solid transparent;background:transparent;cursor:pointer;
    font-variant-numeric:tabular-nums;}
  .hd-cmb.is-on{color:#d4a94a;border-color:rgba(212,169,74,.5);background:rgba(212,169,74,.12);}
  .hd-cgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
  .hd-cwd{font-size:clamp(10px,.9vw,12.5px);font-weight:800;color:#7a8299;text-align:center;
    padding-bottom:2px;}
  .hd-cwd.is-sun{color:#e0574a;}
  .hd-cwd.is-sat{color:#4a9eff;}
  .hd-cell{height:clamp(34px,4.6vh,52px);display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:2px;padding:0;border-radius:8px;border:1px solid transparent;
    background:transparent;font-size:clamp(13px,1.15vw,16px);font-weight:700;color:#7a8299;
    font-variant-numeric:tabular-nums;transition:background .2s ease;}
  .hd-cell.has-m{color:#e8ebf2;font-weight:900;cursor:pointer;}
  .hd-cell.has-m:hover{background:rgba(255,255,255,.06);}
  .hd-cell.is-past{opacity:.45;}
  .hd-cell.is-today{border-color:rgba(212,169,74,.7);}
  .hd-cell.is-pick{background:rgba(255,255,255,.1);}
  .hd-cdot{width:7px;height:7px;border-radius:99px;background:var(--c);}

  /* 지금 보고 있는 경기 — 지도의 선·마커가 이 카드를 따라간다 */
  .hd-fx{margin-top:clamp(6px,1vh,12px);padding:clamp(8px,1.2vh,14px) clamp(12px,1.2vw,20px);
    border-radius:16px;background:rgba(9,17,14,.92);border:1px solid var(--c);
    box-shadow:0 16px 40px rgba(0,0,0,.45);}
  .hd-fxt{display:flex;align-items:center;gap:clamp(6px,.7vw,11px);flex-wrap:wrap;
    font-size:clamp(10px,.92vw,13.5px);font-weight:800;color:#7a8299;font-variant-numeric:tabular-nums;}
  .hd-fxd{border-radius:999px;padding:.18em .7em;font-weight:900;color:var(--c);background:var(--c14);}
  .hd-fxg{color:var(--c);font-weight:900;}
  .hd-fxm{margin-top:clamp(4px,.7vh,8px);display:flex;align-items:center;gap:clamp(6px,.8vw,13px);}
  .hd-fxlogo{width:clamp(26px,2.4vw,42px);height:clamp(26px,2.4vw,42px);object-fit:contain;flex:0 0 auto;}
  .hd-fxn{font-size:clamp(14px,1.5vw,24px);font-weight:900;color:#fff;min-width:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .hd-fxvs{font-size:clamp(10px,.9vw,13px);font-weight:900;color:#7a8299;flex:0 0 auto;}

  /* 조 편성 — 지도 색을 읽는 열쇠. 글자만, 아주 담백하게.
     누르는 곳이 아니다 — 지도는 달력이 고른 일정만 따라간다 */
  .hd-glegs{margin-top:clamp(5px,.8vh,10px);display:flex;flex-direction:column;gap:2px;
    font-size:clamp(10px,.85vw,12.5px);font-weight:700;color:#7a8299;line-height:1.45;}
  .hd-gleg b{color:var(--c);font-weight:900;margin-right:.45em;}

  /* 라운드 일정 — 한 줄. 결승만 금색 */
  .hd-msline{margin-top:clamp(6px,1vh,12px);display:flex;flex-wrap:wrap;gap:clamp(6px,.9vw,15px);
    font-size:clamp(10px,.92vw,13.5px);color:#7a8299;font-weight:700;font-variant-numeric:tabular-nums;}
  .hd-msi{display:inline-flex;align-items:baseline;gap:.42em;}
  .hd-msi b{color:#cfd6e6;font-weight:900;}
  .hd-msi.is-final,.hd-msi.is-final b{color:#d4a94a;}

  /* 지금 보는 경기의 두 팀을 잇는 선. 마커보다 먼저 그려야 로고를 안 가린다 */
  .hd-link{fill:none;stroke-width:2.6;stroke-dasharray:8 7;stroke-linecap:round;opacity:.9;}

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
    grid-template-columns:minmax(0,.92fr) minmax(0,.86fr) minmax(0,.92fr);
    gap:clamp(12px,1.6vw,30px);align-items:start;}
  /* 곁 패널이 없으면 그 열도 없다 — 빈 패널 대신 표가 남은 폭을 가져간다 */
  .standbody.is-duo{grid-template-columns:minmax(0,1fr) minmax(0,.92fr);}
  .standbody.is-solo{grid-template-columns:minmax(0,1fr);}

  /* 13 = 4조 × (머리 .8 + 3행) 에 여백을 얹은 값. 이 나눗셈이 A조가 안 잘리는 근거다 */
  .stwrap{--rowh:min(calc(55svh / 13),58px);display:flex;flex-direction:column;gap:clamp(7px,1.1vh,15px);}
  .gblock{border-radius:14px;overflow:hidden;background:rgba(9,17,14,.93);
    border:1px solid rgba(255,255,255,.09);box-shadow:0 16px 40px rgba(0,0,0,.42);}
  /* 표 열이 좁아졌다(1.14fr → .92fr) — 숫자 열을 깎아 팀 이름 자리를 지킨다 */
  .gbhead,.trow3{display:grid;align-items:center;
    grid-template-columns:minmax(0,1fr) 2.8em 2.8em 4em 4.2em;
    gap:clamp(6px,.7vw,14px);padding:0 clamp(12px,1.2vw,22px);}
  .gbhead{min-height:calc(var(--rowh) * .8);border-bottom:1px solid rgba(255,255,255,.09);
    background:linear-gradient(90deg,var(--c26),transparent 60%);}
  .gbname{font-size:clamp(17px,1.8vw,31px);color:var(--c);line-height:1;font-weight:900;}
  .gbsub{font-size:.4em;color:#7a8299;letter-spacing:.06em;font-weight:700;}
  .gbcol{font-size:clamp(10px,.88vw,13.5px);font-weight:800;color:#7a8299;text-align:right;}

  /* 행은 버튼이다 — 누르면 곁 패널이 그 팀 전용으로 바뀐다. 표 모양은 그대로 두고 UA 기본값만 지운다 */
  .trow3{min-height:var(--rowh);position:relative;border-top:1px solid rgba(255,255,255,.05);
    width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;
    appearance:none;background:transparent;border-left:0;border-right:0;border-bottom:0;}
  .gbhead + .trow3{border-top:none;}
  /* 8강 진출선 — 2위 아래 */
  .trow3.is-cut{border-bottom:2px dashed rgba(43,227,155,.45);}
  .trow3.is-top::before{content:"";position:absolute;left:0;top:18%;bottom:18%;width:3px;
    border-radius:99px;background:var(--c);}
  /* 고른 행 — 배경을 살짝 밝히고 조 색 막대를 끝까지 세운다(is-top 막대를 덮어쓴다) */
  .trow3.is-pick{background:rgba(255,255,255,.06);}
  .trow3.is-pick::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
    border-radius:0;background:var(--c);}
  .tteam{display:flex;align-items:center;gap:clamp(6px,.6vw,11px);min-width:0;}
  .trank{font-size:clamp(11px,.95vw,14px);font-weight:900;color:#7a8299;
    font-variant-numeric:tabular-nums;min-width:1.1em;}
  .tlogo{width:clamp(19px,1.7vw,28px);height:clamp(19px,1.7vw,28px);object-fit:contain;flex:0 0 auto;}
  .tname{font-size:clamp(12px,1.15vw,18px);font-weight:800;color:#fff;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  /* 진출/탈락 알약 — 확정된 것만. /jungman 표와 같은 색·크기다.
     좁은 열이라 이름이 아니라 알약이 자리를 지킨다(이름은 ellipsis로 줄어든다) */
  .tpill{flex:0 0 auto;border-radius:999px;padding:.1em .5em;font-size:.625rem;font-weight:900;line-height:1.6;}
  .tpill.is-go{color:#2BE39B;background:rgba(43,227,155,.16);}
  .tpill.is-out{color:#7a8299;background:rgba(122,130,153,.16);}
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
  /* 팀 전용 머리글 — 로고가 섞이므로 baseline이 아니라 가운데로 맞춘다 */
  .stpht.is-team{align-items:center;justify-content:flex-start;gap:clamp(6px,.7vw,10px);}
  /* 팀 패널 소제목 — 경기 결과 / 남은 경기 */
  .stpsub{padding:clamp(5px,.7vh,9px) clamp(11px,1vw,18px);border-top:1px solid rgba(255,255,255,.05);
    font-size:clamp(9px,.78vw,11.5px);font-weight:900;letter-spacing:.08em;color:#7a8299;}
  .stpht + .stpsub,.stpsub + .mrow{border-top:none;}
  /* 경우의 수 한 줄 — 팀 이름 바로 아래, 경기 목록 위 */
  .stpsc{padding:clamp(5px,.7vh,9px) clamp(11px,1vw,18px);background:rgba(155,185,240,.06);
    font-size:clamp(10px,.88vw,13px);font-weight:900;color:#e8ebf2;}

  .mrow{display:flex;align-items:center;gap:clamp(6px,.7vw,12px);
    padding:clamp(6px,.9vh,11px) clamp(11px,1vw,18px);border-top:1px solid rgba(255,255,255,.05);}
  .stpht + .mrow{border-top:none;}
  .mchip{font-size:clamp(9px,.78vw,11px);font-weight:900;border-radius:999px;padding:.22em .6em;flex:0 0 auto;}
  .mchip.is-w{background:#2BE39B;color:#04120c;}
  .mchip.is-l{background:rgba(224,87,74,.9);color:#04120c;}
  /* 예정 경기의 D-day — 승패 색(초록·빨강)과 섞이면 안 된다 */
  .mchip.is-d{background:rgba(212,169,74,.18);color:#d4a94a;}
  .mvs{font-size:clamp(10px,.85vw,12px);font-weight:900;color:#7a8299;}
  .mlogo{width:clamp(20px,1.8vw,30px);height:clamp(20px,1.8vw,30px);object-fit:contain;flex:0 0 auto;}
  .mtxt{font-size:clamp(10px,.9vw,13px);font-weight:800;color:#cfd6e6;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  /* 지금 보고 있는 팀 — 좌우 자리는 홈·원정 그대로 두고 이름만 굵게 */
  .mtxt.is-me{font-weight:900;color:#fff;}
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
    /* 조 편성 4줄은 폰 폭에서 접혀 8줄이 된다 — 자리가 없다 */
    .hd-glegs{display:none;}
    .hd-name,.hd-badge-c,.hd-badge-t{display:none;}
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
    /* 곁 패널이 없는 폭이다 — 알약은 표 안이라 폰에서도 남긴다. 대신 더 작게 */
    .tpill{font-size:.5625rem;padding:.1em .38em;}
    .tnum{font-size:12px;}
    .tlogo{width:17px;height:17px;}
  }
  /* 커버 높이에 못 들어가는 화면에서는 곁가지를 접는다 */
  /* 화면 높이로 내용을 숨기던 규칙은 걷어냈다 — .hd-scroll이 대신 스크롤한다.
     "왜 8강 줄이 사라졌지?"가 되는 데다, 모니터 크기를 영원히 쫓아다녀야 했다. */

  @media (max-width:639px){
    /* 폰은 폭이 좁아 글자가 접힌다 — 높이가 아니라 폭 때문에 줄이는 것들이다 */
    .hd-title{font-size:26px;}
    .hd-tophead{gap:8px;margin-bottom:8px;}
    .hd-prize{font-size:10.5px;}
    .hd-cal{padding:7px 8px;}
    .hd-cell{height:26px;font-size:11px;}
    .hd-fxn{font-size:14px;}
    .hd-fxlogo{width:24px;height:24px;}
  }

  @media (prefers-reduced-motion:reduce){
    /* 자동 넘김은 진행바의 animationend가 몰고 간다 — 애니메이션을 끄면 자동 넘김도 함께 멈춘다 */
    .hd-bar{animation:none;}
    .hd-track{display:none;}
    .hd-m,.hd-slide,.hd-map{transition:none;}
  }
`;

/**
 * 끝난 경기 한 줄. 전체 목록과 팀 패널이 같은 줄을 쓴다.
 * focus를 주면 그 팀 기준 승패 · 팀 이름 표시로 바뀐다(좌우는 홈·원정 자리로 고정).
 */
function MatchRow({ match, focus }: { match: JungmanStandingsMatch; focus?: string }) {
  const homeWon = match.homeSets > match.awaySets;
  const home = jungmanTeamByName(match.home);
  const away = jungmanTeamByName(match.away);
  // 칩은 보는 팀 기준. 고른 팀이 없으면 홈 기준이다
  const won = focus === match.away ? !homeWon : homeWon;
  const dim = (side: boolean) => (side ? "" : " is-lost");
  return (
    <div className="mrow">
      <span className={`mchip ${won ? "is-w" : "is-l"}`}>{won ? "승" : "패"}</span>
      {home ? (
        <Image
          src={jungmanLogoPath(home.code)}
          alt={match.home}
          width={30}
          height={30}
          className={`mlogo${dim(homeWon)}`}
        />
      ) : null}
      {focus || !home ? (
        <span className={`mtxt${focus === match.home ? " is-me" : ""}${dim(homeWon)}`}>{match.home}</span>
      ) : null}
      <span className="mscore">
        {match.homeSets} : {match.awaySets}
      </span>
      {away ? (
        <Image
          src={jungmanLogoPath(away.code)}
          alt={match.away}
          width={30}
          height={30}
          className={`mlogo${dim(!homeWon)}`}
        />
      ) : null}
      {focus || !away ? (
        <span className={`mtxt${focus === match.away ? " is-me" : ""}${dim(!homeWon)}`}>{match.away}</span>
      ) : null}
      {match.date ? (
        <span className="mdate">{focus ? formatDeckDate(match.date) : match.date.slice(5)}</span>
      ) : null}
    </div>
  );
}

/** 예정 경기 한 줄. focus를 주면 그 팀 이름을 굵게 하고 경기 시각을 덧붙인다 */
function NextRow({ match, focus }: { match: JungmanStandingsMatch; focus?: string }) {
  const home = jungmanTeamByName(match.home);
  const away = jungmanTeamByName(match.away);
  const dday = match.date ? ddayLabel(match.date) : "";
  return (
    <div className="mrow">
      {dday ? <span className="mchip is-d">{dday}</span> : null}
      {home ? (
        <Image src={jungmanLogoPath(home.code)} alt={match.home} width={30} height={30} className="mlogo" />
      ) : null}
      <span className={`mtxt${focus === match.home ? " is-me" : ""}`}>{match.home}</span>
      <span className="mvs">vs</span>
      <span className={`mtxt${focus === match.away ? " is-me" : ""}`}>{match.away}</span>
      {away ? (
        <Image src={jungmanLogoPath(away.code)} alt={match.away} width={30} height={30} className="mlogo" />
      ) : null}
      {match.date ? <span className="mdate">{formatDeckDate(match.date)}</span> : null}
      {focus && match.date ? <span className="mdate">{JUNGMAN_MATCH_TIME}</span> : null}
    </div>
  );
}

/** 시계는 구독할 대상이 없다 — 스냅샷만 필요해서 빈 구독을 준다(참조가 안 바뀌어야 재구독을 안 한다) */
const noSubscribe = () => () => {};

/**
 * 커버 달력. 경기 있는 날에 조 색 점을 찍고, 누르면(또는 마우스를 올리면) 그 경기가 커버의 주인공이 된다.
 * "오늘"은 서버 렌더에 없다 — 서버 스냅샷을 null로 두고 하이드레이션 뒤에 채운다.
 */
function CoverCalendar({
  matches,
  picked,
  canHover,
  onPick,
  onHover,
}: {
  /** 날짜가 있는 경기 전부(예정 + 치른 것) */
  matches: JungmanStandingsMatch[];
  picked: string | null;
  canHover: boolean;
  onPick: (date: string | null) => void;
  onHover: (date: string | null) => void;
}) {
  const today = useSyncExternalStore(noSubscribe, () => SEOUL_YMD.format(new Date()), () => null);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, JungmanStandingsMatch>();
    // 같은 날 여러 경기면 먼저 온 것이 그 칸을 대표한다
    for (const match of matches) if (match.date && !map.has(match.date)) map.set(match.date, match);
    return map;
  }, [matches]);

  const months = useMemo(
    () => [...new Set(matches.map((match) => (match.date ?? "").slice(0, 7)))].sort(),
    [matches]
  );

  // 처음엔 오늘이 속한 달. 경기가 없는 달이면 첫 경기가 있는 달로 떨어진다
  const month = pickedMonth ?? (today && months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0]);

  const cells = useMemo(() => {
    if (!month) return [];
    const lead = weekdayOf(`${month}-01`);
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
    ];
  }, [month]);

  if (!month) return null;

  return (
    <div className="hd-cal">
      {months.length > 1 ? (
        <div className="hd-cmt">
          {months.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === month}
              className={`hd-cmb${value === month ? " is-on" : ""}`}
              onClick={() => {
                setPickedMonth(value);
                onPick(null);
              }}
            >
              {Number(value.slice(5))}월
            </button>
          ))}
        </div>
      ) : null}

      <div className="hd-cgrid">
        {WEEKDAYS.map((day, i) => (
          <span key={day} className={`hd-cwd${i === 0 ? " is-sun" : i === 6 ? " is-sat" : ""}`}>
            {day}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;
          const match = byDate.get(date);
          const past = today !== null && date < today;
          const state = `${past ? " is-past" : ""}${date === today ? " is-today" : ""}`;
          const day = Number(date.slice(8));
          if (!match) {
            return (
              <span suppressHydrationWarning key={date} className={`hd-cell${state}`}>
                {day}
              </span>
            );
          }
          return (
            <button
              suppressHydrationWarning
              key={date}
              type="button"
              aria-label={`${date} ${match.home} 대 ${match.away}`}
              aria-pressed={picked === date}
              className={`hd-cell has-m${state}${picked === date ? " is-pick" : ""}`}
              onClick={() => onPick(picked === date ? null : date)}
              // 호버 미리보기는 마우스가 있는 기기에서만 — 터치에서는 탭 한 번에 상태가 붙어 안 풀린다
              onMouseEnter={canHover ? () => onHover(date) : undefined}
              onMouseLeave={canHover ? () => onHover(null) : undefined}
            >
              {day}
              <span className="hd-cdot" style={{ "--c": groupColor(match.group) } as CSSProperties} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HomeHeroDeck({
  // titleLines는 app/page.tsx와의 prop 계약이라 받기만 한다 — 커버 디자인에 없는 요소라 그리지 않는다
  groups = [],
  tables = [],
  scenarios,
  // 고른 팀이 있으면 아래에서 걸러 쓴다 — 원본은 커버(다가오는 경기)가 그대로 쓴다
  matches: allMatches = [],
  upcoming: allUpcoming = [],
  playerRanks: allRanks = [],
}: {
  titleLines: string[];
  /** 조 편성 — 커버 범례와 지도 하이라이트가 같은 값을 읽는다 */
  groups?: JungmanStandingsGroup[];
  /** 조별 순위표. 비면 순위 슬라이드를 아예 만들지 않는다 */
  tables?: JungmanGroupTable[];
  /** 조 이름 → 팀별 진출 경우의 수. 계산은 서버가 한다 */
  scenarios?: Map<string, JungmanScenario[]>;
  /** 최신순으로 이미 정렬된 경기. 비면 곁 패널 두 칸을 안 만든다 */
  matches?: JungmanStandingsMatch[];
  /** 가까운 날짜부터 정렬된 예정 경기. 비면 커버의 "다가오는 경기" 블록을 안 만든다 */
  upcoming?: JungmanStandingsMatch[];
  playerRanks?: JungmanPlayerRank[];
}) {
  const prize = splitPrizeDetail(JUNGMAN_PRIZE_DETAIL);
  // 결승까지 남은 날 — /jungman 커버와 같은 함수를 써야 두 화면 숫자가 안 갈라진다
  const finalDday = jungmanDaysToFinal();

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
  // 커버 달력에서 고른 날 — 누르면 고정(datePin), 마우스를 올리면 미리보기(dateHover)
  const [datePin, setDatePin] = useState<string | null>(null);
  const [dateHover, setDateHover] = useState<string | null>(null);
  // 순위표에서 고른 팀 — 누르면 고정(teamPin), 마우스를 올리면 미리보기(teamHover)
  const [teamPin, setTeamPin] = useState<string | null>(null);
  const [teamHover, setTeamHover] = useState<string | null>(null);
  const motionOff = useMedia("(prefers-reduced-motion: reduce)");
  // 터치 기기에서 mouseenter만 오고 mouseleave가 안 오면 자동 넘김이 영영 멈춘다 — 호버 있는 기기에서만 단다
  const canHover = useMedia("(hover: hover)");

  const activeTeam = teamHover ?? teamPin;
  const activeLogo = activeTeam ? jungmanTeamByName(activeTeam) : null;
  // 조별로 나뉜 경우의 수를 팀 이름 하나로 찾게 편다 — 12팀뿐이라 memo를 걸 만한 값이 아니다
  const scenarioOf = new Map<string, JungmanScenario>();
  for (const list of scenarios?.values() ?? []) for (const s of list) scenarioOf.set(s.team, s);
  // 고른 팀의 경우의 수 한 줄. 할 말이 없으면 null — 빈 줄은 안 그린다
  const activeLine = activeTeam ? scenarioLine(scenarioOf.get(activeTeam)) : null;
  const ofTeam = (match: JungmanStandingsMatch) => match.home === activeTeam || match.away === activeTeam;
  // 팀을 고르면 곁 패널 두 칸이 그 팀만 본다. 안 골랐으면 전체 그대로다
  const matches = activeTeam ? allMatches.filter(ofTeam) : allMatches;
  const upcoming = activeTeam ? allUpcoming.filter(ofTeam) : allUpcoming;
  const playerRanks = activeTeam ? allRanks.filter((rank) => rank.team === activeTeam) : allRanks;

  // 곁 패널은 각자 자기 데이터로 켜진다 — 빈 상자는 만들지 않고 표가 그만큼 넓어진다.
  // 가운데는 치른 경기가 있으면 결과, 없으면 일정 — 대회 초반에도 빈 칸이 안 남는다.
  // 팀을 고르면 경기가 0건이어도 팀 패널("경기 정보가 없습니다")을 그린다
  const hasMatches = matches.length > 0;
  const hasMid = hasMatches || upcoming.length > 0 || activeTeam !== null;
  const hasRanks = playerRanks.length > 0;
  const cols = 1 + (hasMid ? 1 : 0) + (hasRanks ? 1 : 0);

  const multi = slides.length > 1;
  const autoOn = auto && multi && !motionOff;
  const slide = slides[index] ?? slides[0];

  // 슬라이드를 넘기면 달력 선택도 푼다 — 돌아왔을 때 엉뚱한 날이 켜져 있으면 혼란스럽다
  const clearDate = () => {
    setDatePin(null);
    setDateHover(null);
  };

  // useCallback을 쓰면 React 컴파일러가 추론한 의존성과 어긋나 컴파일을 통째로 건너뛴다.
  // 어디에도 의존성 배열로 넘기지 않는 핸들러라 그냥 함수로 둔다
  const go = (next: number) => {
    setAuto(false);
    clearDate();
    // 슬라이드를 넘기면 팀 선택을 푼다 — 돌아왔을 때 이전 선택이 남아 있으면 혼란스럽다
    setTeamPin(null);
    setTeamHover(null);
    setIndex(((next % slides.length) + slides.length) % slides.length);
  };

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

  // 커버에서만 지도가 한 경기를 따라간다. 순위 슬라이드는 전체 조를 켠다.
  const onCover = slide.key === "cover" && groups.length > 0;

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

  // 커버 달력이 다루는 경기 — 날짜가 있는 것 전부(예정 + 치른 것).
  // useMemo를 걸면 기본값 []가 "나중에 바뀔 수 있는 의존성"으로 잡혀 React 컴파일러가 통째로 최적화를 건너뛴다
  const dated = [...allUpcoming, ...allMatches].filter((match) => match.date);

  // 커버의 주인공. 달력에서 고른 날 > 가장 가까운 예정 경기 > 가장 최근 치른 경기 순으로 떨어진다
  const chosenDate = dateHover ?? datePin;
  const focusMatch =
    (chosenDate ? dated.find((match) => match.date === chosenDate) : undefined) ??
    allUpcoming[0] ??
    allMatches[0] ??
    null;
  const focusColor = focusMatch ? groupColor(focusMatch.group) : GOLD;
  const focusHome = focusMatch ? jungmanTeamByName(focusMatch.home) : undefined;
  const focusAway = focusMatch ? jungmanTeamByName(focusMatch.away) : undefined;
  // 아직 안 치른 경기면 D-day, 치렀으면 점수를 앞에 붙인다
  const focusDone = focusMatch?.decided ?? false;

  // 지난 라운드는 뺀다. 결승 D-day만 lib 함수를 그대로 써서 /jungman 커버와 숫자를 맞춘다
  const milestones = useMemo(
    () =>
      JUNGMAN_MILESTONES.map((milestone) => {
        const offline = "offline" in milestone && milestone.offline;
        return {
          label: milestone.label,
          // 결승은 날짜 한 개뿐이라 상수 문구(장소) 대신 날짜를 그린다 — 나머지는 note가 이미 날짜 나열이다
          note: offline ? formatDeckDate(milestone.date) : milestone.note,
          offline,
          dday: offline ? jungmanDaysToFinal() : daysToKST(milestone.date),
        };
      }).filter((milestone) => milestone.dday >= 0),
    []
  );

  const pickDate = (date: string | null) => {
    // 달력을 누른 사람은 그 경기를 보고 있다 — 자동 넘김을 여기서 멈춘다(스쳐 지나가는 호버로는 안 끈다)
    setDatePin(date);
    setAuto(false);
  };

  // 순위표를 만지는 것도 "읽는 중"이라는 신호다 — 클릭에서만 자동 넘김을 끈다(스쳐 지나가는 호버로는 안 끈다)
  const pickTeam = (name: string) => {
    setTeamPin((current) => (current === name ? null : name));
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
          {/* 두 팀을 잇는 선은 마커보다 먼저 — 나중에 그리면 로고를 가린다 */}
          {onCover && focusHome && focusAway ? (
            <line
              className="hd-link"
              x1={focusHome.x}
              y1={focusHome.y}
              x2={focusAway.x}
              y2={focusAway.y}
              stroke={focusColor}
            />
          ) : null}
          {JUNGMAN_TEAMS.map((team) => {
            const gi = groupOf.get(team.code);
            const groupTone = gi === undefined ? GOLD : JUNGMAN_GROUP_COLORS[gi % JUNGMAN_GROUP_COLORS.length];
            // 커버는 지금 보는 경기의 두 팀만, 조 편성이 없거나 순위 슬라이드면 전체를 켠다
            const on = !onCover || team.code === focusHome?.code || team.code === focusAway?.code;
            const color = on && onCover ? focusColor : groupTone;
            const state = on ? "is-on" : "";
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
                <div className="hd-scroll">
                  {/* 모니터 높이는 제각각이라 내용을 화면에 맞춰 숨기면 끝이 없다.
                      글자 칸만 안쪽에서 스크롤시킨다 — 지도·화살표·버튼은 제자리에 남고
                      아무것도 안 사라진다. 자리가 남으면 margin-block:auto가 가운데로 보낸다. */}
                  <div className="hd-stack">
                    {/* 고정 정보(조 편성)는 바로 옆 순위 슬라이드가 순위까지 얹어 보여준다.
                        커버는 매일 뜻이 바뀌는 일정을 주인공으로 올린다 */}
                    <div className="hd-tophead">
                      <h1 className="hd-title">
                        K-<em>중만컵</em>
                      </h1>
                      {finalDday >= 0 ? (
                        <span suppressHydrationWarning className="hd-dday">
                          {finalDday > 0 ? `D-${finalDday}` : "D-DAY"}
                        </span>
                      ) : null}
                      <p className="hd-prize">
                        총 상금 <b>{JUNGMAN_PRIZE_TOTAL}</b> · {prize.win}
                        {prize.winExtra ? ` + ${prize.winExtra}` : ""}
                      </p>
                    </div>

                    {/* 경기가 하나도 없으면 달력은 빈 격자다 — 통째로 안 그린다 */}
                    {dated.length ? (
                      <CoverCalendar
                        matches={dated}
                        picked={datePin}
                        canHover={canHover}
                        onPick={pickDate}
                        onHover={setDateHover}
                      />
                    ) : null}

                    {/* 지도의 선·마커가 이 카드를 따라간다. 좌우는 홈·원정 자리로 고정한다 */}
                    {focusMatch ? (
                      <div
                        className="hd-fx"
                        style={{ "--c": focusColor, "--c14": alpha(focusColor, 0.14) } as CSSProperties}
                      >
                        <p className="hd-fxt">
                          {focusDone ? (
                            <span className="hd-fxd">
                              {focusMatch.homeSets} : {focusMatch.awaySets}
                            </span>
                          ) : focusMatch.date && ddayLabel(focusMatch.date) ? (
                            <span suppressHydrationWarning className="hd-fxd">
                              {ddayLabel(focusMatch.date)}
                            </span>
                          ) : null}
                          {focusMatch.date ? <span>{formatDeckDate(focusMatch.date)}</span> : null}
                          <span>{JUNGMAN_MATCH_TIME}</span>
                          <span className="hd-fxg">{focusMatch.group}</span>
                        </p>
                        <p className="hd-fxm">
                          {focusHome ? (
                            <Image
                              src={jungmanLogoPath(focusHome.code)}
                              alt=""
                              width={44}
                              height={44}
                              className="hd-fxlogo"
                            />
                          ) : null}
                          <span className="hd-fxn">{focusMatch.home}</span>
                          <span className="hd-fxvs">vs</span>
                          <span className="hd-fxn">{focusMatch.away}</span>
                          {focusAway ? (
                            <Image
                              src={jungmanLogoPath(focusAway.code)}
                              alt=""
                              width={44}
                              height={44}
                              className="hd-fxlogo"
                            />
                          ) : null}
                        </p>
                      </div>
                    ) : null}

                    {/* 조 편성 — 지도 색을 읽는 열쇠. 읽는 것만 하는 줄이라 버튼이 아니다 */}
                    {groups.length ? (
                      <p className="hd-glegs">
                        {groups.map((group) => (
                          <span
                            key={group.name}
                            className="hd-gleg"
                            style={{ "--c": groupColor(group.name) } as CSSProperties}
                          >
                            <b>{group.name.trim().charAt(0)}</b>
                            {group.teams.join(" · ")}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    {/* 지난 라운드가 없으면(대회 종료) 줄도 사라진다.
                        날짜 계산은 렌더 시각 기준이라 자정을 걸치면 하이드레이션 값이 다를 수 있다 */}
                    {milestones.length ? (
                      <p suppressHydrationWarning className="hd-msline">
                        {milestones.map((milestone) => (
                          <span
                            key={milestone.label}
                            className={`hd-msi${milestone.offline ? " is-final" : ""}`}
                          >
                            <b>{milestone.label}</b>
                            {milestone.note}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="hd-scroll justify-center">
                  <div className="stand">
                    <div className="sthd">
                      <h2 className="sth2">
                        K-중만컵 <em>조별 순위</em>
                      </h2>
                      <p className="stsort">
                        매치 승패 → 세트 득실 → 세트 승 → 승자승 · 점선 위쪽이 8강 진출권
                      </p>
                    </div>

                    <div className={`standbody${cols === 1 ? " is-solo" : cols === 2 ? " is-duo" : ""}`}>
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
                                // 확정된 것만 알약이 된다 — 미확정에 뭘 붙이면 글자만 는다
                                const s = scenarioOf.get(row.team);
                                const pill = s?.clinched ? "진출" : s?.eliminated ? "탈락" : "";
                                return (
                                  <button
                                    key={row.team}
                                    type="button"
                                    // 마지막 행이 2위면 진출선을 안 긋는다 — 표 바닥에 점선만 남는다
                                    className={`trow3${ri < 2 ? " is-top" : ""}${
                                      ri === 1 && ri < table.rows.length - 1 ? " is-cut" : ""
                                    }${activeTeam === row.team ? " is-pick" : ""}`}
                                    aria-pressed={teamPin === row.team}
                                    // aria-label이 행 내용을 통째로 가린다 — 알약도 여기에 실어야 읽힌다
                                    aria-label={`${row.team} 경기 보기${pill ? ` · ${pill} 확정` : ""}`}
                                    onClick={() => pickTeam(row.team)}
                                    // 호버 미리보기는 마우스가 있는 기기에서만 — 터치에서는 탭 한 번에 상태가 붙어 안 풀린다
                                    onMouseEnter={canHover ? () => setTeamHover(row.team) : undefined}
                                    onMouseLeave={canHover ? () => setTeamHover(null) : undefined}
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
                                      {pill ? (
                                        <span className={`tpill ${s?.clinched ? "is-go" : "is-out"}`}>
                                          {pill}
                                        </span>
                                      ) : null}
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
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>

                      {/* 가운데 — 고른 팀이 있으면 그 팀 전용, 없으면 치른 경기가 있으면 결과, 그것도 없으면 일정 */}
                      {activeTeam ? (
                        <div className="stpanel">
                          <p className="stpht is-team">
                            {activeLogo ? (
                              <Image
                                src={jungmanLogoPath(activeLogo.code)}
                                alt=""
                                width={30}
                                height={30}
                                className="mlogo"
                              />
                            ) : null}
                            {activeTeam}
                          </p>
                          {/* 경우의 수 한 줄 — 문구는 /jungman과 같다 */}
                          {activeLine ? <p className="stpsc">{activeLine}</p> : null}
                          {/* 화면 높이를 넘기면 안 된다 — 위아래 각각 4경기까지만 */}
                          {hasMatches ? <p className="stpsub">경기 결과</p> : null}
                          {matches.slice(0, 4).map((match, mi) => (
                            <MatchRow
                              key={`${match.date ?? ""}-${match.home}-${match.away}-${mi}`}
                              match={match}
                              focus={activeTeam}
                            />
                          ))}
                          {upcoming.length ? <p className="stpsub">남은 경기</p> : null}
                          {upcoming.slice(0, 4).map((match, mi) => (
                            <NextRow
                              key={`${match.date ?? ""}-${match.home}-${match.away}-${mi}`}
                              match={match}
                              focus={activeTeam}
                            />
                          ))}
                          {!hasMatches && !upcoming.length ? (
                            <p className="stpsub">경기 정보가 없습니다</p>
                          ) : null}
                        </div>
                      ) : hasMatches ? (
                        <div className="stpanel">
                          <p className="stpht">경기 결과</p>
                          {matches.slice(0, 5).map((match, mi) => (
                            <MatchRow key={`${match.date ?? ""}-${match.home}-${match.away}-${mi}`} match={match} />
                          ))}
                        </div>
                      ) : upcoming.length ? (
                        <div className="stpanel">
                          <p className="stpht">다가오는 경기</p>
                          {upcoming.slice(0, 5).map((match, mi) => (
                            <NextRow key={`${match.date ?? ""}-${match.home}-${match.away}-${mi}`} match={match} />
                          ))}
                        </div>
                      ) : null}

                      {hasRanks ? (
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
            onAnimationEnd={() => {
              // 자동 넘김도 넘김이다 — 선택을 들고 넘어가지 않는다
              clearDate();
              setTeamPin(null);
              setTeamHover(null);
              setIndex((i) => (i + 1) % slides.length);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
