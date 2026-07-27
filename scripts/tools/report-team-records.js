const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const qs = require("querystring");
const fs = require("fs");
const path = require("path");
const {
  normalizeProfileUrl,
  resolveSpecialProfileUrlByName,
  toMixBoardProfileUrl,
  shouldUseMixEndpoint,
} = require("./lib/eloboard-special-cases");

const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);
const JSON_ONLY = process.argv.includes("--json-only");
const argv = process.argv.slice(2);
const univArgIndex = argv.indexOf("--univ");
const playerArgIndex = argv.indexOf("--player");
const concurrencyArgIndex = argv.indexOf("--concurrency");
const profileUrlArgIndex = argv.indexOf("--profile-url");
const wrIdArgIndex = argv.indexOf("--wr-id");
const genderArgIndex = argv.indexOf("--gender");
const tierArgIndex = argv.indexOf("--tier");
const entityIdArgIndex = argv.indexOf("--entity-id");
const priorJsonArgIndex = argv.indexOf("--prior-json");
const TEAM_NAME = univArgIndex >= 0 && argv[univArgIndex + 1] ? argv[univArgIndex + 1] : "";
const PLAYER_NAME = playerArgIndex >= 0 && argv[playerArgIndex + 1] ? argv[playerArgIndex + 1] : null;
const PROFILE_URL_ARG =
  profileUrlArgIndex >= 0 && argv[profileUrlArgIndex + 1] ? argv[profileUrlArgIndex + 1] : null;
const WR_ID_ARG = wrIdArgIndex >= 0 && argv[wrIdArgIndex + 1] ? Number(argv[wrIdArgIndex + 1]) : null;
const GENDER_ARG = genderArgIndex >= 0 && argv[genderArgIndex + 1] ? argv[genderArgIndex + 1] : null;
const TIER_ARG = tierArgIndex >= 0 && argv[tierArgIndex + 1] ? argv[tierArgIndex + 1] : "";
const ENTITY_ID_ARG =
  entityIdArgIndex >= 0 && argv[entityIdArgIndex + 1] ? argv[entityIdArgIndex + 1] : "";
const PRIOR_JSON_ARG =
  priorJsonArgIndex >= 0 && argv[priorJsonArgIndex + 1] ? argv[priorJsonArgIndex + 1] : "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 책갈피 키는 팀과 무관한 단일 버킷이다. 예전 키(name|wr_id|profile_url)는 프로필 URL이
// 바뀌거나 선수가 팀을 옮기면 앵커를 잃었고, 팀별 버킷 탓에 같은 선수가 c9/씨나인처럼 두 벌로
// 쌓였다. 정체성(entity_id)에 매달아 두면 이름·URL·소속이 변해도 책갈피가 살아남는다.
function playerCacheKey(player) {
  const entityId = String((player && player.entity_id) || "").trim();
  if (entityId) return entityId;
  const wrId = Number((player && player.wr_id) || 0);
  const gender = String((player && player.gender) || "").trim() || "unknown";
  if (Number.isFinite(wrId) && wrId > 0) return `wr_${gender}_${wrId}`;
  return String((player && player.name) || "unknown_player");
}

function rowKey(r) {
  return `${r.date}|${r.opponent}|${r.map}|${r.result_text}|${r.set_score}|${r.note}`;
}

function emptyCache() {
  return { version: 2, players: {} };
}

