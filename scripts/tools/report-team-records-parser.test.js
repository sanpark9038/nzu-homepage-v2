const assert = require("node:assert/strict");
const test = require("node:test");

const { extractInitialRows, selectMode } = require("./report-team-records");

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
