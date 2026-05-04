const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp", "__player_history_artifact_test__");

const {
  buildHistoryArtifactKey,
  buildPlayerHistoryArtifacts,
  getR2Config,
  readPlayerHistoryArtifact,
} = require("./export-player-history-artifacts");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function cleanup() {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}

runTest("buildHistoryArtifactKey uses durable eloboard identity", () => {
  assert.equal(buildHistoryArtifactKey("eloboard:male:913"), "eloboard-male-913");
  assert.equal(buildHistoryArtifactKey("eloboard:female:mix:1055"), "eloboard-female-mix-1055");
});

runTest("buildPlayerHistoryArtifacts writes per-player newest-first history and index", () => {
  cleanup();
  try {
    const result = buildPlayerHistoryArtifacts({
      outputDir: TMP_DIR,
      generatedAt: "2026-05-03T00:00:00.000Z",
      rows: [
        {
          match_date: "2026-04-01",
          player_entity_id: "eloboard:male:913",
          player_name: "player-a",
          team: "nzu",
          tier: "A",
          race: "T",
          opponent_entity_id: "eloboard:female:777",
          opponent_name: "opponent-old",
          opponent_race: "Z",
          map_name: "map-old",
          is_win: "true",
          memo: "old",
          source_file: "source-a.csv",
          source_row_no: "2",
        },
        {
          match_date: "2026-04-03",
          player_entity_id: "eloboard:male:913",
          player_name: "player-a",
          team: "nzu",
          tier: "A",
          race: "T",
          opponent_entity_id: "eloboard:female:778",
          opponent_name: "opponent-new",
          opponent_race: "P",
          map_name: "map-new",
          is_win: "false",
          memo: "new",
          source_file: "source-a.csv",
          source_row_no: "1",
        },
      ],
    });

    assert.equal(result.players_written, 1);
    assert.equal(result.match_rows_written, 2);
    assert.equal(fs.existsSync(path.join(TMP_DIR, "index.json")), true);

    const artifact = readPlayerHistoryArtifact(
      path.join(TMP_DIR, "eloboard-male-913.json")
    );
    assert.equal(artifact.player.entity_id, "eloboard:male:913");
    assert.deepEqual(
      artifact.match_history.map((row) => row.opponent_name),
      ["opponent-new", "opponent-old"]
    );
    assert.deepEqual(artifact.summary, {
      matches: 2,
      wins: 1,
      losses: 1,
      latest_match_date: "2026-04-03",
    });
  } finally {
    cleanup();
  }
});

runTest("player history R2 config can target a dedicated bucket without changing board image R2 env", () => {
  const config = getR2Config(
    {
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "generic-access",
      R2_SECRET_ACCESS_KEY: "generic-secret",
      R2_BUCKET_NAME: "board-images",
      R2_PUBLIC_BASE_URL: "https://images.example.com",
      PLAYER_HISTORY_R2_BUCKET_NAME: "nzu-homepage-data",
      PLAYER_HISTORY_PUBLIC_BASE_URL: "https://pub-history.example.com/player-history",
    },
    "player-history"
  );

  assert.equal(config.bucketName, "nzu-homepage-data");
  assert.equal(config.publicBaseUrl, "https://pub-history.example.com/player-history");
});

runTest("player history R2 config can derive public history URL from a dedicated R2 public root", () => {
  const config = getR2Config(
    {
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "generic-access",
      R2_SECRET_ACCESS_KEY: "generic-secret",
      PLAYER_HISTORY_R2_BUCKET_NAME: "nzu-homepage-data",
      PLAYER_HISTORY_R2_PUBLIC_BASE_URL: "https://pub-history.example.com",
    },
    "custom-prefix"
  );

  assert.equal(config.bucketName, "nzu-homepage-data");
  assert.equal(config.publicBaseUrl, "https://pub-history.example.com/custom-prefix");
});

runTest("player-service refuses stale player history artifacts when Supabase history is newer", () => {
  const source = fs.readFileSync(path.join(ROOT, "lib", "player-service.ts"), "utf8");

  assert.match(source, /loadPlayerHistoryArtifact/);
  assert.match(source, /mergePlayerHistoryArtifact/);
  assert.match(source, /selectFresherStoredMatchHistory/);
  assert.match(
    source,
    /fallbackLatest\s*>\s*artifactLatest/,
    "Player service should compare latest match dates before trusting artifact history"
  );
  assert.doesNotMatch(
    source,
    /if\s*\(\s*artifactHistory\s*&&\s*artifactHistory\.length\s*>\s*0\s*\)\s*{[\s\S]*?match_history:\s*artifactHistory/,
    "Artifact history should not blindly override newer Supabase match_history"
  );
});
