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
  // 지도는 한 장만 만들고 켜지는 팀만 바꾼다. 조를 2400ms마다 돌리던 순환은 걷어냈다 —
  // 이제 지도는 조가 아니라 커버가 보고 있는 경기를 따라간다
  assert.match(deck, /JUNGMAN_TEAMS\.map/);
  assert.doesNotMatch(deck, /CYCLE_MS|setInterval/);
  // 조 범례 4줄은 순위 슬라이드의 열화판이라 뺐다
  assert.doesNotMatch(deck, /hd-aleg|hd-agrp|hd-alogo/);
  // 덱 커버에는 사이트 히어로 문구를 그리지 않는다 — 목업에 없는 요소이고,
  // 넣었더니 커버 레이아웃이 아래로 밀려 목업과 다른 화면이 됐다.
  // prop은 app/page.tsx와의 계약이라 시그니처만 남긴다(이미지·영상 모드에서는 그대로 쓴다).
  assert.match(deck, /titleLines/);
  assert.doesNotMatch(deck, /titleLines\.map/);
  // 대회 정보는 lib 상수에서만 온다 — 문구를 두 벌로 적으면 /jungman과 어긋난다
  assert.match(deck, /JUNGMAN_PRIZE_TOTAL/);
  assert.match(deck, /jungmanDaysToFinal/);
  // 경기 방식 두 줄은 자리가 없어 /jungman 커버로 옮겼다. 옮긴 곳에 있어야 하고,
  // 어느 쪽도 문구를 직접 적으면 안 된다 — 두 벌이 되면 조용히 어긋난다.
  const cover = readProjectFile("app/jungman/JungmanCover.tsx");
  assert.match(cover, /JUNGMAN_FORMAT_LINE/);
  assert.match(cover, /JUNGMAN_BRACKET_NOTE/);
  assert.doesNotMatch(deck, /9전 5선승|붙도록 추첨/);
  assert.doesNotMatch(cover, /9전 5선승|붙도록 추첨/);
  assert.match(deck, /href="\/jungman"/);

  // 순위 슬라이드 높이는 화면에서 계산한다. transform:scale()로 줄이면 레이아웃 높이가 안 줄어 A조가 잘린다
  assert.match(deck, /--rowh:min\(calc\(55svh \/ 13\),58px\)/);
  assert.doesNotMatch(deck, /transform:scale\(/);
  // 곁 패널은 각자 자기 데이터로 켜진다 — 하나에 매달아두면 한쪽이 없을 때 둘 다 사라진다
  assert.match(deck, /hasMatches = matches\.length > 0/);
  assert.match(deck, /const hasMid = hasMatches \|\| upcoming\.length > 0/);
  assert.match(deck, /const hasRanks = playerRanks\.length > 0/);
  // 치른 경기가 0건이어도 일정이 있으면 가운데 칸을 그린다
  assert.match(deck, /\) : upcoming\.length \? \([\s\S]{0,200}stpht">다가오는 경기/);
  // 오른쪽 칸은 개인 순위가 있을 때만 — hasMatches에 매달면 안 된다
  assert.match(deck, /\{hasRanks \? \([\s\S]{0,200}개인 순위/);
  // 열 수는 실제로 그리는 칸 수를 따른다 (3 · 2 · 1)
  assert.match(deck, /const cols = 1 \+ \(hasMid \? 1 : 0\) \+ \(hasRanks \? 1 : 0\)/);
  assert.match(deck, /cols === 1 \? " is-solo" : cols === 2 \? " is-duo" : ""/);
  assert.match(deck, /\.standbody\.is-solo\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(deck, /\.standbody\.is-duo\{grid-template-columns:minmax\(0,1fr\) minmax\(0,\.92fr\)/);
  // 일정 줄의 날짜·D-day는 이미 있는 헬퍼를 쓴다 — 계산이 두 벌이 되면 조용히 어긋난다
  assert.match(deck, /dday = match\.date \? ddayLabel\(match\.date\) : ""/);
  assert.match(deck, /<span className="mdate">\{formatDeckDate\(match\.date\)\}<\/span>/);
  // 좁은 화면에서는 조별 순위만 남는다
  assert.match(deck, /\.stpanel\{display:none;\}/);
});

test("순위표 팀 행을 고르면 곁 패널이 그 팀으로 바뀐다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");

  // 행은 버튼이다 — div로 두면 키보드로 고를 수 없다
  assert.match(deck, /<button\s+key=\{row\.team\}\s+type="button"/);
  assert.doesNotMatch(deck, /<div\s+key=\{row\.team\}/);
  assert.match(deck, /aria-pressed=\{teamPin === row\.team\}/);

  // 호버 미리보기는 마우스가 있는 기기에서만 — 터치에서 달면 탭 한 번에 붙어 안 풀린다
  assert.match(deck, /canHover = useMedia\("\(hover: hover\)"\)/);
  assert.match(deck, /onMouseEnter=\{canHover \? \(\) => setTeamHover\(row\.team\) : undefined\}/);
  assert.match(deck, /onMouseLeave=\{canHover \? \(\) => setTeamHover\(null\) : undefined\}/);

  // 순위표를 만지는 것도 "읽는 중"이라는 신호다 — 클릭에서만 자동 넘김을 끈다
  assert.match(deck, /onClick=\{\(\) => pickTeam\(row\.team\)\}/);
  assert.match(deck, /const pickTeam = \(name: string\) => \{[\s\S]{0,200}?setAuto\(false\);/);

  // 슬라이드를 넘기면 선택이 풀린다 — 직접 넘김(go)과 자동 넘김(진행바) 두 경로 모두
  const cleared = deck.match(/setTeamPin\(null\);\s+setTeamHover\(null\);\s+setIndex\(/g) ?? [];
  assert.equal(cleared.length, 2, "넘김 경로 두 곳에서 선택을 푼다");

  // 미리보기(호버) > 고정(클릭) 순서. 곁 패널 데이터는 고른 팀으로 걸러진 것을 쓴다
  assert.match(deck, /const activeTeam = teamHover \?\? teamPin/);
  assert.match(deck, /const matches = activeTeam \? allMatches\.filter\(ofTeam\) : allMatches/);
  assert.match(deck, /const upcoming = activeTeam \? allUpcoming\.filter\(ofTeam\) : allUpcoming/);
  // 오른쪽 칸은 그 팀 선수만 — 0명이면 hasRanks가 꺼져 칸도 열도 사라진다
  assert.match(
    deck,
    /const playerRanks = activeTeam \? allRanks\.filter\(\(rank\) => rank\.team === activeTeam\) : allRanks/
  );
  // 팀을 골랐는데 경기가 0건이어도 가운데 칸은 남는다
  assert.match(deck, /\|\| activeTeam !== null/);

  // 가운데 칸: 고른 팀이 있으면 팀 패널, 없으면 기존 전체 목록으로 떨어진다
  assert.match(deck, /\{activeTeam \? \([\s\S]{0,300}stpht is-team/);
  assert.match(deck, /stpsub">경기 결과/);
  assert.match(deck, /stpsub">남은 경기/);
  assert.match(deck, /경기 정보가 없습니다/);
  assert.match(deck, /\) : hasMatches \? \([\s\S]{0,200}stpht">경기 결과/);
  // 100svh 안에 들어가야 한다 — 위아래 각각 4경기까지
  assert.match(deck, /matches\.slice\(0, 4\)/);
  assert.match(deck, /upcoming\.slice\(0, 4\)/);
  // 경기 줄은 한 벌뿐이다 — 팀 패널과 전체 목록이 같은 컴포넌트를 쓴다
  assert.match(deck, /function MatchRow\(\{ match, focus \}/);
  assert.match(deck, /function NextRow\(\{ match, focus \}/);
});

test("커버가 일정 달력과 라운드 일정을 그린다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // 예정 경기는 덱이 계산하지 않는다 — 데이터로 받는다
  assert.match(deck, /upcoming\?: JungmanStandingsMatch\[\]/);
  // 달력은 예정 + 치른 경기를 함께 본다 — 예정만 넘기면 8월의 리듬이 반쪽이 된다
  assert.match(deck, /const dated = \[\.\.\.allUpcoming, \.\.\.allMatches\]\.filter\(\(match\) => match\.date\)/);
  // 경기가 하나도 없으면 빈 격자를 안 그린다
  assert.match(deck, /\{dated\.length \? \([\s\S]{0,120}<CoverCalendar/);
  // 라운드 일정 문구·날짜는 lib 상수에서만 온다
  assert.match(deck, /JUNGMAN_MILESTONES/);
  assert.match(deck, /JUNGMAN_MATCH_TIME/);
  // 결승 D-day는 /jungman 커버와 같은 함수를 쓴다 — 두 화면 숫자가 갈라지면 안 된다
  assert.match(deck, /offline \? jungmanDaysToFinal\(\) : daysToKST/);
  // 지난 라운드는 안 그린다
  assert.match(deck, /filter\(\(milestone\) => milestone\.dday >= 0\)/);
  // 라운드 일정은 한 줄이다 — 3줄짜리 블록(.hd-ms*)은 걷어냈다
  assert.match(deck, /\.hd-msline\{[^}]*display:flex;flex-wrap:wrap/);
  assert.doesNotMatch(deck, /hd-msr|hd-msd|hd-gf-chip/);
  // 덱은 자기 높이를 만들지 않는다 — 높이는 app/page.tsx의 히어로 섹션이 정한다
  assert.doesNotMatch(deck, /100vh|100svh|h-screen/);
});

test("커버 달력이 일정을 고르고 지도가 그 경기를 따라간다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");

  // 7열 격자 · 일요일 시작
  assert.match(deck, /\.hd-cgrid\{display:grid;grid-template-columns:repeat\(7,1fr\)/);
  assert.match(deck, /const WEEKDAYS = \["일", "월", "화", "수", "목", "금", "토"\]/);
  // 날짜 계산은 문자열과 Intl(Asia/Seoul)로만 — UTC 게터를 쓰면 칸이 하루씩 밀린다
  assert.match(deck, /timeZone: "Asia\/Seoul"/);
  assert.doesNotMatch(deck, /getUTC|getMonth\(\)|getDate\(\)|getDay\(\)/);
  // "오늘"은 서버 렌더에 없다 — 서버 스냅샷 null. useState+useEffect면 하이드레이션 불일치를 스스로 만든다
  assert.match(deck, /\(\) => SEOUL_YMD\.format\(new Date\(\)\),\s*\(\) => null/);
  assert.doesNotMatch(deck, /useEffect\(/);
  // 오늘 칸은 테두리, 지난 날짜는 흐리게
  assert.match(deck, /\.hd-cell\.is-today\{border-color/);
  assert.match(deck, /\.hd-cell\.is-past\{opacity:\.45;\}/);

  // 누르면 고정(자동 넘김도 끈다), 마우스가 있는 기기에서만 호버 미리보기
  assert.match(deck, /const pickDate = \(date: string \| null\) => \{[\s\S]{0,200}?setAuto\(false\);/);
  assert.match(deck, /const chosenDate = dateHover \?\? datePin/);
  assert.match(deck, /onMouseEnter=\{canHover \? \(\) => onHover\(date\) : undefined\}/);
  // 슬라이드를 넘기면 달력 선택도 푼다 — 직접 넘김(go)과 자동 넘김(진행바) 두 경로 모두
  assert.equal((deck.match(/\bclearDate\(\);/g) ?? []).length, 2, "넘김 경로 두 곳에서 날짜를 푼다");

  // focus는 고른 날 > 가장 가까운 예정 > 가장 최근 결과 순으로 떨어진다
  assert.match(deck, /allUpcoming\[0\] \?\?\s*allMatches\[0\] \?\?\s*null/);

  // 지도는 그 경기의 두 팀만 켜고 둘을 선으로 잇는다. 선은 마커보다 먼저 그려야 로고를 안 가린다
  assert.match(deck, /<line\s+className="hd-link"[\s\S]{0,200}stroke=\{focusColor\}/);
  assert.match(deck, /<line[\s\S]*?JUNGMAN_TEAMS\.map/);
  assert.match(deck, /const on = !onCover \|\| team\.code === focusHome\?\.code \|\| team\.code === focusAway\?\.code/);
  // 순위 슬라이드는 그대로 전체 조를 켠다(onCover가 false)
  assert.match(deck, /const onCover = slide\.key === "cover" && groups\.length > 0/);
});

test("커버 달력이 커지고, 조 편성 4줄이 읽기 전용으로 돌아왔다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");

  // 달력이 커버의 빈자리를 채운다 — 칸·날짜·점이 함께 커진다
  assert.match(deck, /\.hd-cell\{height:clamp\(34px,4\.6vh,52px\)/);
  assert.match(deck, /\.hd-cell\{[^}]*font-size:clamp\(13px,1\.15vw,16px\)/);
  assert.match(deck, /\.hd-cdot\{width:7px;height:7px/);
  assert.match(deck, /\.hd-cwd\{font-size:clamp\(10px,\.9vw,12\.5px\)/);

  // 조 편성 4줄 — 지도 색을 읽는 열쇠. 세로로 한 줄씩, 조 글자만 조 색
  assert.match(deck, /\.hd-glegs\{[^}]*flex-direction:column/);
  assert.match(deck, /\.hd-gleg b\{color:var\(--c\)/);
  assert.match(deck, /className="hd-glegs"/);
  assert.match(deck, /groups\.map\(\(group\) => \(/);
  // 눈에 띄면 안 된다 — 담백한 크기·회색 팀 이름
  assert.match(deck, /\.hd-glegs\{[^}]*font-size:clamp\(10px,\.85vw,12\.5px\);font-weight:700;color:#7a8299/);
  // 좁은 화면에서는 접힌다 — 4줄이 8줄이 되면 커버가 넘친다
  assert.match(deck, /\.hd-glegs\{display:none;\}/);

  // 누를 수 없다 — 상호작용을 되살리면 "지도는 달력이 고른 일정을 따라간다" 규칙과 충돌한다
  const legend = deck.slice(deck.indexOf('className="hd-glegs"'), deck.indexOf('className="hd-msline"'));
  assert.ok(legend.length > 0, "조 편성 줄은 마일스톤 줄보다 앞에 있다");
  assert.doesNotMatch(legend, /<button|onClick|onMouseEnter|aria-pressed/);
});

test("순위 슬라이드는 개인 순위 칸을 넓게 준다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // 왼쪽 조별 표를 줄이고 오른쪽 개인 순위를 넓혔다
  assert.match(
    deck,
    /grid-template-columns:minmax\(0,\.92fr\) minmax\(0,\.86fr\) minmax\(0,\.92fr\)/
  );
  // 표가 좁아진 만큼 숫자 열을 깎아 팀 이름이 안 잘리게 한다
  assert.match(deck, /grid-template-columns:minmax\(0,1fr\) 2\.8em 2\.8em 4em 4\.2em/);
});

test("순위 슬라이드가 진출 경우의 수를 함께 보여준다", () => {
  const page = readProjectFile("app/page.tsx");
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  const groupTables = readProjectFile("app/jungman/JungmanGroupTables.tsx");

  // 계산은 서버가 한다. jungmanStandings가 덱 모드에서만 채워지므로(위 테스트) 계산도 덱 모드에서만 돈다 —
  // 이미지·영상 모드가 조당 최대 1,000가지 전수 조사를 돌면 안 된다
  assert.match(page, /jungmanStandings\s*\?\s*buildJungmanScenarios\(jungmanStandings\)/);
  assert.match(page, /scenarios=\{jungmanScenarios\}/);
  assert.match(deck, /scenarios\?: Map<string, JungmanScenario\[\]>/);
  // 덱은 계산하지 않는다 — 클라이언트에서 전수 조사를 다시 돌리면 안 된다
  assert.doesNotMatch(deck, /buildJungmanScenarios/);

  // 알약은 확정된 것만. 미확정에 뭘 붙이면 한 화면에 글자만 는다
  assert.match(deck, /const pill = s\?\.clinched \? "진출" : s\?\.eliminated \? "탈락" : ""/);
  // aria-label이 행 내용을 통째로 가린다 — 알약도 여기에 실려야 읽힌다
  assert.match(deck, /aria-label=\{`\$\{row\.team\} 경기 보기\$\{pill \? ` · \$\{pill\} 확정` : ""\}`\}/);
  // 곁 패널 한 줄은 할 말이 있을 때만
  assert.match(deck, /\{activeLine \? <p className="stpsc">\{activeLine\}<\/p> : null\}/);
  assert.match(deck, /const activeLine = activeTeam \? scenarioLine\(scenarioOf\.get\(activeTeam\)\) : null/);

  // 문구는 /jungman과 한 글자도 달라선 안 된다 — 두 벌이 되면 조용히 어긋난다
  for (const line of [
    "8강 진출 확정",
    "탈락 확정",
    "다음 경기에서 이기면 진출, 지면 탈락",
    "다음 경기를 이기면 진출 확정",
    "다음 경기를 지면 탈락",
  ]) {
    assert.ok(deck.includes(line), `덱에 없음: ${line}`);
    assert.ok(groupTables.includes(line), `/jungman에 없음: ${line}`);
  }

  // 폰에서는 곁 패널(.stpanel)이 없다 — 알약은 표 안이라 폰에서도 살아 있어야 한다
  assert.doesNotMatch(deck, /\.tpill\{[^}]*display:none/);
  assert.match(deck, /\.tpill\.is-go\{color:#2BE39B/);
  assert.match(deck, /\.tpill\.is-out\{color:#7a8299/);
  // 좁은 열이다 — 알약이 팀 이름을 밀어내면 안 된다
  assert.match(deck, /\.tpill\{flex:0 0 auto/);
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
