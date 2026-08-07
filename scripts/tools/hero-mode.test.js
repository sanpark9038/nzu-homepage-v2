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
  // scale이 있어도 되는 곳은 누른 순간(:active) 셋뿐이다 — 표를 scale로 줄이면 A조가 잘린다
  const scales = deck.match(/[^\n]*transform:scale\([^\n]*/g) ?? [];
  assert.equal(scales.length, 3, "scale은 :active 셋뿐");
  for (const line of scales) assert.match(line, /:active\{/, line.trim());
  // 곁 패널은 각자 자기 데이터로 켜진다 — 하나에 매달아두면 한쪽이 없을 때 둘 다 사라진다
  assert.match(deck, /hasMatches = matches\.length > 0/);
  assert.match(deck, /const hasRanks = playerRanks\.length > 0/);
  // 치른 경기가 0건이어도 일정이 있으면 가운데 칸을 그린다
  assert.match(deck, /\) : upcoming\.length \? \([\s\S]{0,200}stpht">다가오는 경기/);
  // 오른쪽 칸은 개인 순위가 있을 때만 — hasMatches에 매달면 안 된다
  assert.match(deck, /\{hasRanks \? \([\s\S]{0,200}개인 순위/);
  // 열은 언제나 3열이다 — 곁 패널 유무로 표 폭이 튀면 읽는 눈이 흔들린다.
  // 칸 수로 열을 바꾸던 cols·is-duo·is-solo는 통째로 걷어냈다(안 쓰는 코드를 남기지 않는다)
  assert.match(deck, /<div className="standbody">/);
  assert.doesNotMatch(deck, /is-duo|is-solo|const cols =/);
  // 칸이 없으면 빈 자리표시자가 그 열을 지킨다 — 가운데 · 오른쪽 두 곳
  assert.equal((deck.match(/<div className="stgap" \/>/g) ?? []).length, 2, "자리표시자 두 곳");
  // 폰은 1열이라(.stpanel이 숨는다) 자리표시자도 숨긴다 — 안 그러면 빈 행 간격만 먹는다
  assert.match(deck, /\.stgap\{display:none;\}/);
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
  // 가운데 칸: 고른 팀이 있으면 팀 패널(경기가 0건이어도), 없으면 기존 전체 목록으로 떨어진다
  assert.match(deck, /\{activeTeam \? \([\s\S]{0,300}stpht is-team/);
  assert.match(deck, /stpsub">경기 결과/);
  assert.match(deck, /stpsub">남은 경기/);
  assert.match(deck, /경기 정보가 없습니다/);
  assert.match(deck, /\) : hasMatches \? \([\s\S]{0,200}stpht">경기 결과/);
  // 100svh 안에 들어가야 한다 — 위아래 각각 4경기까지
  assert.match(deck, /matches\.slice\(0, 4\)/);
  assert.match(deck, /upcoming\.slice\(0, 4\)/);
  // 경기 줄은 한 벌뿐이다 — 팀 패널과 전체 목록이 같은 컴포넌트를 쓴다
  assert.match(deck, /function MatchRow\(\{\s*match,\s*focus,/);
  assert.match(deck, /function NextRow\(\{ match, focus \}/);
});

test("경기 줄을 누르면 세트별 대진이 펼쳐진다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");

  // 세트가 있는 경기만 눌린다 — 없으면 예전처럼 그냥 <div> 한 줄
  assert.match(deck, /const sets = match\.sets \?\? \[\]/);
  assert.match(deck, /sets\.length && onToggle \? \(/);
  assert.match(deck, /<button type="button" className="mrow" aria-expanded=\{open\}/);
  assert.match(deck, /<div className="mrow">\{line\}<\/div>/);

  // 좌우는 홈·원정 자리로 고정하고 가운데가 맵 — 이긴 선수를 왼쪽으로 몰면 소속이 안 보인다
  assert.match(
    deck,
    /\{set\.home\}<\/span>[\s\S]{0,120}\{set\.map\}<\/span>[\s\S]{0,120}\{set\.away\}<\/span>/
  );
  // 이긴 쪽은 밝게, 진 쪽은 흐리게. 진행 중(null)이면 양쪽 다 보통
  assert.match(deck, /winner === null \? "" : winner === side \? " is-win" : " is-lost"/);
  assert.match(deck, /\.sname\.is-win\{font-weight:900;color:#fff;\}/);
  // 한 줄은 번호 · 홈 · 맵 · 원정 네 칸뿐이다 — 종족 배지 자리는 없다(선수 DB를 안 읽는다)
  assert.match(deck, /\.srow\{display:grid;grid-template-columns:1\.5em minmax\(0,1fr\) minmax\(0,\.92fr\) minmax\(0,1fr\)/);

  // 자르지 마라 — 5개만 보여줬더니 5:3 경기가 5:0처럼 읽혔다. 세트 수와 점수는 맞아야 한다
  assert.doesNotMatch(deck, /sets\.slice\(/);
  // 그래도 넘치면 그 패널만 안쪽에서 스크롤한다 — 100svh를 넘기면 안 된다
  assert.match(deck, /\.stpanel\{[^}]*overflow:hidden auto/);

  // 세트를 펼치는 것도 "읽는 중"이라는 신호다 — 자동 넘김을 끈다
  assert.match(deck, /const toggleSet = \(key: string\) => \{[\s\S]{0,200}?setAuto\(false\);/);
  assert.match(deck, /current === key \? null : key/);
  // 팀이 바뀌면 저절로 닫히도록 고른 팀을 키에 섞는다
  assert.match(deck, /`\$\{activeTeam \?\? ""\}\|/);
  // 슬라이드를 넘기면 닫는다 — 직접 넘김(go)과 자동 넘김(진행바) 두 경로 모두
  assert.equal((deck.match(/setOpenSet\(null\);/g) ?? []).length, 2, "넘김 경로 두 곳에서 닫는다");
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

test("순위 슬라이드 열 비율은 목업 v5를 따른다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // v5는 1.14/.82/.78로 표가 제일 넓었다. .92까지 줄였더니 팀 이름이 잘려 되돌렸고
  // 오른쪽(개인 순위)만 조금 넓혔다 — 표는 이름이 안 잘리는 게 우선이다
  assert.match(
    deck,
    /grid-template-columns:minmax\(0,1\.12fr\) minmax\(0,\.82fr\) minmax\(0,\.84fr\)/
  );
  // 숫자 열은 내용 폭까지만 — 남는 자리는 팀 이름이 쓴다("경우의 수" 알약이 붙어 더 좁아졌다).
  // "세트 득실"은 머리글이 길어 4.4em 그대로다 — 줄이면 두 줄로 접혀 --rowh 계산이 깨진다
  assert.match(deck, /grid-template-columns:minmax\(0,1fr\) 2\.4em 2\.4em 4\.4em 3em/);
  // 팀 이름은 잘려도 되게(ellipsis) 두되 알약이 이름을 밀어내면 안 된다
  assert.match(deck, /\.tname\{font-size:clamp\(13\.5px/);
  assert.match(deck, /\.tpill\{[^}]*flex:0 0 auto/);
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

  // 알약 문구는 lib 한 곳에서만 온다 — 확정도 탈락도 아니면 "경우의 수"가 눌러보라고 알린다
  assert.match(deck, /const pill = s \? jungmanScenarioBadge\(s\) : ""/);
  assert.match(deck, /const tone = s\?\.clinched \? "is-go" : s\?\.eliminated \? "is-out" : "is-open"/);
  // aria-label이 행 내용을 통째로 가린다 — 알약도 여기에 실려야 읽힌다
  assert.match(deck, /aria-label=\{`\$\{row\.team\} 경기 보기\$\{pill \? ` · \$\{pill\}` : ""\}`\}/);
  // 곁 패널 한 줄은 할 말이 있을 때만
  assert.match(deck, /\{activeLine \? <p className="stpsc">\{activeLine\}<\/p> : null\}/);
  assert.match(deck, /const activeLine = activeScenario \? jungmanScenarioLine\(activeScenario\) : null/);

  // 문구를 두 화면이 각자 적으면 조용히 어긋난다 — 둘 다 lib 함수만 부른다
  for (const source of [deck, groupTables]) {
    assert.match(source, /jungmanScenarioBadge/);
    assert.match(source, /jungmanScenarioLine/);
    assert.doesNotMatch(source, /이기면 진출|지면 탈락|"진출 확정"|"경우의 수"/);
  }

  // 폰에서는 곁 패널(.stpanel)이 없다 — 알약은 표 안이라 폰에서도 살아 있어야 한다
  assert.doesNotMatch(deck, /\.tpill\{[^}]*display:none/);
  assert.match(deck, /\.tpill\.is-go\{color:#2BE39B/);
  assert.match(deck, /\.tpill\.is-out\{color:#7a8299/);
  assert.match(deck, /\.tpill\.is-open\{color:#d4a94a/);
  // 좁은 열이다 — 알약이 팀 이름을 밀어내면 안 된다. "경우의 수"는 "진출"보다 기니 더 작게 그린다
  assert.match(deck, /\.tpill\{flex:0 0 auto/);
  assert.match(deck, /\.tpill\{[^}]*font-size:\.5625rem/);
  assert.match(deck, /\.tpill\{[^}]*white-space:nowrap/);
});

test("눌리는 것은 눌린 티가 난다 — reduced-motion에서는 움직이지 않는다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  // 순위표 행 · 경기 줄(세트 펼침) · 달력 칸 — 눌리는 곳 셋 다
  assert.match(deck, /\.trow3:active\{background:rgba\(255,255,255,\.12\);transform:scale\(\.985\);\}/);
  assert.match(deck, /button\.mrow:active\{background:rgba\(255,255,255,\.12\);transform:scale\(\.985\);\}/);
  assert.match(deck, /\.hd-cell\.has-m:active\{background:rgba\(255,255,255,\.14\);transform:scale\(\.985\);\}/);
  // 고른 행(is-pick)보다 뒤에 와야 이미 고른 행에서도 배경이 바뀐다
  assert.ok(deck.indexOf(".trow3.is-pick{") < deck.indexOf(".trow3:active{"), "is-pick 뒤에 온다");
  // 짧게 — 눌렸다는 걸 알 정도면 충분하다
  assert.match(deck, /\.trow3\{[^}]*transition:background \.12s ease,transform \.12s ease/);
  // 움직임을 싫어하는 사람에게는 배경 변화만 남긴다
  assert.match(
    deck,
    /prefers-reduced-motion:reduce\)\{[\s\S]*?\.trow3:active,button\.mrow:active,\.hd-cell\.has-m:active\{transform:none;\}/
  );
  // JS로 누름 상태를 들고 있지 않다 — CSS :active 한 줄이면 된다
  assert.doesNotMatch(deck, /onPointerDown|setPressed/);
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
