const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** 프로젝트 TS를 그대로 트랜스파일해 실제 로직을 돌린다 (jungman-standings.test.js와 같은 방식). */
function loadModule(relativePath, resolve = () => ({})) {
  const compiled = ts.transpileModule(readProjectFile(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, resolve);
  return mod.exports;
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

const { sanitizeHeroMode } = loadModule("lib/hero-media.ts");

test("셋 중 하나만 통과하고 나머지는 null(= 설정된 적 없음)", () => {
  for (const value of ["image", "video", "deck"]) {
    assert.equal(sanitizeHeroMode(value), value);
  }
  // 앞뒤 공백은 손편집 흔적이라 봐준다
  assert.equal(sanitizeHeroMode("  deck  "), "deck");

  // 대문자는 통과시키지 않는다 — 쓰는 곳이 관리자 API 하나뿐이라 관용이 필요 없고,
  // 모르는 값이면 기존 동작(켜둔 미디어)으로 떨어지는 쪽이 안전하다
  for (const value of ["", "   ", "IMAGE", "Deck", "media", "none", null, undefined, 0, 1, {}, ["deck"]]) {
    assert.equal(sanitizeHeroMode(value), null, `value=${JSON.stringify(value)}`);
  }
});

test("홈이 세 갈래를 다 갖는다", () => {
  const page = readProjectFile("app/page.tsx");
  assert.match(page, /import HomeHeroDeck from "@\/components\/home\/HomeHeroDeck"/);
  assert.match(page, /<HomeHeroDeck\b/);
  assert.match(page, /titleLines=\{heroTitleLines\}/);
  assert.match(page, /getHeroMode\(\)/);
  // 미디어 조회는 그대로 살아 있어야 한다
  assert.match(page, /getActiveHeroMedia\(/);
  // 키가 없으면(null) 인자 없이 = 예전 질의 그대로
  assert.match(page, /getActiveHeroMedia\(heroMode \?\? undefined\)/);
});

test("기존 이미지·영상 경로가 그대로 남아 있다", () => {
  const page = readProjectFile("app/page.tsx");
  assert.match(page, /<video/);
  assert.match(page, /<Image/);
  assert.match(page, /sanitizeHeroMediaType\(/);
  // 문구 애니메이션은 두 화면이 같이 쓴다 — 공용 <style>이 사라지면 덱도 같이 죽는다
  assert.match(page, /@keyframes heroTitleLift/);
});

test("덱 모드에서만 조별 순위를 읽고, 실패는 홈을 죽이지 않는다", () => {
  const page = readProjectFile("app/page.tsx");
  // 이미지·영상 모드가 쓸데없는 DB 질의를 하면 안 된다
  assert.match(page, /heroMode === "deck" \? await loadJungmanStandings\(\) : null/);
  // getSetting은 실패 시 throw한다 — 순위 한 칸 때문에 홈 전체가 죽으면 안 된다
  assert.match(page, /async function loadJungmanStandings[\s\S]*?try \{[\s\S]*?\} catch/);
  // 덱은 노드가 아니라 데이터를 받는다 — 자기 표를 자기 높이로 그려야 100svh 안에 들어간다
  assert.match(page, /tables=\{groupTables\}/);
  assert.match(page, /matches=\{sortJungmanMatches\(jungmanStandings\?\.matches \?\? \[\]\)\}/);
  assert.match(page, /playerRanks=\{buildJungmanPlayerRanks\(jungmanStandings\?\.matches \?\? \[\]\)\}/);
  // 예정 경기도 데이터로 넘긴다 — 커버가 "다가오는 경기"를 그린다
  assert.match(page, /upcoming=\{upcomingJungmanMatches\(jungmanStandings\?\.matches \?\? \[\]\)\}/);
  // /jungman 순위표를 홈이 끌어다 쓰면 스크롤 페이지용 크기가 그대로 따라온다
  assert.doesNotMatch(page, /<JungmanGroupTables|jungman\/JungmanGroupTables/);
});

test("커버 덱은 넘어가는 슬라이드 덱이고 지도 위에 blur를 쓰지 않는다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // 전환·자동넘김을 다루므로 클라이언트 컴포넌트다
  assert.match(deck, /^"use client";/);
  assert.doesNotMatch(deck, /backdrop-blur|backdrop-filter/);

  // 슬라이드마다 머무는 시간이 다르다 (커버 / 조별 순위)
  assert.match(deck, /ms: 11500/);
  assert.match(deck, /ms: 9500/);
  // 진행바는 CSS 애니메이션이다 — width를 매 프레임 바꾸면 레이아웃이 다시 계산된다
  assert.match(deck, /@keyframes hdBar\{from\{transform:scaleX\(0\)\}/);
  assert.doesNotMatch(deck, /requestAnimationFrame/);
  assert.match(deck, /onAnimationEnd=/);
  // 한 번이라도 직접 넘기면 자동 넘김이 영구히 꺼진다
  assert.match(deck, /setAuto\(false\)/);
  // reduce 모드면 자동 넘김을 끄고 진행바를 감춘다
  assert.match(deck, /prefers-reduced-motion: reduce/);
  assert.match(deck, /prefers-reduced-motion:reduce/);
  // 넘기는 수단 셋 — 키보드 · 스와이프 · 버튼
  assert.match(deck, /ArrowLeft/);
  assert.match(deck, /changedTouches/);
  assert.match(deck, /aria-label="이전 슬라이드"/);
  assert.match(deck, /aria-label="다음 슬라이드"/);
  // 비활성 슬라이드는 읽히지도 탭되지도 않는다
  assert.match(deck, /aria-hidden=\{i !== index\}/);
  assert.match(deck, /inert=\{i !== index\}/);
  // 지도는 한 장만 만들고 켜지는 조만 바꾼다
  assert.match(deck, /CYCLE_MS = 2400/);
  assert.match(deck, /JUNGMAN_TEAMS\.map/);
  // 덱 커버에는 사이트 히어로 문구를 그리지 않는다 — 목업에 없는 요소이고,
  // 넣었더니 커버 레이아웃이 아래로 밀려 목업과 다른 화면이 됐다.
  // prop은 app/page.tsx와의 계약이라 시그니처만 남긴다(이미지·영상 모드에서는 그대로 쓴다).
  assert.match(deck, /titleLines/);
  assert.doesNotMatch(deck, /titleLines\.map/);
  // 대회 정보는 lib 상수에서만 온다 — 문구를 두 벌로 적으면 /jungman과 어긋난다
  assert.match(deck, /JUNGMAN_FORMAT_LINE/);
  assert.match(deck, /JUNGMAN_PRIZE_TOTAL/);
  assert.match(deck, /jungmanDaysToFinal/);
  assert.match(deck, /href="\/jungman"/);

  // 순위 슬라이드 높이는 화면에서 계산한다. transform:scale()로 줄이면 레이아웃 높이가 안 줄어 A조가 잘린다
  assert.match(deck, /--rowh:min\(calc\(55svh \/ 13\),58px\)/);
  assert.doesNotMatch(deck, /transform:scale\(/);
  // 경기가 0건이면 곁 패널을 만들지 않고 표가 전체 폭을 쓴다
  assert.match(deck, /hasMatches = matches\.length > 0/);
  assert.match(deck, /\.standbody\.is-solo\{grid-template-columns:minmax\(0,1fr\)/);
  // 좁은 화면에서는 조별 순위만 남는다
  assert.match(deck, /\.stpanel\{display:none;\}/);
});

test("커버가 다가오는 경기와 라운드 일정을 그린다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // 예정 경기는 덱이 계산하지 않는다 — 데이터로 받는다
  assert.match(deck, /upcoming\?: JungmanStandingsMatch\[\]/);
  // 커버는 코앞 두 경기만 — 전체 일정은 /jungman이 그린다
  assert.match(deck, /upcoming\.slice\(0, 2\)/);
  // 예정 경기가 0건이면 블록을 통째로 안 그린다
  assert.match(deck, /nextMatches\.length \?/);
  // 라운드 일정 문구·날짜는 lib 상수에서만 온다
  assert.match(deck, /JUNGMAN_MILESTONES/);
  assert.match(deck, /JUNGMAN_MATCH_TIME/);
  // 결승 D-day는 /jungman 커버와 같은 함수를 쓴다 — 두 화면 숫자가 갈라지면 안 된다
  assert.match(deck, /offline \? jungmanDaysToFinal\(\) : daysToKST/);
  // 지난 라운드는 안 그린다
  assert.match(deck, /filter\(\(milestone\) => milestone\.dday >= 0\)/);
  // 좁은 화면에서는 결승 한 줄만 남긴다
  assert.match(deck, /\.hd-msr:not\(\.is-final\)\{display:none;\}/);
  // 덱은 자기 높이를 만들지 않는다 — 높이는 app/page.tsx의 히어로 섹션이 정한다
  assert.doesNotMatch(deck, /100vh|100svh|h-screen/);
});

test("커버 문구는 /jungman과 홈이 같은 상수를 쓴다", () => {
  const lib = readProjectFile("lib/jungman.ts");
  assert.match(lib, /JUNGMAN_FINAL_DATE = "2026-09-19"/);
  assert.match(lib, /export function jungmanDaysToFinal\(\): number/);

  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  assert.match(cover, /from "@\/lib\/jungman"/);
  // 계산·문구가 커버 안에 다시 생기면 두 화면이 갈라진다
  assert.doesNotMatch(cover, /const FINAL_DATE/);
  assert.doesNotMatch(cover, /3,500만원/);
});

test("관리자 API가 hero_mode를 저장한다", () => {
  const route = readProjectFile("app/api/admin/hero-media/route.ts");
  assert.ok(route.includes('"set-mode"'));
  assert.match(route, /key: "hero_mode"/);
  assert.match(route, /sanitizeHeroMode/);
  // 잘못된 값은 400, 테이블이 없으면 안내 (set-title과 같은 처리)
  assert.match(route, /status: 400/);
  assert.match(route, /PGRST205/);
  // 저장 뒤 홈 캐시 무효화 — 안 하면 60초 동안 옛 화면이 남는다
  assert.match(route, /revalidatePath\("\/"\)/);

  const admin = readProjectFile("app/admin/hero-media/HeroMediaAdmin.tsx");
  assert.match(admin, /action: "set-mode"/);
  assert.match(admin, /type="radio"/);
  // 설정 전에는 아무것도 선택되지 않은 상태여야 한다
  assert.match(admin, /initialMode = null/);
  assert.match(admin, /설정하지 않음/);
});

process.exitCode = failed ? 1 : 0;
