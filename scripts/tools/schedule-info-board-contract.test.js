const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board SQL defines additive schedule info fields", () => {
  const sql = readProjectFile("scripts/sql/create-board-posts.sql");

  assert.match(sql, /schedule_date\s+date/i);
  assert.match(sql, /schedule_start_time\s+time\s+without\s+time\s+zone/i);
  assert.match(sql, /schedule_display_name\s+text/i);
  assert.match(sql, /external_link_url\s+text/i);
  assert.match(sql, /board_posts_schedule_public_idx/i);
});

test("database types include schedule info board fields", () => {
  const types = readProjectFile("lib/database.types.ts");

  for (const field of ["schedule_date", "schedule_start_time", "schedule_display_name", "external_link_url"]) {
    assert.match(types, new RegExp(`${field}: string \\\\| null`));
    assert.match(types, new RegExp(`${field}\\\\?: string \\\\| null`));
  }
});

test("board schedule label is displayed as info schedule", () => {
  const board = readProjectFile("lib/board.ts");

  assert.match(board, /if\s*\(category === "schedule"\)\s*return "정보\/일정"/);
});
