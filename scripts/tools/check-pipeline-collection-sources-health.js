const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");

const { TEAM_INDEX_URL, extractTeamNamesFromRosterIndex } = require("./lib/team-project-discovery");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const HEALTH_LATEST_JSON_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.json");
const HEALTH_LATEST_MD_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.md");
const DEFAULT_TIMEOUT_MS = 30000;

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const eucKr = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEucKr = (eucKr.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEucKr ? utf8 : eucKr;
}

async function fetchBinary(url, options = {}) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
      ...(options.headers || {}),
    },
    timeout: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
  });
  return res.data;
}

async function postBinary(url, body, options = {}) {
  const res = await axios.post(url, body, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(options.headers || {}),
    },
    timeout: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
  });
  return res.data;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function loadProjectDocs() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const code = entry.name;
      const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
      if (!fs.existsSync(filePath)) return null;
      try {
        const doc = readJson(filePath);
        return { code, doc };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function pickSampleProject(projects) {
  const preferred = projects.find((row) => String(row.doc && row.doc.fetch_univ_name ? row.doc.fetch_univ_name : "").trim());
  return preferred || projects[0] || null;
}

function parseRosterPlayers(html) {
  const $ = cheerio.load(html);
  const players = [];
  $("table.table tbody tr").each((_, tr) => {
    const row = $(tr);
    const nameAnchor = row.find("a.p_name").first();
    const profileAnchor = row.find('a[target="_blank"]').first();
    if (!nameAnchor.length || !profileAnchor.length) return;

    const fullName = nameAnchor.text().trim();
    const playerName = fullName.replace(/\([^)]*\)\s*$/, "").trim();
    const href = profileAnchor.attr("href") || "";
    const profileUrl = href.startsWith("http") ? href.replace(/^http:\/\//i, "https://") : `https://eloboard.com${href}`;
    const wrMatch = profileUrl.match(/wr_id=(\d+)/);

    players.push({
      name: playerName,
      profile_url: profileUrl,
      wr_id: wrMatch ? Number(wrMatch[1]) : null,
    });
  });

  return players;
}

function selectMode(profileUrl) {
  const text = String(profileUrl || "");
  if (text.includes("bo_table=bj_m_list")) {
    return {
      endpoint: "mix_view_list.php",
      boardBase: text.includes("/men/") ? "https://eloboard.com/men/bbs" : "https://eloboard.com/women/bbs",
    };
  }

  return {
    endpoint: "view_list.php",
    boardBase: text.includes("/men/") ? "https://eloboard.com/men/bbs" : "https://eloboard.com/women/bbs",
  };
}

function parseProfileBootstrap(profileHtml, profileUrl, fallbackName) {
  const endpoint = selectMode(profileUrl).endpoint;
  const endpointIndex = profileHtml.indexOf(endpoint);
  const slice =
    endpointIndex >= 0
      ? profileHtml.slice(Math.max(0, endpointIndex - 3000), endpointIndex + 3000)
      : profileHtml;

  let match = slice.match(/p_name\s*[:=]\s*["']([^"']+)["']/i);
  if (!match) match = slice.match(/name=["']p_name["'][^>]*value=["']([^"']+)["']/i);
  const pName = match && match[1] ? match[1].trim() : fallbackName;

  const $ = cheerio.load(profileHtml);
  const moreLink = $("a.more[id]").first();
  const rawLastId = Number(moreLink.attr("id") || 0);
  const hasListBoard = $("div.list-board").length > 0;
  const hasUpdates = $("div#updates").length > 0;

  return {
    p_name: pName,
    endpoint,
    last_id: Number.isFinite(rawLastId) ? rawLastId : 0,
    has_list_board: hasListBoard,
    has_updates: hasUpdates,
    has_more_link: moreLink.length > 0,
  };
}

async function checkTeamIndex() {
  const html = decodeHtml(await fetchBinary(TEAM_INDEX_URL));
  const teamNames = extractTeamNamesFromRosterIndex(html);
  return {
    ok: teamNames.length > 0,
    url: TEAM_INDEX_URL,
    observed_team_count: teamNames.length,
    sample_teams: teamNames.slice(0, 10),
  };
}

async function checkTeamRoster(sampleProject) {
  const teamName = String(
    (sampleProject && sampleProject.doc && (sampleProject.doc.fetch_univ_name || sampleProject.doc.team_name)) || ""
  ).trim();
  const rosterUrl = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(teamName)}`;
  const html = decodeHtml(await fetchBinary(rosterUrl));
  const players = parseRosterPlayers(html);
  return {
    ok: players.length > 0,
    url: rosterUrl,
    team_name: teamName,
    player_count: players.length,
    sample_player: players[0] || null,
    sample_players: players.slice(0, 8),
  };
}

async function checkPlayerProfile(samplePlayer, rosterUrl = "") {
  const html = decodeHtml(
    await fetchBinary(samplePlayer.profile_url, {
      headers: rosterUrl ? { Referer: rosterUrl } : undefined,
    })
  );
  const bootstrap = parseProfileBootstrap(html, samplePlayer.profile_url, samplePlayer.name);
  return {
    ok: Boolean(bootstrap.p_name && (bootstrap.has_list_board || bootstrap.has_more_link || bootstrap.has_updates)),
    url: samplePlayer.profile_url,
    profile_url: samplePlayer.profile_url,
    wr_id: samplePlayer.wr_id || null,
    endpoint: bootstrap.endpoint,
    p_name_present: Boolean(bootstrap.p_name),
    has_list_board: bootstrap.has_list_board,
    has_more_link: bootstrap.has_more_link,
    last_id: bootstrap.last_id,
    bootstrap,
  };
}

async function checkPaginatedHistory(profileCheck) {
  const bootstrap = profileCheck.bootstrap;
  const mode = selectMode(profileCheck.profile_url);
  const pageUrl = `${mode.boardBase}/${mode.endpoint}`;
  const lastId = Number(bootstrap.last_id || 0);
  if (!bootstrap.p_name || lastId <= 0) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_p_name_or_last_id",
      url: pageUrl,
    };
  }

  const body = qs.stringify({ p_name: bootstrap.p_name, last_id: lastId });
  const html = decodeHtml(
    await postBinary(pageUrl, body, {
      headers: {
        Referer: profileCheck.profile_url,
      },
    })
  );
  const $ = cheerio.load(html);
  const rowCount = $("tr").length;
  const nextLastId = Number($('input[name="last_id"]').val() || $("a.more[id]").last().attr("id") || 0);

  return {
    ok: rowCount > 0 || nextLastId > 0,
    url: pageUrl,
    row_count: rowCount,
    next_last_id: Number.isFinite(nextLastId) ? nextLastId : 0,
  };
}

async function main() {
  const includeDeep = !hasFlag("--no-deep");
  const shouldWrite = hasFlag("--write");
  const markdownOnly = hasFlag("--markdown");
  const projects = loadProjectDocs();
  const sampleProject = pickSampleProject(projects);
  if (!sampleProject) {
    throw new Error("No project metadata available under data/metadata/projects");
  }

  const indexCheck = await checkTeamIndex();
  const rosterCheck = await checkTeamRoster(sampleProject);
  if (!rosterCheck.sample_players || !rosterCheck.sample_players.length) {
    throw new Error("Roster health check returned no sample player");
  }
  let profileCheck = null;
  let profileError = null;
  for (const candidate of rosterCheck.sample_players) {
    try {
      profileCheck = await checkPlayerProfile(candidate, rosterCheck.url);
      if (profileCheck.ok) break;
    } catch (error) {
      profileError = error;
    }
  }
  if (!profileCheck) {
    profileCheck = {
      ok: false,
      url: rosterCheck.sample_players[0].profile_url,
      profile_url: rosterCheck.sample_players[0].profile_url,
      error: profileError instanceof Error ? profileError.message : String(profileError || "unknown_profile_error"),
      p_name_present: false,
      has_list_board: false,
      has_more_link: false,
      last_id: 0,
      bootstrap: null,
    };
  }
  let deepCheck = { ok: false, skipped: true, reason: "profile_check_failed" };
  if (includeDeep && profileCheck.ok) {
    deepCheck = await checkPaginatedHistory(profileCheck);
  } else if (!includeDeep) {
    deepCheck = { ok: false, skipped: true, reason: "disabled" };
  }

  const summary = {
    generated_at: new Date().toISOString(),
    sample_project_code: sampleProject.code,
    checks: {
      team_index: indexCheck,
      team_roster_page: rosterCheck,
      player_profile_page: profileCheck,
      player_paginated_history: deepCheck,
    },
  };

  summary.ok = Object.values(summary.checks).every((check) => check.ok || check.skipped);

  if (shouldWrite) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(HEALTH_LATEST_JSON_PATH, JSON.stringify(summary, null, 2), "utf8");
    fs.writeFileSync(HEALTH_LATEST_MD_PATH, formatMarkdown(summary), "utf8");
  }

  if (markdownOnly) {
    console.log(formatMarkdown(summary));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

function checkStatusLabel(check) {
  if (check && check.skipped) return "skipped";
  return check && check.ok ? "ok" : "failed";
}

function formatMarkdown(summary) {
  const checks = summary && summary.checks ? summary.checks : {};
  const lines = [
    "## Collection Sources Health",
    "",
    `- Overall: ${summary && summary.ok ? "ok" : "failed"}`,
    `- Generated At: ${summary && summary.generated_at ? summary.generated_at : "-"}`,
    `- Sample Project: ${summary && summary.sample_project_code ? summary.sample_project_code : "-"}`,
    "",
    `- Team Index: ${checkStatusLabel(checks.team_index)}`,
    `- Team Roster Page: ${checkStatusLabel(checks.team_roster_page)}`,
    `- Player Profile Page: ${checkStatusLabel(checks.player_profile_page)}`,
    `- Player Paginated History: ${checkStatusLabel(checks.player_paginated_history)}`,
  ];

  if (checks.team_index && checks.team_index.url) {
    lines.push(`- Team Index URL: ${checks.team_index.url}`);
  }
  if (checks.team_index && Number.isFinite(checks.team_index.observed_team_count)) {
    lines.push(`- Observed Teams: ${checks.team_index.observed_team_count}`);
  }
  if (checks.team_roster_page && checks.team_roster_page.team_name) {
    lines.push(`- Sample Team: ${checks.team_roster_page.team_name}`);
  }
  if (checks.team_roster_page && Number.isFinite(checks.team_roster_page.player_count)) {
    lines.push(`- Sample Team Players: ${checks.team_roster_page.player_count}`);
  }
  if (checks.player_profile_page && checks.player_profile_page.profile_url) {
    lines.push(`- Sample Profile: ${checks.player_profile_page.profile_url}`);
  }
  if (checks.player_paginated_history && checks.player_paginated_history.url) {
    lines.push(`- History Endpoint: ${checks.player_paginated_history.url}`);
  }
  if (checks.player_paginated_history && checks.player_paginated_history.reason) {
    lines.push(`- History Note: ${checks.player_paginated_history.reason}`);
  }

  return lines.join("\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  HEALTH_LATEST_JSON_PATH,
  HEALTH_LATEST_MD_PATH,
  decodeHtml,
  formatMarkdown,
  parseProfileBootstrap,
  parseRosterPlayers,
  selectMode,
};
