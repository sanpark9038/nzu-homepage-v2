const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** 프로젝트 파일을 그대로 트랜스파일해 실제 로직을 돌린다. import는 resolve 스텁이 대신 답한다. */
function loadModule(relativePath, resolve = () => ({})) {
  const compiled = ts.transpileModule(readProjectFile(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, resolve);
  return mod.exports;
}

/** lib/jungman.ts — site-settings(공개 읽기)만 스텁으로 막는다. */
function loadJungmanLib(getSetting) {
  return loadModule("lib/jungman.ts", () => (getSetting ? { getSetting } : {}));
}

/** 수집기 + KV 스텁. 어떤 키를 어떤 순서로 읽고 썼는지 기록한다. */
function loadJungmanCollector(store) {
  const reads = [];
  const writes = [];
  const collector = loadModule("lib/jungman-collector.ts", (id) =>
    id === "@/lib/jungman"
      ? loadJungmanLib()
      : {
          readSettingAdmin: async (key) => {
            reads.push(key);
            return store[key] ?? null;
          },
          writeSettingAdmin: async (key, value) => {
            writes.push([key, value]);
          },
        }
  );

  return { collector, reads, writes };
}

/** 숲 댓글 API 한 페이지 응답을 흉내낸다. 되돌리는 함수를 반환한다. */
function stubSoopComments(rows) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ meta: { meta: { last_page: 1 } }, data: rows }),
  });
  return () => {
    globalThis.fetch = original;
  };
}

const soopRow = (commentNo, likes) => ({
  p_comment_no: commentNo,
  like_cnt: likes,
  user_id: "u",
  user_nick: "n",
  comment: "신청합니다",
  tag_index: -1,
});

/** 신형 API 한 줄 — 같은 값을 camelCase로 준다 (실측: 같은 글에서 12건 전부 일치) */
const modernRow = (commentNo, likes) => ({
  pCommentNo: commentNo,
  likeCnt: likes,
  userId: "u",
  userNick: "n",
  comment: "신청합니다",
  tagIndex: -1,
  cCommentCnt: 0,
  isBestTop: false,
});

/**
 * 호스트별로 다른 응답(또는 실패)을 준다. 신형은 meta가 평평(lastPage),
 * 구형은 한 겹 더 감싸여 있다(meta.meta.last_page).
 */
function stubSoopHosts({ modern, legacy }) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const isModern = href.includes("api-channel.sooplive.com");
    calls.push({ href, headers: (init && init.headers) || {} });
    const rows = isModern ? modern : legacy;
    if (rows instanceof Error) throw rows;
    if (rows === null) return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true,
      json: async () =>
        isModern
          ? { meta: { total: rows.length, perPage: 30, lastPage: 1, currentPage: 1 }, data: rows }
          : { meta: { meta: { last_page: 1 } }, data: rows },
    };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/**
 * 수집기(async)를 실제로 돌려보는 테스트가 있어 선언 순서대로 한 줄로 세워 돌린다.
 * 겹쳐 돌면 전역 fetch 스텁을 서로 갈아끼워 엉뚱한 응답을 본다.
 */
let queue = Promise.resolve();

function test(name, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    }
  });
  return queue;
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
  // 순위·경합 계산도 투표 대상 팀만 기준
  assert.match(lib, /[rR]ankMap[\s\S]*?JUNGMAN_VOTING_TEAMS\.slice\(\)\.sort/);
});

