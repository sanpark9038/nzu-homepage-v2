const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "team_role_overrides.v1.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function getProjectPath(project) {
  return path.join(ROOT, "data", "metadata", "projects", project, `players.${project}.v1.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeTierKey(tier) {
  const raw = String(tier || "").trim().toLowerCase();
  const map = {
    god: "god",
    갓: "god",
    king: "king",
    킹: "king",
    킹티어: "king",
    jack: "jack",
    잭: "jack",
    잭티어: "jack",
    joker: "joker",
    조커: "joker",
    spade: "spade",
    스페이드: "spade",
    baby: "9",
    베이비: "9",
    유스: "9",
  };
  if (map[raw]) return map[raw];
  if (/^\d+$/.test(raw)) return raw;
  return raw || "unknown";
}

function tierRank(tier) {
  const key = normalizeTierKey(tier);
  const order = ["god", "king", "jack", "joker", "spade", "0", "1", "2", "3"];
  const idx = order.indexOf(key);
  if (idx >= 0) return idx;
  if (/^\d+$/.test(key)) return 100 + Number(key);
  return 999;
}

function main() {
  const project = argValue("--project", "wfu");
  const filePath = argValue("--file", getProjectPath(project));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing project metadata file: ${filePath}`);
  }
  if (!fs.existsSync(OVERRIDES_PATH)) {
    throw new Error(`Missing role overrides file: ${OVERRIDES_PATH}`);
  }

  const json = readJson(filePath);
  if (!Array.isArray(json.roster)) {
    throw new Error("Invalid project metadata: roster is not an array");
  }

  const code = String(json.team_code || project).toLowerCase();
  const overrides = readJson(OVERRIDES_PATH);
  const teamOverrides = (overrides.teams && overrides.teams[code]) || [];
  const byName = new Map(teamOverrides.map((r) => [String(r.name), r]));

  for (const p of json.roster) {
    const hit = byName.get(String(p.name));
    if (hit) {
      p.role_title = String(hit.role_title || "");
      p.role_priority = Number(hit.role_priority);
    } else {
      if (!("role_title" in p)) p.role_title = "";
      if (!("role_priority" in p)) p.role_priority = null;
    }
    p.tier_key = normalizeTierKey(p.tier);
  }

  json.roster.sort((a, b) => {
    const aHasRole = a.role_priority !== null && a.role_priority !== undefined && a.role_priority !== "";
    const bHasRole = b.role_priority !== null && b.role_priority !== undefined && b.role_priority !== "";
    const ap = aHasRole && Number.isFinite(Number(a.role_priority)) ? Number(a.role_priority) : 9999;
    const bp = bHasRole && Number.isFinite(Number(b.role_priority)) ? Number(b.role_priority) : 9999;
    if (ap !== bp) return ap - bp;
    const ar = tierRank(a.tier);
    const br = tierRank(b.tier);
    if (ar !== br) return ar - br;
    return String(a.name).localeCompare(String(b.name), "ko");
  });

  json.generated_at = new Date().toISOString();
  json.roster_ordering = {
    role_priority_first: true,
    tier_order: ["god", "king", "jack", "joker", "spade", "0", "1", "2", "3"],
    tier_aliases: {
      god: ["god", "갓"],
      king: ["king", "킹"],
      jack: ["jack", "잭"],
      joker: ["joker", "조커"],
      spade: ["spade", "스페이드"],
      baby: ["baby", "베이비", "유스", "9"],
    },
  };

  writeJson(filePath, json);
  console.log(
    JSON.stringify(
      {
        project,
        file: filePath,
        team_code: code,
        roster_count: json.roster.length,
        role_overrides_applied: teamOverrides.length,
      },
      null,
      2
    )
  );
}

main();
