const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("public jungman route revalidates and ships a loading boundary", () => {
  const page = readProjectFile("app/jungman/page.tsx");

  assert.match(page, /export const revalidate = \d+/);
  assert.doesNotMatch(page, /"use client"/);
  assert.ok(fs.existsSync(path.join(ROOT, "app/jungman/loading.tsx")), "app/jungman/loading.tsx should exist");
  assert.doesNotMatch(readProjectFile("app/jungman/loading.tsx"), /"use client"/);
});

test("jungman admin write path stays behind the admin session cookie", () => {
  const route = readProjectFile("app/api/admin/jungman/route.ts");

  assert.match(route, /ADMIN_SESSION_COOKIE/);
  assert.match(route, /assertValidAdminSession/);
  // 모든 진입점(GET/POST)이 requireAdmin을 먼저 통과해야 한다
  const entryPoints = route.match(/export async function (GET|POST)[\s\S]*?\n\}/g) || [];
  assert.equal(entryPoints.length, 2, "route should expose exactly GET and POST");
  for (const body of entryPoints) {
    assert.match(body, /await requireAdmin\(\)/);
  }
  // 저장 후 공개 페이지 캐시 무효화
  assert.match(route, /revalidatePath\("\/jungman"\)/);
  for (const action of ["save-snapshot", "save-config", "delete-last-snapshot"]) {
    assert.ok(route.includes(`"${action}"`), `route should handle action ${action}`);
  }
});

test("jungman excludes the auto-seeded team from vote tallies", () => {
  const lib = readProjectFile("lib/jungman.ts");

  assert.match(lib, /JUNGMAN_SEED_TEAM_CODE = "SSU"/);
  assert.match(lib, /JUNGMAN_VOTING_TEAMS[\s\S]*?JUNGMAN_TEAMS\.filter\([\s\S]*?!==\s*JUNGMAN_SEED_TEAM_CODE/);
  // 파서가 투표 대상 코드만 통과시켜야 SSU 표가 순위에 섞이지 않는다
  assert.match(lib, /VOTING_CODES = new Set\(JUNGMAN_VOTING_TEAMS\.map/);
  assert.match(lib, /if \(!VOTING_CODES\.has\(code\)\) continue;/);
  // 순위·경합 계산도 12팀 기준
  assert.match(lib, /rankMap[\s\S]*?JUNGMAN_VOTING_TEAMS\.slice\(\)\.sort/);
});

test("jungman snapshot parser survives broken admin input", () => {
  const lib = readProjectFile("lib/jungman.ts");

  assert.match(lib, /try \{\s*parsed = JSON\.parse\(raw\);\s*\} catch \{\s*return \[\];/);
  assert.match(lib, /if \(!Array\.isArray\(parsed\)\) return \[\];/);
  assert.match(lib, /count < 0/);
});

test("jungman map renders all 13 markers from a single data source", () => {
  const lib = readProjectFile("lib/jungman.ts");
  const map = readProjectFile("components/jungman/JungmanMap.tsx");
  const page = readProjectFile("app/jungman/page.tsx");

  const teamRows = lib.match(/\{ code: "[A-Z0-9]+", name:/g) || [];
  assert.equal(teamRows.length, 13, "JUNGMAN_TEAMS should hold all 13 teams");

  assert.match(lib, /export function buildJungmanMarkers[\s\S]*?JUNGMAN_TEAMS\.map/);
  assert.match(map, /markers\.map/);
  assert.match(page, /buildJungmanMarkers\(standings\)/);
  assert.match(page, /<JungmanMap markers=\{markers\} \/>/);
  // 지도 정적 레이어는 빌드 산출물 — 손편집 금지 표식이 남아 있어야 한다
  assert.match(readProjectFile("components/jungman/map-base.ts"), /손으로 고치지 말 것/);
});

test("jungman is reachable from public and admin navigation", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /href: "\/jungman", label: "중만컵"/);
  assert.match(readProjectFile("components/Navbar.tsx"), /"\/jungman":/);
  assert.match(readProjectFile("components/admin/AdminNav.tsx"), /href: "\/admin\/jungman"/);
});
