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
  shouldSkipByPriorityWindow,
  shouldReuseInactiveExistingJson,
} = require("./export-team-roster-detailed");

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
