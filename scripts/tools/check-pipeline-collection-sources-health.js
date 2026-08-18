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
      endpoint: null,
      boardBase: text.includes("/men/") ? "https://eloboard.com/men/bbs" : "https://eloboard.com/women/bbs",
      disabled_reason: "mixed_match_collection_disabled",
    };
  }

  // 2026-08 개편: 여자부 경기 목록은 프로필에 서버 렌더링되지 않고 연도 단위 AJAX로 온다.
  // 옛 view_list.php는 여전히 200을 주지만 낡은 스냅샷이라, 그걸 보고 "정상"이라고 하면
  // 여자부 전체가 7월 이후를 놓치는 동안에도 헬스체크가 통과한다(실제로 그랬다).
  if (!text.includes("/men/")) {
    return {
      endpoint: "ajax_women_record.php",
      boardBase: "https://eloboard.com/women/bbs",
      disabled_reason: null,
      param: "bj_name",
    };
  }

  return {
    endpoint: "view_list.php",
    boardBase: "https://eloboard.com/men/bbs",
    disabled_reason: null,
    param: "p_name",
  };
}

function parseProfileBootstrap(profileHtml, profileUrl, fallbackName) {
  const mode = selectMode(profileUrl);
  const endpoint = mode.endpoint;
  const endpointIndex = endpoint ? profileHtml.indexOf(endpoint) : -1;
  const slice =
    endpointIndex >= 0
      ? profileHtml.slice(Math.max(0, endpointIndex - 3000), endpointIndex + 3000)
      : profileHtml;

  // 남자부는 p_name, 개편된 여자부는 bj_name을 프로필 JS가 들고 있다.
  const param = mode.param || "p_name";
  let match = slice.match(new RegExp(`${param}\\s*[:=]\\s*["']([^"']+)["']`, "i"));
  if (!match) match = slice.match(new RegExp(`name=["']${param}["'][^>]*value=["']([^"']+)["']`, "i"));
  const pName = match && match[1] ? match[1].trim() : fallbackName;

  const $ = cheerio.load(profileHtml);
  const moreLink = $("a.more[id]").first();
  const rawLastId = Number(moreLink.attr("id") || 0);
  const hasListBoard = $("div.list-board").length > 0;
  const hasUpdates = $("div#updates").length > 0;

  return {
    p_name: pName,
    endpoint,
    disabled_reason: mode.disabled_reason,
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
    // 여자부는 남자부와 수집 경로가 완전히 다르다(연도 AJAX). 로스터 앞쪽이 남자부면
    // 여자부 엔드포인트가 한 번도 검사되지 않으므로 후보를 따로 뽑아 둔다.
    women_sample_players: players
      .filter((row) => selectMode(row.profile_url).param === "bj_name")
      .slice(0, 5),
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

// 빈 연도 응답도 thead는 들어 있다. td를 가진 행만 세야 "그 해 경기 없음"과 구분된다.
function countWomenRecordRows(html) {
  const $ = cheerio.load(html);
  let count = 0;
  $("tbody tr").each((_, tr) => {
    if ($(tr).find("td").length >= 4) count += 1;
  });
  return count;
}

async function checkPaginatedHistory(profileCheck) {
  const bootstrap = profileCheck.bootstrap;
  const mode = selectMode(profileCheck.profile_url);
  if (!mode.endpoint) {
    return {
      ok: true,
      skipped: true,
      reason: mode.disabled_reason || "history_collection_disabled",
      url: null,
    };
  }
  const pageUrl = `${mode.boardBase}/${mode.endpoint}`;

  // 여자부는 연도 단위 AJAX 한 방이라 last_id가 없다. 올해에 경기가 없는 선수도 있으니
  // 작년까지 훑어 한 해라도 행이 나오면 소스가 살아 있는 것으로 본다.
  if (mode.param === "bj_name") {
    if (!bootstrap.p_name) {
      return { ok: false, skipped: true, reason: "missing_bj_name", url: pageUrl };
    }
    const thisYear = new Date().getFullYear();
    const yearsTried = [];
    let rowCount = 0;
    for (const year of [thisYear, thisYear - 1]) {
      yearsTried.push(year);
      const html = decodeHtml(
        await postBinary(pageUrl, qs.stringify({ bj_name: bootstrap.p_name, target_year: year }), {
          headers: { Referer: profileCheck.profile_url },
        })
      );
      rowCount = countWomenRecordRows(html);
      if (rowCount > 0) break;
    }
    return {
      ok: rowCount > 0,
      url: pageUrl,
      row_count: rowCount,
      years_tried: yearsTried,
      ...(rowCount > 0 ? {} : { reason: "women_yearly_endpoint_returned_no_rows" }),
    };
  }

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

  // 여자부는 별도 검사가 필요하다. 위 샘플 선수가 남자부면 view_list.php만 확인되는데,
  // 2026-08 개편 뒤 여자부는 그 경로를 아예 쓰지 않는다(낡은 스냅샷만 돌아온다).
  let womenCheck = { ok: false, skipped: true, reason: "no_women_sample_player" };
  if (!includeDeep) {
    womenCheck = { ok: false, skipped: true, reason: "disabled" };
  } else {
    for (const candidate of rosterCheck.women_sample_players || []) {
      try {
        const womenProfile = await checkPlayerProfile(candidate, rosterCheck.url);
        if (!womenProfile.ok) continue;
        womenCheck = await checkPaginatedHistory(womenProfile);
        womenCheck.profile_url = candidate.profile_url;
        if (womenCheck.ok) break;
      } catch (error) {
        womenCheck = {
          ok: false,
          url: null,
          profile_url: candidate.profile_url,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    sample_project_code: sampleProject.code,
    checks: {
      team_index: indexCheck,
      team_roster_page: rosterCheck,
      player_profile_page: profileCheck,
      player_paginated_history: deepCheck,
      player_women_yearly_history: womenCheck,
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
    `- Player Women Yearly History: ${checkStatusLabel(checks.player_women_yearly_history)}`,
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
  if (checks.player_women_yearly_history && checks.player_women_yearly_history.url) {
    lines.push(`- Women History Endpoint: ${checks.player_women_yearly_history.url}`);
  }
  if (checks.player_women_yearly_history && checks.player_women_yearly_history.reason) {
    lines.push(`- Women History Note: ${checks.player_women_yearly_history.reason}`);
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
  countWomenRecordRows,
  decodeHtml,
  formatMarkdown,
  parseProfileBootstrap,
  parseRosterPlayers,
  selectMode,
};
