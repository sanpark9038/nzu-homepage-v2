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
  // 순위·경합 계산도 12팀 기준
  assert.match(lib, /[rR]ankMap[\s\S]*?JUNGMAN_VOTING_TEAMS\.slice\(\)\.sort/);
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

test("jungman live mode has a server-computed window and a viewer-driven poller", () => {
  const lib = readProjectFile("lib/jungman.ts");
  const client = readProjectFile("app/jungman/JungmanClient.tsx");
  const page = readProjectFile("app/jungman/page.tsx");

  assert.match(lib, /JUNGMAN_LIVE_WINDOW_MS = \d+ \* 60 \* 1000/);
  assert.match(lib, /JUNGMAN_COLLECT_INTERVAL_MS = \d+ \* 60 \* 1000/);
  // 쿨다운은 크론 주기보다 짧아야 매 회차가 통과한다
  assert.match(lib, /JUNGMAN_COLLECT_COOLDOWN_MS = \d+ \* 1000/);
  assert.match(lib, /isLive: isJungmanLive\(latest\)/);

  // 백그라운드 탭은 갱신하지 않는다
  assert.match(client, /if \(document\.hidden\) return;/);
  assert.match(client, /router\.refresh\(\)/);
  // 상단은 차수가 아니라 갱신 상태 — LIVE면 초 단위 경과, 아니면 마지막 집계 시각
  assert.match(client, /LIVE<\/span>/);
  assert.match(client, /elapsedLabel\(now - Date\.parse\(latestAt\)\)/);
  assert.match(client, /\{jungmanSeoulTime\(latestAt\)\}/);
  assert.doesNotMatch(client, /차 개표/);
  assert.match(client, /motion-reduce:hidden/);
  // 집계 주기 안내는 상수에서 만든다 — 하드코딩하면 상수가 바뀔 때 거짓말이 된다
  assert.match(client, /\{jungmanIntervalLabel\(\)\}마다 자동 집계/);
  assert.doesNotMatch(client, /3분마다 자동 집계/);
  assert.match(lib, /export function jungmanIntervalLabel/);

  // 자동 갱신을 autoCollect 하나에 매달면 읽기 실패(=기본값 false) 순간 회복 수단까지 사라진다
  assert.match(page, /const autoRefresh = config\.autoCollect \|\| snapshots\.length > 0 \|\| degraded;/);
  assert.match(page, /\{autoRefresh \? <JungmanAutoRefresh \/> : null\}/);
  assert.match(page, /isLive=\{isLive\}/);
});

