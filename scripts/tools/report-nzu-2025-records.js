const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");
const fs = require("fs");
const path = require("path");

const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);
const JSON_ONLY = process.argv.includes("--json-only");
const argv = process.argv.slice(2);
const univArgIndex = argv.indexOf("--univ");
const playerArgIndex = argv.indexOf("--player");
const concurrencyArgIndex = argv.indexOf("--concurrency");
const TEAM_NAME = univArgIndex >= 0 && argv[univArgIndex + 1] ? argv[univArgIndex + 1] : "\uB2AA\uC9C0\uB300";
const PLAYER_NAME = playerArgIndex >= 0 && argv[playerArgIndex + 1] ? argv[playerArgIndex + 1] : null;
const INCLUDE_MATCHES = process.argv.includes("--include-matches");
const NO_CACHE = process.argv.includes("--no-cache");
const CONCURRENCY =
  concurrencyArgIndex >= 0 && Number(argv[concurrencyArgIndex + 1]) > 0
    ? Number(argv[concurrencyArgIndex + 1])
    : 4;
const ROSTER_URL = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(
  TEAM_NAME
)}`;
const CACHE_PATH = path.join(process.cwd(), "tmp", ".cache", "roster_report_cache.json");
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

const K_WIN = "\uC2B9";
const K_LOSS = "\uD328";
const K_FEMALE_SECTION = "\uC5EC\uC131\uBC00\uB9AC\uC804\uC801";
const K_SSANGDI = "\uC30D\uB514";

const SPECIAL_PROFILE_URL = {
  [K_SSANGDI]:
    "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=671",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playerCacheKey(player) {
  return `${player.name}|${player.wr_id}|${player.profile_url}`;
}

function rowKey(r) {
  return `${r.date}|${r.opponent}|${r.map}|${r.result_text}|${r.set_score}|${r.note}`;
}

function loadCache() {
  if (NO_CACHE) return { version: 1, teams: {} };
  try {
    if (!fs.existsSync(CACHE_PATH)) return { version: 1, teams: {} };
    const raw = fs.readFileSync(CACHE_PATH, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, teams: {} };
    if (!parsed.teams || typeof parsed.teams !== "object") parsed.teams = {};
    return parsed;
  } catch {
    return { version: 1, teams: {} };
  }
}

function saveCache(cache) {
  if (NO_CACHE) return;
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

async function withRetry(fn, label) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      const waitMs = RETRY_BASE_MS * 2 ** attempt;
      if (!JSON_ONLY) {
        console.log(`[RETRY] ${label} attempt=${attempt + 1} wait=${waitMs}ms`);
      }
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const width = Math.max(1, Math.min(limit, items.length || 1));

  async function run() {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: width }, () => run()));
  return results;
}

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const eucKr = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEucKr = (eucKr.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEucKr ? utf8 : eucKr;
}

async function fetchBinary(url, options = {}) {
  const res = await withRetry(
    () =>
      axios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...(options.headers || {}),
        },
        timeout: 30000,
      }),
    `GET ${url}`
  );
  return res.data;
}

function normalizeDate(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const compact = raw.replace(/\./g, "-").replace(/\//g, "-");

  let m = compact.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;

  m = compact.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  return null;
}

function inRange(date) {
  return date >= START_DATE && date <= END_DATE;
}

function parseOutcome(resultText, styleText, rowText) {
  const result = String(resultText || "").replace(/\s+/g, "");
  const style = String(styleText || "").toLowerCase();

  if (result.includes(K_WIN)) return true;
  if (result.includes(K_LOSS)) return false;
  if (result.startsWith("+")) return true;
  if (result.startsWith("-")) return false;

  if (style.includes("#00ccff") || style.includes("rgb(0,204,255)")) return true;
  if (style.includes("#434348") || style.includes("rgb(67,67,72)")) return false;

  // rowText can contain memo strings like "OO승", which is ambiguous for winner side.
  // Do not infer outcome from whole-row text.
  void rowText;
  return null;
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("table.table tbody tr").each((_, tr) => {
    const row = $(tr);
    const pNameEl = row.find("a.p_name").first();
    if (!pNameEl.length) return;

    const full = pNameEl.text().trim();
    const name = full.replace(/\([^)]*\)\s*$/, "").trim();
    const tier = (full.match(/\(([^)]+)\)\s*$/) || [null, ""])[1];

    const historyHref = row.find('a[target="_blank"]').attr("href") || "";
    if (!historyHref) return;

    let profileUrl = historyHref.startsWith("http")
      ? historyHref
      : `https://eloboard.com${historyHref}`;
    profileUrl = profileUrl.replace(/^http:\/\//i, "https://");

    const wrMatch = profileUrl.match(/wr_id=(\d+)/);
    const wrId = wrMatch ? Number(wrMatch[1]) : null;

    const finalProfileUrl = SPECIAL_PROFILE_URL[name] || profileUrl;
    rows.push({
      name,
      tier,
      wr_id: wrId,
      profile_url: finalProfileUrl,
    });
  });

  const dedup = new Map();
  for (const r of rows) {
    const key = r.wr_id ?? `${r.name}|${r.profile_url}`;
    if (!dedup.has(key)) dedup.set(key, r);
  }
  return [...dedup.values()];
}