test("jungman snapshot parser survives broken admin input", () => {
  const lib = readProjectFile("lib/jungman.ts");

  assert.match(lib, /try \{\s*parsed = JSON\.parse\(raw\);\s*\} catch \{\s*return \[\];/);
  assert.match(lib, /if \(!Array\.isArray\(parsed\)\) return \[\];/);
  assert.match(lib, /count < 0/);
});

test("jungman map renders all 12 markers from a single data source", () => {
  const lib = readProjectFile("lib/jungman.ts");
  const map = readProjectFile("components/jungman/JungmanMap.tsx");
  const page = readProjectFile("app/jungman/page.tsx");

  const teamRows = lib.match(/\{ code: "[A-Z0-9]+", name:/g) || [];
  assert.equal(teamRows.length, 12, "JUNGMAN_TEAMS should hold all 12 teams");

  assert.match(lib, /export function buildJungmanMarkers[\s\S]*?JUNGMAN_TEAMS\.map/);
  assert.match(map, /markers\.map/);
  // 투표가 끝나 득표는 공지 확정치(코드 상수)에서만 온다 — 지도도 같은 순위표를 읽어야 숫자가 갈라지지 않는다
  assert.match(page, /const voteStandings = buildJungmanFinalStandings\(\);/);
  assert.match(page, /buildJungmanMarkers\(voteStandings\)/);
  assert.match(page, /<JungmanMap markers=\{markers\}/);
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

test("jungman collector reads the modern comment API and falls back to the legacy one", async () => {
  const source = readProjectFile("lib/jungman-collector.ts");

  // 신형이 기본, 구형은 폴백 — 두 주소가 다 살아 있어야 한다
  assert.match(source, /COMMENT_API = "https:\/\/api-channel\.sooplive\.com\/v1\.1\/channel"/);
  assert.match(source, /LEGACY_COMMENT_API = "https:\/\/chapi\.sooplive\.co\.kr\/api"/);
  // 신형 meta는 평평(lastPage), 구형은 한 겹 더(meta.meta.last_page) — 둘 다 읽어야 순회가 멈출 곳을 안다
  assert.match(source, /meta\?\.lastPage \?\? nested\?\.last_page/);
  // 대댓글 판별은 양쪽 다 tagIndex — 신형의 cCommentCnt는 "달린 대댓글 수"라 여기 못 쓴다
  assert.match(source, /Number\(row\.tagIndex \?\? row\.tag_index \?\? -1\) >= 0/);

  const at = new Date(Date.now() - 10 * 60_000).toISOString();
  const config = {
    soopId: "ititit",
    titleNo: 202619457,
    autoCollect: true,
    voteCloseAt: "2099-01-01T00:00:00+09:00",
    mapping: { 1: "DM", 2: "KU" },
  };
  const storeOf = () => ({
    jungman_config: JSON.stringify(config),
    jungman_snapshots: JSON.stringify([{ round: 7, at, votes: { DM: 100, KU: 200 } }]),
    jungman_latest: JSON.stringify({ at, round: 7 }),
  });

  // ① 신형이 기본 경로 — 구형은 부르지도 않는다. 폴백이 안 돌았으니 source도 안 남는다.
  let stub = stubSoopHosts({ modern: [modernRow(1, 150), modernRow(2, 250)], legacy: [] });
  let modernComments;
  try {
    const run = loadJungmanCollector(storeOf());
    modernComments = await run.collector.fetchJungmanComments("ititit", 202619457);
    const result = await run.collector.collectJungmanSnapshot(false);
    assert.deepEqual(result, { ok: true, round: 8, votes: { DM: 150, KU: 250 }, carried: [] });
    assert.ok(
      stub.calls.every((call) => call.href.includes("api-channel.sooplive.com")),
      `legacy API was called: ${stub.calls.map((call) => call.href)}`
    );
    // 신형에도 UA를 붙인다 — 막힐 이유를 만들지 않는다
    for (const call of stub.calls) assert.match(String(call.headers["User-Agent"]), /^Mozilla\/5\.0/);
  } finally {
    stub.restore();
  }

  // ② 신형이 죽으면 구형이 같은 결과를 낸다 + 폴백 사실이 심박에 남는다
  for (const broken of [new Error("boom"), null, []]) {
    stub = stubSoopHosts({ modern: broken, legacy: [soopRow(1, 150), soopRow(2, 250)] });
    try {
      const run = loadJungmanCollector(storeOf());
      // ③ 두 응답 형식이 같은 모양으로 정규화된다
      const legacyComments = await run.collector.fetchJungmanComments("ititit", 202619457);
      assert.deepEqual(legacyComments.comments, modernComments.comments);
      assert.equal(modernComments.source, "modern");
      assert.equal(legacyComments.source, "legacy");

      const result = await run.collector.collectJungmanSnapshot(false);
      assert.deepEqual(result, {
        ok: true,
        round: 8,
        votes: { DM: 150, KU: 250 },
        carried: [],
        source: "legacy",
      });
      assert.ok(
        stub.calls.some((call) => call.href.includes("chapi.sooplive.co.kr")),
        "fallback should hit the legacy API"
      );

      const heartbeat = JSON.parse(run.writes.find(([key]) => key === "jungman_heartbeat")[1]);
      assert.equal(heartbeat.source, "legacy", "폴백이 심박에 안 남았다");
    } finally {
      stub.restore();
    }
  }

  // 둘 다 죽으면 예외가 아니라 실패값 — 수집 실패가 페이지를 깨뜨리면 안 된다
  stub = stubSoopHosts({ modern: new Error("boom"), legacy: new Error("boom") });
  try {
    const run = loadJungmanCollector(storeOf());
    const result = await run.collector.collectJungmanSnapshot(false);
    assert.equal(result.ok, false);
    assert.equal(result.skipped, "fetch_failed");
    assert.ok(!run.writes.some(([key]) => key === "jungman_snapshots"), "fetch_failed must not write");
  } finally {
    stub.restore();
  }
});

test("jungman collect path guards writes with cooldown and anomaly checks", () => {
  const collector = readProjectFile("lib/jungman-collector.ts");
  const route = readProjectFile("app/api/jungman/collect/route.ts");

  for (const skip of ["disabled", "cooldown", "no_match", "anomaly", "unchanged"]) {
    assert.ok(collector.includes(`skipped: "${skip}"`), `collector should be able to skip with ${skip}`);
  }
  assert.match(collector, /JUNGMAN_COLLECT_COOLDOWN_MS/);
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

test("jungman collection stops itself after the vote closes", () => {
  const collector = readProjectFile("lib/jungman-collector.ts");

  // 크론 해제를 잊어도 대회가 끝나면 스스로 멈춰야 한다 — 안 그러면 3분마다 영원히 돈다
  assert.match(collector, /COLLECT_GRACE_MS/);
  assert.match(collector, /Date\.now\(\) > Date\.parse\(config\.voteCloseAt\) \+ COLLECT_GRACE_MS/);
  assert.ok(collector.includes('skipped: "vote_closed"'), "collector should skip once the vote is closed");
});

// 실시간 개표 화면(임베드)은 미러 종료로 제거됐다 — /jungman은 확정 결과만 그린다
test("jungman live vote screens are gone and must not come back", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/jungman/embed")), "embed는 미러 종료로 제거됐다");
  assert.ok(!fs.existsSync(path.join(ROOT, "app/jungman/JungmanClient.tsx")), "실시간 개표 대시보드는 제거됐다");
  assert.ok(!fs.existsSync(path.join(ROOT, "app/jungman/JungmanChart.tsx")), "개표 시계열 차트는 제거됐다");
  // 크롬 제거·iframe 개방도 같이 걷어냈다 — 남으면 죽은 경로에 정책만 남는다
  assert.doesNotMatch(readProjectFile("lib/navigation-config.ts"), /jungman\/embed/);
  assert.doesNotMatch(readProjectFile("next.config.ts"), /jungman\/embed|frame-ancestors/);

  // 크롬 제거는 방송 오버레이 전용으로 남는다 — 배선 자체는 살아 있어야 한다
  const { isChromelessRoute } = loadModule("lib/navigation-config.ts");
  assert.equal(isChromelessRoute("/jungman/embed"), false);
  assert.equal(isChromelessRoute("/jungman"), false);
  assert.equal(isChromelessRoute("/overlay/news"), true);
  assert.match(readProjectFile("components/Navbar.tsx"), /if \(isChromelessRoute\(pathname\)\) return null;/);
  assert.match(readProjectFile("components/ScrollToTop.tsx"), /if \(isChromelessRoute\(pathname\)\) return null;/);
});

test("jungman collection cadence constants stay ordered for the cron", () => {
  const lib = readProjectFile("lib/jungman.ts");

  assert.match(lib, /JUNGMAN_COLLECT_INTERVAL_MS = \d+ \* 60 \* 1000/);
  // 쿨다운은 크론 주기보다 짧아야 매 회차가 통과한다
  assert.match(lib, /JUNGMAN_COLLECT_COOLDOWN_MS = \d+ \* 1000/);
  const { JUNGMAN_COLLECT_INTERVAL_MS, JUNGMAN_COLLECT_COOLDOWN_MS } = loadJungmanLib();
  assert.ok(JUNGMAN_COLLECT_COOLDOWN_MS < JUNGMAN_COLLECT_INTERVAL_MS, "쿨다운이 크론 주기보다 길다");

  // 수집 엔드포인트는 남아야 한다 — 크론과 관리자 [지금 수집]이 쓴다
  assert.ok(
    fs.existsSync(path.join(ROOT, "app/api/jungman/collect/route.ts")),
    "collect endpoint should stay for cron and admin"
  );
  assert.match(readProjectFile("app/admin/jungman/JungmanAdmin.tsx"), /"collect-now"/);
});

test("jungman cooldown reads a light key before the 86KB snapshot array", async () => {
  const collector = readProjectFile("lib/jungman-collector.ts");
  const adminRoute = readProjectFile("app/api/admin/jungman/route.ts");

  assert.match(readProjectFile("lib/jungman.ts"), /JUNGMAN_LATEST_KEY = "jungman_latest"/);

  // 500개 스냅샷 = 수십 KB. 쿨다운으로 스킵될 호출이 이걸 읽으면 시청자 수만큼 전송량이 곱해진다.
  const snapshots = Array.from({ length: 500 }, (_, i) => ({
    round: i + 1,
    at: new Date(Date.now() - 30_000 - (499 - i) * 3 * 60_000).toISOString(),
    votes: { DM: 100 + i, KU: 50 + i },
  }));
  const store = {
    // voteCloseAt을 빼면 기본값(실제 대회 마감)이 들어와 대회가 끝난 뒤로는 이 테스트가 "vote_closed"로 죽는다
    jungman_config: JSON.stringify({
      soopId: "x",
      titleNo: 1,
      autoCollect: true,
      voteCloseAt: "2099-01-01T00:00:00+09:00",
      mapping: { 1: "DM" },
    }),
    jungman_snapshots: JSON.stringify(snapshots),
    jungman_latest: JSON.stringify({ at: snapshots[499].at, round: 500 }),
  };

  // 쿨다운이면 가벼운 키만 읽고 끝난다 — 스냅샷 배열은 건드리지 않는다
  const cooled = loadJungmanCollector(store);
  assert.deepEqual(await cooled.collector.collectJungmanSnapshot(false), { ok: false, skipped: "cooldown" });
  assert.ok(!cooled.reads.includes("jungman_snapshots"), `snapshot array was read: ${cooled.reads}`);
  // 심박(진단 이력)은 가볍고, 핵심은 86KB 스냅샷 배열을 읽지 않는 것이다
  assert.deepEqual(cooled.reads, ["jungman_heartbeat", "jungman_config", "jungman_latest"]);
  assert.ok(!cooled.reads.includes("jungman_snapshots"), "쿨다운 경로가 스냅샷 배열을 읽었다");

  // 가벼운 키가 없거나 깨졌으면 배열로 되돌아가 같은 판정을 낸다 (하위호환)
  for (const broken of [undefined, "{not json"]) {
    const fallback = loadJungmanCollector({ ...store, jungman_latest: broken });
    assert.deepEqual(await fallback.collector.collectJungmanSnapshot(false), { ok: false, skipped: "cooldown" });
    assert.ok(fallback.reads.includes("jungman_snapshots"), "fallback should read the array");
  }

  // 배열을 쓰는 통로가 하나여야 요약 키가 어긋나지 않는다 — 관리자 수동 저장·삭제도 여기를 지난다
  const writer = loadJungmanCollector({});
  await writer.collector.writeJungmanSnapshots(snapshots);
  assert.deepEqual(
    writer.writes.map(([key]) => key),
    ["jungman_snapshots", "jungman_latest"]
  );
  assert.deepEqual(JSON.parse(writer.writes[1][1]), { at: snapshots[499].at, round: 500 });
  assert.ok(writer.writes[1][1].length < 200, "the light key must stay tiny");

  assert.equal(
    (collector.match(/writeSettingAdmin\(JUNGMAN_SNAPSHOTS_KEY/g) || []).length,
    1,
    "only writeJungmanSnapshots should write the snapshot array"
  );
  assert.doesNotMatch(adminRoute, /writeSetting\(JUNGMAN_SNAPSHOTS_KEY/);
  assert.equal((adminRoute.match(/writeJungmanSnapshots\(/g) || []).length, 2);
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
  assert.deepEqual(mappingOf(comment(6, "흑카데미 신청합니다", 3), comment(7, "흑카데미 화이팅", 300)), { 6: "HKA" });
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
  const identities = { kuboss: "KU", hkaboss: "HKA" };

  // 팀명이 없어도 명부에 있는 숲ID면 잡힌다 — 이 신호의 핵심 이득
  const byId = suggestJungmanMapping([comment(1, "신청합니다", "KUBoss")], identities);
  assert.deepEqual(byId.mapping, { 1: "KU" });
  assert.deepEqual(byId.guesses["1"], { code: "KU", via: "숲ID 일치" });

  // 두 신호가 일치하면 근거를 둘 다 남긴다
  const agreed = suggestJungmanMapping([comment(2, "케이대 신청합니다", "kuboss")], identities);
  assert.deepEqual(agreed.mapping, { 2: "KU" });
  assert.equal(agreed.guesses["2"].via, '숲ID 일치 · "케이대"');

  // 소속과 다른 팀을 언급하면 미지정 — 흑카데미 선수의 "케이대 화이팅"은 팬 댓글이다
  assert.deepEqual(suggestJungmanMapping([comment(3, "케이대 화이팅", "hkaboss")], identities).mapping, {});

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
    suggestJungmanMapping([comment(10, "케이대랑 흑카데미 붙는거 보고싶다", "kuboss")], identities).mapping,
    {}
  );

  // 하위호환 — 맵을 안 넘기면 텍스트 매칭만 쓰던 그대로
  assert.deepEqual(suggestJungmanMapping([comment(8, "신청합니다", "kuboss")]).mapping, {});
  const legacy = suggestJungmanMapping([comment(9, "케이대 신청합니다", "kuboss")]);
  assert.deepEqual(legacy.guesses["9"], { code: "KU", via: "케이대" });
});

// 11팀 votes 레코드를 만든다 — 코드 순서는 lib의 JUNGMAN_VOTING_TEAMS와 같다
const headlineSnapshot = (round, votes) => ({ round, at: `2026-07-2${round}T00:00:00.000Z`, votes });
// 인접 격차를 전부 경합 임계(1위의 3% = 30표)보다 크게 벌려 둔다 — 사건 없는 기준선
const headlineBase = {
  DM: 1000, KMS: 900, WFU: 800, JSA: 600, BGM: 500,
  HKA: 400, HM: 300, SSG: 200, NCS: 150, MBU: 100, KU: 50,
};

test("jungman headlines narrate what actually changed since an hour ago", () => {
  const { buildJungmanHeadlines } = loadJungmanLib();
  const snapshot = headlineSnapshot;
  const base = headlineBase;

  assert.deepEqual(buildJungmanHeadlines([]), []);

  // JSA(600→850)가 와플대(800)를 넘어 3위 — 교체(시각 포함) + 컷라인 양쪽이 잡힌다
  const swap = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, JSA: 850 })]);
  assert.equal(swap[0], "09:00 JSA가 3위로 올라섰습니다");
  assert.ok(swap.includes("JSA가 시드권에 진입했습니다"), swap.join(" / "));
  assert.ok(swap.includes("와플대가 시드권에서 밀려났습니다"), swap.join(" / "));

  // 와일드카드전은 폐지됐다(12팀 전원 본선) — 하위권 이동은 컷라인 문구를 만들지 않는다.
  // 케이대(50, 11위 → 250, 8위)는 순위 교체로만 잡히고, 밀려난 엠비대는 아무 말도 얻지 못한다.
  const escaped = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KU: 250 })]);
  assert.equal(escaped[0], "09:00 케이대가 8위로 올라섰습니다");
  assert.ok(!escaped.some((line) => /와일드카드|와카/.test(line)), escaped.join(" / "));
  assert.ok(!escaped.some((line) => line.includes("엠비대가")), escaped.join(" / "));
  // 시드권 문구는 시드선(3위)을 실제로 넘나든 팀에만 붙는다
  assert.ok(!escaped.some((line) => line.includes("시드권")), escaped.join(" / "));

  // 초박빙 — 인접 표차가 1위 표수의 3%(=30표) 이내. 조사도 받침 따라 붙는다(DM=엠 → "과")
  const tight = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KMS: 999 })]);
  assert.equal(tight[0], "1위 DM과 2위 캄몬스타즈가 1표 차입니다");
  assert.ok(tight.includes("최근 1시간 캄몬스타즈가 +99표로 가장 많이 늘었습니다"), tight.join(" / "));
  // 초박빙이 1·2위를 이미 다뤘으면 선두 격차 문장은 겹치지 않게 생략된다
  assert.ok(!tight.some((line) => line.includes("앞서 있습니다")), tight.join(" / "));

  // 사건이 쏟아져도 5개까지
  assert.equal(
    buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, JSA: 850, KU: 250 })]).length,
    5
  );
});