test("jungman viewers refresh the page instead of driving collection", () => {
  const client = readProjectFile("app/jungman/JungmanClient.tsx");

  // 뷰어 폴링이 수집을 때리면 쿨다운으로 스킵되는 호출마다 86KB 스냅샷을 읽는다 —
  // 동시 시청자 수만큼 전송량이 곱해진다. 수집은 서버 크론 몫이다.
  assert.doesNotMatch(client, /fetch\(\s*"\/api\/jungman\/collect/);
  assert.doesNotMatch(client, /method: "POST"/);
  assert.match(client, /export function JungmanAutoRefresh/);

  // 엔드포인트 자체는 남아야 한다 — 크론과 관리자 [지금 수집]이 쓴다
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
    jungman_config: JSON.stringify({ soopId: "x", titleNo: 1, autoCollect: true, mapping: { 1: "DM" } }),
    jungman_snapshots: JSON.stringify(snapshots),
    jungman_latest: JSON.stringify({ at: snapshots[499].at, round: 500 }),
  };

  // 쿨다운이면 가벼운 키만 읽고 끝난다 — 스냅샷 배열은 건드리지 않는다
  const cooled = loadJungmanCollector(store);
  assert.deepEqual(await cooled.collector.collectJungmanSnapshot(false), { ok: false, skipped: "cooldown" });
  assert.ok(!cooled.reads.includes("jungman_snapshots"), `snapshot array was read: ${cooled.reads}`);
  assert.deepEqual(cooled.reads, ["jungman_config", "jungman_latest"]);

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

// 12팀 votes 레코드를 만든다 — 코드 순서는 lib의 JUNGMAN_VOTING_TEAMS와 같다
const headlineSnapshot = (round, votes) => ({ round, at: `2026-07-2${round}T00:00:00.000Z`, votes });
// 인접 격차를 전부 경합 임계(1위의 3% = 30표)보다 크게 벌려 둔다 — 사건 없는 기준선
const headlineBase = {
  DM: 1000, KMS: 900, WFU: 800, C9: 700, JSA: 600, BGM: 500,
  HKA: 400, HM: 300, SSG: 200, NCS: 150, MBU: 100, KU: 50,
};

test("jungman headlines narrate what actually changed since an hour ago", () => {
  const { buildJungmanHeadlines } = loadJungmanLib();
  const snapshot = headlineSnapshot;
  const base = headlineBase;

  assert.deepEqual(buildJungmanHeadlines([]), []);

  // 씨나인(700→850)이 와플대(800)를 넘어 3위 — 교체(시각 포함) + 컷라인 양쪽이 잡힌다
  const swap = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, C9: 850 })]);
  assert.equal(swap[0], "09:00 씨나인이 3위로 올라섰습니다");
  assert.ok(swap.includes("씨나인이 시드권에 진입했습니다"), swap.join(" / "));
  assert.ok(swap.includes("와플대가 시드권에서 밀려났습니다"), swap.join(" / "));

  // 케이대(50, 12위 → 250, 9위)가 와일드카드권 탈출, 밀려난 쪽도 잡힌다
  const escaped = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KU: 250 })]);
  assert.equal(escaped[0], "09:00 케이대가 9위로 올라섰습니다");
  assert.ok(escaped.includes("케이대가 와일드카드권에서 벗어났습니다"), escaped.join(" / "));
  assert.ok(escaped.includes("뉴캣슬이 와일드카드권으로 밀렸습니다"), escaped.join(" / "));

  // 초박빙 — 인접 표차가 1위 표수의 3%(=30표) 이내. 조사도 받침 따라 붙는다(DM=엠 → "과")
  const tight = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, KMS: 999 })]);
  assert.equal(tight[0], "1위 DM과 2위 캄몬스타즈가 1표 차입니다");
  assert.ok(tight.includes("최근 1시간 캄몬스타즈가 +99표로 가장 많이 늘었습니다"), tight.join(" / "));
  // 초박빙이 1·2위를 이미 다뤘으면 선두 격차 문장은 겹치지 않게 생략된다
  assert.ok(!tight.some((line) => line.includes("앞서 있습니다")), tight.join(" / "));

  // 사건이 쏟아져도 5개까지
  assert.equal(
    buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, C9: 850, KU: 250 })]).length,
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
  assert.ok(idle.includes("3위 와플대와 4위 씨나인이 100표 차입니다"), idle.join(" / "));
  assert.ok(idle.includes("10위 뉴캣슬과 11위 엠비대가 50표 차입니다"), idle.join(" / "));
  assert.ok(idle.includes("1위 DM이 2위와 100표 차로 앞서 있습니다"), idle.join(" / "));

  // 스냅샷 하나뿐이라 비교 대상이 없어도 상시 소재로 3문장
  assert.ok(buildJungmanHeadlines([snapshot(1, base)]).length >= 3);

  // 만 단위 이정표는 기준 시점에 못 미쳤다가 넘긴 순간만
  const crossed = buildJungmanHeadlines([snapshot(1, base), snapshot(2, { ...base, DM: 5300 })]);
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

