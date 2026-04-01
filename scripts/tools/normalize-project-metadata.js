const fs = require("fs");
const path = require("path");
const {
  defaultProfileUrlForPlayer,
  getEloboardProfileKind,
  normalizeProfileUrl,
} = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function main() {
  const shouldWrite = hasFlag("--write");
  const dirs = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];

  const summary = [];

  for (const code of dirs.sort((a, b) => a.localeCompare(b))) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;

    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    let filledDisplayNames = 0;
    let filledProfileUrls = 0;
    let filledProfileKinds = 0;

    for (const player of roster) {
      const name = String(player && player.name ? player.name : "").trim();
      if (!String(player && player.display_name ? player.display_name : "").trim() && name) {
        player.display_name = name;
        filledDisplayNames += 1;
      }

      const normalizedProfileUrl = normalizeProfileUrl(
        player && player.profile_url
          ? player.profile_url
          : defaultProfileUrlForPlayer({
              wr_id: player && player.wr_id,
              gender: player && player.gender,
              name,
            })
      );
      if (!String(player && player.profile_url ? player.profile_url : "").trim() && normalizedProfileUrl) {
        player.profile_url = normalizedProfileUrl;
        filledProfileUrls += 1;
      } else if (normalizedProfileUrl && normalizedProfileUrl !== player.profile_url) {
        player.profile_url = normalizedProfileUrl;
      }

      const profileKind = getEloboardProfileKind(player && player.profile_url ? player.profile_url : "");
      if (!String(player && player.profile_kind ? player.profile_kind : "").trim() && profileKind) {
        player.profile_kind = profileKind;
        filledProfileKinds += 1;
      }
    }

    if (shouldWrite && (filledDisplayNames || filledProfileUrls || filledProfileKinds)) {
      doc.generated_at = new Date().toISOString();
      writeJson(filePath, doc);
    }

    summary.push({
      project: code,
      roster_count: roster.length,
      filled_display_names: filledDisplayNames,
      filled_profile_urls: filledProfileUrls,
      filled_profile_kinds: filledProfileKinds,
      wrote: shouldWrite && Boolean(filledDisplayNames || filledProfileUrls || filledProfileKinds),
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
    });
  }

  console.log(JSON.stringify({ ok: true, write: shouldWrite, projects: summary }, null, 2));
}

main();