test("jungman headlines keep the ticker moving when nothing happened", () => {
  const { buildJungmanHeadlines } = loadJungmanLib();
  const snapshot = headlineSnapshot;
  const base = headlineBase;

  // 표가 1표도 안 움직인 구간 — 사건은 0건인데도 경합·격차로 3문장이 찬다
  const idle = buildJungmanHeadlines([snapshot(1, base), snapshot(2, base)]);
  assert.ok(idle.length >= 3, `expected 3+ headlines, got ${idle.length}: ${idle.join(" / ")}`);
  // 상시 소재는 시드 경쟁뿐이다 — 시드선(3위/4위)과 시드 안쪽 마지막 자리(2위/3위)
  assert.ok(idle.includes("3위 와플대와 4위 JSA가 200표 차입니다"), idle.join(" / "));
  assert.ok(idle.includes("2위 캄몬스타즈와 3위 와플대가 100표 차입니다"), idle.join(" / "));
  assert.ok(idle.includes("1위 DM이 2위와 100표 차로 앞서 있습니다"), idle.join(" / "));
  // 탈락이 없어졌으니 하위권 표차를 티커가 떠들면 안 된다
  assert.ok(!idle.some((line) => /^1[01]위/.test(line)), idle.join(" / "));

  // 스냅샷 하나뿐이라 비교 대상이 없어도 상시 소재로 3문장
  assert.ok(buildJungmanHeadlines([snapshot(1, base)]).length >= 3);

  // 만 단위 이정표는 기준 시점에 못 미쳤다가 넘긴 순간만
  const crossed = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, DM: 6000 })]);
  assert.ok(crossed.includes("총 투표수 1만 표를 넘었습니다"), crossed.join(" / "));

  // 마감 6시간 안쪽이면 남은 시간, 밖이면 침묵
  const closeAt = "2026-07-30T15:00:00.000Z";
  const near = buildJungmanHeadlines([snapshot(1, base)], closeAt, Date.parse(closeAt) - 2 * 3600_000 - 60_000);
  assert.ok(near.includes("투표 마감까지 2시간 1분 남았습니다"), near.join(" / "));
  const far = buildJungmanHeadlines([snapshot(1, base)], closeAt, Date.parse(closeAt) - 9 * 3600_000);
  assert.ok(!far.some((line) => line.includes("마감까지")), far.join(" / "));
});

