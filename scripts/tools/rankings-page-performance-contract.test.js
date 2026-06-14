const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("rankings page uses shared table classes instead of repeated Tailwind row strings", () => {
  const pageSource = readProjectFile("app/rankings/page.tsx");
  const cssSource = readProjectFile("app/globals.css");

  assert.match(pageSource, /rankings-table-shell/);
  assert.match(pageSource, /rankings-table-cell/);
  assert.match(pageSource, /rankings-score-win/);
  assert.match(pageSource, /rankings-score-loss/);
  assert.match(cssSource, /\.rankings-table-shell/);
  assert.match(cssSource, /\.rankings-table-cell/);
  assert.match(cssSource, /\.rankings-score-win/);
  assert.match(cssSource, /\.rankings-score-loss/);

  const repeatedCellClassCount = (pageSource.match(/px-8 py-5/g) || []).length;
  assert.ok(
    repeatedCellClassCount <= 2,
    `Expected rankings page to avoid repeated table cell Tailwind strings; found ${repeatedCellClassCount}`
  );
});
