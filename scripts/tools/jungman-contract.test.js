const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** lib/jungman.ts를 그대로 트랜스파일해 실제 로직을 돌린다. site-settings(service role)만 스텁으로 막는다. */
function loadJungmanLib() {
  const compiled = ts.transpileModule(readProjectFile("lib/jungman.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, () => ({}));
  return mod.exports;
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

test("jungman collector sends a browser User-Agent", () => {
  const collector = readProjectFile("lib/jungman-collector.ts");

  // UA가 없으면 숲 댓글 API가 404 HTML을 돌려준다 — 헤더가 빠지면 수집이 통째로 죽는다
  assert.match(collector, /USER_AGENT\s*=\s*\n?\s*"Mozilla\/5\.0/);
  assert.match(collector, /headers: \{ "User-Agent": USER_AGENT/);
  assert.match(collector, /cache: "no-store"/);
  assert.match(collector, /AbortSignal\.timeout\(FETCH_TIMEOUT_MS\)/);
  // 페이지 순회는 상한이 있어야 한다 (per_page 30 고정)
  assert.match(collector, /MAX_PAGES = \d+/);
  assert.match(collector, /Math\.min\(lastPage, MAX_PAGES\)/);
  // 매핑된 댓글을 다 찾으면 멈춘다 — 3분마다 팬 댓글 수백 개를 끝까지 읽지 않는다
  assert.match(collector, /if \(requiredCommentNos\?\.length && !pending\.size\) break;/);
  // 실패는 예외가 아니라 결과값으로 — 수집 실패가 페이지를 깨뜨리면 안 된다
  assert.match(collector, /\{ ok: false; reason: string \}/);
});

test("jungman collect path guards writes with cooldown and anomaly checks", () => {
  const collector = readProjectFile("lib/jungman-collector.ts");
  const route = readProjectFile("app/api/jungman/collect/route.ts");

  for (const skip of ["disabled", "cooldown", "no_match", "anomaly", "unchanged"]) {
    assert.ok(collector.includes(`skipped: "${skip}"`), `collector should be able to skip with ${skip}`);
  }
  assert.match(collector, /JUNGMAN_COLLECT_INTERVAL_MS/);
  assert.match(collector, /ANOMALY_FLOOR_RATIO/);
  // KV 한 칸에 들어가야 하므로 스냅샷은 잘라낸다
  assert.match(collector, /MAX_SNAPSHOTS = \d+/);
  assert.match(collector, /\.slice\(\s*-MAX_SNAPSHOTS\s*\)/);

  // 공개 엔드포인트 — force(쿨다운 무시)는 관리자 쿠키가 있을 때만
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /isValidAdminSession\(cookieStore\.get\(ADMIN_SESSION_COOKIE\)\?\.value\)/);
  assert.match(route, /collectJungmanSnapshot\(force\)/);
  assert.match(route, /revalidatePath\("\/jungman"\)/);
});

test("jungman live mode has a server-computed window and a viewer-driven poller", () => {
  const lib = readProjectFile("lib/jungman.ts");
  const client = readProjectFile("app/jungman/JungmanClient.tsx");
  const page = readProjectFile("app/jungman/page.tsx");

  assert.match(lib, /JUNGMAN_LIVE_WINDOW_MS = \d+ \* 60 \* 1000/);
  assert.match(lib, /JUNGMAN_COLLECT_INTERVAL_MS = \d+ \* 60 \* 1000/);
  assert.match(lib, /isLive: isJungmanLive\(latest\)/);

  // 백그라운드 탭은 수집을 돌리지 않고, 중복 요청은 in-flight로 막는다
  assert.match(client, /if \(inFlight \|\| document\.hidden\) return;/);
  assert.match(client, /fetch\("\/api\/jungman\/collect"/);
  assert.match(client, /router\.refresh\(\)/);
  assert.match(client, /실시간 집계/);
  assert.match(client, /motion-reduce:hidden/);

  assert.match(page, /config\.autoCollect \? <JungmanAutoCollect \/> : null/);
  assert.match(page, /isLive=\{isLive\}/);
});

test("jungman admin exposes the comment mapping actions", () => {
  const route = readProjectFile("app/api/admin/jungman/route.ts");
  const admin = readProjectFile("app/admin/jungman/JungmanAdmin.tsx");

  for (const action of ["fetch-comments", "save-mapping", "set-auto-collect", "collect-now"]) {
    assert.ok(route.includes(`"${action}"`), `route should handle action ${action}`);
  }
  // 같은 팀을 두 댓글에 지정하면 저장을 거부해야 한다
  assert.match(route, /중복 지정됐습니다/);
  // 일정 저장이 수집 설정(soopId·mapping…)을 지우면 안 된다
  assert.match(route, /const config: JungmanConfig = \{\s*\.\.\.current,\s*voteCloseAt:/);
  assert.match(route, /station\\\/\(\[A-Za-z0-9_-\]\+\)\\\/post\\\/\(\\d\+\)/);

  // 수동 입력 폼은 폴백으로 남는다
  assert.ok(admin.includes("수동 폴백"), "manual snapshot form should stay as a fallback");
  assert.match(admin, /action: "save-snapshot"/);

  // 자동 추정은 서버에서 계산해 내려주고, 관리자는 확인·수정만 한다
  assert.match(route, /suggestJungmanMapping\(comments/);
  assert.ok(admin.includes("자동 추정으로 채우기"), "admin should offer a bulk auto-fill button");
  assert.ok(admin.includes("자동 추정 ·"), "guessed rows should be badged");
});

test("jungman guesses a team per comment without overreaching", () => {
  const { suggestJungmanMapping } = loadJungmanLib();
  const comment = (commentNo, text, likes = 0, nick = "총장") => ({
    commentNo,
    userId: "u",
    nick,
    text,
    likes,
  });
  const mappingOf = (...comments) => suggestJungmanMapping(comments).mapping;

  const single = suggestJungmanMapping([comment(1, "케이대 신청합니다")]);
  assert.deepEqual(single.mapping, { 1: "KU" });
  assert.deepEqual(single.guesses["1"], { code: "KU", via: "케이대" });

  // 영문 약칭은 단어 경계 — HMM은 HM이 아니고, 구두점은 무시한다(B.A → 흑카데미)
  assert.deepEqual(mappingOf(comment(2, "HMM 잘하네")), {});
  assert.deepEqual(mappingOf(comment(3, "HM 신청합니다")), { 3: "HM" });
  assert.deepEqual(mappingOf(comment(4, "B.A 신청합니다")), { 4: "HKA" });

  // 한 댓글에 두 팀이 잡히면 미지정
  assert.deepEqual(mappingOf(comment(5, "케이대랑 와플대 중에 누가 이기나요")), {});

  // 같은 팀 후보가 여럿이면 신청 문구가 있는 쪽. 추천수로 고르면 팬 댓글이 총장을 이긴다.
  assert.deepEqual(mappingOf(comment(6, "씨나인 신청합니다", 3), comment(7, "씨나인 화이팅", 300)), { 6: "C9" });
  // 신청 문구가 둘 다 없으면 먼저 쓴 쪽
  assert.deepEqual(mappingOf(comment(9, "츠캄몬스타즈 화이팅", 50), comment(8, "캄몬 최고", 5)), { 8: "KMS" });

  // 수술대는 투표 대상이 아니라 결과에서 빠진다 (사전에는 있어야 오탐을 막는다)
  assert.deepEqual(mappingOf(comment(10, "수술대 신청합니다", 50)), {});
  // 닉네임도 본다
  assert.deepEqual(mappingOf(comment(11, "신청합니다", 1, "뉴캣슬 총장")), { 11: "NCS" });
});

test("jungman folds the soop-id signal into the guess without dropping text matching", () => {
  const { suggestJungmanMapping } = loadJungmanLib();
  const comment = (commentNo, text, userId = "u", nick = "총장") => ({
    commentNo,
    userId,
    nick,
    text,
    likes: 0,
  });
  // 숲ID(소문자) → 팀코드
  const identities = { kuboss: "KU", c9boss: "C9" };

  // 팀명이 없어도 명부에 있는 숲ID면 잡힌다 — 이 신호의 핵심 이득
  const byId = suggestJungmanMapping([comment(1, "신청합니다", "KUBoss")], identities);
  assert.deepEqual(byId.mapping, { 1: "KU" });
  assert.deepEqual(byId.guesses["1"], { code: "KU", via: "숲ID 일치" });

  // 두 신호가 일치하면 근거를 둘 다 남긴다
  const agreed = suggestJungmanMapping([comment(2, "케이대 신청합니다", "kuboss")], identities);
  assert.deepEqual(agreed.mapping, { 2: "KU" });
  assert.equal(agreed.guesses["2"].via, '숲ID 일치 · "케이대"');

  // 소속과 다른 팀을 언급하면 미지정 — 씨나인 선수의 "케이대 화이팅"은 팬 댓글이다
  assert.deepEqual(suggestJungmanMapping([comment(3, "케이대 화이팅", "c9boss")], identities).mapping, {});

  // 신청 문구가 ID 단독 신호를 이긴다
  assert.deepEqual(
    suggestJungmanMapping([comment(4, "ㅋㅋㅋ", "kuboss"), comment(5, "케이대 신청합니다", "someone")], identities)
      .mapping,
    { 5: "KU" }
  );
  // 신청 문구가 없으면 ID 신호가 있는 쪽 (먼저 쓴 댓글보다 위)
  assert.deepEqual(
    suggestJungmanMapping([comment(6, "케이대 화이팅", "fan"), comment(7, "ㅎㅇ", "kuboss")], identities).mapping,
    { 7: "KU" }
  );

  // 여러 팀을 언급했으면 소속(ID)으로도 귀속하지 않는다 — 케이대 선수의 관전평은 신청이 아니다
  assert.deepEqual(
    suggestJungmanMapping([comment(10, "케이대랑 씨나인 붙는거 보고싶다", "kuboss")], identities).mapping,
    {}
  );

  // 하위호환 — 맵을 안 넘기면 텍스트 매칭만 쓰던 그대로
  assert.deepEqual(suggestJungmanMapping([comment(8, "신청합니다", "kuboss")]).mapping, {});
  const legacy = suggestJungmanMapping([comment(9, "케이대 신청합니다", "kuboss")]);
  assert.deepEqual(legacy.guesses["9"], { code: "KU", via: "케이대" });
});

test("jungman headlines narrate what actually changed between the last two rounds", () => {
  const { buildJungmanHeadlines } = loadJungmanLib();
  // 12팀 votes 레코드를 만든다 — 코드 순서는 lib의 JUNGMAN_VOTING_TEAMS와 같다
  const snapshot = (round, votes) => ({ round, at: `2026-07-2${round}T00:00:00.000Z`, votes });
  // 인접 격차를 전부 경합 임계(1위의 3% = 30표)보다 크게 벌려 둔다 — 사건 없는 기준선
  const base = {
    DM: 1000, KMS: 900, WFU: 800, C9: 700, JSA: 600, BGM: 500,
    HKA: 400, HM: 300, SSG: 200, NCS: 150, MBU: 100, KU: 50,
  };

  assert.deepEqual(buildJungmanHeadlines([]), []);

  // 스냅샷이 하나면 비교 대상이 없다 — 선두 유지 문장 1개
  const first = buildJungmanHeadlines([snapshot(1, base)]);
  assert.deepEqual(first, ["1위 DM이 1,000표로 선두를 지키고 있습니다"]);

  // 값이 그대로여도 선두 유지 문장 1개 (변화 없음 = 사건 없음)
  assert.deepEqual(buildJungmanHeadlines([snapshot(1, base), snapshot(2, base)]), [
    "1위 DM이 1,000표로 선두를 지키고 있습니다",
  ]);

  // 씨나인(700→850)이 와플대(800)를 넘어 3위 — 교체 + 컷라인 양쪽이 잡힌다
  const swap = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, C9: 850 })]);
  assert.equal(swap[0], "씨나인이 와플대를 제치고 3위로 올라섰습니다");
  assert.ok(swap.includes("씨나인이 시드권에 진입했습니다"), swap.join(" / "));
  assert.ok(swap.includes("와플대가 시드권에서 밀려났습니다"), swap.join(" / "));

  // 케이대(50, 12위 → 250, 9위)가 와일드카드권 탈출, 밀려난 쪽도 잡힌다
  const escaped = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KU: 250 })]);
  assert.equal(escaped[0], "케이대가 신세계를 제치고 9위로 올라섰습니다");
  assert.ok(escaped.includes("케이대가 와일드카드권에서 벗어났습니다"), escaped.join(" / "));
  assert.ok(escaped.includes("뉴캣슬이 와일드카드권으로 밀렸습니다"), escaped.join(" / "));

  // 초박빙 — 인접 표차가 1위 표수의 3%(=30표) 이내. 조사도 받침 따라 붙는다(DM=엠 → "과")
  const tight = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KMS: 999 })]);
  assert.equal(tight[0], "1위 DM과 2위 캄몬스타즈가 1표 차입니다");
  assert.ok(tight.includes("이번 집계에서 캄몬스타즈가 +99표로 가장 많이 늘었습니다"), tight.join(" / "));

  // 순위가 안 바뀌면 최다 득표만 남는다
  assert.deepEqual(buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, DM: 1200 })]), [
    "이번 집계에서 DM이 +200표로 가장 많이 늘었습니다",
  ]);

  // 사건이 쏟아져도 3개까지
  assert.equal(
    buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, C9: 850, KU: 250 })]).length,
    3
  );
});

test("jungman is reachable from public and admin navigation", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /href: "\/jungman", label: "중만컵"/);
  assert.match(readProjectFile("components/Navbar.tsx"), /"\/jungman":/);
  assert.match(readProjectFile("components/admin/AdminNav.tsx"), /href: "\/admin\/jungman"/);
});