test("jungman buckets a range by its closing value, never an average", () => {
  const { bucketJungmanSnapshots, buildJungmanSeries } = loadJungmanLib();
  // 3분 간격 20점 = 1시간. 득표는 누적이라 마지막 값이 그 구간의 진짜 값이다.
  const snapshots = Array.from({ length: 21 }, (_, i) => ({
    round: i + 1,
    at: new Date(Date.UTC(2026, 6, 27, 0, i * 3)).toISOString(),
    votes: { DM: 100 + i * 10 },
  }));

  // 15분 버킷 — 각 버킷의 종가(마지막 점). 평균이면 5개 점이 145/195/... 로 나온다.
  const quarter = bucketJungmanSnapshots(snapshots, 15 * 60 * 1000);
  assert.deepEqual(
    quarter.map((point) => point.votes.DM),
    [140, 190, 240, 290, 300]
  );
  // 1시간 버킷 — 정시 경계로 갈리고 남는 건 각 구간 종가
  assert.deepEqual(
    bucketJungmanSnapshots(snapshots, 60 * 60 * 1000).map((point) => point.votes.DM),
    [290, 300]
  );
  // bucketMs 0이면 원본 그대로
  assert.equal(bucketJungmanSnapshots(snapshots, 0).length, 21);

  const series = buildJungmanSeries(snapshots);
  assert.deepEqual(
    series.map((entry) => entry.key),
    ["h1", "h6", "all"]
  );
  // 1시간 구간은 원본(3분) 그대로, 전체는 1시간 봉
  assert.equal(series[0].points.length, 21);
  assert.equal(series[2].points.length, 2);
  // 어떤 구간이든 마지막 점은 최신 스냅샷과 같아야 한다 — 종가가 잘리면 순위가 어긋난다
  for (const entry of series) {
    assert.equal(entry.points[entry.points.length - 1].votes.DM, 300, entry.key);
  }
});

test("jungman labels the x axis in Asia/Seoul and marks day boundaries", () => {
  const { jungmanAxisLabel, jungmanSeoulTime, jungmanDayBoundaries, buildJungmanRankEvents } = loadJungmanLib();

  // 2026-07-27T14:30Z = 07-27 23:30 KST, +1시간이면 07-28 00:30 KST로 날짜가 넘어간다
  const before = "2026-07-27T14:30:00.000Z";
  const after = "2026-07-27T15:30:00.000Z";

  assert.equal(jungmanSeoulTime(before), "23:30");
  assert.equal(jungmanSeoulTime(after), "00:30");
  // 같은 날이면 시각만, 날짜가 바뀌면 그 지점만 날짜를 붙인다
  assert.equal(jungmanAxisLabel(after, "2026-07-27T15:00:00.000Z"), "00:30");
  assert.equal(jungmanAxisLabel(after, before), "7/28 00:30");

  const points = [before, "2026-07-27T14:50:00.000Z", after, "2026-07-27T16:30:00.000Z"].map((at) => ({
    at,
    votes: {},
  }));
  assert.deepEqual(jungmanDayBoundaries(points), [{ index: 2, day: 2 }]);

  // 순위 상승 시점 타임라인 — 최신순
  const votes = (dm, ku) => ({ DM: dm, KU: ku });
  const events = buildJungmanRankEvents([
    { round: 1, at: before, votes: votes(100, 50) },
    { round: 2, at: after, votes: votes(100, 200) },
  ]);
  assert.equal(events.length, 1);
  assert.deepEqual({ code: events[0].code, rank: events[0].rank, at: events[0].at }, { code: "KU", rank: 1, at: after });
});