function parseDisplayStats(html) {
  const make = (m) =>
    m
      ? {
          total: Number(m[1].replace(/,/g, "")),
          wins: Number(m[2].replace(/,/g, "")),
          losses: Number(m[3].replace(/,/g, "")),
        }
      : null;

  const totalMatch = html.match(
    /\uCD1D\uC804\uC801\s*:\s*([0-9,]+)\uC804\s*([0-9,]+)\uC2B9\s*([0-9,]+)\uD328/
  );
  const femaleMatch = html.match(
    /\uC5EC\uC131\uC804\uC801\s*:\s*([0-9,]+)\uC804\s*([0-9,]+)\uC2B9\s*([0-9,]+)\uD328/
  );
  const maleMatch = html.match(
    /\uB0A8\uC131\uC804\uC801\s*:\s*([0-9,]+)\uC804\s*([0-9,]+)\uC2B9\s*([0-9,]+)\uD328/
  );

  return {
    total: make(totalMatch),
    female: make(femaleMatch),
    male: make(maleMatch),
  };
}

function selectMode(player) {
  const isSsangdi = player.name === K_SSANGDI;
  if (isSsangdi) {
    return {
      mode: "special_mix",
      endpoint: "mix_view_list.php",
      sectionMarker: "\uBC00\uB9AC \uC804\uC801",
    };
  }
  return {
    mode: "female_or_default",
    endpoint: "view_list.php",
    sectionMarker: K_FEMALE_SECTION,
  };
}

