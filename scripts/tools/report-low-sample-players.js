const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const TMP_DIR = path.join(ROOT, "tmp");
const REPORTS_DIR = path.join(TMP_DIR, "reports");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function safeFileName(value) {
  return String(value || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
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
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function loadExcludedEntityIds(exclusionsPath = EXCLUSIONS_PATH) {
  const doc = readJson(exclusionsPath, {});
  const rows = Array.isArray(doc && doc.players) ? doc.players : [];
  return new Set(rows.map((row) => String(row && row.entity_id ? row.entity_id : "").trim()).filter(Boolean));
}

function loadRosterPlayers(projectsDir = PROJECTS_DIR) {
  if (!fs.existsSync(projectsDir)) return [];
  const teamCodes = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b), "ko"));

  const players = [];
  for (const code of teamCodes) {
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath, {});
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const row of roster) {
      players.push({
        team_code: String(row && row.team_code ? row.team_code : doc.team_code || code).trim(),
        team_name: String(row && row.team_name ? row.team_name : doc.team_name || code).trim(),
        entity_id: String(row && row.entity_id ? row.entity_id : "").trim(),
        wr_id: Number(row && row.wr_id ? row.wr_id : 0) || 0,
        gender: String(row && row.gender ? row.gender : "").trim(),
        name: String(row && row.name ? row.name : "").trim(),
        display_name: String(row && row.display_name ? row.display_name : row && row.name ? row.name : "").trim(),
        tier: String(row && row.tier ? row.tier : "").trim(),
      });
    }
  }
  return players;
}

function resolveMatchFilePath(player, tmpDir = TMP_DIR) {
  const teamName = String(player && player.team_name ? player.team_name : "").trim();
  const playerName = String(player && player.name ? player.name : "").trim();
  if (!teamName || !playerName) return null;
  const candidates = [
    path.join(tmpDir, `${teamName}_${playerArtifactKey(player)}_matches.json`),
    path.join(tmpDir, `${teamName}_${safeFileName(playerName)}_matches.json`),
  ];
  return candidates.find((filePath) => fs.existsSync(filePath)) || null;
}

function buildLowSampleReview({
  projectsDir = PROJECTS_DIR,
  tmpDir = TMP_DIR,
  exclusionsPath = EXCLUSIONS_PATH,
  threshold = 3,
  now = new Date(),
} = {}) {
  const excludedEntityIds = loadExcludedEntityIds(exclusionsPath);
  const players = loadRosterPlayers(projectsDir);
  const deduped = new Map();

  for (const player of players) {
    if (!player.name || excludedEntityIds.has(player.entity_id)) continue;
    const matchFilePath = resolveMatchFilePath(player, tmpDir);
    if (!matchFilePath) continue;
    const doc = readJson(matchFilePath, {});
    const periodTotal = Number(doc && doc.players && doc.players[0] && doc.players[0].period_total);
    if (!Number.isFinite(periodTotal) || periodTotal > threshold) continue;

    const key = `${player.team_code}@@${player.name}`;
    const current = deduped.get(key) || {
      team_code: player.team_code,
      team_name: player.team_name,
      player_name: player.name,
      display_name: player.display_name || player.name,
      tier: player.tier,
      total_matches: periodTotal,
      category: periodTotal === 0 ? "zero_record" : "low_sample",
      entity_ids: [],
      match_files: [],
    };

    current.total_matches = Math.max(current.total_matches, periodTotal);
    current.category = current.total_matches === 0 ? "zero_record" : "low_sample";
    current.entity_ids.push(player.entity_id);
    current.match_files.push(path.relative(ROOT, matchFilePath).replace(/\\/g, "/"));
    deduped.set(key, current);
  }

  const rows = [...deduped.values()]
    .map((row) => ({
      ...row,
      entity_ids: [...new Set(row.entity_ids)].sort(),
      match_files: [...new Set(row.match_files)].sort(),
    }))
    .sort((a, b) => {
      if (a.total_matches !== b.total_matches) return a.total_matches - b.total_matches;
      const teamCompare = String(a.team_name).localeCompare(String(b.team_name), "ko");
      if (teamCompare !== 0) return teamCompare;
      return String(a.display_name || a.player_name).localeCompare(String(b.display_name || b.player_name), "ko");
    });

  const counts = rows.reduce((acc, row) => {
    acc[row.category] = Number(acc[row.category] || 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: now.toISOString(),
    threshold,
    total: rows.length,
    counts,
    players: rows,
  };
}

function writeReviewFiles(review, reportsDir = REPORTS_DIR, dateTag = todayInSeoul()) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const datedPath = path.join(reportsDir, `low_sample_review_${dateTag}.json`);
  const latestPath = path.join(reportsDir, "low_sample_review_latest.json");
  const text = JSON.stringify(review, null, 2) + "\n";
  fs.writeFileSync(datedPath, text, "utf8");
  fs.writeFileSync(latestPath, text, "utf8");
  return { datedPath, latestPath };
}

function main() {
  const threshold = Math.max(0, Number(argValue("--threshold", "3")) || 3);
  const write = hasFlag("--write");
  const review = buildLowSampleReview({ threshold });
  if (write) {
    const written = writeReviewFiles(review);
    console.error(
      `WROTE ${path.relative(ROOT, written.datedPath).replace(/\\/g, "/")} ${path.relative(ROOT, written.latestPath).replace(/\\/g, "/")}`
    );
  }
  console.log(JSON.stringify(review, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLowSampleReview,
  loadExcludedEntityIds,
  loadRosterPlayers,
  playerArtifactKey,
  resolveMatchFilePath,
  safeFileName,
  writeReviewFiles,
};
