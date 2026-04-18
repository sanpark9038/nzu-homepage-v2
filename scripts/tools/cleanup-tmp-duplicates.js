const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function safeFileName(name) {
  return String(name || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function playerArtifactKey(player) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  if (entityId) return entityId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const wrId = Number(player && player.wr_id ? player.wr_id : 0);
  const gender = String(player && player.gender ? player.gender : "").trim() || "unknown";
  if (Number.isFinite(wrId) && wrId > 0) return `wr_${gender}_${wrId}`;
  return safeFileName(String(player && player.name ? player.name : "unknown_player"));
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function buildTmpMatchFileIndex(tmpDir = TMP_DIR) {
  if (!fs.existsSync(tmpDir)) return [];
  const files = fs
    .readdirSync(tmpDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("_matches.json"))
    .map((entry) => entry.name);

  return files.map((name) => {
    const fullPath = path.join(tmpDir, name);
    const doc = readJson(fullPath, null);
    const firstPlayer =
      doc && Array.isArray(doc.players) && doc.players.length > 0 && doc.players[0] ? doc.players[0] : null;
    const stats = fs.statSync(fullPath);
    return {
      name,
      path: fullPath,
      sizeBytes: stats.size,
      lastModifiedMs: stats.mtimeMs,
      teamName: String(doc && doc.team_name ? doc.team_name : "").trim(),
      wrId: Number(firstPlayer && firstPlayer.wr_id ? firstPlayer.wr_id : 0) || null,
      profileUrl: String(firstPlayer && firstPlayer.profile_url ? firstPlayer.profile_url : "").trim(),
      playerName: String(firstPlayer && firstPlayer.name ? firstPlayer.name : "").trim(),
    };
  });
}

function listProjectPlayers() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const players = [];
  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  for (const code of dirs) {
    const rosterPath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    const json = readJson(rosterPath, { roster: [], players: [] });
    const rows = Array.isArray(json.roster) ? json.roster : Array.isArray(json.players) ? json.players : [];
    for (const row of rows) {
      const teamName = String(row && row.team_name ? row.team_name : "").trim();
      const playerName = String(row && row.name ? row.name : "").trim();
      if (!teamName || !playerName) continue;
      players.push({
        teamName,
        playerName,
        player: row,
      });
    }
  }
  return players;
}

function listMatchJsonDuplicateTargets(tmpDir = TMP_DIR) {
  const targets = [];
  const seen = new Set();
  for (const { teamName, playerName, player } of listProjectPlayers()) {
    const canonicalName = `${teamName}_${playerArtifactKey(player)}_matches.json`;
    const fallbackName = `${teamName}_${safeFileName(playerName)}_matches.json`;
    if (canonicalName === fallbackName) continue;
    const canonicalPath = path.join(tmpDir, canonicalName);
    const fallbackPath = path.join(tmpDir, fallbackName);
    if (!fs.existsSync(canonicalPath) || !fs.existsSync(fallbackPath)) continue;
    if (seen.has(fallbackPath)) continue;
    const stats = fs.statSync(fallbackPath);
    seen.add(fallbackPath);
    targets.push({
      type: "match_json_fallback_duplicate",
      team_name: teamName,
      player_name: playerName,
      canonical_name: canonicalName,
      fallback_name: fallbackName,
      path: fallbackPath,
      sizeBytes: stats.size,
      lastModifiedMs: stats.mtimeMs,
    });
  }
  return targets.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function listLegacyTeamMatchTargets(tmpDir = TMP_DIR) {
  if (!fs.existsSync(tmpDir)) return [];
  const indexedFiles = buildTmpMatchFileIndex(tmpDir);
  const fileNames = indexedFiles.map((row) => row.name);
  const byName = new Map(indexedFiles.map((row) => [row.name, row]));
  const targets = [];
  const seen = new Set();

  for (const { teamName, playerName, player } of listProjectPlayers()) {
    const artifactKey = playerArtifactKey(player);
    const safeName = safeFileName(playerName);
    const profileUrl = String(player && player.profile_url ? player.profile_url : "").trim();
    const canonicalCurrent = `${teamName}_${artifactKey}_matches.json`;
    const canonicalCurrentPath = path.join(tmpDir, canonicalCurrent);
    if (!fs.existsSync(canonicalCurrentPath)) continue;

    for (const fileName of fileNames) {
      if (fileName === canonicalCurrent) continue;
      const indexed = byName.get(fileName);
      const suffixHit = fileName.endsWith(`_${artifactKey}_matches.json`);
      const metadataHit = !!indexed && !!profileUrl && !!indexed.profileUrl && indexed.profileUrl === profileUrl;
      const safeNameHit = fileName.endsWith(`_${safeName}_matches.json`) && metadataHit;
      if (!suffixHit && !metadataHit) continue;
      if (!indexed) continue;
      if (!suffixHit && !safeNameHit && !metadataHit) continue;
      if (fileName.startsWith(`${teamName}_`)) continue;
      if (seen.has(indexed.path)) continue;
      seen.add(indexed.path);
      targets.push({
        type: "legacy_team_match_duplicate",
        team_name: teamName,
        player_name: playerName,
        canonical_name: canonicalCurrent,
        fallback_name: fileName,
        path: indexed.path,
        sizeBytes: indexed.sizeBytes,
        lastModifiedMs: indexed.lastModifiedMs,
      });
    }
  }

  return targets.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function listDetailedCsvDuplicateTargets(tmpDir = TMP_DIR) {
  if (!fs.existsSync(tmpDir)) return [];
  const fileNames = new Set(
    fs.readdirSync(tmpDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
  );
  const canonicalByPlain = new Map();

  for (const fileName of fileNames) {
    const match = fileName.match(/^(eloboard_(?:male|female|male_mix)_\d+_.+_상세전적(?:_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2})?\.csv)$/u);
    if (!match) continue;
    const plainName = fileName.replace(/^eloboard_(?:male|female|male_mix)_\d+_/u, "");
    if (!canonicalByPlain.has(plainName)) canonicalByPlain.set(plainName, []);
    canonicalByPlain.get(plainName).push(fileName);
  }

  const targets = [];
  for (const [plainName, canonicalNames] of canonicalByPlain) {
    if (!fileNames.has(plainName)) continue;
    const fullPath = path.join(tmpDir, plainName);
    const stats = fs.statSync(fullPath);
    targets.push({
      type: "detail_csv_plain_duplicate",
      canonical_names: canonicalNames.slice().sort(),
      fallback_name: plainName,
      path: fullPath,
      sizeBytes: stats.size,
      lastModifiedMs: stats.mtimeMs,
    });
  }

  return targets.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function listCleanupTargets(tmpDir = TMP_DIR) {
  return [
    ...listMatchJsonDuplicateTargets(tmpDir),
    ...listLegacyTeamMatchTargets(tmpDir),
    ...listDetailedCsvDuplicateTargets(tmpDir),
  ].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function cleanupTmpDuplicates({ apply = false, tmpDir = TMP_DIR } = {}) {
  const targets = listCleanupTargets(tmpDir);
  if (apply) {
    for (const target of targets) {
      fs.rmSync(target.path, { force: true });
    }
  }
  const reclaimedBytes = targets.reduce((acc, target) => acc + target.sizeBytes, 0);
  return {
    generated_at: new Date().toISOString(),
    tmp_dir: tmpDir,
    apply,
    removed_count: targets.length,
    reclaimed_bytes: reclaimedBytes,
    reclaimed_human: formatBytes(reclaimedBytes),
    removed: targets.map((target) => ({
      type: target.type,
      team_name: target.team_name || null,
      player_name: target.player_name || null,
      fallback_name: target.fallback_name,
      canonical_name: target.canonical_name || null,
      canonical_names: target.canonical_names || null,
      size_bytes: target.sizeBytes,
      size_human: formatBytes(target.sizeBytes),
      last_modified_at: new Date(target.lastModifiedMs).toISOString(),
    })),
  };
}

function main() {
  const apply = hasFlag("--apply");
  const summary = cleanupTmpDuplicates({ apply });
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("dry-run: pass --apply to delete duplicate tmp root files");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  cleanupTmpDuplicates,
  listCleanupTargets,
  listMatchJsonDuplicateTargets,
  listLegacyTeamMatchTargets,
  listDetailedCsvDuplicateTargets,
};
