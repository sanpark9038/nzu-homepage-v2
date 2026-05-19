const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("prediction admin supports explicit start-time TBD and clearer save confirmation", () => {
  const source = readProjectFile("app/admin/prediction/PredictionMatchAdmin.tsx");

  assert.match(source, /start_time_tbd/);
  assert.match(source, /\uACBD\uAE30 \uC2DC\uAC04 \uBBF8\uC815/);
  assert.match(source, /\uC2B9\uBD80\uC608\uCE21 \uD398\uC774\uC9C0 \uBCF4\uAE30/);
  assert.match(source, /\uC2B9\uBD80\uC608\uCE21\uC774 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4/);
});

test("prediction admin title input preserves editing text until save", () => {
  const source = readProjectFile("app/admin/prediction/PredictionMatchAdmin.tsx");

  assert.match(source, /function normalizeClientTitle/);
  assert.match(source, /function normalizeSaveTitle/);
  assert.match(source, /title:\s*normalizeClientTitle\(match\.title,\s*type\)/);
  assert.match(source, /prepared\.title\s*=\s*normalizeSaveTitle\(match\.title,\s*type\)/);
  assert.match(source, /onChange=\{\(event\) => updateSelected\(\{ title: event\.target\.value \}\)\}/);
  assert.doesNotMatch(source, /title:\s*normalizeText\(match\.title\)\s*\|\|/);
});

test("public prediction cards emphasize start, deadline, and total votes", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(source, /formatStartLabel/);
  assert.match(source, /formatDeadlineLabel/);
  assert.match(source, /function MatchMetaItem/);
  assert.match(source, /md:grid-cols-3/);
  assert.match(source, /\uACBD\uAE30 \uC2DC\uC791/);
  assert.match(source, /\uB9C8\uAC10/);
  assert.match(source, /\uCD1D \uD22C\uD45C/);
  assert.match(source, /ui-label/);
  assert.match(source, /ui-value/);
  assert.match(source, /ui-card-title/);
});

test("public prediction cards use a denser vote option layout", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(source, /min-h-\[68px\]/);
  assert.match(source, /px-3 py-2/);
  assert.match(source, /ui-value/);
  assert.match(source, /lg:items-center/);
  assert.match(source, /min-h-\[88px\]/);
  assert.doesNotMatch(source, /lg:items-stretch/);
  assert.doesNotMatch(source, /min-h-\[96px\] flex-col/);
  assert.doesNotMatch(source, /min-h-\[104px\]/);
});

test("individual prediction cards show standardized player badges in the matchup line", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(source, /function IndividualMatchupLine/);
  assert.match(source, /teamA\.players\[0\]/);
  assert.match(source, /teamB\.players\[0\]/);
  assert.match(source, /<PlayerLine player={leftPlayer} \/>/);
  assert.match(source, /<PlayerLine player={rightPlayer} \/>/);
  assert.doesNotMatch(source, /\$\{match\.teamA\.teamName\} vs \$\{match\.teamB\.teamName\}/);
});

test("public prediction component keeps Korean labels readable", () => {
  const source = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.doesNotMatch(source, /[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF]/);
  assert.doesNotMatch(source, /\?{2,}/);
  assert.match(source, /\uB85C\uADF8\uC778 \uD6C4 \uC2B9\uBD80\uC608\uCE21\uC5D0 \uCC38\uC5EC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4/);
  assert.match(source, /\uB4F1\uB85D\uB41C \uC2B9\uBD80\uC608\uCE21\uC774 \uC5C6\uC2B5\uB2C8\uB2E4/);
});

test("prediction schema can persist the start-time TBD flag", () => {
  const sql = readProjectFile("scripts/sql/create-prediction-tables.sql");
  const types = readProjectFile("lib/database.types.ts");

  assert.match(sql, /start_time_tbd boolean not null default false/);
  assert.match(types, /start_time_tbd: boolean/);
  assert.match(types, /start_time_tbd\?: boolean/);
});