function parsePNameFromProfile(profileHtml, endpoint, fallbackName) {
  const endpointIndex = profileHtml.indexOf(endpoint);
  const slice =
    endpointIndex >= 0
      ? profileHtml.slice(Math.max(0, endpointIndex - 3000), endpointIndex + 3000)
      : profileHtml;

  let match = slice.match(/p_name\s*[:=]\s*["']([^"']+)["']/i);
  if (!match) match = slice.match(/name=["']p_name["'][^>]*value=["']([^"']+)["']/i);
  return match && match[1] ? match[1].trim() : fallbackName;
}

function parseRowsFromBoard($, boardEl) {
  const rows = [];
  if (!boardEl || !boardEl.length) return rows;

  let trNodes = boardEl.find("tbody tr");
  if (!trNodes.length) {
    trNodes = boardEl.find("tr");
  }

  trNodes.each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const date = normalizeDate($(cells[0]).text().trim());
    if (!date) return;
    rows.push({
      date,
      opponent: $(cells[1]).text().trim(),
      map: $(cells[2]).text().trim(),
      result_text: $(cells[3]).text().trim(),
      set_score: $(cells[4]).text().trim(),
      note: $(cells[5]).text().trim(),
      style0: $(cells[0]).attr("style") || "",
      row_text: $(tr).text(),
    });
  });

  return rows;
}

function extractInitialRows(profileHtml, mode) {
  const $ = cheerio.load(profileHtml);
  let board = null;
  let initialLastId = 0;

  const updatesRow = $("div#updates").first();
  if (updatesRow.length) {
    const moreRow = updatesRow.prevAll("div.list-row").first();
    const moreLink = moreRow.find("a.more[id]").first();
    const linkedBoard = moreRow.prevAll("div.list-board").first();
    if (linkedBoard.length && moreLink.length) {
      board = linkedBoard;
      const id = Number(moreLink.attr("id"));
      if (Number.isFinite(id) && id > 0) initialLastId = id;
    }
  }

  if (!board || !board.length) {
    const moreLink = $("a.more[id]").first();
    if (moreLink.length) {
      const moreRow = moreLink.closest("div.list-row");
      const linkedBoard = moreRow.prevAll("div.list-board").first();
      if (linkedBoard.length) {
        board = linkedBoard;
        const id = Number(moreLink.attr("id"));
        if (Number.isFinite(id) && id > 0) initialLastId = id;
      }
    }
  }

  if (mode.mode === "special_mix") {
    if (!board || !board.length) {
      board = $("div.list-board").first();
    }
  } else if (!board || !board.length) {
    const marker = $("strong")
      .toArray()
      .find((el) => $(el).text().includes(mode.sectionMarker));
    if (marker) {
      board = $(marker).nextAll("div.list-board").first();
    } else {
      board = $("div.list-board").first();
    }
  }

  const rows = parseRowsFromBoard($, board);
  if (!initialLastId) {
    const more = board ? board.nextAll("div.list-row").find("a.more[id]").first() : null;
    if (more && more.length) {
      const id = Number(more.attr("id"));
      if (Number.isFinite(id) && id > 0) initialLastId = id;
    }
  }

  return {
    rows,
    initialLastId,
  };
}

async function fetchPageRows(player, mode, pName, lastId) {
  const base = player.profile_url.includes("/men/")
    ? "https://eloboard.com/men/bbs"
    : "https://eloboard.com/women/bbs";
  const url = `${base}/${mode.endpoint}`;
  const body = qs.stringify({ p_name: pName, last_id: lastId });

  const res = await withRetry(
    () =>
      axios.post(url, body, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: player.profile_url,
        },
        timeout: 30000,
      }),
    `POST ${url} p_name=${pName} last_id=${lastId}`
  );

  const html = decodeHtml(res.data);
  const $ = cheerio.load(html);
  const rows = parseRowsFromBoard($, $.root());
  let nextLastId = Number($('input[name="last_id"]').val() || 0);
  if (!Number.isFinite(nextLastId) || nextLastId <= 0) {
    const moreId = Number($("a.more[id]").last().attr("id") || 0);
    if (Number.isFinite(moreId) && moreId > 0) {
      nextLastId = moreId;
    } else {
      const moreBoxId = $("div.morebox[id]").last().attr("id") || "";
      const m = moreBoxId.match(/^more(\d+)$/);
      nextLastId = m ? Number(m[1]) : 0;
    }
  }

  return {
    rows,
    nextLastId,
  };
}

function appendRows(bucket, seen, rows, anchorKey = null) {
  let unknownOutcomeRows = 0;
  let hitAnchor = false;
  for (const r of rows) {
    if (!inRange(r.date)) continue;
    const isWin = parseOutcome(r.result_text, r.style0, r.row_text);
    if (typeof isWin !== "boolean") {
      unknownOutcomeRows += 1;
      continue;
    }
    const key = rowKey(r);
    if (anchorKey && key === anchorKey) hitAnchor = true;
    if (seen.has(key)) continue;
    seen.add(key);
    bucket.push({ ...r, is_win: isWin });
  }
  return { unknownOutcomeRows, hitAnchor };
}

function compareMatchDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ao = String(a.opponent || "");
  const bo = String(b.opponent || "");
  if (ao !== bo) return ao > bo ? 1 : -1;
  const am = String(a.map || "");
  const bm = String(b.map || "");
  if (am !== bm) return am > bm ? 1 : -1;
  const as = String(a.set_score || "");
  const bs = String(b.set_score || "");
  if (as !== bs) return as > bs ? 1 : -1;
  return 0;
}

async function collectPlayer(player, cacheEntry = null) {
  const profileHtml = decodeHtml(await fetchBinary(player.profile_url));
  const mode = selectMode(player);
  const displayStats = parseDisplayStats(profileHtml);
  const pName = parsePNameFromProfile(profileHtml, mode.endpoint, player.name);
  const initial = extractInitialRows(profileHtml, mode);

  const seen = new Set();
  const matches = [];
  let unknownOutcomeRows = 0;
  const anchorKey = cacheEntry && cacheEntry.latest_key ? cacheEntry.latest_key : null;
  let hitAnchor = false;
  const initAppend = appendRows(matches, seen, initial.rows, anchorKey);
  unknownOutcomeRows += initAppend.unknownOutcomeRows;
  hitAnchor = hitAnchor || initAppend.hitAnchor;

  let pagesScanned = 0;
  let lastId = initial.initialLastId;
  const isMenBoard = player.profile_url.includes("/men/");
  if (lastId <= 0 && isMenBoard && mode.endpoint === "view_list.php") {
    lastId = 1;
  }
  let reachedOlderThanStart = false;
  let emptyHops = 0;

  for (let i = 0; i < 200 && lastId > 0; i += 1) {
    if (hitAnchor) break;
    const page = await fetchPageRows(player, mode, pName, lastId);
    if (!page.rows.length) {
      emptyHops += 1;
      if (
        Number.isFinite(page.nextLastId) &&
        page.nextLastId > lastId &&
        emptyHops <= 10
      ) {
        lastId = page.nextLastId;
        continue;
      }
      break;
    }
    emptyHops = 0;
    pagesScanned += 1;
    const pageAppend = appendRows(matches, seen, page.rows, anchorKey);
    unknownOutcomeRows += pageAppend.unknownOutcomeRows;
    hitAnchor = hitAnchor || pageAppend.hitAnchor;
    const pageDates = page.rows.map((r) => r.date).filter(Boolean).sort();
    if (pageDates.length && pageDates[0] < START_DATE) {
      reachedOlderThanStart = true;
    }

    if (
      !Number.isFinite(page.nextLastId) ||
      page.nextLastId <= 0 ||
      page.nextLastId === lastId
    ) {
      break;
    }
    if (reachedOlderThanStart) {
      break;
    }
    lastId = page.nextLastId;
  }

  let usedIncrementalCache = false;
  if (hitAnchor && cacheEntry && Array.isArray(cacheEntry.matches) && cacheEntry.matches.length) {
    usedIncrementalCache = true;
    for (const old of cacheEntry.matches) {
      const key = rowKey(old);
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(old);
    }
  }

  const wins = matches.filter((m) => m.is_win).length;
  const losses = matches.length - wins;
  const winRate = matches.length ? Number(((wins / matches.length) * 100).toFixed(2)) : 0;
  matches.sort(compareMatchDesc);
  const dates = matches.map((m) => m.date).sort();
  const outOfRange = matches.filter((m) => !inRange(m.date)).length;
  const validation = {
    no_unknown_outcome: unknownOutcomeRows === 0,
    no_out_of_range: outOfRange === 0,
    wins_losses_match_total: wins + losses === matches.length,
  };
  const validationPass =
    validation.no_unknown_outcome &&
    validation.no_out_of_range &&
    validation.wins_losses_match_total;

  return {
    ...player,
    mode: mode.mode,
    endpoint: mode.endpoint,
    p_name: pName,
    period_total: matches.length,
    period_wins: wins,
    period_losses: losses,
    period_win_rate: winRate,
    period_min_date: dates[0] || null,
    period_max_date: dates[dates.length - 1] || null,
    pages_scanned: pagesScanned,
    unknown_outcome_rows: unknownOutcomeRows,
    validation,
    validation_pass: validationPass,
    display_stats: displayStats,
    scan_strategy: usedIncrementalCache ? "incremental_cache_merge" : "full_scan",
    matches: INCLUDE_MATCHES ? matches : undefined,
    _cache_payload: {
      latest_key: matches[0] ? rowKey(matches[0]) : null,
      matches,
      updated_at: new Date().toISOString(),
      period_from: START_DATE,
      period_to: END_DATE,
    },
  };
}

