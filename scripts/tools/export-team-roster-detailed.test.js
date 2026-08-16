const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const {
  buildExternalOpponentExclusionRows,
  filterPlayersByEntityIds,
  exclusionReason,
  directReportArgs,
  shouldUseNoCacheForFetch,
  evaluateRegressionGuard,
  shouldSkipByPriorityWindow,
  shouldReuseInactiveExistingJson,
  shouldRotationFullVerify,
  shouldReuseExistingJson,
  isSourceOutageError,
  errorDetailText,
  sourceOutageMarkerPath,
  hasSourceOutageMarker,
  nextSourceOutageStreak,
  isSourceOutageCircuitOpen,
  sourceOutageOutcome,
  SOURCE_OUTAGE_STREAK_LIMIT,
  ROTATION_BUCKETS,
} = require("./export-team-roster-detailed");
const { loadProjectPlayerMetadata } = require("./lib/project-player-metadata");
const { shouldUseMixEndpoint } = require("./lib/eloboard-special-cases");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeTempJson(fileName, value = {}) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  return filePath;
}

runTest("shouldSkipByPriorityWindow reuses recent cached json within interval", () => {
  const filePath = writeTempJson("__test__priority_window_recent.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const yesterday = new Date("2026-04-08T12:00:00.000Z");
    fs.utimesSync(filePath, yesterday, yesterday);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

// 2026-08-08 회귀: 예약이 밀려 어제 실행이 10시에 끝나면, 오늘 새벽 실행까지 경과가
// 22시간대라 매일 확인(1일) 선수가 전원 스킵됐다. 날짜가 바뀌었으면 다시 읽어야 한다.
runTest("shouldSkipByPriorityWindow collects again once the Seoul date changes", () => {
  assert.equal(
    shouldSkipByPriorityWindow(
      { last_checked_at: "2026-08-07T01:05:46.472Z", check_interval_days: 1 },
      "2026-08-08"
    ),
    false,
    "어제 읽었으면 오늘은 다시 읽어야 한다(경과 22시간이어도)"
  );
  assert.equal(
    shouldSkipByPriorityWindow(
      { last_checked_at: "2026-08-08T01:05:46.472Z", check_interval_days: 1 },
      "2026-08-08"
    ),
    true,
    "같은 날 이미 읽었으면 스킵"
  );
});

runTest("shouldSkipByPriorityWindow forces recollect when cached json is stale", () => {
  const filePath = writeTempJson("__test__priority_window_stale.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const stale = new Date("2026-04-05T12:00:00.000Z");
    fs.utimesSync(filePath, stale, stale);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("inactive reuse does not bypass due priority-window recollection", () => {
  const filePath = writeTempJson("__test__inactive_due_priority.json", {
    players: [{ period_max_date: "2026-04-20" }],
  });
  try {
    assert.equal(
      shouldReuseInactiveExistingJson(
        { last_checked_at: "2026-05-01T00:00:00.000Z", check_interval_days: 3 },
        14,
        "2026-05-14T00:00:00.000Z",
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("inactive reuse still protects legacy players without priority metadata", () => {
  const filePath = writeTempJson("__test__inactive_legacy_player.json", {
    players: [{ period_max_date: "2026-04-20" }],
  });
  try {
    assert.equal(
      shouldReuseInactiveExistingJson({}, 14, "2026-05-14T00:00:00.000Z", filePath),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

// 새 의도: 매일 확인하는 선수(check_interval_days=1)도 책갈피 증분으로 읽는다.
// 예전에는 이들이 매일 --no-cache로 전체 재수집됐고, 그 플래그가 책갈피 저장까지 막아
// 책갈피가 몇 달째 얼어 있었다. 전체 재수집은 명시적 --force-no-cache에서만 일어난다.
runTest("daily-cadence players no longer bypass the bookmark cache", () => {
  assert.equal(shouldUseNoCacheForFetch({ forceNoCache: false }), false);
  assert.equal(shouldUseNoCacheForFetch({}), false);
  assert.equal(shouldUseNoCacheForFetch(null), false);
});

runTest("report args carry the bookmark identity and the merge source when prior json exists", () => {
  const player = {
    name: "선수",
    wr_id: 123,
    gender: "female",
    tier: "잭",
    entity_id: "eloboard:female:123",
    profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=123",
  };
  const args = directReportArgs("테스트팀", "선수", player);
  assert.equal(args[args.indexOf("--entity-id") + 1], "eloboard:female:123");
  // 병합 원본이 없으면 --prior-json도 없어야 한다(몸통 없이 앵커만 믿고 조기 중단 방지).
  assert.equal(args.includes("--prior-json"), false);
  assert.equal(args.includes("--no-cache"), false);

  const priorPath = path.join(TMP_DIR, "테스트팀_eloboard:female:123_matches.json".replace(/:/g, "_"));
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(priorPath, JSON.stringify({ players: [{ matches: [] }] }), "utf8");
  try {
    const withPrior = directReportArgs("테스트팀", "선수", player);
    assert.equal(withPrior[withPrior.indexOf("--prior-json") + 1], priorPath);
  } finally {
    try {
      fs.unlinkSync(priorPath);
    } catch {}
  }
});

runTest("filterPlayersByEntityIds keeps only requested canonical players", () => {
  const roster = [
    { entity_id: "eloboard:male:37", name: "A" },
    { entity_id: "eloboard:female:956", name: "B" },
    { entity_id: "eloboard:male:8", name: "C" },
  ];

  assert.deepEqual(filterPlayersByEntityIds(roster, " female:956, male:37 "), [
    { entity_id: "eloboard:male:37", name: "A" },
    { entity_id: "eloboard:female:956", name: "B" },
  ]);
});

runTest("filterPlayersByEntityIds returns full roster when no entity ids are requested", () => {
  const roster = [{ entity_id: "male:37", name: "A" }];

  assert.deepEqual(filterPlayersByEntityIds(roster, ""), roster);
});

runTest("external-opponent name decisions never exclude roster players (entity_id), only entity-less matches", () => {
  const rows = buildExternalOpponentExclusionRows({
    decisions: [
      { opponent_name: " 다예 ", decision: "external_opponent" },
      { opponent_name: "림예이", decision: "external_opponent" },
      { opponent_name: "기준후보", decision: "canonical_candidate" },
      { opponent_name: "", decision: "external_opponent" },
    ],
  });

  assert.deepEqual(rows, [
    {
      name: "다예",
      reason: "external_opponent_reviewed",
    },
    {
      name: "림예이",
      reason: "external_opponent_reviewed",
    },
  ]);
  // 로스터 선수는 전부 entity_id 보유 → 이름-only 외부인 규칙과 이름이 같아도 제외되지 않는다.
  // (김설·앵지·박정일이 두 달 조용히 미수집되던 사고를 구조적으로 차단)
  assert.equal(
    exclusionReason({ name: "다예", wr_id: 999, entity_id: "eloboard:female:999" }, rows),
    null
  );
  // entity_id 없는(비로스터) 동명 상대만 이름 규칙으로 제외된다.
  assert.equal(exclusionReason({ name: "다예" }, rows), "external_opponent_reviewed");
});

runTest("shouldUseNoCacheForFetch honors an explicit force flag", () => {
  assert.equal(shouldUseNoCacheForFetch({ forceNoCache: true }), true);
});

// R3 보험(순환 전체 정독). 상태 파일 없이 결정적으로 골라야 하므로, 같은 날은 항상 같은 집합이
// 나와야 한다(재실행·청크 분할에도 흔들리지 않는다).
runTest("rotation full-verify picks the same players for the same day, different for another day", () => {
  const players = Array.from({ length: 100 }, (_, i) => ({ entity_id: `eloboard:female:${i}` }));
  const pick = (date) => players.filter((p) => shouldRotationFullVerify(p, date)).map((p) => p.entity_id);

  assert.deepEqual(pick("2026-07-01"), pick("2026-07-01"), "같은 날짜는 같은 집합");
  assert.notDeepEqual(pick("2026-07-01"), pick("2026-07-02"), "다음 날은 다른 버킷");
  // entity_id 없는 선수(비식별)는 순환 대상이 아니다 — 어떤 날에도 뽑히면 안 된다.
  assert.equal(shouldRotationFullVerify({ entity_id: "" }, "2026-07-01"), false);
  assert.equal(shouldRotationFullVerify({ entity_id: "eloboard:female:1" }, "not-a-date"), false);
});

// 핵심 증명: 34일 연속이면 전원이 정확히 1회씩 정독된다("한 달에 전원 1회"). epoch-day가
// 단조증가라 버킷이 정확히 한 바퀴 돈다.
runTest("34 consecutive days cover every rotation-eligible roster player exactly once", () => {
  // 선수 객체를 통째로 쓴다. entity_id만 뽑아 쓰면 혼성 보드 판정(profile_url·name 기반)이
  // 죽어서, 실제로는 제외되는 선수를 테스트만 포함시키는 거짓 통과가 된다.
  const seen = new Set();
  const roster = loadProjectPlayerMetadata().filter((p) => {
    const id = String(p.entity_id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const players = roster.length
    ? roster
    : Array.from({ length: 337 }, (_, i) => ({
        entity_id: `eloboard:${i % 2 ? "male" : "female"}:${1000 + i}`,
      }));
  // 혼성 보드 선수는 수집이 꺼져 있어 정독이 성립하지 않는다 → 순환 대상이 아니다.
  const eligible = players.filter((p) => !shouldUseMixEndpoint(p));
  assert.ok(eligible.length, "순환 대상이 하나도 없으면 이 테스트는 아무것도 증명하지 못한다");

  const counts = new Map();
  const dailySizes = [];
  const start = Date.UTC(2026, 6, 1);
  for (let day = 0; day < ROTATION_BUCKETS; day += 1) {
    const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
    const picked = players.filter((p) => shouldRotationFullVerify(p, date));
    dailySizes.push(picked.length);
    for (const p of picked) counts.set(p.entity_id, (counts.get(p.entity_id) || 0) + 1);
  }

  assert.equal(counts.size, eligible.length, "34일이면 순환 대상 전원이 최소 1회 정독된다");
  assert.ok([...counts.values()].every((n) => n === 1), "각 선수는 정확히 1회(버킷당 정확히 1일)");
  const total = dailySizes.reduce((a, b) => a + b, 0);
  assert.equal(total, eligible.length);
  // 하루 부하: 337명이면 평균 ~10명. 상한은 해시 분포에 브리틀하지 않게 넉넉히 잡는다.
  assert.ok(Math.max(...dailySizes) <= 25, `하루 최대 ${Math.max(...dailySizes)}명은 너무 많다`);
  console.log(
    `  rotation coverage: roster=${players.length} eligible=${eligible.length} covered=${counts.size} ` +
      `avg/day=${(total / ROTATION_BUCKETS).toFixed(1)} max/day=${Math.max(...dailySizes)}`
  );
});

// 혼성 보드 선수는 어떤 날에도 뽑히면 안 된다. 뽑히면 관측 없는 0건이 회귀 가드를 때려
// mismatch 오탐으로 되돌아간다(2026-07-28 사고).
runTest("rotation full-verify never picks mixed-board players", () => {
  const mixPlayer = {
    entity_id: "eloboard:male:mix:1184",
    name: "혁민",
    profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=1184",
  };
  assert.equal(shouldUseMixEndpoint(mixPlayer), true, "테스트 대상이 실제로 혼성 보드여야 한다");

  const start = Date.UTC(2026, 6, 1);
  for (let day = 0; day < ROTATION_BUCKETS; day += 1) {
    const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
    assert.equal(shouldRotationFullVerify(mixPlayer, date), false, `${date}에 혼성 선수가 뽑혔다`);
  }
});

// 보험이 스킵으로 무력화되면 의미가 없다: 우선순위 창에 걸려 오늘 건너뛸 선수라도
// 순환 차례가 오면 반드시 다시 읽어야 한다.
runTest("rotation full-verify overrides the reuse/skip path", () => {
  const filePath = writeTempJson("__test__rotation_override.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const yesterday = new Date("2026-04-08T12:00:00.000Z");
    fs.utimesSync(filePath, yesterday, yesterday);
    const player = { name: "가", last_checked_at: "2026-04-08", check_interval_days: 3 };
    assert.equal(shouldSkipByPriorityWindow(player, today, filePath), true, "평소엔 우선순위 창으로 스킵");

    assert.equal(shouldReuseExistingJson(true, true, true), false, "순환 대상은 재사용되지 않는다");
    assert.equal(shouldReuseExistingJson(false, true, true), true, "평소엔 기존 json 재사용");
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

runTest("rotation full-verify forces the no-cache full read", () => {
  assert.equal(shouldUseNoCacheForFetch({ rotationVerify: true }), true);
  assert.equal(shouldUseNoCacheForFetch({}), false);
});

// 운영자 재수집은 재기준선이 목적이다. 증분(합집합)으로 읽으면 값이 줄어들 수 없어 목적이 깨진다.
runTest("operator resume marker forces the no-cache full read", () => {
  assert.equal(shouldUseNoCacheForFetch({ forceRefresh: true }), true);
  assert.equal(shouldUseNoCacheForFetch({ forceRefresh: false }), false);
});

runTest("operator resume accepts a lower total as the new baseline", () => {
  const guard = evaluateRegressionGuard({
    existingPeriodTotal: 401,
    nextPeriodTotal: 398,
    forceRefresh: true,
  });
  assert.equal(guard.write, true, "낮아도 파일을 쓴다");
  assert.deepEqual(guard.rebaselined, { from: 401, to: 398 });
});

runTest("operator resume without a drop records no rebaseline", () => {
  assert.deepEqual(evaluateRegressionGuard({ existingPeriodTotal: 398, nextPeriodTotal: 401, forceRefresh: true }), {
    write: true,
    rebaselined: null,
  });
  assert.deepEqual(evaluateRegressionGuard({ existingPeriodTotal: 398, nextPeriodTotal: 398, forceRefresh: true }), {
    write: true,
    rebaselined: null,
  });
});

// 일반 경로의 안전 의미론은 그대로다 — 마커를 건 선수만 예외다.
runTest("regression guard still blocks a lower total without the resume marker", () => {
  assert.deepEqual(evaluateRegressionGuard({ existingPeriodTotal: 401, nextPeriodTotal: 398 }), {
    write: false,
    rebaselined: null,
  });
  // 기존 파일이 없으면 비교 대상이 없으니 그냥 쓴다.
  assert.deepEqual(evaluateRegressionGuard({ existingPeriodTotal: null, nextPeriodTotal: 0 }), {
    write: true,
    rebaselined: null,
  });
});

// --- 소스(엘로보드) 장애 회로 차단기 -----------------------------------------

// 실패 사유는 자식 프로세스의 message가 아니라 stderr에 실려 온다(수집기가 [SOURCE] 줄을 남긴다).
runTest("isSourceOutageError reads the marker from child stdout/stderr too", () => {
  const childFailure = {
    message: "Command failed: node scripts/tools/report-team-records.js --json-only",
    stdout: "",
    stderr: "[SOURCE] 김선수 source_outage: GET https://eloboard.com/women/bbs/board.php\n",
  };
  assert.equal(isSourceOutageError(errorDetailText(childFailure)), true);
  assert.equal(isSourceOutageError(errorDetailText({ message: "source_anomaly: 김선수 display_total=8 matches=0" })), true);
  // 그냥 타임아웃·네트워크 실패는 사이트 장애로 단정하지 않는다(개별 선수 문제일 수 있다).
  assert.equal(isSourceOutageError(errorDetailText({ message: "ETIMEDOUT", stderr: "socket hang up" })), false);
});

// 연속 5명이면 남은 선수를 두드려봐야 같은 오류만 받는다. 실제로 읽어낸 선수가 나오면 리셋.
runTest("source outage circuit opens on 5 consecutive failures and resets on a real read", () => {
  let streak = 0;
  for (let i = 0; i < SOURCE_OUTAGE_STREAK_LIMIT - 1; i += 1) {
    streak = nextSourceOutageStreak(streak, "source_outage");
    assert.equal(isSourceOutageCircuitOpen(streak), false, `${i + 1}명째에는 아직 안 열린다`);
  }
  streak = nextSourceOutageStreak(streak, "source_outage");
  assert.equal(isSourceOutageCircuitOpen(streak), true, "연속 5명이면 열린다");

  // 4명 + 성공 → 리셋
  let reset = 0;
  for (let i = 0; i < 4; i += 1) reset = nextSourceOutageStreak(reset, "source_outage");
  reset = nextSourceOutageStreak(reset, "ok");
  assert.equal(reset, 0);
  assert.equal(isSourceOutageCircuitOpen(nextSourceOutageStreak(reset, "source_outage")), false);
});

// 기존 json 재사용·다른 이유의 실패는 "사이트가 살아 있다"는 증거가 아니다 — 카운터를 유지한다.
runTest("only a real fetch resets the outage streak", () => {
  assert.equal(sourceOutageOutcome({ fetch_status: "fetch_failed_source_outage", error: "x" }), "source_outage");
  assert.equal(sourceOutageOutcome({ fetch_status: "ok", error: null }), "ok");
  assert.equal(sourceOutageOutcome({ fetch_status: "used_existing_json", error: null }), "other");
  assert.equal(sourceOutageOutcome({ fetch_status: "failed", error: "ETIMEDOUT" }), "other");
  assert.equal(nextSourceOutageStreak(3, "other"), 3);
});

// tmp/는 GitHub Actions 캐시로 다음 날 밤까지 살아남는다. 어제 마커가 오늘 수집을 죽이면 안 된다.
runTest("source outage marker is keyed by date so yesterday's marker is ignored", () => {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "nzu-outage-marker-"));
  const yesterday = sourceOutageMarkerPath("2026-08-13", dir);
  fs.writeFileSync(yesterday, "{}", "utf8");

  assert.equal(hasSourceOutageMarker("2026-08-13", dir), true);
  assert.equal(hasSourceOutageMarker("2026-08-14", dir), false, "날짜가 다르면 어제 마커를 보지 않는다");
  assert.notEqual(sourceOutageMarkerPath("2026-08-13", dir), sourceOutageMarkerPath("2026-08-14", dir));
});
