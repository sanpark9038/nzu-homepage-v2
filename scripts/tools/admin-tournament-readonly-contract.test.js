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

test("admin tournament page follows deployment read-only guard pattern", () => {
  const source = readProjectFile("app/admin/tournament/page.tsx");

  assert.doesNotMatch(source, /^"use client";/);
  assert.match(source, /import \{ isAdminWriteDisabled \}/);
  assert.match(source, /import \{ isTournamentHomeSupabaseStoreEnabled \}/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /const readOnly = isAdminWriteDisabled\(\) && !isTournamentHomeSupabaseStoreEnabled\(\)/);
  assert.match(source, /<TournamentManagementClient readOnly=\{readOnly\}/);
});

test("admin tournament client receives read-only state from the server page", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  assert.match(source, /^"use client";/);
  assert.match(source, /import \{ AdminReadonlyNotice \}/);
  assert.match(source, /readOnly = false/);
  assert.match(source, /<AdminReadonlyNotice/);
  assert.doesNotMatch(source, /isAdminWriteDisabled/);
});

test("admin tournament mutation handlers fail closed before fetch when read-only", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  for (const handler of ["recruitPlayer", "updateTeamName", "setTeamCaptain", "removePlayer"]) {
    const start = source.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} handler should exist`);
    const fetchIndex = source.indexOf("fetch(", start);
    const readOnlyIndex = source.indexOf("if (readOnly)", start);
    assert.notEqual(fetchIndex, -1, `${handler} should contain a fetch call`);
    assert.notEqual(readOnlyIndex, -1, `${handler} should guard read-only mode`);
    assert.ok(readOnlyIndex < fetchIndex, `${handler} should check readOnly before fetch`);
  }
});

test("admin tournament mutation controls are disabled in read-only mode", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  assert.match(source, /disabled=\{saving \|\| readOnly \|\| isTeamFull\}/);
  assert.match(source, /disabled=\{readOnly\}/);
  assert.match(source, /disabled=\{saving \|\| readOnly \|\| p\.is_placeholder\}/);
});

test("admin tournament enforces the shared four-player participant team limit", () => {
  const clientSource = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");
  const routeSource = readProjectFile("app/api/admin/roster/route.ts");
  const homeSource = readProjectFile("lib/tournament-home.ts");
  const constantsSource = readProjectFile("lib/tournament-constants.ts");

  assert.match(constantsSource, /TOURNAMENT_TEAM_SIZE\s*=\s*4/);
  assert.match(clientSource, /import \{ TOURNAMENT_TEAM_SIZE \}/);
  assert.match(clientSource, /targetTeam\.players\.length >= TOURNAMENT_TEAM_SIZE/);
  assert.match(clientSource, /disabled=\{saving \|\| readOnly \|\| isTeamFull\}/);
  assert.match(clientSource, /is_placeholder\?: boolean/);
  assert.match(clientSource, /disabled=\{saving \|\| readOnly \|\| p\.is_placeholder\}/);
  assert.match(routeSource, /import \{ TOURNAMENT_TEAM_SIZE \}/);
  assert.match(routeSource, /targetTeam\.player_ids\.length \+ \(targetTeam\.placeholder_players \|\| \[\]\)\.length >= TOURNAMENT_TEAM_SIZE/);
  assert.match(homeSource, /orderedPlayers\.slice\(0,\s*TOURNAMENT_TEAM_SIZE\)/);
});

test("admin tournament API includes placeholder-only display players in team rows", () => {
  const routeSource = readProjectFile("app/api/admin/roster/route.ts");

  assert.match(routeSource, /type TournamentPlaceholderPlayerConfig/);
  assert.match(routeSource, /function mapTournamentPlaceholderPlayer/);
  assert.match(routeSource, /function mapTournamentTeamsForAdmin/);
  assert.match(routeSource, /is_placeholder:\s*true/);
  assert.match(routeSource, /const placeholderPlayers = \(t\.placeholder_players \|\| \[\]\)\.map/);
  assert.match(routeSource, /players:\s*\[\.\.\.slotPlayers,\s*\.\.\.placeholderPlayers\]/);
  assert.match(routeSource, /player_count:\s*slotPlayers\.length \+ placeholderPlayers\.length/);
});

test("admin tournament production writes are backed by Supabase config storage", () => {
  const routeSource = readProjectFile("app/api/admin/roster/route.ts");
  const homeSource = readProjectFile("lib/tournament-home.ts");
  const sql = readProjectFile("scripts/sql/create-tournament-home-config.sql");

  assert.match(homeSource, /TOURNAMENT_HOME_STORE/);
  assert.match(homeSource, /from\("tournament_home_config"\)/);
  assert.match(homeSource, /upsert\(/);
  assert.match(routeSource, /isTournamentHomeSupabaseStoreEnabled/);
  assert.match(routeSource, /await loadTournamentHomeConfig\(\)/);
  assert.match(routeSource, /await saveTournamentHomeConfig\(config\)/);
  assert.match(sql, /create table if not exists public\.tournament_home_config/);
  assert.match(sql, /alter table public\.tournament_home_config enable row level security/i);
  assert.match(sql, /grant select, insert, update on table public\.tournament_home_config to service_role/i);
});