test("jungman emphasises the seed cutline, not the vote leaders", () => {
  const lib = loadJungmanLib();
  const { jungmanEmphasis, JUNGMAN_SEED_CUT, JUNGMAN_VOTING_TEAMS } = lib;

  const tiers = Array.from({ length: JUNGMAN_VOTING_TEAMS.length }, (_, i) => jungmanEmphasis(i + 1));
  // 12팀 전원 본선이라 다투는 경계는 시드선 하나뿐 — 1~3위가 1군, 바로 밖 4위가 2군, 나머지는 배경
  assert.deepEqual(tiers, [
    "lead", "lead", "lead", "edge", "back", "back",
    "back", "back", "back", "back", "back",
  ]);
  // 순위가 아니라 컷 상수를 기준으로 판정해야 한다 — 컷이 움직이면 강조도 따라 움직인다
  assert.equal(jungmanEmphasis(JUNGMAN_SEED_CUT), "lead");
  assert.equal(jungmanEmphasis(JUNGMAN_SEED_CUT + 1), "edge");
  // 꼴찌도 잃을 게 없다 — 하위권을 되살려 강조하던 규칙이 남아 있으면 안 된다
  assert.equal(jungmanEmphasis(JUNGMAN_VOTING_TEAMS.length), "back");

  // 와일드카드전 폐지 — 컷 상수는 시드선 하나뿐이다
  assert.doesNotMatch(readProjectFile("lib/jungman.ts"), /JUNGMAN_WILDCARD_CUT/);
});

test("jungman keeps the map server-side and no longer mounts the live vote dashboard", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  const map = readProjectFile("components/jungman/JungmanMap.tsx");

  // 88KB 지도 SVG는 서버 컴포넌트가 직접 그린다 — 클라이언트가 import하면 번들로 넘어간다
  assert.match(page, /<JungmanMap markers=\{markers\}/);

  // 투표가 끝나 실시간 대시보드(선택 공유·차트·시계열)는 /jungman에서 통째로 내려갔다.
  // 되살리면 조별 순위 페이지가 다시 끝난 개표 화면으로 되돌아간다.
  assert.doesNotMatch(page, /JungmanDashboard|JungmanChart|buildJungmanSeries|snapshots/);

  // 와일드카드전 폐지 — 12팀 전원 본선(4개조)이라 탈락·와카 표기가 어디에도 남으면 안 된다.
  // 시드 표기는 그대로다: 걸린 건 1~3위 세 자리뿐이다.
  for (const [name, source] of [["page", page], ["map", map]]) {
    assert.doesNotMatch(source, /와일드카드|와카|"wildcard"|JUNGMAN_WILDCARD_CUT/, `${name}에 와일드카드가 남아 있다`);
    assert.match(source, /seed|시드/, `${name}에서 시드 표기까지 사라졌다`);
  }
});

test("jungman is reachable from public and admin navigation", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /href: "\/jungman", label: "K-중만컵"/);
  assert.match(readProjectFile("components/Navbar.tsx"), /"\/jungman":/);
  assert.match(readProjectFile("components/admin/AdminNav.tsx"), /href: "\/admin\/jungman"/);
});

