const assert = require("node:assert/strict");

const {
  buildEloboardEntityId,
  getEloboardProfileKind,
  normalizeProfileUrl,
} = require("./eloboard-special-cases");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("normalizeProfileUrl keeps bj_m_list on women namespace", () => {
  const actual = normalizeProfileUrl("http://eloboard.com/men/bbs/board.php?bo_table=bj_m_list&wr_id=73");
  assert.equal(actual, "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=73");
});

runTest("getEloboardProfileKind distinguishes mix board", () => {
  assert.equal(getEloboardProfileKind("https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=73"), "default");
  assert.equal(getEloboardProfileKind("https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=73"), "mix");
  assert.equal(getEloboardProfileKind("https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=73"), "default");
});

runTest("buildEloboardEntityId separates women mix board from men board", () => {
  assert.equal(
    buildEloboardEntityId({
      wr_id: 73,
      gender: "female",
      name: "여성BJ",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=73",
    }),
    "eloboard:female:73"
  );
  assert.equal(
    buildEloboardEntityId({
      wr_id: 73,
      gender: "male",
      name: "오뀨",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=73",
    }),
    "eloboard:male:mix:73"
  );
  assert.equal(
    buildEloboardEntityId({
      wr_id: 73,
      gender: "male",
      name: "홍덕",
      profile_url: "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=73",
    }),
    "eloboard:male:73"
  );
});
