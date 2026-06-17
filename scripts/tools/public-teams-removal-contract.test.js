const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function existsProjectFile(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

test("public navigation no longer exposes the teams route", () => {
  const navSource = readProjectFile("lib/navigation-config.ts");
  const navbarSource = readProjectFile("components/Navbar.tsx");

  assert.doesNotMatch(navSource, /href:\s*"\/teams"/);
  assert.doesNotMatch(navSource, /쌍너스 참가팀|참가팀/);
  assert.doesNotMatch(navbarSource, /showTeamsBadge/);
  assert.doesNotMatch(navbarSource, /Trophy/);
  assert.doesNotMatch(navbarSource, /EVENT/);
});

test("direct teams route no longer renders the participant teams page", () => {
  assert.equal(existsProjectFile("app/teams/page.tsx"), false);
  assert.equal(existsProjectFile("app/teams/loading.tsx"), false);
});

test("obsolete public teams client payload wiring is removed", () => {
  const packageJson = readProjectFile("package.json");
  const tournamentHomeSource = readProjectFile("lib/tournament-home.ts");

  assert.equal(existsProjectFile("components/home/TournamentTeamsView.tsx"), false);
  assert.equal(existsProjectFile("components/home/TournamentTeamsClient.tsx"), false);
  assert.equal(existsProjectFile("scripts/tools/tournament-teams-payload-contract.test.js"), false);
  assert.doesNotMatch(packageJson, /test:tournament-teams-payload-contract/);
  assert.doesNotMatch(tournamentHomeSource, /TournamentTeamsClient/);
  assert.doesNotMatch(tournamentHomeSource, /buildTournamentTeamsClientPayload/);
});
