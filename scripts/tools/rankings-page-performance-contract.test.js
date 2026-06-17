const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("rankings page uses short shared table classes instead of repeated long row strings", () => {
  const pageSource = readProjectFile("app/rankings/page.tsx");
  const cssSource = readProjectFile("app/globals.css");

  assert.match(pageSource, /rk-shell/);
  assert.match(pageSource, /rk-td/);
  assert.match(pageSource, /rk-win/);
  assert.match(pageSource, /rk-loss/);
  assert.match(cssSource, /\.rk-shell/);
  assert.match(cssSource, /\.rk-td/);
  assert.match(cssSource, /\.rk-win/);
  assert.match(cssSource, /\.rk-loss/);

  const repeatedCellClassCount = (pageSource.match(/px-8 py-5/g) || []).length;
  assert.ok(
    repeatedCellClassCount <= 2,
    `Expected rankings page to avoid repeated table cell Tailwind strings; found ${repeatedCellClassCount}`
  );

  const longRankingsTokenCount = (pageSource.match(/rankings-[a-z-]+/g) || []).length;
  assert.equal(
    longRankingsTokenCount,
    0,
    `Expected rankings page HTML to use short rk-* aliases; found ${longRankingsTokenCount} long rankings-* tokens`
  );
});
