const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const {
  buildAutoProjectDoc,
  ensureAutoDiscoveredTeamProjects,
  extractTeamNamesFromRosterIndex,
  makeTeamCode,
} = require("./team-project-discovery");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await runTest("extractTeamNamesFromRosterIndex reads all_bj_list team links", async () => {
    const html = `
      <a href="board.php?bo_table=all_bj_list&univ_name=JSA">JSA</a>
      <a href="board.php?bo_table=all_bj_list&amp;univ_name=DM">DM</a>
      <a href="board.php?bo_table=all_bj_list&univ_name=%EC%97%B0%ED%95%A9%ED%8C%80">FA</a>
    `;

    const actual = extractTeamNamesFromRosterIndex(html);

    assert.deepEqual(actual, ["JSA", "DM", "연합팀"]);
  });

  await runTest("makeTeamCode appends suffix when slug already exists", async () => {
    const actual = makeTeamCode("DM", new Set(["dm", "dm_2"]));
    assert.equal(actual, "dm_3");
  });

  await runTest("buildAutoProjectDoc creates an empty project scaffold", async () => {
    const actual = buildAutoProjectDoc("DM", "dm");
    assert.equal(actual.team_name, "DM");
    assert.equal(actual.team_code, "dm");
    assert.equal(actual.fetch_univ_name, "DM");
    assert.deepEqual(actual.team_aliases, ["DM"]);
    assert.deepEqual(actual.roster, []);
  });

  await runTest("ensureAutoDiscoveredTeamProjects creates only unknown team projects", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-team-discovery-"));
    const projectsDir = path.join(root, "projects");
    const reportDir = path.join(root, "reports");
    fs.mkdirSync(path.join(projectsDir, "jsa"), { recursive: true });
    fs.writeFileSync(
      path.join(projectsDir, "jsa", "players.jsa.v1.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        generated_at: new Date().toISOString(),
        project: "jsa",
        team_name: "JSA",
        team_code: "jsa",
        team_name_en: "JSA",
        fetch_univ_name: "JSA",
        team_aliases: ["JSA"],
        roster_count: 0,
        roster: [],
      }),
      "utf8"
    );

    const html = `
      <a href="board.php?bo_table=all_bj_list&univ_name=JSA">JSA</a>
      <a href="board.php?bo_table=all_bj_list&univ_name=DM">DM</a>
    `;

    const actual = await ensureAutoDiscoveredTeamProjects({
      html,
      projectsDir,
      reportDir,
    });

    assert.equal(actual.created_projects_count, 1);
    assert.equal(actual.created_projects[0].team_code, "dm");

    const createdPath = path.join(projectsDir, "dm", "players.dm.v1.json");
    assert.equal(fs.existsSync(createdPath), true);
    const createdDoc = JSON.parse(fs.readFileSync(createdPath, "utf8"));
    assert.equal(createdDoc.team_name, "DM");
    assert.equal(createdDoc.fetch_univ_name, "DM");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
