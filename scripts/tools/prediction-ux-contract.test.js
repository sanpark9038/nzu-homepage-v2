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

test("prediction admin roster rows can push players into entry matchups", () => {
  const source = readProjectFile("app/admin/prediction/PredictionMatchAdmin.tsx");

  // 명단 줄에 추가 버튼 / 매치N 배지 분기가 있다.
  assert.match(source, /const assignedIndex =/);
  assert.match(source, /assignedIndex >= 0 \? \(/);
  assert.match(source, /매치\{assignedIndex \+ 1\}/);
  assert.match(source, /onClick=\{\(\) => assignPlayerToMatchup\(side, playerId\)\}/);

  // 팀전일 때만 렌더된다.
  assert.match(source, /const canAssign = selectedMatchType === "team" && Boolean\(playerId\)/);
  assert.match(source, /trailing=\{\s*!canAssign \? undefined :/);

  // 첫 빈 슬롯을 찾아 채우고, 없으면 매치를 새로 만든다.
  assert.match(source, /const assignPlayerToMatchup = \(side: "a" \| "b", playerId: string\) => \{/);
  assert.match(source, /const emptyIndex = rows\.findIndex\(/);
  assert.match(source, /if \(emptyIndex >= 0\) \{[\s\S]*?updateMatchup\(emptyIndex,/);
  assert.match(source, /entry_matchups: \[\s*\.\.\.rows,/);

  // 배지는 첫 매치만 본다(같은 선수 중복 허용은 기존 동작 그대로).
  assert.match(source, /const findMatchupIndexOfPlayer = \(side: "a" \| "b", playerId: string\) =>/);
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

test("prediction pages apply the frozen tier before assembling player data", () => {
  const adminPage = readProjectFile("app/admin/prediction/page.tsx");
  const publicPage = readProjectFile("app/prediction/page.tsx");

  for (const source of [adminPage, publicPage]) {
    // 동결은 서버에서만 읽는다. KV 실패가 페이지를 죽이면 안 되므로 try/catch로 미동결 fallback.
    assert.match(source, /parseTierFreeze\(await getSetting\(TIER_FREEZE_KEY\)\)/);
    assert.match(source, /try \{[\s\S]*?freeze = parseTierFreeze[\s\S]*?\} catch/);
    assert.match(source, /frozenTierOf\(freeze, player\.id, player\.tier\)/);
    assert.match(source, /return frozen \? \{ \.\.\.player, tier: frozen \} : player/);
    assert.doesNotMatch(source, /"use client"/);
  }

  // 조립 함수에 들어가는 배열이 동결 적용본이어야 한다(라이브 배열을 그대로 넘기면 무효).
  assert.match(adminPage, /buildPredictionUniversityTeams\(players\)/);
  assert.match(adminPage, /const players = livePlayers\.map/);
  assert.match(publicPage, /const allPlayers = livePlayers\.map/);
  assert.match(publicPage, /buildTournamentPredictionMatches\(allPlayers, state/);
  assert.match(publicPage, /buildTournamentHomeTeamsFromStore\(allPlayers\)/);

  // 동결 중일 때만 관리자 상단에 한 줄 안내.
  assert.match(adminPage, /\{freeze \? \(/);
  assert.match(adminPage, /\uD2F0\uC5B4 \uB3D9\uACB0 \uC911 \u2014 \uB300\uD68C \uAE30\uAC04\uC5D0\uB294 \uB3D9\uACB0 \uD2F0\uC5B4\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4/);
  assert.doesNotMatch(publicPage, /\uB3D9\uACB0 \uC911/);
});
