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

// lib/asl.ts는 날짜를 lib/jungman.ts의 ASL_SCHEDULE에서 가져온다 — 진짜 모듈을 물려준다.
// 스텁 빈 객체를 넘기면 ASL_SCHEDULE이 undefined라 "라벨 일치" 검증이 통째로 무의미해진다.
const jungman = loadModule("lib/jungman.ts");
const asl = loadModule("lib/asl.ts", (id) => (id === "./jungman" ? jungman : {}));

const {
  ASL_DRAW_DATE,
  ASL_GROUPS,
  ASL_MAPS,
  ASL_OPENING_DATE,
  ASL_RO24_STAGES,
  ASL_ROUNDS,
  ASL_SEEDS,
  ASL_STATION_URL,
  aslGroupByLabel,
  aslNextBroadcast,
  aslScheduleDate,
  formatAslDate,
} = asl;
const { ASL_SCHEDULE } = jungman;

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

test("24강은 6개 조 × 4명 = 24명이고 이름이 겹치지 않는다", () => {
  assert.equal(ASL_GROUPS.length, 6);
  assert.deepEqual(
    ASL_GROUPS.map((group) => group.name),
    ["A조", "B조", "C조", "D조", "E조", "F조"]
  );
  for (const group of ASL_GROUPS) {
    assert.equal(group.players.length, 4, `group=${group.name}`);
  }

  const names = ASL_GROUPS.flatMap((group) => group.players.map((player) => player.name));
  assert.equal(names.length, 24);
  // 한 선수가 두 조에 들어가면 화면은 멀쩡해 보이고 사실만 틀린다
  assert.equal(new Set(names).size, 24);
});