// v2 캐시는 책갈피만 담는다(경기 사본 없음 → 103MB → 수백 KB). 구버전 파일을 만나면
// latest_key만 건져 올리고 나머지는 버린다 — 키 체계가 달라 매칭되지 않는 항목은 자연히
// 사라지고, 해당 선수는 다음 차례에 한 번 full_scan 하면서 새 책갈피를 남긴다.
function loadCache() {
  if (NO_CACHE) return emptyCache();
  try {
    if (!fs.existsSync(CACHE_PATH)) return emptyCache();
    const raw = fs.readFileSync(CACHE_PATH, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyCache();
    const players = {};
    const source = parsed.players && typeof parsed.players === "object" ? parsed.players : {};
    for (const [key, entry] of Object.entries(source)) {
      if (!entry || typeof entry !== "object" || !entry.latest_key) continue;
      players[key] = {
        latest_key: entry.latest_key,
        updated_at: entry.updated_at || null,
        period_to: entry.period_to || null,
      };
    }
    return { version: 2, players };
  } catch {
    return emptyCache();
  }
}

// 병합 원본은 캐시가 아니라 선수별 matches json이다(호출자가 --prior-json으로 알려준다).
function loadPriorMatches(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    const player = Array.isArray(doc.players) ? doc.players[0] : null;
    return Array.isArray(player && player.matches) ? player.matches : [];
  } catch {
    return [];
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
    profileUrl = normalizeProfileUrl(profileUrl);

    const wrMatch = profileUrl.match(/wr_id=(\d+)/);
    const wrId = wrMatch ? Number(wrMatch[1]) : null;

    const finalProfileUrl = resolveSpecialProfileUrlByName(name, profileUrl);
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
  const usesMixEndpoint = shouldUseMixEndpoint(player);
  if (usesMixEndpoint) {
    return {
      mode: "mixed_collection_disabled",
      endpoint: null,
      sectionMarker: null,
      collect_matches: false,
    };
  }
  return {
    mode: "female_or_default",
    endpoint: "view_list.php",
    sectionMarker: K_FEMALE_SECTION,
    collect_matches: true,
  };
}

function isMissingPostErrorPage(html) {
  const text = String(html || "");
  return (
    text.includes("\uC624\uB958\uC548\uB0B4 \uD398\uC774\uC9C0") &&
    text.includes("\uAE00\uC774 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4")
  );
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
  if (mode && (mode.mode === "special_mix" || mode.mode === "mixed_collection_disabled")) {
    return {
      rows: [],
      initialLastId: 0,
    };
  }

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

  if (!board || !board.length) {
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

// 앵커에 걸려 조기 중단했을 때 과거 기록을 이어 붙인다. 날짜 단위 무효화가 핵심 안전장치다:
// 이번에 읽은 날짜의 과거 행은 통째로 버리고 새로 읽은 것으로 대체한다(같은 날 경기가 뒤늦게
// 정정·추가돼도 반영되도록). matches/seen을 제자리에서 갱신한다.
function mergePriorMatches(matches, seen, priorMatches) {
  const refreshedDates = new Set(matches.map((item) => String(item.date || "")).filter(Boolean));
  for (const old of Array.isArray(priorMatches) ? priorMatches : []) {
    if (refreshedDates.has(String(old.date || ""))) continue;
    const key = rowKey(old);
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(old);
  }
  return matches;
}

function statTotal(stats) {
  return Number(stats && stats.total ? stats.total : 0) || 0;
}

function collectionDisplayTotal(player, mode, displayStats) {
  if (!mode || mode.collect_matches === false) return 0;
  const url = String(player && player.profile_url ? player.profile_url : "");
  const isMenBoard = url.includes("/men/");
  const sectionStats = isMenBoard ? displayStats && displayStats.male : displayStats && displayStats.female;
  if (sectionStats) return statTotal(sectionStats);
  if (!isMenBoard) return 0;
  return statTotal(displayStats && displayStats.total);
}

async function collectPlayer(player, cacheEntry = null, priorMatches = []) {
  let resolvedPlayer = { ...player };
  let profileHtml = decodeHtml(await fetchBinary(resolvedPlayer.profile_url));
  if (isMissingPostErrorPage(profileHtml)) {
    const fallbackProfileUrl = toMixBoardProfileUrl(resolvedPlayer.profile_url);
    if (fallbackProfileUrl && fallbackProfileUrl !== resolvedPlayer.profile_url) {
      const fallbackHtml = decodeHtml(await fetchBinary(fallbackProfileUrl));
      if (!isMissingPostErrorPage(fallbackHtml)) {
        resolvedPlayer = {
          ...resolvedPlayer,
          profile_url: fallbackProfileUrl,
        };
        profileHtml = fallbackHtml;
      }
    }
  }

  const mode = selectMode(resolvedPlayer);
  const displayStats = parseDisplayStats(profileHtml);
  if (mode.collect_matches === false) {
    return {
      ...resolvedPlayer,
      mode: mode.mode,
      endpoint: mode.endpoint,
      p_name: resolvedPlayer.name,
      period_total: 0,
      period_wins: 0,
      period_losses: 0,
      period_win_rate: 0,
      period_min_date: null,
      period_max_date: null,
      pages_scanned: 0,
      unknown_outcome_rows: 0,
      validation: {
        no_unknown_outcome: true,
        no_out_of_range: true,
        wins_losses_match_total: true,
        display_total_consistent: true,
      },
      validation_pass: true,
      display_stats: displayStats,
      scan_strategy: "mixed_collection_disabled",
      matches: INCLUDE_MATCHES ? [] : undefined,
      _cache_payload: {
        latest_key: null,
        updated_at: new Date().toISOString(),
        period_to: END_DATE,
      },
    };
  }
  const pName = parsePNameFromProfile(profileHtml, mode.endpoint, resolvedPlayer.name);
  const initial = extractInitialRows(profileHtml, mode);

  const seen = new Set();
  const matches = [];
  let unknownOutcomeRows = 0;
  // 붙일 과거 기록이 없으면 앵커도 쓰지 않는다. 앵커만 믿고 조기 중단하면 병합할 몸통이
  // 없어 "짧은 전적"을 그대로 써버린다(팀 이동 등으로 prior json이 새 경로일 때 실제로 발생).
  const prior = Array.isArray(priorMatches) ? priorMatches : [];
  const anchorKey = prior.length && cacheEntry && cacheEntry.latest_key ? cacheEntry.latest_key : null;
  let hitAnchor = false;
  const initAppend = appendRows(matches, seen, initial.rows, anchorKey);
  unknownOutcomeRows += initAppend.unknownOutcomeRows;
  hitAnchor = hitAnchor || initAppend.hitAnchor;

  let pagesScanned = 0;
  let lastId = initial.initialLastId;
  const displayTotal = collectionDisplayTotal(resolvedPlayer, mode, displayStats);
  const isMenBoard = resolvedPlayer.profile_url.includes("/men/");
  // Some profile pages intermittently render summary stats but omit the initial list board.
  // Force a paginated fetch in that case instead of accepting a silent 0-match result.
  if (lastId <= 0 && initial.rows.length === 0 && displayTotal > 0) {
    lastId = 1;
  }
  if (lastId <= 0 && isMenBoard && mode.endpoint === "view_list.php") {
    lastId = 1;
  }
  let reachedOlderThanStart = false;
  let emptyHops = 0;

  for (let i = 0; i < 200 && lastId > 0; i += 1) {
    if (hitAnchor) break;
    const page = await fetchPageRows(resolvedPlayer, mode, pName, lastId);
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

  const usedIncrementalCache = hitAnchor && prior.length > 0;
  if (usedIncrementalCache) mergePriorMatches(matches, seen, prior);

  const wins = matches.filter((m) => m.is_win).length;
  const losses = matches.length - wins;
  const winRate = matches.length ? Number(((wins / matches.length) * 100).toFixed(2)) : 0;
  const dates = matches.map((m) => m.date).sort();
  const outOfRange = matches.filter((m) => !inRange(m.date)).length;
  const validation = {
    no_unknown_outcome: unknownOutcomeRows === 0,
    no_out_of_range: outOfRange === 0,
    wins_losses_match_total: wins + losses === matches.length,
    display_total_consistent: !(displayTotal > 0 && matches.length === 0),
  };
  const validationPass =
    validation.no_unknown_outcome &&
    validation.no_out_of_range &&
    validation.wins_losses_match_total &&
    validation.display_total_consistent;

  return {
    ...resolvedPlayer,
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
      updated_at: new Date().toISOString(),
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
  if (!TEAM_NAME) {
    throw new Error("Missing required arg: --univ <teamName>");
  }

  const cache = loadCache();

  let roster = [];
  if (PROFILE_URL_ARG) {
    const profileUrl = normalizeProfileUrl(PROFILE_URL_ARG);
    const wrMatch = profileUrl.match(/wr_id=(\d+)/);
    const wrId = Number.isFinite(WR_ID_ARG) ? WR_ID_ARG : wrMatch ? Number(wrMatch[1]) : null;
    const name =
      PLAYER_NAME ||
      (wrId !== null ? `wr_${wrId}` : "unknown_player");
    roster = [
      {
        name,
        tier: TIER_ARG || "",
        wr_id: wrId,
        gender: GENDER_ARG || "",
        entity_id: ENTITY_ID_ARG || "",
        profile_url: profileUrl,
      },
    ];
  } else {
    roster = await withRetry(async () => {
      const rosterHtml = decodeHtml(await fetchBinary(ROSTER_URL));
      const parsed = parseRoster(rosterHtml);
      if (!PLAYER_NAME && parsed.length === 0) {
        throw new Error(`Empty roster parsed: ${TEAM_NAME}`);
      }
      return parsed;
    }, `ROSTER ${TEAM_NAME}`);
    if (PLAYER_NAME) {
      roster = roster.filter((p) => p.name === PLAYER_NAME);
    }
  }
  if (!JSON_ONLY) {
    console.log(`[INFO] team=${TEAM_NAME} players=${roster.length} concurrency=${CONCURRENCY} cache=${NO_CACHE ? "off" : "on"}`);
  }

  // --prior-json은 단일 선수 호출에서만 의미가 있다(호출자가 그 선수의 기존 matches 경로를 안다).
  const priorMatches = roster.length === 1 ? loadPriorMatches(PRIOR_JSON_ARG) : [];

  const results = await mapWithConcurrency(roster, CONCURRENCY, async (player) => {
    try {
      const key = playerCacheKey(player);
      const cached = cache.players[key] || null;
      const rec = await collectPlayer(player, cached, priorMatches);
      if (rec && rec._cache_payload) {
        cache.players[key] = rec._cache_payload;
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
  const generatedAt = new Date().toISOString();
  console.log(
    JSON.stringify(
      {
        generated_at: generatedAt,
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  collectionDisplayTotal,
  extractInitialRows,
  selectMode,
  playerCacheKey,
  mergePriorMatches,
  rowKey,
};
