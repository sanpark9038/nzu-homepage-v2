const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("public schedule page uses schedule info board posts instead of prediction fixtures", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /listScheduleInfoPosts/);
  assert.match(source, /ScheduleInfoList/);
  assert.doesNotMatch(source, /storageReady/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches/);
  assert.doesNotMatch(source, /loadPredictionState/);
});

test("schedule info list renders filters, inline details, and untimed group", () => {
  const source = readProjectFile("components/schedule/ScheduleInfoList.tsx");

  assert.match(source, /"use client"/);
  assert.match(source, /todayKey/);
  assert.match(source, /filterMode/);
  assert.match(source, /오늘/);
  assert.match(source, /내일/);
  assert.match(source, /7일/);
  assert.match(source, /시간 미정/);
  assert.match(source, /정보\/일정/);
  assert.match(source, /details/);
  assert.match(source, /summary/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /iframe/);
  assert.doesNotMatch(source, /<img/);
});
