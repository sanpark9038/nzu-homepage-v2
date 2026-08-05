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
  assert.match(page, /<HomeHeroDeck titleLines=\{heroTitleLines\} \/>/);
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

test("커버 덱은 서버 컴포넌트이고 지도 위에 blur를 쓰지 않는다", () => {
  const deck = readProjectFile("components/home/HomeHeroDeck.tsx");
  assert.doesNotMatch(deck, /"use client"/);
  assert.doesNotMatch(deck, /backdrop-blur|backdrop-filter/);
  // 관리자가 고치는 문구가 실제로 그려져야 한다
  assert.match(deck, /titleLines\.map/);
  assert.match(deck, /heroTitleLift/);
  // 대회 정보는 lib 상수에서만 온다 — 문구를 두 벌로 적으면 /jungman과 어긋난다
  assert.match(deck, /JUNGMAN_FORMAT_LINE/);
  assert.match(deck, /JUNGMAN_PRIZE_TOTAL/);
  assert.match(deck, /jungmanDaysToFinal/);
  assert.match(deck, /href="\/jungman"/);
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
