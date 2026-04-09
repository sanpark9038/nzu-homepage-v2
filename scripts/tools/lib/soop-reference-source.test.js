const assert = require("node:assert/strict");

const {
  parseFlatJsonReference,
  parseHtmlReference,
} = require("./soop-reference-source");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parseFlatJsonReference normalizes channel url and profile image", () => {
  const records = parseFlatJsonReference(
    JSON.stringify([
      {
        player_name: "아링",
        soop_user_id: "jungym0116",
        race: "protoss",
        soop_channel_url: "https://www.sooplive.com/station/jungym0116",
      },
    ]),
    { kind: "flat-json", label: "33.json" }
  );

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    source_name: "아링",
    display_name: null,
    alias_names: [],
    soop_user_id: "jungym0116",
    broadcast_url: "https://www.sooplive.com/station/jungym0116",
    profile_image_url: "https://profile.img.sooplive.com/LOGO/af/jungym0116/jungym0116.jpg",
    race: "protoss",
    college: null,
    tier_group: null,
    elo_ref: {
      wr_id: null,
      direct_elo_id: null,
      custom_url: null,
      profile_kind: "unknown",
    },
    source_ref: {
      kind: "flat-json",
      label: "33.json",
    },
  });
});

runTest("parseHtmlReference extracts mix profile and alias names", () => {
  const html = `
    <a class="player-card offline protoss"
      data-id="parkjaehyeon"
      data-race="protoss"
      data-name="박재현"
      data-college="BGM"
      data-elo-id=""
      data-custom-elo-url="https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=124"
      data-tier-group="women"
      href="https://www.sooplive.com/station/parkjaehyeon"
      target="_blank"><span class='player-name-text'>쿰신</span></a>
  `;
  const records = parseHtmlReference(html, { kind: "html", label: "44.html" });

  assert.equal(records.length, 1);
  assert.equal(records[0].source_name, "박재현");
  assert.equal(records[0].display_name, "쿰신");
  assert.deepEqual(records[0].alias_names, ["쿰신"]);
  assert.equal(records[0].soop_user_id, "parkjaehyeon");
  assert.equal(records[0].elo_ref.wr_id, 124);
  assert.equal(records[0].elo_ref.profile_kind, "mix");
});