test("jungman charts label the x axis in Asia/Seoul and mark day boundaries", () => {
  const { jungmanAxisLabel, jungmanSeoulTime, jungmanDayBoundaries, buildJungmanRankEvents } = loadJungmanLib();
  const chart = readProjectFile("app/jungman/JungmanChart.tsx");

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

  // 차트는 "n차"가 아니라 시간축을 쓴다 + 날짜 경계선을 그린다
  assert.match(chart, /jungmanAxisLabel\(/);
  assert.match(chart, /jungmanDayBoundaries\(/);
  assert.match(chart, /일차/);
  assert.doesNotMatch(chart, /snapshot\.round/);

  // 순위 상승 시점 타임라인 — 최신순
  const votes = (dm, ku) => ({ DM: dm, KU: ku });
  const events = buildJungmanRankEvents([
    { round: 1, at: before, votes: votes(100, 50) },
    { round: 2, at: after, votes: votes(100, 200) },
  ]);
  assert.equal(events.length, 1);
  assert.deepEqual({ code: events[0].code, rank: events[0].rank, at: events[0].at }, { code: "KU", rank: 1, at: after });
});

test("jungman charts emphasise the cutlines, not the vote leaders", () => {
  const lib = loadJungmanLib();
  const { jungmanEmphasis, JUNGMAN_SEED_CUT, JUNGMAN_WILDCARD_CUT, JUNGMAN_VOTING_TEAMS } = lib;
  const chart = readProjectFile("app/jungman/JungmanChart.tsx");

  const tiers = Array.from({ length: JUNGMAN_VOTING_TEAMS.length }, (_, i) => jungmanEmphasis(i + 1));
  // 1~3위(시드) + 11~12위(와카)가 1군, 컷 바로 안쪽 4위·10위가 2군, 나머지는 배경
  assert.deepEqual(tiers, [
    "lead", "lead", "lead", "edge", "back", "back",
    "back", "back", "back", "edge", "lead", "lead",
  ]);
  // 순위가 아니라 컷 상수를 기준으로 판정해야 한다 — 컷이 움직이면 강조도 따라 움직인다
  assert.equal(jungmanEmphasis(JUNGMAN_SEED_CUT), "lead");
  assert.equal(jungmanEmphasis(JUNGMAN_SEED_CUT + 1), "edge");
  assert.equal(jungmanEmphasis(JUNGMAN_WILDCARD_CUT), "edge");
  assert.equal(jungmanEmphasis(JUNGMAN_WILDCARD_CUT + 1), "lead");

  // 득표 상위 N개를 잘라 강조하던 규칙은 남아 있으면 안 된다
  assert.doesNotMatch(chart, /FOCUS/);
  // 차트·범례 둘 다 같은 규칙을 쓴다 (득표/순위 모드 공용)
  assert.ok((chart.match(/jungmanEmphasis\(/g) || []).length >= 2, "chart and legend should share the rule");
  assert.match(chart, /JUNGMAN_SEED_CUT/);
  assert.match(chart, /JUNGMAN_WILDCARD_CUT/);
});

test("jungman dashboard keeps the map server-side and shares one selected team", () => {
  const page = readProjectFile("app/jungman/page.tsx");
  const client = readProjectFile("app/jungman/JungmanClient.tsx");

  // 88KB 지도 SVG는 서버에서 그려 children으로 넘긴다 — 클라이언트가 import하면 번들로 넘어간다
  assert.doesNotMatch(client, /JungmanMap/);
  assert.match(page, /map=\{/);
  // 버킷은 서버가 끝낸다
  assert.match(page, /buildJungmanSeries\(snapshots\)/);

  // hover는 일시 강조, 클릭 선택은 지속 강조 — hover가 끝나면 선택으로 돌아온다
  assert.match(client, /pokeMap\("data-active", hovered \|\| selected\)/);
  // 지도 마커 클릭도 선택 입력 (서버 SVG라 이벤트 위임)
  assert.match(client, /closest\?\.\("\[data-team\]"\)/);
  assert.match(readProjectFile("components/jungman/JungmanMap.tsx"), /cursor:pointer/);
});

test("jungman is reachable from public and admin navigation", () => {
  assert.match(readProjectFile("lib/navigation-config.ts"), /href: "\/jungman", label: "중만컵"/);
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
  assert.equal(broken.standings.length, 12);

  // 정상 읽기는 degraded가 아니다
  const snapshot = { round: 7, at: new Date().toISOString(), votes: { DM: 10 } };
  const healthy = loadJungmanLib(async (key) =>
    key === "jungman_snapshots" ? JSON.stringify([snapshot]) : null
  );
  const fine = await healthy.getJungmanState();
  assert.equal(fine.degraded, false);
  assert.equal(fine.latest.round, 7);

  // 화면: 빈 상태가 아니라 실패를 말하고, 못 믿을 config로 카운트다운을 그리지 않는다
  const page = readProjectFile("app/jungman/page.tsx");
  assert.match(page, /집계 데이터를 불러오지 못했습니다/);
  assert.match(page, /곧 다시 시도합니다/);
  assert.match(page, /degraded \? null : \(/);
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
  const META = { KMS: "calm", HKA: "black", C9: "c9", DM: "dm", WFU: "wfu", JSA: "jsa",
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