test("조별 날짜는 ASL_SCHEDULE의 같은 라벨 날짜와 일치한다", () => {
  const byLabel = new Map(ASL_SCHEDULE.map((item) => [item.label, item.date]));
  for (const group of ASL_GROUPS) {
    const label = `ASL ${group.name}`;
    assert.equal(group.date, byLabel.get(label), `label=${label}`);
    assert.match(group.date, /^\d{4}-\d{2}-\d{2}$/, `label=${label}`);
  }
  // 개막 = A조, 조지명식도 같은 한 벌에서 온다
  assert.equal(ASL_OPENING_DATE, byLabel.get("ASL A조"));
  assert.equal(ASL_DRAW_DATE, byLabel.get("ASL 조지명식"));

  // 날짜를 lib/asl.ts에 두 벌로 적으면 달력과 조용히 어긋난다 — 리터럴 날짜는 결승 하나뿐이다.
  // 주석은 뺀다 — 설명용 예시 날짜("2026-08-17" → "8/17(월)")까지 잡으면 검사가 문서를 막는다.
  const code = readProjectFile("lib/asl.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const literals = code.match(/"\d{4}-\d{2}-\d{2}"/g) || [];
  assert.deepEqual(literals, ['"2026-10-17"']);
});

test("모르는 라벨을 찾으면 던진다 (오타를 빌드에서 잡는다)", () => {
  assert.throws(() => aslScheduleDate("ASL G조"), /ASL G조/);
  assert.throws(() => aslScheduleDate(""), /ASL_SCHEDULE/);
  assert.equal(aslScheduleDate("ASL A조"), "2026-08-17");
});

test("16강 시드는 4명이고 종족은 전부 T/Z/P다", () => {
  assert.equal(ASL_SEEDS.length, 4);
  const all = [...ASL_GROUPS.flatMap((group) => group.players), ...ASL_SEEDS];
  assert.equal(all.length, 28);
  for (const player of all) {
    assert.ok(["T", "Z", "P"].includes(player.race), `${player.name}=${player.race}`);
    assert.ok(player.name.trim(), `race=${player.race}`);
  }
  // 시드가 24강 명단에 또 있으면 한 선수가 두 자리를 먹는다
  assert.equal(new Set(all.map((player) => player.name)).size, 28);
});

test("종족 분포 검산 — T 10 · Z 12 · P 6 (시드 포함 28명)", () => {
  // 눈으로 세지 말고 검산한다. 한 글자만 틀려도 화면은 멀쩡해 보이고 사실만 틀린다.
  const count = (players) =>
    players.reduce((acc, player) => ({ ...acc, [player.race]: (acc[player.race] || 0) + 1 }), {});

  // 24강 24명 — 공식 선수소개(테란 8·저그 11·프로토스 5)와 같아야 한다
  assert.deepEqual(count(ASL_GROUPS.flatMap((group) => group.players)), { T: 8, Z: 11, P: 5 });
  // 시드 4명
  assert.deepEqual(count(ASL_SEEDS), { Z: 1, T: 2, P: 1 });
  // 합계 28명
  assert.deepEqual(count([...ASL_GROUPS.flatMap((group) => group.players), ...ASL_SEEDS]), {
    T: 10,
    Z: 12,
    P: 6,
  });
});

test("라운드 5줄과 맵 7개 — 신규 4 · 기존 3", () => {
  assert.deepEqual(
    ASL_ROUNDS.map((round) => round.round),
    ["24강", "16강", "8강", "4강", "결승"]
  );
  for (const round of ASL_ROUNDS) assert.ok(round.format.trim(), `round=${round.round}`);

  assert.equal(ASL_MAPS.length, 7);
  assert.equal(ASL_MAPS.filter((map) => map.fresh).length, 4);
  assert.equal(new Set(ASL_MAPS.map((map) => map.name)).size, 7);
});

test("날짜 표기는 한국 시간대로 조립한다", () => {
  // 서버가 UTC라도 8/17이 8/16으로 밀리면 안 된다
  assert.equal(formatAslDate("2026-08-17"), "8/17(월)");
  assert.equal(formatAslDate("2026-10-17"), "10/17(토)");
});

test("다음 방송은 ASL_SCHEDULE의 한 칸이거나 null이다", () => {
  const next = aslNextBroadcast();
  // 조지명식이 지나면 null이 정상 — 9월 이후 일정은 미공개다
  if (next !== null) {
    assert.ok(
      ASL_SCHEDULE.some((item) => item.date === next.date && item.label === next.label),
      JSON.stringify(next)
    );
  }
});

test("다음 방송 라벨로 조를 찾는다 — 조지명식은 조가 없어 null이다", () => {
  const a = aslGroupByLabel("ASL A조");
  assert.equal(a.name, "A조");
  assert.equal(a.players.length, 4);
  assert.equal(aslGroupByLabel("ASL 조지명식"), null);
  assert.equal(aslGroupByLabel("없는조"), null);
  // 커버가 aslNextBroadcast().label을 그대로 넘긴다 — 라벨 형식이 어긋나면 선수가 조용히 사라진다
  for (const group of ASL_GROUPS) {
    assert.equal(aslGroupByLabel(`ASL ${group.name}`), group, `group=${group.name}`);
  }
});

test("커버는 SOOP 공식 방송국으로 새 탭 링크를 연다", () => {
  assert.equal(ASL_STATION_URL, "https://www.sooplive.com/station/afstar1");
  const page = readProjectFile("app/asl/page.tsx");
  assert.match(page, /href=\{ASL_STATION_URL\}/);
  // target="_blank"만 두고 rel을 빼면 새 탭이 window.opener로 이 페이지를 만질 수 있다
  assert.match(page, /target="_blank"[\s\S]{0,60}rel="noopener noreferrer"/);
  // URL은 lib 한 곳에만 — page.tsx에 또 적으면 조용히 어긋난다
  assert.doesNotMatch(page, /sooplive\.com/);
});

test("/asl의 포인트색은 ASL 주황 — 금색은 K-중만컵 색이다", () => {
  // #d4a94a(금색)는 K-중만컵 브랜드색이다. /asl에 섞이면 두 대회가 같은 색으로 보인다
  assert.doesNotMatch(readProjectFile("app/asl/page.tsx"), /d4a94a/);
  assert.match(readProjectFile("app/asl/page.tsx"), /#fb923c/);
});

test("다음 방송은 커버의 카드다 — dl 한 칸이 아니다", () => {
  const page = readProjectFile("app/asl/page.tsx");
  // 라벨 다음에 날짜+시각이 크게, 그 아래 해당 조 선수들이 온다
  assert.match(page, /다음 방송[\s\S]{0,400}formatAslDate\(next\.date\)[\s\S]{0,200}ASL_MATCH_TIME/);
  assert.match(page, /nextGroup[\s\S]{0,200}PlayerLine/);
  // 일정이 끝나면 카드 대신 회색 한 줄
  assert.match(page, /조지명식 이후 일정 미공개/);
});

test("24강 맵 배정은 3단계고 맵 이름이 ASL_MAPS 안에 전부 있다", () => {
  assert.deepEqual(
    ASL_RO24_STAGES.map((item) => item.stage),
    ["1·2경기", "승자전·패자전", "최종전"]
  );
  assert.deepEqual(
    ASL_RO24_STAGES.map((item) => item.ban),
    [false, true, true]
  );

  // 맵 이름 오타는 화면에서 멀쩡해 보이고 사실만 틀린다 — ASL_MAPS 한 벌과 대조한다
  const known = new Set(ASL_MAPS.map((map) => map.name));
  const maps = ASL_RO24_STAGES.flatMap((item) => item.maps);
  assert.equal(maps.length, 7);
  for (const name of maps) assert.ok(known.has(name), `map=${name}`);
});

test("다음 방송 카드는 24강일 때만 방식 요약을 곁들인다", () => {
  const page = readProjectFile("app/asl/page.tsx");
  // 조지명식(nextGroup null)에는 24강 방식이 붙으면 안 된다 — 조건 안에 있어야 한다
  assert.match(page, /\{nextGroup \? \([\s\S]{0,400}24강 방식[\s\S]{0,600}ASL_RO24_STAGES\.map/);
  // 단계·맵은 lib 한 벌에서만 온다 — page.tsx에 또 적으면 조용히 어긋난다
  assert.doesNotMatch(page, /녹아웃|애티튜드|옥타곤/);
});

test("/asl은 서버 컴포넌트고 달력 때문에 KV를 읽는다", () => {
  const page = readProjectFile("app/asl/page.tsx");
  assert.doesNotMatch(page, /"use client"/);
  // 달력이 K-중만컵 일정을 곁들이므로 더 이상 완전 정적이 아니다
  assert.match(page, /export const revalidate = 60/);
  assert.match(page, /getSetting\(JUNGMAN_STANDINGS_KEY\)\.catch\(\(\) => null\)/);
  // 달력은 장식이다 — KV가 비거나 깨져도 빈 배열로 그려야지 페이지가 죽으면 안 된다
  assert.match(page, /parseJungmanStandings\(/);
  assert.match(page, /standings\?\.matches \?\? \[\]/);
  assert.match(page, /alternates: \{ canonical: "\/asl" \}/);
  // 종족 배지는 사이트 공용 컴포넌트를 쓴다 — 색을 두 벌로 두면 /jungman과 어긋난다
  assert.match(page, /RaceLetterBadge/);
});

test("/asl은 커버 바로 아래에 달력을 그린다 (넓은 화면만)", () => {
  const page = readProjectFile("app/asl/page.tsx");
  // 폰은 커버의 "다음 방송"이 대신한다 — 폰용 목록을 또 만들지 않는다
  assert.match(page, /className="hidden md:block"[\s\S]{0,120}<JungmanCalendar[\s\S]{0,80}variant="asl"/);
  // JS로 폭을 재면 서버·브라우저가 서로 다른 화면을 그린다
  assert.doesNotMatch(page, /matchMedia|innerWidth/);
  // 달력 → 24강 조 편성 → 16강 시드 순 (커버 다음이 일정이다)
  assert.match(page, /<JungmanCalendar[\s\S]*?24강 조 편성[\s\S]*?16강 시드/);
});

test("달력은 variant로 주인공을 뒤집는다 — 기본값은 K-중만컵", () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  assert.match(source, /variant\?: "jungman" \| "asl"/);
  // 기본값이 "jungman"이라 /jungman 호출부는 variant를 안 넘겨도 그대로다
  assert.match(source, /variant = "jungman"/);
  assert.doesNotMatch(readProjectFile("app/jungman/page.tsx"), /variant=/);

  // /asl에서는 ASL이 컬러 카드(주황), K-중만컵이 회색 quiet 한 줄이다
  assert.match(source, /const ASL_ACCENT = "#fb923c"/);
  assert.match(source, /color: ASL_ACCENT/);
  assert.match(source, /label: `K-중만컵 \$\{event\.label\}`,\s*color: MUTED/);
  // 월 탭은 ASL 일정으로 정한다 — 9월 이후가 미공개라 K-중만컵 9월분은 범위 밖이다
  assert.match(source, /new Set\(ASL_SCHEDULE\.map\(\(item\) => item\.date\.slice\(0, 7\)\)\)/);
  // 시각은 lib 상수에서만 온다 — "19:00"을 여기 또 적으면 조용히 어긋난다
  assert.match(source, /ASL_MATCH_TIME/);
});

test('/asl 달력의 기본은 "이번 주" 한 줄 — 월 격자는 탭을 눌러야 나온다', () => {
  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  // 탭 목록 맨 앞이 주간이고, 없으면(=today 미전달) 월 탭만 남는다
  assert.match(source, /const weekTab = isAsl && todayProp \? "week" : null/);
  assert.match(source, /const tabs = weekTab \? \[weekTab, \.\.\.months\] : months/);
  // 기본 선택이 주간 — picked보다 뒤, 월 기본값보다 앞이어야 "이번 주"가 첫 화면이다
  assert.match(source, /picked \?\? weekTab \?\?/);
  assert.match(source, /key === weekTab \? "이번 주"/);
  // 주간도 월 격자와 같은 셀 렌더링을 쓴다 — cells 배열만 갈아끼운다(마크업 두 벌 금지)
  assert.match(source, /view === weekTab \? weekCells\([\s\S]{0,40}\) : monthCells\(view\)/);
  assert.equal((source.match(/min-h-\[7\.5rem\]/g) || []).length, 2);

  // /jungman은 today를 안 넘긴다 — 주간 탭이 생기면 기존 화면이 바뀐다
  assert.doesNotMatch(readProjectFile("app/jungman/page.tsx"), /today=/);
});

test("이번 주는 서버가 정하고, 요일은 UTC가 아니라 한국 시간대로 읽는다", () => {
  const page = readProjectFile("app/asl/page.tsx");
  // 클라이언트가 new Date()로 주를 정하면 서버 렌더와 어긋나 하이드레이션이 깨진다
  assert.match(page, /timeZone: "Asia\/Seoul"[\s\S]{0,120}\.format\(new Date\(\)\)/);
  assert.match(page, /<JungmanCalendar[\s\S]{0,120}today=\{todayKST\}/);

  const source = readProjectFile("app/jungman/JungmanCalendar.tsx");
  assert.match(source, /today\?: string/);
  // 요일을 getUTCDay()로 읽으면 한국 자정이 UTC로 전날이라 주가 통째로 하루 밀린다.
  // 시간대 포맷터로만 읽는다(jungman-standings.test.js도 getUTC* 자체를 막고 있다).
  assert.match(source, /WEEKDAY_INDEX\[SEOUL_WEEKDAY\.format\(base\)\]/);
  assert.doesNotMatch(source, /getUTC|getDay\(\)/);
});

test("네비게이션에 ASL이 K-중만컵 다음, 스코어보드 앞에 있다", () => {
  const nav = readProjectFile("lib/navigation-config.ts");
  assert.match(nav, /"\/jungman"[\s\S]{0,120}"\/asl"[\s\S]{0,200}"\/overlay\/admin"/);
  // 링크만 있고 accent가 없으면 기본 흰색으로 떨어져 브랜드색이 사라진다
  assert.match(readProjectFile("components/Navbar.tsx"), /"\/asl":\s*\{ activeBg: "bg-orange-400\/10"/);
});

process.exit(failed ? 1 : 0);
