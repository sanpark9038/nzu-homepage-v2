const assert = require("node:assert/strict");

const {
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

runTest("parseProfileBootstrap extracts p_name and last_id", () => {
  const html = `
    <div class="list-board"></div>
    <a class="more" id="456"></a>
    <script>var p_name = "PlayerA";</script>
  `;
  const bootstrap = parseProfileBootstrap(html, "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=123", "Fallback");
  assert.equal(bootstrap.p_name, "PlayerA");
  assert.equal(bootstrap.last_id, 456);
  assert.equal(bootstrap.has_list_board, true);
});

runTest("selectMode chooses mix endpoint for mix boards", () => {
  const mode = selectMode("https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=304");
  assert.equal(mode.endpoint, "mix_view_list.php");
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
    },
  });

  assert.match(markdown, /Overall: ok/);
  assert.match(markdown, /Sample Project: dm/);
  assert.match(markdown, /Observed Teams: 13/);
  assert.match(markdown, /History Endpoint: https:\/\/example.com\/view_list\.php/);
});
