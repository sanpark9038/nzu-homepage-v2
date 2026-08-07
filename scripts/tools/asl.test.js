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
  ASL_ROUNDS,
  ASL_SEEDS,
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

test("/asl은 DB를 안 읽는 정적 서버 컴포넌트다", () => {
  const page = readProjectFile("app/asl/page.tsx");
  assert.doesNotMatch(page, /"use client"/);
  // 정적 페이지에 revalidate·데이터 조회가 끼면 안 된다
  assert.doesNotMatch(page, /export const revalidate/);
  assert.doesNotMatch(page, /getSetting|playerService|supabase/);
  assert.match(page, /alternates: \{ canonical: "\/asl" \}/);
  // 종족 배지는 사이트 공용 컴포넌트를 쓴다 — 색을 두 벌로 두면 /jungman과 어긋난다
  assert.match(page, /RaceLetterBadge/);
});

test("네비게이션에 ASL이 K-중만컵 다음, 스코어보드 앞에 있다", () => {
  const nav = readProjectFile("lib/navigation-config.ts");
  assert.match(nav, /"\/jungman"[\s\S]{0,120}"\/asl"[\s\S]{0,200}"\/overlay\/admin"/);
  // 링크만 있고 accent가 없으면 기본 흰색으로 떨어져 브랜드색이 사라진다
  assert.match(readProjectFile("components/Navbar.tsx"), /"\/asl":\s*\{ activeBg: "bg-orange-400\/10"/);
});

process.exit(failed ? 1 : 0);
