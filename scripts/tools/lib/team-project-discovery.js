const fs = require("fs");
const path = require("path");
const axios = require("axios");
const iconv = require("iconv-lite");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const DEFAULT_REPORT_DIR = path.join(ROOT, "tmp", "reports");
const TEAM_INDEX_URL = "https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list";

function normalizeTeamName(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const eucKr = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEucKr = (eucKr.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEucKr ? utf8 : eucKr;
}

async function fetchHtml(url = TEAM_INDEX_URL) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000,
  });
  return decodeHtml(res.data);
}

function decodeHtmlEntity(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&");
}

function extractTeamNamesFromRosterIndex(html) {
  const matches = new Set();
  const regex = /board\.php\?bo_table=all_bj_list(?:&amp;|&)univ_name=([^"'#<>\s]+)/gi;
  let match = regex.exec(String(html || ""));
  while (match) {
    const raw = decodeHtmlEntity(match[1]);
    try {
      matches.add(normalizeTeamName(decodeURIComponent(raw)));
    } catch {
      matches.add(normalizeTeamName(raw));
    }
    match = regex.exec(String(html || ""));
  }
  return [...matches].filter(Boolean);
}

function makeTeamSlug(name) {
  const slug = String(name || "")
    .replace(/[^\w\uAC00-\uD7A3]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (slug) return slug;
  return encodeURIComponent(String(name || "")).toLowerCase();
}

function makeTeamCode(name, existingCodes = new Set()) {
  const base = makeTeamSlug(name);
  let candidate = base;
  let suffix = 2;
  while (existingCodes.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function makeTeamNameEn(teamName, teamCode) {
  const ascii = String(teamName || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "");
  if (ascii) return ascii.toUpperCase();
  return String(teamCode || "").replace(/_/g, "").toUpperCase();
}

function buildAutoProjectDoc(teamName, teamCode) {
  const normalizedTeamName = normalizeTeamName(teamName);
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    project: teamCode,
    team_name: normalizedTeamName,
    team_code: teamCode,
    team_name_en: makeTeamNameEn(normalizedTeamName, teamCode),
    fetch_univ_name: normalizedTeamName,
    team_aliases: [normalizedTeamName],
    roster_count: 0,
    roster: [],
  };
}

function collectKnownTeamNames(projectsDir) {
  const names = new Set();
  const codes = new Set();
  if (!fs.existsSync(projectsDir)) {
    return { names, codes };
  }

  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const code of dirs) {
    codes.add(code);
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const doc = readJson(filePath);
      [
        doc && doc.team_name,
        doc && doc.fetch_univ_name,
        ...(Array.isArray(doc && doc.team_aliases) ? doc.team_aliases : []),
      ]
        .map((value) => normalizeTeamName(value).toLowerCase())
        .filter(Boolean)
        .forEach((value) => names.add(value));
    } catch {
      continue;
    }
  }

  return { names, codes };
}

async function ensureAutoDiscoveredTeamProjects({
  html = null,
  fetchHtmlImpl = fetchHtml,
  indexUrl = TEAM_INDEX_URL,
  projectsDir = DEFAULT_PROJECTS_DIR,
  reportDir = DEFAULT_REPORT_DIR,
} = {}) {
  const indexHtml = html == null ? await fetchHtmlImpl(indexUrl) : String(html);
  const observedTeamNames = extractTeamNamesFromRosterIndex(indexHtml);
  const { names: knownNames, codes: existingCodes } = collectKnownTeamNames(projectsDir);
  const createdProjects = [];

  for (const teamName of observedTeamNames) {
    const normalizedKey = normalizeTeamName(teamName).toLowerCase();
    if (!normalizedKey || knownNames.has(normalizedKey)) continue;

    const teamCode = makeTeamCode(teamName, existingCodes);
    const doc = buildAutoProjectDoc(teamName, teamCode);
    const filePath = path.join(projectsDir, teamCode, `players.${teamCode}.v1.json`);
    writeJson(filePath, doc);

    createdProjects.push({
      team_name: doc.team_name,
      team_code: doc.team_code,
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
    });

    existingCodes.add(teamCode);
    knownNames.add(normalizedKey);
  }

  const report = {
    generated_at: new Date().toISOString(),
    index_url: indexUrl,
    observed_team_names: observedTeamNames,
    created_projects_count: createdProjects.length,
    created_projects: createdProjects,
  };

  if (reportDir) {
    const reportPath = path.join(reportDir, "team_auto_discovery_report.json");
    writeJson(reportPath, report);
    report.report_path = path.relative(ROOT, reportPath).replace(/\\/g, "/");
  }

  return report;
}

module.exports = {
  TEAM_INDEX_URL,
  buildAutoProjectDoc,
  ensureAutoDiscoveredTeamProjects,
  extractTeamNamesFromRosterIndex,
  makeTeamCode,
  makeTeamSlug,
};
