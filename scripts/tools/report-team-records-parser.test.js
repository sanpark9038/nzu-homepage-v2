const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectionDisplayTotal,
  isSourceOutagePage,
  isSourceAnomaly,
  extractInitialRows,
  selectMode,
  playerCacheKey,
  mergePriorMatches,
  rowKey,
} = require("./report-team-records");

const FEMALE_SECTION = "\uC5EC\uC131\uBC00\uB9AC\uC804\uC801";
const MIXED_SECTION = "\uD63C\uC131\uBC00\uB9AC\uC804\uC801";

test("extractInitialRows does not mix mixed-section rows into female collection", () => {
  const html = `
    <strong>[${FEMALE_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody></tbody></table>
    </div>
    <strong>[${MIXED_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody>
        <tr>
          <td style="padding:5px;background:#434348; color:#FFF; text-align:center">2026-05-16</td>
          <td>Opponent(Z)</td>
          <td>Map</td>
          <td>-16.5</td>
          <td></td>
          <td>Loss(3)</td>
        </tr>
      </tbody></table>
    </div>
  `;

  const initial = extractInitialRows(html, {
    mode: "female_or_default",
    endpoint: "view_list.php",
    sectionMarker: FEMALE_SECTION,
  });

  assert.equal(initial.rows.length, 0);
});

test("extractInitialRows refuses explicit mixed collection mode", () => {
  const html = `
    <strong>[${MIXED_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody>
        <tr>
          <td style="padding:5px;background:#00ccff; color:#FFF; text-align:center">2026-05-16</td>
          <td>Opponent(P)</td>
          <td>Map</td>
          <td>+16.5</td>
        </tr>
      </tbody></table>
    </div>
  `;

  const initial = extractInitialRows(html, {
    mode: "special_mix",
    endpoint: "mix_view_list.php",
    sectionMarker: MIXED_SECTION,
  });

  assert.equal(initial.rows.length, 0);
  assert.equal(initial.initialLastId, 0);
});

test("selectMode disables mixed profile collection instead of using mix endpoint", () => {
  const mode = selectMode({
    name: "Mixed profile",
    profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=531",
  });

  assert.equal(mode.mode, "mixed_collection_disabled");
  assert.equal(mode.endpoint, null);
  assert.equal(mode.collect_matches, false);
});

test("collectionDisplayTotal uses female section total instead of mixed page total", () => {
  const displayStats = {
    total: { total: 3, wins: 0, losses: 3 },
    female: { total: 0, wins: 0, losses: 0 },
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Female default profile",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1036",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 0);
});

test("collectionDisplayTotal treats ambiguous women total as section-empty", () => {
  const displayStats = {
    total: { total: 3, wins: 0, losses: 3 },
    female: null,
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Female default profile",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1036",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 0);
});

test("collectionDisplayTotal keeps total fallback for men profile guardrail", () => {
  const displayStats = {
    total: { total: 10, wins: 6, losses: 4 },
    female: null,
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Men default profile",
      profile_url: "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=37",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 10);
});

// 2026-08-13 장애: 엘로보드가 HTTP 200에 mysqli 오류 본문(~378바이트)을 실어 보냈다.
// 이걸 정상 페이지로 읽으면 경기 0건이 되고 상위가 "조용한 삭제 의심"으로 수십 건 오탐한다.
test("isSourceOutagePage detects the mysqli overload body and passes normal pages", () => {
  const outage =
    "<br />\n<b>Warning</b>:  mysqli_connect(): (HY000/1226): User 'mimesys' has exceeded the " +
    "'max_user_connections' resource in <b>/home/mimesys/public_html/lib/mysqli.lib.php</b>\n" +
    "Connect Error: User mimesys already has more than 'max_user_connections' active connections";

  assert.equal(isSourceOutagePage(outage), true);
  assert.equal(isSourceOutagePage("<html><div class=\"list-board\">정상</div></html>"), false);
  assert.equal(isSourceOutagePage(""), false);
  assert.equal(isSourceOutagePage(null), false);
});

// 표시 카운터는 살아 있는데 목록이 0행이면 소스 이상이다(장애 중 view_list.php가 빈 응답).
// 이 결과를 쓰면 멀쩡한 기존 전적이 0으로 덮이거나 "경기 수 감소" 오탐이 된다.
test("isSourceAnomaly flags counter>0 with zero collected rows only", () => {
  assert.equal(isSourceAnomaly(8, 0), true);
  assert.equal(isSourceAnomaly(8, 8), false);
  // 카운터도 0이면 정상적인 "경기 없음"이다(혼성 보드 선수는 displayTotal이 0으로 계산된다).
  assert.equal(isSourceAnomaly(0, 0), false);
});

// 책갈피 키는 팀·프로필 URL과 무관해야 한다. 예전 키(name|wr_id|profile_url) + 팀별 버킷은
// 프로필 URL이 바뀌거나 선수가 팀을 옮기면 앵커를 잃었고, c9/씨나인처럼 같은 팀이 두 벌로 쌓였다.
test("playerCacheKey is team- and url-independent, falling back to wr identity", () => {
  const a = { entity_id: "eloboard:female:9", name: "김선수", wr_id: 9, gender: "female", profile_url: "https://a/x?wr_id=9" };
  const b = { entity_id: "eloboard:female:9", name: "닉변", wr_id: 9, gender: "female", profile_url: "https://b/y?wr_id=9" };
  assert.equal(playerCacheKey(a), playerCacheKey(b));
  assert.equal(playerCacheKey(a), "eloboard:female:9");

  assert.equal(playerCacheKey({ name: "무명", wr_id: 37, gender: "male" }), "wr_male_37");
  assert.equal(playerCacheKey({ name: "무명" }), "무명");
});

// 날짜 단위 무효화: 이번에 읽은 날짜의 과거 행은 버리고 새로 읽은 것으로 대체한다.
// 같은 날 경기가 뒤늦게 정정·추가돼도 반영되게 하는 안전장치다.
test("mergePriorMatches drops prior rows on dates re-read this run", () => {
  const fresh = [
    { date: "2026-07-25", opponent: "A", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    { date: "2026-07-24", opponent: "B", map: "M", result_text: "-1", set_score: "", note: "", is_win: false },
  ];
  const seen = new Set(fresh.map(rowKey));
  const prior = [
    // 같은 날짜(2026-07-24)의 낡은 행 — 폐기되어야 한다.
    { date: "2026-07-24", opponent: "STALE", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    // 더 오래된 행 — 그대로 이어 붙는다.
    { date: "2026-07-01", opponent: "C", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    // 새로 읽은 것과 완전히 같은 행 — 중복 없이 한 번만.
    { date: "2026-07-25", opponent: "A", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
  ];

  const merged = mergePriorMatches(fresh, seen, prior);
  assert.deepEqual(merged.map((m) => `${m.date}|${m.opponent}`), [
    "2026-07-25|A",
    "2026-07-24|B",
    "2026-07-01|C",
  ]);
});
