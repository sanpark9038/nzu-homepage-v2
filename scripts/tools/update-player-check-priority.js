const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const TMP_DIR = path.join(ROOT, "tmp");

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function safeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function playerArtifactKey(player) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  if (entityId) return entityId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const wrId = Number(player && player.wr_id ? player.wr_id : 0);
  const gender = String(player && player.gender ? player.gender : "").trim() || "unknown";
  if (Number.isFinite(wrId) && wrId > 0) return `wr_${gender}_${wrId}`;
  return safeFileName(String(player && player.name ? player.name : "unknown_player"));
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function isoOrNull(value) {
  const d = asDate(value);
  return d ? d.toISOString() : null;
}

function daysSince(from, to) {
  if (!from || !to) return null;
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function loadTeamCodes() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((code) => fs.existsSync(path.join(PROJECTS_DIR, code, `players.${code}.v1.json`)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function matchJsonPath(teamCode, teamName, fetchUnivName, player) {
  const playerName = String(player && player.name ? player.name : "");
  const safeName = safeFileName(playerName);
  const candidates = [
    path.join(TMP_DIR, `${teamName}_${playerArtifactKey(player)}_matches.json`),
    path.join(TMP_DIR, `${fetchUnivName}_${playerArtifactKey(player)}_matches.json`),
    path.join(TMP_DIR, `${teamName}_${safeName}_matches.json`),
    path.join(TMP_DIR, `${fetchUnivName}_${safeName}_matches.json`),
    path.join(TMP_DIR, "exports", String(teamCode || ""), "json", `${teamName}_${safeName}_matches.json`),
    path.join(TMP_DIR, "exports", String(teamCode || ""), "json", `${fetchUnivName}_${safeName}_matches.json`),
  ].filter(Boolean);

  const hit = candidates.find((filePath) => fs.existsSync(filePath));
  return hit || candidates[0];
}

function readPlayerMatchMeta(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const stat = fs.statSync(jsonPath);
    const doc = readJson(jsonPath);
    const player = Array.isArray(doc.players) ? doc.players[0] : null;
    return {
      last_checked_at: stat.mtime.toISOString(),
      last_match_at: isoOrNull(player && player.period_max_date ? player.period_max_date : null),
      period_total: Number(player && player.period_total ? player.period_total : 0) || 0,
    };
  } catch {
    return null;
  }
}

function computePriority(meta, today) {
  if (!meta || !meta.last_checked_at) {
    return { check_priority: "high", check_interval_days: 1 };
  }
  const lastMatch = asDate(meta.last_match_at);
  if (!lastMatch) {
    return { check_priority: "normal", check_interval_days: 3 };
  }
  const inactiveDays = daysSince(lastMatch, today);
  if (inactiveDays === null) return { check_priority: "normal", check_interval_days: 3 };
  if (inactiveDays <= 14) return { check_priority: "high", check_interval_days: 1 };
  if (inactiveDays <= 45) return { check_priority: "normal", check_interval_days: 3 };
  return { check_priority: "low", check_interval_days: 7 };
}

function main() {
  const teamsArg = argValue("--teams", "");
  const requested = new Set(
    teamsArg
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
  const teamCodes = loadTeamCodes().filter((code) => requested.size === 0 || requested.has(code));
  const today = new Date();
  const summary = [];

  for (const code of teamCodes) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    const teamName = String(doc.team_name || code);
    const fetchUnivName = String(doc.fetch_univ_name || doc.team_name || code);
    let updated = 0;

    for (const player of roster) {
      const prev = {
        last_match_at: String(player.last_match_at || ""),
        last_checked_at: String(player.last_checked_at || ""),
        check_priority: String(player.check_priority || ""),
        check_interval_days: Number(player.check_interval_days || 0) || 0,
      };
      const meta = readPlayerMatchMeta(matchJsonPath(code, teamName, fetchUnivName, player));
      if (meta) {
        player.last_checked_at = meta.last_checked_at;
        player.last_match_at = meta.last_match_at;
      } else {
        if (!("last_checked_at" in player)) player.last_checked_at = null;
        if (!("last_match_at" in player)) player.last_match_at = null;
      }

      const priority = computePriority(meta, today);
      player.check_priority = priority.check_priority;
      player.check_interval_days = priority.check_interval_days;

      const changed =
        prev.last_match_at !== String(player.last_match_at || "") ||
        prev.last_checked_at !== String(player.last_checked_at || "") ||
        prev.check_priority !== String(player.check_priority || "") ||
        prev.check_interval_days !== Number(player.check_interval_days || 0);

      if (changed) {
        player.last_changed_at = new Date().toISOString();
        updated += 1;
      } else if (!("last_changed_at" in player)) {
        player.last_changed_at = null;
      }
    }

    doc.generated_at = new Date().toISOString();
    writeJson(filePath, doc);
    summary.push({
      team_code: code,
      roster_count: roster.length,
      updated,
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
    });
  }

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        teams: summary,
      },
      null,
      2
    )
  );
}

main();
