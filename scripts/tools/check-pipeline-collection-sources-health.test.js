const assert = require("node:assert/strict");

const {
  countWomenRecordRows,
  formatMarkdown,
  parseProfileBootstrap,
  parseRosterPlayers,
  selectMode,
} = require("./check-pipeline-collection-sources-health");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parseRosterPlayers extracts names and profile URLs", () => {
  const html = `
    <table class="table">
      <tbody>
        <tr>
          <td><a class="p_name">PlayerA(1)</a></td>
          <td><a target="_blank" href="/women/bbs/board.php?bo_table=bj_list&wr_id=123">profile</a></td>
        </tr>
      </tbody>
    </table>
  `;
  const players = parseRosterPlayers(html);
  assert.equal(players.length, 1);
  assert.equal(players[0].name, "PlayerA");
  assert.equal(players[0].wr_id, 123);
});

runTest("parseProfileBootstrap extracts p_name and last_id on men boards", () => {
  const html = `
    <div class="list-board"></div>
    <a class="more" id="456"></a>
    <script>var p_name = "PlayerA";</script>
  `;
  const bootstrap = parseProfileBootstrap(html, "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=123", "Fallback");
  assert.equal(bootstrap.p_name, "PlayerA");
  assert.equal(bootstrap.last_id, 456);
  assert.equal(bootstrap.has_list_board, true);
});

// 2026-08 개편 후 여자부 프로필이 들고 있는 이름 파라미터는 bj_name이다. p_name(상대전적
// 위젯용)을 집어 오면 엉뚱한 요청을 보내게 된다.
runTest("parseProfileBootstrap picks bj_name on the reworked women board", () => {
  const html = `
    <script>$.ajax({ url: "ajax_women_record.php", type: "POST", data: { bj_name: "진서", target_year: targetYear } });</script>
    <script>$.ajax({ url: "view_list2.php", type: "post", data: { p_name: "진서", b_id: "eloboard" } });</script>
    <div class="list-board"></div>
  `;
  const bootstrap = parseProfileBootstrap(html, "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1048", "Fallback");
  assert.equal(bootstrap.p_name, "진서");
  assert.equal(bootstrap.endpoint, "ajax_women_record.php");
});

runTest("selectMode disables mix boards instead of choosing mix endpoint", () => {
  const mode = selectMode("https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=304");
  assert.equal(mode.endpoint, null);
  assert.equal(mode.disabled_reason, "mixed_match_collection_disabled");
});

// 옛 view_list.php는 여자부에서도 200을 주지만 낡은 스냅샷이다. 그걸 보던 헬스체크가
// "정상"이라고 하는 동안 여자부 전체가 7월 이후 경기를 놓쳤다(2026-08 사고).
runTest("selectMode sends women boards to the yearly ajax endpoint, men stay on view_list", () => {
  const women = selectMode("https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1048");
  assert.equal(women.endpoint, "ajax_women_record.php");
  assert.equal(women.param, "bj_name");
  assert.equal(women.boardBase, "https://eloboard.com/women/bbs");

  const men = selectMode("https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=22");
  assert.equal(men.endpoint, "view_list.php");
  assert.equal(men.param, "p_name");
  assert.equal(men.boardBase, "https://eloboard.com/men/bbs");
});

runTest("countWomenRecordRows separates real rows from a header-only empty year", () => {
  const head = `<table id="datatable_women"><thead><tr><th>날짜</th><th>상대</th></tr></thead><tbody>`;
  const tail = `</tbody></table>`;
  assert.equal(countWomenRecordRows(`${head}${tail}`), 0);
  assert.equal(
    countWomenRecordRows(
      `${head}<tr><td>2026-08-16</td><td>휘연(P)</td><td>폴리포이드</td><td>-14.4</td><td>단판</td><td>휘연승</td></tr>${tail}`
    ),
    1
  );
});

runTest("formatMarkdown summarizes health checks", () => {
  const markdown = formatMarkdown({
    ok: true,
    generated_at: "2026-04-17T00:00:00.000Z",
    sample_project_code: "dm",
    checks: {
      team_index: { ok: true, url: "https://example.com/index", observed_team_count: 13 },
      team_roster_page: { ok: true, team_name: "DM", player_count: 9 },
      player_profile_page: { ok: true, profile_url: "https://example.com/player" },
      player_paginated_history: { ok: true, url: "https://example.com/view_list.php" },
      player_women_yearly_history: { ok: true, url: "https://example.com/ajax_women_record.php" },
    },
  });

  assert.match(markdown, /Overall: ok/);
  assert.match(markdown, /Sample Project: dm/);
  assert.match(markdown, /Observed Teams: 13/);
  assert.match(markdown, /History Endpoint: https:\/\/example.com\/view_list\.php/);
  assert.match(markdown, /Player Women Yearly History: ok/);
  assert.match(markdown, /Women History Endpoint: https:\/\/example.com\/ajax_women_record\.php/);
});