function printSummaryTable(rows) {
  const table = rows.map((r) => ({
    name: r.name,
    wr_id: r.wr_id,
    period_total: r.period_total,
    period_wins: r.period_wins,
    period_losses: r.period_losses,
    period_win_rate: `${r.period_win_rate}%`,
    period_min_date: r.period_min_date || "-",
    period_max_date: r.period_max_date || "-",
    mode: r.mode,
    endpoint: r.endpoint,
    validation_pass: typeof r.validation_pass === "boolean" ? r.validation_pass : "",
    error: r.error || "",
  }));
  console.table(table);
}

async function main() {
  const cache = loadCache();
  if (!cache.teams[TEAM_NAME]) cache.teams[TEAM_NAME] = {};

  const rosterHtml = decodeHtml(await fetchBinary(ROSTER_URL));
  let roster = parseRoster(rosterHtml);
  if (PLAYER_NAME) {
    roster = roster.filter((p) => p.name === PLAYER_NAME);
  }
  if (!JSON_ONLY) {
    console.log(`[INFO] team=${TEAM_NAME} players=${roster.length} concurrency=${CONCURRENCY} cache=${NO_CACHE ? "off" : "on"}`);
  }

  const results = await mapWithConcurrency(roster, CONCURRENCY, async (player) => {
    try {
      const key = playerCacheKey(player);
      const cached = cache.teams[TEAM_NAME][key] || null;
      const rec = await collectPlayer(player, cached);
      if (rec && rec._cache_payload) {
        cache.teams[TEAM_NAME][key] = rec._cache_payload;
      }
      if (!JSON_ONLY) {
        console.log(
          `[OK] ${rec.name} ${rec.period_total} (${rec.period_wins}/${rec.period_losses}) ${rec.period_min_date || "-"}~${rec.period_max_date || "-"} validation=${rec.validation_pass ? "PASS" : "FAIL"} strategy=${rec.scan_strategy}`
        );
      }
      return rec;
    } catch (error) {
      if (!JSON_ONLY) {
        console.log(`[FAIL] ${player.name} ${error.message}`);
      }
      return {
        ...player,
        error: error.message,
      };
    }
  });

  saveCache(cache);

  const outputPlayers = results.map((r) => {
    const out = { ...r };
    delete out._cache_payload;
    if (!INCLUDE_MATCHES) delete out.matches;
    return out;
  });

  const failedValidations = outputPlayers.filter((r) => r.validation_pass === false);
  if (!JSON_ONLY) {
    printSummaryTable(outputPlayers);
  }
  console.log(
    JSON.stringify(
      {
        team_name: TEAM_NAME,
        roster_url: ROSTER_URL,
        period: { from: START_DATE, to: END_DATE },
        count: outputPlayers.length,
        validation_failed_count: failedValidations.length,
        players: outputPlayers,
      },
      null,
      2
    )
  );

  if (failedValidations.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