test("jungman tells a failed read apart from an empty board", async () => {
  const settings = readProjectFile("lib/site-settings.ts");

  // 테이블이 아직 없는 건(PGRST205) 배포 순서 문제라 조용히 넘긴다. 그 외 실패는 던져야 한다 —
  // 삼키면 호출부가 "값 없음"으로 읽고 빈 화면을 정상 상태로 캐시한다.
  assert.match(settings, /if \(error\.code === "PGRST205"\) return fallback;/);
  assert.match(settings, /throw new Error\(`site_settings read failed/);

  const failing = loadJungmanLib(async () => {
    throw new Error("boom");
  });
  const broken = await failing.getJungmanState();
  assert.equal(broken.degraded, true);
  assert.equal(broken.latest, null);
  // 상태 자체는 렌더 가능한 모양이어야 한다 — 지도·순위표가 터지면 안 된다
  assert.equal(broken.standings.length, 11);

  // 정상 읽기는 degraded가 아니다
  const snapshot = { round: 7, at: new Date().toISOString(), votes: { DM: 10 } };
  const healthy = loadJungmanLib(async (key) =>
    key === "jungman_snapshots" ? JSON.stringify([snapshot]) : null
  );
  const fine = await healthy.getJungmanState();
  assert.equal(fine.degraded, false);
  assert.equal(fine.latest.round, 7);
});

test("jungman keeps every round of the vote window in one array", () => {
  const collector = readProjectFile("lib/jungman-collector.ts");
  const lib = loadJungmanLib();

  const max = Number(collector.match(/MAX_SNAPSHOTS = (\d+)/)[1]);
  // 투표 78시간 전체가 남아야 "최고 순위"와 전체 추이가 거짓말을 안 한다.
  // 500이면 25시간(3분 × 500)에 물려 1일차가 조용히 잘려나간다.
  const windowMs = 78 * 60 * 60 * 1000;
  assert.ok(
    max * lib.JUNGMAN_COLLECT_INTERVAL_MS >= windowMs,
    `MAX_SNAPSHOTS ${max} covers only ${(max * lib.JUNGMAN_COLLECT_INTERVAL_MS) / 3600000}h`
  );
  // 순회 상한은 API가 알려준 last_page에서 이미 멈춘다 — 낮추면 뒷쪽 신청 댓글을 못 찾는다
  assert.match(collector, /줄이지 말 것/);
});

test("jungman carries a vanished comment forward instead of dropping the team to zero", async () => {
  const at = new Date(Date.now() - 10 * 60_000).toISOString();
  const config = {
    soopId: "x",
    titleNo: 1,
    autoCollect: true,
    voteCloseAt: "2099-01-01T00:00:00+09:00",
    mapping: { 1: "DM", 2: "KU" },
  };
  const storeWith = (votes) => ({
    jungman_config: JSON.stringify(config),
    jungman_snapshots: JSON.stringify([{ round: 42, at, votes }]),
    jungman_latest: JSON.stringify({ at, round: 42 }),
  });

  // 2번 댓글(KU)이 사라졌다 — KU는 직전 값을 그대로 이어받는다
  let restore = stubSoopComments([soopRow(1, 1100)]);
  try {
    const run = loadJungmanCollector(storeWith({ DM: 1000, KU: 900 }));
    const result = await run.collector.collectJungmanSnapshot(false);
    assert.deepEqual(result, { ok: true, round: 43, votes: { DM: 1100, KU: 900 }, carried: ["KU"] });

    // 이어받은 사실은 심박에 남아야 관리자가 원인을 안다
    const heartbeat = JSON.parse(run.writes.find(([key]) => key === "jungman_heartbeat")[1]);
    assert.deepEqual(heartbeat.carried, ["KU"]);
  } finally {
    restore();
  }

  // 비중이 큰 팀(KU 9000)이 사라져도 이상치 가드에 걸려 영구 정지하면 안 된다
  restore = stubSoopComments([soopRow(1, 110)]);
  try {
    const run = loadJungmanCollector(storeWith({ DM: 100, KU: 9000 }));
    const result = await run.collector.collectJungmanSnapshot(false);
    assert.equal(result.ok, true, `expected a write, got ${JSON.stringify(result)}`);
    assert.deepEqual(result.votes, { DM: 110, KU: 9000 });
  } finally {
    restore();
  }

  // 전부 사라졌으면 기존대로 기록 거부 — 이어받기가 no_match를 뚫으면 안 된다
  restore = stubSoopComments([]);
  try {
    const run = loadJungmanCollector(storeWith({ DM: 1000, KU: 900 }));
    assert.deepEqual(await run.collector.collectJungmanSnapshot(false), { ok: false, skipped: "no_match" });
    assert.ok(!run.writes.some(([key]) => key === "jungman_snapshots"), "no_match must not write");
  } finally {
    restore();
  }
});

test("jungman refuses to overwrite history it could not read", async () => {
  const at = new Date(Date.now() - 10 * 60_000).toISOString();
  // 요약 키에는 173차가 남아 있는데 배열 JSON이 깨졌다 — 여기서 쓰면 round 1이 이력 전체를 덮는다
  const store = {
    jungman_config: JSON.stringify({
      soopId: "x",
      titleNo: 1,
      autoCollect: true,
      voteCloseAt: "2099-01-01T00:00:00+09:00",
      mapping: { 1: "DM" },
    }),
    jungman_snapshots: "{깨진 JSON",
    jungman_latest: JSON.stringify({ at, round: 173 }),
  };

  const restore = stubSoopComments([soopRow(1, 1)]);
  try {
    // 관리자 force도 이 가드는 못 뚫는다 — 한 회차를 거르는 게 며칠치 이력보다 싸다
    for (const force of [false, true]) {
      const run = loadJungmanCollector(store);
      assert.deepEqual(await run.collector.collectJungmanSnapshot(force), {
        ok: false,
        skipped: "history_lost",
      });
      assert.ok(!run.writes.some(([key]) => key === "jungman_snapshots"), `force=${force} must not write`);
    }
  } finally {
    restore();
  }

  // 정상적으로 비어 있는 상태(요약 키 없음)는 막지 않는다 — 첫 수집이 돌아야 한다
  const first = loadJungmanCollector({ ...store, jungman_snapshots: "[]", jungman_latest: undefined });
  const restoreFirst = stubSoopComments([soopRow(1, 5)]);
  try {
    const result = await first.collector.collectJungmanSnapshot(false);
    assert.deepEqual(result, { ok: true, round: 1, votes: { DM: 5 }, carried: [] });
  } finally {
    restoreFirst();
  }
});

test("jungman drops a round rather than losing one to a concurrent write", async () => {
  const at = new Date(Date.now() - 10 * 60_000).toISOString();
  let latestReads = 0;
  const store = {
    jungman_config: JSON.stringify({
      soopId: "x",
      titleNo: 1,
      autoCollect: true,
      voteCloseAt: "2099-01-01T00:00:00+09:00",
      mapping: { 1: "DM" },
    }),
    jungman_snapshots: JSON.stringify([{ round: 500, at, votes: { DM: 1000 } }]),
    // 쓰기 직전 재확인 때는 다른 수집기가 이미 501차를 기록한 상태
    get jungman_latest() {
      latestReads += 1;
      return JSON.stringify({ at, round: latestReads === 1 ? 500 : 501 });
    },
  };

  const restore = stubSoopComments([soopRow(1, 1100)]);
  try {
    const run = loadJungmanCollector(store);
    assert.deepEqual(await run.collector.collectJungmanSnapshot(false), { ok: false, skipped: "raced" });
    assert.ok(!run.writes.some(([key]) => key === "jungman_snapshots"), "raced must not write");
    assert.ok(latestReads >= 2, "the collector must re-read the summary key before writing");
  } finally {
    restore();
  }
});

test("jungman team short labels follow the project metadata", () => {
  const { JUNGMAN_TEAMS, teamShort } = loadJungmanLib();
  // 표기는 임의로 정하지 않는다 — data/metadata/projects/*/players.*.json의 team_name_en이 원본이다
  const META = { KMS: "calm", HKA: "black", DM: "dm", WFU: "wfu", JSA: "jsa",
    BGM: "bgm", HM: "hm", SSG: "ssg", NCS: "ncs", MBU: "mbu", KU: "ku", SSU: "ssu" };

  for (const team of JUNGMAN_TEAMS) {
    const file = `data/metadata/projects/${META[team.code]}/players.${META[team.code]}.v1.json`;
    const documented = JSON.parse(readProjectFile(file)).team_name_en;
    assert.equal(
      teamShort(team).toUpperCase(),
      String(documented).toUpperCase(),
      `${team.name} 표기가 메타데이터(${documented})와 다르다`
    );
  }
});

test("jungman freezes into a final result once the vote closes", () => {
  const { isJungmanClosed, buildJungmanHeadlines } = loadJungmanLib();

  const closeAt = "2026-07-30T15:00:00.000Z";
  assert.equal(isJungmanClosed(closeAt, Date.parse(closeAt) - 1000), false);
  assert.equal(isJungmanClosed(closeAt, Date.parse(closeAt)), true);
  // 설정이 깨져 마감 시각을 못 읽으면 진행 중으로 남는다 — 멀쩡한 투표를 종료로 덮으면 안 된다
  assert.equal(isJungmanClosed("not-a-date", Date.now()), false);

  // 티커는 확정 한 문장으로 고정 — 진행 중을 암시하는 문장이 하나도 섞이면 안 된다
  const lines = buildJungmanHeadlines(
    [headlineSnapshot(1, headlineBase), headlineSnapshot(2, { ...headlineBase, JSA: 850 })],
    closeAt,
    Date.parse(closeAt) + 60_000
  );
  // 표수는 붙이지 않는다 — 마감 순간 공지가 닫혀 마지막 몇 분이 집계에 안 잡힐 수 있다
  assert.deepEqual(lines, ["최종 결과 — 1위 DM"]);
  // 마감 전에는 한 글자도 달라지지 않는다
  assert.ok(
    buildJungmanHeadlines([headlineSnapshot(1, headlineBase)], closeAt, Date.parse(closeAt) - 60_000).length >= 3
  );

  // /jungman에는 마감 갈림길 자체가 없다 — 상태를 읽지 않고 확정 결과만 그린다.
  // 여기에 getJungmanState가 다시 들어오면 끝난 투표 화면이 조별 순위 위로 되돌아온다.
  const page = readProjectFile("app/jungman/page.tsx");
  assert.doesNotMatch(page, /getJungmanState|isJungmanClosed|degraded/);
  assert.match(page, /buildJungmanFinalStandings\(\)/);
});

test("jungman final result matches the official notice", () => {
  const { JUNGMAN_FINAL_VOTES, JUNGMAN_FINAL_TOTAL, buildJungmanFinalStandings } = loadJungmanLib();

  // 공지 확정치 — 오타 하나가 공식 결과로 나간다
  assert.equal(JUNGMAN_FINAL_TOTAL, 106741);
  assert.equal(Object.keys(JUNGMAN_FINAL_VOTES).length, 11, "투표 대상 11팀이 모두 있어야 한다");

  const standings = buildJungmanFinalStandings();
  assert.deepEqual(
    standings.map((standing) => [standing.rank, standing.team.code, standing.votes]).slice(0, 4),
    [
      [1, "KMS", 29431],
      [2, "NCS", 20242],
      [3, "KU", 11533],
      [4, "JSA", 10554],
    ]
  );
  // 시드 배지는 1~3위에만 (수술대는 투표 밖에서 4시드)
  assert.deepEqual(
    standings.filter((standing) => standing.badge === "seed").map((standing) => standing.team.code),
    ["KMS", "NCS", "KU"]
  );
});

test("jungman hides vote counts after the close", () => {
  const map = readProjectFile("components/jungman/JungmanMap.tsx");
  const page = readProjectFile("app/jungman/page.tsx");

  // 마감 순간 숲 공지가 비공개로 바뀌면 마지막 몇 분의 추천이 집계에 안 잡힌다.
  // 순위는 확정으로 보여주되 표수는 한 군데도 남기지 않는다 — 틀린 숫자가 공식 수치처럼 읽힌다.
  // 지도 칩 — "n위 · 1,234표"에서 표수만 뺀다
  assert.match(map, /closed \? `\$\{marker\.rank\}위`/);
  // /jungman은 마감 상태로 굳었다 — 지도도 조건 없이 closed로 그린다
  assert.match(page, /<JungmanMap markers=\{markers\} closed \/>/);
});

/** 수집 라우트를 실제로 실행한다. next/* 와 관리자 인증·수집기는 스텁으로 대신 답한다. */
function loadCollectRoute({ admin = false } = {}) {
  const forces = [];
  const route = loadModule("app/api/jungman/collect/route.ts", (id) => {
    if (id === "next/cache") return { revalidatePath: () => {} };
    if (id === "next/headers") {
      return { cookies: async () => ({ get: () => (admin ? { value: "admin-token" } : undefined) }) };
    }
    if (id === "next/server") {
      return {
        NextResponse: { json: (body, init) => ({ status: (init && init.status) || 200, body }) },
        // 응답 후 캐시 워밍용 — 테스트에서는 실행하지 않는다(진짜 fetch가 나가면 안 된다)
        after: () => {},
      };
    }
    if (id === "@/lib/admin-auth") {
      return {
        ADMIN_SESSION_COOKIE: "nzu_admin",
        isValidAdminSession: (value) => value === "admin-token",
      };
    }
    return {
      collectJungmanSnapshot: async (force) => {
        forces.push(force);
        return { ok: true, round: 1, votes: {}, carried: [] };
      },
    };
  });

  return { route, forces };
}

const collectRequest = (headers = {}, body = {}) =>
  new Request("https://www.star-hosaga.com/api/jungman/collect", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

test("jungman collect endpoint honours an optional shared secret", async () => {
  const original = process.env.JUNGMAN_COLLECT_SECRET;
  try {
    // 시크릿 미설정 = 지금 그대로 공개. 배포가 크론 헤더 설정보다 먼저 나가도 수집이 끊기면 안 된다.
    delete process.env.JUNGMAN_COLLECT_SECRET;
    const open = loadCollectRoute();
    assert.equal((await open.route.POST(collectRequest())).status, 200);
    assert.equal(open.forces.length, 1);

    process.env.JUNGMAN_COLLECT_SECRET = "s3cret";

    // 헤더 없음·틀린 헤더는 401이고 DB 근처도 못 간다
    for (const headers of [{}, { "x-jungman-secret": "wrong" }]) {
      const blocked = loadCollectRoute();
      const response = await blocked.route.POST(collectRequest(headers));
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, { ok: false, skipped: "unauthorized" });
      assert.equal(blocked.forces.length, 0, "unauthorized must not reach the collector");
    }

    const allowed = loadCollectRoute();
    assert.equal((await allowed.route.POST(collectRequest({ "x-jungman-secret": "s3cret" }))).status, 200);
    assert.equal(allowed.forces.length, 1);

    // 관리자 [지금 수집]은 시크릿 헤더 없이도 통과하고 force도 쓴다
    const asAdmin = loadCollectRoute({ admin: true });
    assert.equal((await asAdmin.route.POST(collectRequest({}, { force: true }))).status, 200);
    assert.deepEqual(asAdmin.forces, [true]);

    // force는 관리자 쿠키가 있을 때만 — 시크릿만 아는 크론은 쿨다운을 못 뚫는다
    const cron = loadCollectRoute();
    await cron.route.POST(collectRequest({ "x-jungman-secret": "s3cret" }, { force: true }));
    assert.deepEqual(cron.forces, [false]);
  } finally {
    if (original === undefined) delete process.env.JUNGMAN_COLLECT_SECRET;
    else process.env.JUNGMAN_COLLECT_SECRET = original;
  }
});

test("jungman collect endpoint throttles repeat calls inside one instance", async () => {
  const original = process.env.JUNGMAN_COLLECT_SECRET;
  try {
    delete process.env.JUNGMAN_COLLECT_SECRET;
    const run = loadCollectRoute();

    assert.equal((await run.route.POST(collectRequest())).status, 200);
    const second = await run.route.POST(collectRequest());
    assert.deepEqual(second.body, { ok: false, skipped: "throttled" });
    assert.equal(run.forces.length, 1, "throttled call must not reach the collector");

    // 관리자 force는 예외 — [지금 수집]이 20초 벽에 막히면 손 쓸 수단이 사라진다
    const adminRun = loadCollectRoute({ admin: true });
    await adminRun.route.POST(collectRequest({}, { force: true }));
    await adminRun.route.POST(collectRequest({}, { force: true }));
    assert.deepEqual(adminRun.forces, [true, true]);
  } finally {
    if (original === undefined) delete process.env.JUNGMAN_COLLECT_SECRET;
    else process.env.JUNGMAN_COLLECT_SECRET = original;
  }
});

test("public pages expose robots, a sitemap and a canonical base", () => {
  const robots = readProjectFile("app/robots.ts");
  const sitemap = readProjectFile("app/sitemap.ts");
  const layout = readProjectFile("app/layout.tsx");

  assert.match(robots, /disallow: \["\/admin", "\/api"\]/);
  assert.match(robots, /sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/);

  // 사이트맵 원본은 내비게이션 하나 — 메뉴가 늘면 사이트맵도 같이 는다
  assert.match(sitemap, /visibleNavbarLinks/);
  assert.match(sitemap, /\.filter\(\(link\) => !link\.href\.startsWith\("\/overlay"\)\)/);
  // 동적 상세를 수천 개 흘리지 않는다
  assert.doesNotMatch(sitemap, /\/player\/\$\{/);

  assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
  assert.match(layout, /robots: \{ index: true, follow: true \}/);
  assert.match(layout, /siteName: "호사가 HOSAGA"/);
  // og:url도 canonical과 같은 함정 — 루트에 박으면 하위 페이지 카드가 전부 홈을 가리킨다
  assert.doesNotMatch(layout, /url: "\/"/);
  // 빈 검증 코드는 없느니만 못하다
  assert.doesNotMatch(layout, /YOUR_NAVER_CODE/);
  // canonical은 페이지별 자기 주소 — 루트에 두면 하위 페이지까지 "/"로 상속된다
  assert.doesNotMatch(layout, /alternates:/);
  assert.match(readProjectFile("app/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  assert.match(readProjectFile("app/jungman/page.tsx"), /alternates: \{ canonical: "\/jungman" \}/);
});

test("public routes carry their own description and canonical", () => {
  const firstDescription = (source) => {
    const match = source.match(/description:\s*"([^"]+)"/);
    return match ? match[1] : null;
  };

  const homeDescription = firstDescription(readProjectFile("app/page.tsx"));
  assert.ok(homeDescription, "app/page.tsx must declare a description");

  // 목록은 하드코딩하지 않는다 — 내비게이션이 원본이라 메뉴가 늘면 이 검사도 같이 는다
  const routes = (readProjectFile("lib/navigation-config.ts").match(/href: "[^"]+"/g) || [])
    .map((entry) => entry.slice('href: "'.length, -1))
    .filter((href) => href !== "/" && !href.startsWith("/overlay"));
  assert.ok(routes.length >= 8, `expected the public nav to expose at least 8 routes, got ${routes.length}`);

  const owners = new Map();
  for (const href of routes) {
    const file = `app${href}/page.tsx`;
    const source = readProjectFile(file);
    const description = firstDescription(source);

    // 자기 설명이 없으면 홈 설명을 그대로 물려받는다 — 구글이 /tier와 /player를 구분하지 못한다
    assert.ok(description, `${file} must declare its own description`);
    assert.notEqual(description, homeDescription, `${file} must not reuse the home description`);
    assert.ok(!owners.has(description), `${file} duplicates the description of ${owners.get(description)}`);
    owners.set(description, file);

    // canonical·og:url은 페이지마다 자기 주소
    assert.ok(source.includes(`canonical: "${href}"`), `${file} must set canonical to ${href}`);
    assert.ok(source.includes(`url: "${href}"`), `${file} must set og:url to ${href}`);
  }
});

test("jungman rank arrows run on the hour baseline and the map reads the same value", () => {
  const { buildJungmanStandings, buildJungmanMarkers, buildJungmanHourDeltas, jungmanHourBaseline } = loadJungmanLib();
  const at = (minutesAgo) => new Date(Date.UTC(2026, 6, 27, 12, 0) - minutesAgo * 60_000).toISOString();
  // 케이대가 90분 전엔 꼴찌(50표), 1시간 기준점에도 꼴찌, 3분 전에 이미 1위로 올라섰다
  const snapshots = [
    { round: 1, at: at(90), votes: headlineBase },
    { round: 2, at: at(65), votes: headlineBase },
    { round: 3, at: at(3), votes: { ...headlineBase, KU: 2000 } },
    { round: 4, at: at(0), votes: { ...headlineBase, KU: 2050 } },
  ];

  // 기준은 직전 차수(3분 전)가 아니라 1시간 전 — 3분 기준이면 0이라 화살표가 사라진다
  const standings = buildJungmanStandings(snapshots);
  const ku = standings.find((standing) => standing.team.code === "KU");
  assert.equal(ku.rank, 1);
  assert.equal(ku.rankDelta, 10, "11위 → 1위는 ▲10이어야 한다");
  // 옆칸 1시간 증가량과 같은 스냅샷을 봐야 두 숫자가 어긋나지 않는다
  assert.equal(jungmanHourBaseline(snapshots).round, 2);
  assert.equal(buildJungmanHourDeltas(snapshots).KU, 2000);

  // 지도 마커도 리스트와 같은 값 — 표시 소스가 하나여야 두 화면이 다른 숫자를 말하지 않는다
  const marker = buildJungmanMarkers(standings).find((entry) => entry.code === "KU");
  assert.equal(marker.rankDelta, ku.rankDelta);

  // 1시간 전 기록이 없으면 비교하지 않는다 (증가량과 같은 규칙)
  assert.equal(jungmanHourBaseline([snapshots[3]]), null);
  assert.equal(buildJungmanStandings([snapshots[3]])[0].rankDelta, null);
  assert.deepEqual(buildJungmanHourDeltas([snapshots[3]]), {});

  // 마감 뒤에는 멈춘 화살표를 지도에서도 내린다
  assert.match(readProjectFile("components/jungman/JungmanMap.tsx"), /const rankDelta = closed \? null : marker\.rankDelta;/);
});

test("jungman headlines drop stale rank swaps", () => {
  const { buildJungmanHeadlines } = loadJungmanLib();
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  // 두 시점: 예전엔 DM이 1위, 지금은 KMS가 1위 — 교체 사건이 만들어진다
  const snap = (round, minutesAgo, votes) => ({ round, at: at(minutesAgo), votes });
  // 최신 집계 시점 기준으로 오래된 교체 (마지막 스냅샷보다 4시간 앞)
  // 교체는 5시간 전에 일어났고 그 뒤로 순위 변화 없이 최신 집계까지 왔다
  const old = [snap(1, 305, { DM: 100, KMS: 50 }), snap(2, 300, { DM: 100, KMS: 200 }), snap(3, 10, { DM: 100, KMS: 200 })];
  const fresh = [snap(1, 20, { DM: 100, KMS: 50 }), snap(2, 10, { DM: 100, KMS: 200 })];

  // 오래된 교체는 티커에 남지 않는다 — 어제 일을 현재형으로 방송하면 안 된다
  assert.ok(
    !buildJungmanHeadlines(old).some((line) => /위로 올라섰습니다/.test(line)),
    "5시간 전 순위 교체가 티커에 남았다"
  );
  assert.ok(
    buildJungmanHeadlines(fresh).some((line) => /위로 올라섰습니다/.test(line)),
    "방금 일어난 순위 교체가 티커에서 빠졌다"
  );
});

