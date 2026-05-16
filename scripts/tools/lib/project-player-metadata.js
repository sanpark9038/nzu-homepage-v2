const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function normalizeProjectPlayer(row, projectDoc, sourcePath) {
  const entityId = trim(row && row.entity_id);
  const gender = trim(row && row.gender).toLowerCase();
  const wrId = Number(row && row.wr_id);
  return {
    ...row,
    source_path: sourcePath,
    project: trim(projectDoc && projectDoc.project),
    team_code: trim(row && row.team_code) || trim(projectDoc && projectDoc.team_code),
    team_name: trim(row && row.team_name) || trim(projectDoc && projectDoc.team_name),
    entity_id: entityId,
    gender,
    wr_id: Number.isFinite(wrId) ? wrId : null,
    gender_wr_id: gender && Number.isFinite(wrId) ? `${gender}:${wrId}` : "",
    name: trim(row && row.name),
    display_name: trim((row && row.display_name) || (row && row.name)),
    soop_user_id: trim(row && row.soop_user_id),
  };
}

function loadProjectPlayerMetadata(options = {}) {
  const includeUnidentified = Boolean(options.includeUnidentified);
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const players = [];
  const projectDirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const code of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const row of roster) {
      const player = normalizeProjectPlayer(row, doc, filePath);
      if (!includeUnidentified && (!player.entity_id || !player.gender_wr_id)) continue;
      players.push(player);
    }
  }

  return players;
}

module.exports = {
  PROJECTS_DIR,
  loadProjectPlayerMetadata,
  readJson,
  trim,
};
