const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildCoverageReport,
  formatMarkdown,
} = require("./report-player-history-opponent-identity-coverage");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function withFixtureDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-opponent-identity-coverage-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeArtifact(dir, fileName, matchHistory) {
  fs.writeFileSync(
    path.join(dir, fileName),
    JSON.stringify(
      {
        generated_at: "2026-05-16T00:00:00.000Z",
        player: {
          entity_id: `eloboard:test:${fileName.replace(".json", "")}`,
          name: fileName.replace(".json", ""),
        },
        match_history: matchHistory,
      },
      null,
      2
    ),
    "utf8"
  );
}

runTest("buildCoverageReport measures opponent entity id and name coverage", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "eloboard:female:1", opponent_name: "opponent-a" },
      { opponent_entity_id: "", opponent_name: "opponent-b" },
    ]);
    writeArtifact(dir, "player-b.json", [
      { opponentEntityId: "eloboard:male:2", opponentName: "opponent-c" },
    ]);
    fs.writeFileSync(path.join(dir, "index.json"), "{}", "utf8");

    const report = buildCoverageReport({
      artifactDir: dir,
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.equal(report.artifact_files, 2);
    assert.equal(report.players_with_history, 2);
    assert.equal(report.match_rows, 3);
    assert.equal(report.rows_with_opponent_entity_id, 2);
    assert.equal(report.rows_with_opponent_name, 3);
    assert.equal(report.opponent_entity_id_coverage_pct, 66.67);
    assert.equal(report.opponent_name_coverage_pct, 100);
    assert.equal(report.ready_to_remove_name_fallback, false);
    assert.equal(report.incomplete_samples.length, 1);
  });
});

runTest("buildCoverageReport marks fallback removal ready only when every row has opponent identity", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "eloboard:female:1", opponent_name: "opponent-a" },
      { opponent_entity_id: "eloboard:female:2", opponent_name: "opponent-b" },
    ]);

    const report = buildCoverageReport({
      artifactDir: dir,
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.equal(report.opponent_entity_id_coverage_pct, 100);
    assert.equal(report.ready_to_remove_name_fallback, true);
    assert.equal(report.incomplete_samples.length, 0);
  });
});

runTest("formatMarkdown includes the fallback removal decision", () => {
  const markdown = formatMarkdown({
    generated_at: "2026-05-16T00:00:00.000Z",
    artifact_dir: "tmp/player-history-artifacts",
    artifact_files: 1,
    players_with_history: 1,
    match_rows: 1,
    rows_with_opponent_entity_id: 0,
    rows_with_opponent_name: 1,
    opponent_entity_id_coverage_pct: 0,
    opponent_name_coverage_pct: 100,
    ready_to_remove_name_fallback: false,
    incomplete_samples: [],
  });

  assert.match(markdown, /ready_to_remove_name_fallback: false/);
  assert.match(markdown, /opponent_entity_id_coverage_pct: 0/);
});
