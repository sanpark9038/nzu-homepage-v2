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
const K_MIX_SECTION = "\uD63C\uC131\uBC00\uB9AC\uC804\uC801";
// \uD63C\uC131 \uBAA9\uB85D\uC740 \uD55C \uBE14\uB85D\uC774 \uC815\uD655\uD788 30\uD589\uC774\uB2E4(\uC11C\uBC84 LIMIT). \uC624\uD504\uC14B \uACC4\uC0B0\uC758 \uAE30\uC900\uAC12.
const MIX_PAGE_SIZE = 30;

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
  const res = await withRetry(async () => {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(options.headers || {}),
      },
      timeout: 30000,
    });
    throwIfSourceOutage(response.data, `GET ${url}`);
    return response;
  }, `GET ${url}`);
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

  // \uC2E4\uC81C \uB808\uC774\uC544\uC6C3(2026-08-17 \uC2E4\uCE21): \uC5EC\uC790\uBD80\uB294 "\uC5EC\uC131 : 9\uC804 0\uC2B9 9\uD328" \uC778\uB77C\uC778("\uC804\uC801" \uC5C6\uC74C),
  // \uB0A8\uC790\uBD80\uB294 "<th>\uCD1D\uC804\uC801</th><td>4,098\uC804 2,294\uC2B9 1,804\uD328(56.0%)</td>" \uD45C \uD615\uD0DC(\uCF5C\uB860 \uC5C6\uC74C).
  // \uC6D0\uB798\uC758 "\uC5EC\uC131\uC804\uC801 :"/"\uCD1D\uC804\uC801 :" \uC778\uB77C\uC778\uB9CC \uCC3E\uB358 \uC815\uADDC\uC2DD\uC740 \uB450 \uBCF4\uB4DC \uBAA8\uB450\uC5D0\uC11C \uC8FD\uC5B4 \uC788\uC5C8\uACE0,
  // \uADF8 \uD0D3\uC5D0 \uCE74\uC6B4\uD130>0 \uD310\uC815(\uC18C\uC2A4 \uC774\uC0C1 \uAC10\uC9C0\u00B7\uAC15\uC81C \uD398\uC774\uC9C0\uB124\uC774\uC158)\uC774 \uC804\uBD80 \uBB34\uB825\uD654\uB410\uB2E4.
  const NUMS = "([0-9,]+)\\s*\uC804\\s*([0-9,]+)\\s*\uC2B9\\s*([0-9,]+)\\s*\uD328";
  const SEP = "\\s*(?::|<\\/th>\\s*<td[^>]*>)\\s*";
  const totalMatch = html.match(new RegExp(`\uCD1D\uC804\uC801${SEP}${NUMS}`));
  const femaleMatch = html.match(new RegExp(`\uC5EC\uC131(?:\uC804\uC801)?${SEP}${NUMS}`));
  const maleMatch = html.match(new RegExp(`\uB0A8\uC131(?:\uC804\uC801)?${SEP}${NUMS}`));

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
  // 2026-08 개편: 여자부만 경기 목록이 AJAX 연도 조회로 갈렸다(아래 fetchWomenYearRows 주석).
  // 남자부(/men/)는 개편되지 않아 view_list.php 페이지네이션 그대로다 — 건드리지 말 것.
  if (!String((player && player.profile_url) || "").includes("/men/")) {
    return {
      mode: "women_yearly",
      endpoint: "ajax_women_record.php",
      sectionMarker: K_FEMALE_SECTION,
      collect_matches: true,
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

// 엘로보드(공유호스팅 PHP)가 DB 과부하로 죽으면 HTTP 200에 ~378바이트짜리 mysqli 오류
// 본문을 실어 보낸다(2026-08-13~). 이걸 정상 페이지로 읽으면 경기 0건이 되고, 상위가
// "조용한 삭제 의심"으로 수십 건 오탐한다. 정상 페이지가 아니면 수집을 실패시키는 게 정직하다.
function isSourceOutagePage(html) {
  const text = String(html || "");
  return text.includes("max_user_connections") || text.includes("Connect Error");
}

// 오류 본문은 순수 ASCII라 euc-kr/utf8 판정(decodeHtml) 전에도 그대로 읽힌다.
function throwIfSourceOutage(buffer, label) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  if (!isSourceOutagePage(text)) return;
  const error = new Error(`source_outage: ${label}`);
  error.code = "SOURCE_OUTAGE";
  throw error;
}

// 표시 카운터는 살아 있는데 경기 목록이 0행이면 소스가 이상한 것이다(장애 중 view_list.php가
// 빈 응답을 주는 형태). 예전에는 validation_pass=false로 기록만 하고 0건을 그대로 써서
// 그 0건이 상위의 "경기 수 감소" 오탐이 됐다. 이제는 결과를 쓰지 않고 실패로 끝낸다.
function isSourceAnomaly(displayTotal, matchCount) {
  return Number(displayTotal) > 0 && Number(matchCount) === 0;
}

// key는 프로필 JS가 쓰는 파라미터 이름이다. 남자부는 p_name, 개편된 여자부는 bj_name.
function parsePNameFromProfile(profileHtml, endpoint, fallbackName, key = "p_name") {
  const endpointIndex = profileHtml.indexOf(endpoint);
  const slice =
    endpointIndex >= 0
      ? profileHtml.slice(Math.max(0, endpointIndex - 3000), endpointIndex + 3000)
      : profileHtml;

  let match = slice.match(new RegExp(`${key}\\s*[:=]\\s*["']([^"']+)["']`, "i"));
  if (!match) match = slice.match(new RegExp(`name=["']${key}["'][^>]*value=["']([^"']+)["']`, "i"));
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

  const label = `POST ${url} p_name=${pName} last_id=${lastId}`;
  const res = await withRetry(async () => {
    const response = await axios.post(url, body, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: player.profile_url,
      },
      timeout: 30000,
    });
    throwIfSourceOutage(response.data, label);
    return response;
  }, label);

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

// 수집 윈도가 걸친 연도들(최신 → 과거). 여자부 엔드포인트는 연도 단위로만 조회된다.
function windowYears() {
  const from = Number(START_DATE.slice(0, 4));
  const to = Number(END_DATE.slice(0, 4));
  const years = [];
  for (let y = to; y >= from; y -= 1) years.push(y);
  return years;
}

// 응답 테이블 구조는 옛 list-board와 같다(날짜/상대/맵/ELO/경기방식/메모 + 날짜칸 배경색이 승패).
// 그래서 parseRowsFromBoard를 그대로 태운다.
function parseWomenYearRows(html) {
  const $ = cheerio.load(html);
  return parseRowsFromBoard($, $.root());
}

// 2026-08 개편(실측 2026-08-18): 여자부 프로필 페이지는 경기 목록을 더 이상 서버 렌더링하지
// 않는다. 페이지에 남아 있는 list-board 블록은 낡은 스냅샷이라(7월 초에서 멈춤) 그걸 읽던
// 옛 경로는 여자부 전체가 7월 이후 경기를 통째로 놓쳤다. 실제 목록은 접속 즉시 이 AJAX가
// 연도 단위로 가져온다 — 페이지네이션 없이 해당 연도 전량이 한 번에 온다.
// 남자부는 개편되지 않았다(view_list.php 그대로).
async function fetchWomenYearRows(player, mode, bjName, year) {
  const url = `https://eloboard.com/women/bbs/${mode.endpoint}`;
  const body = qs.stringify({ bj_name: bjName, target_year: year });

  const label = `POST ${url} bj_name=${bjName} target_year=${year}`;
  const res = await withRetry(async () => {
    const response = await axios.post(url, body, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: player.profile_url,
      },
      timeout: 30000,
    });
    throwIfSourceOutage(response.data, label);
    return response;
  }, label);

  // 헤더만 있고 0행이면 "그 해 경기 없음"이다(정상). 소스 이상 판정은 상위에서 표시 카운터와
  // 대조해 한 번만 한다.
  return parseWomenYearRows(decodeHtml(res.data));
}

// 혼성전(남자 상대) 탭. 2026-08 개편은 여성전만 AJAX로 옮겼고 혼성은 아직 서버 렌더링이라,
// 프로필 HTML의 "[혼성밀리전적 - ...]" 마커 뒤 첫 div.list-board에 최신 30행이 그대로 들어 있다.
// nextAll은 마커 뒤만 보므로 앞쪽 여성 섹션 보드를 잘못 집을 수 없다.
function extractMixInitialRows(profileHtml) {
  const $ = cheerio.load(profileHtml);
  const marker = $("strong")
    .toArray()
    .find((el) => $(el).text().includes(K_MIX_SECTION));
  if (!marker) return [];
  return parseRowsFromBoard($, $(marker).nextAll("div.list-board").first());
}

// 이어보기: POST view_mix_list.php, body는 p_name(여성전의 bj_name과 다름) + last_id.
// 함정 — 여기서 last_id는 날짜/글번호가 아니라 30·60·90 같은 OFFSET이다(프로필 JS 주석에 명시).
async function fetchMixPageRows(player, pName, offset) {
  const url = "https://eloboard.com/women/bbs/view_mix_list.php";
  const body = qs.stringify({ p_name: pName, last_id: offset });

  const label = `POST ${url} p_name=${pName} last_id=${offset}`;
  const res = await withRetry(async () => {
    const response = await axios.post(url, body, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: player.profile_url,
      },
      timeout: 30000,
    });
    throwIfSourceOutage(response.data, label);
    return response;
  }, label);

  const $ = cheerio.load(decodeHtml(res.data));
  return parseRowsFromBoard($, $.root());
}

// 혼성 목록 전체를 페이지 배열로 모은다. fetchPage(offset)는 테스트에서 주입한다.
// 중단 조건 셋: 빈 응답 / 윈도(START_DATE)보다 오래된 행 등장 / 30행 미만(마지막 블록).
async function collectMixPages(initialRows, fetchPage) {
  const pages = [];
  let rows = Array.isArray(initialRows) ? initialRows : [];
  for (let i = 0; i < 200 && rows.length; i += 1) {
    pages.push(rows);
    // 목록은 최신순이라 윈도 밖 행이 하나라도 보이면 그 뒤는 전부 더 오래된 경기다.
    if (rows.some((r) => r.date < START_DATE)) break;
    if (rows.length < MIX_PAGE_SIZE) break;
    rows = await fetchPage((i + 1) * MIX_PAGE_SIZE);
  }
  return pages;
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

// 매일 경로 전용 병합: 컷오프(올해 1/1)보다 오래된 prior 행만 이어 붙인다.
// mergePriorMatches를 여기 쓰면 안 된다 — 그건 "이번에 읽은 날짜의 prior 행을 통째로 버리는"
// 날짜 무효화 로직이라, 혼성 재읽기가 과거 날짜를 포함하면 그 날짜의 prior 여성전 행까지
// 함께 버려서 경기 수가 줄고 회귀 가드가 오작동한다. 여기서는 컷오프 + rowKey 중복 제거만 한다.
// 올해 행은 절대 부활시키지 않는다(올해는 방금 전량 재읽음 — 지워진 경기가 되살아나면 안 된다).
function mergePriorOlderThan(matches, seen, priorMatches, cutoffDate) {
  for (const old of Array.isArray(priorMatches) ? priorMatches : []) {
    const date = String((old && old.date) || "");
    if (!date || date >= cutoffDate) continue;
    if (!inRange(date)) continue;
    // prior 행에는 is_win이 이미 있다(appendRows가 넣어둔 값) → parseOutcome 재파싱 없이 그대로 쓴다.
    if (typeof old.is_win !== "boolean") continue;
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
  const isWomenYearly = mode.mode === "women_yearly";
  const pName = parsePNameFromProfile(
    profileHtml,
    mode.endpoint,
    resolvedPlayer.name,
    isWomenYearly ? "bj_name" : "p_name"
  );

  const seen = new Set();
  const matches = [];
  let unknownOutcomeRows = 0;
  let pagesScanned = 0;
  let usedIncrementalCache = false;
  let womenCurrentYearOnly = false;
  const prior = Array.isArray(priorMatches) ? priorMatches : [];
  const displayTotal = collectionDisplayTotal(resolvedPlayer, mode, displayStats);

  if (isWomenYearly) {
    // 연도 전량 조회라 앵커 조기중단이 의미가 없다(어차피 한 요청에 그 해가 다 온다).
    // 연도는 최신 → 과거 순이고 각 응답도 최신순이라, 결과는 그대로 최신순으로 쌓인다.
    //
    // 매일 경로는 올해만 읽는다. 보드의 연도 쿼리(ajax_women_record.php)가 전적 많은 선수에게
    // 아주 무겁고(실측: 801경기 선수 1명에 22초), 매일 전 연도를 읽었더니 연합팀(101명) 청크가
    // 30분 스텝 타임아웃으로 죽어 run 전체가 실패했다. 과거 연도는 기존 파일(prior)에서 가져오고,
    // 과거 연도의 조용한 삭제 감지는 원래 설계대로 34일 순환 전체 정독(--no-cache)이 맡는다.
    // prior가 없으면(첫 수집·팀 전체 호출) 붙일 몸통이 없으므로 전 연도를 그대로 읽는다.
    womenCurrentYearOnly = !NO_CACHE && prior.length > 0;
    const currentYearStart = `${END_DATE.slice(0, 4)}-01-01`;
    const years = womenCurrentYearOnly ? [Number(END_DATE.slice(0, 4))] : windowYears();
    for (const year of years) {
      const rows = await fetchWomenYearRows(resolvedPlayer, mode, pName, year);
      pagesScanned += 1;
      unknownOutcomeRows += appendRows(matches, seen, rows).unknownOutcomeRows;
    }

    // ajax_women_record.php는 여성전만 준다. 개편 전 수집에는 혼성전(남자 상대)도 들어 있었고
    // 지금도 활발한 콘텐츠라, 빼먹으면 여자부 전원이 "경기 수 감소"로 회귀 가드에 막힌다.
    // 같은 matches/seen에 이어 붙이면 rowKey 중복 제거가 여성/혼성 겹침을 알아서 처리한다.
    // 혼성 요청이 재시도 뒤에도 실패하면 여기서 그대로 throw된다 — 반쪽 데이터를 쓰면 또 "감소"다.
    const mixPName = parsePNameFromProfile(
      profileHtml,
      "view_mix_list.php",
      resolvedPlayer.name,
      "p_name"
    );
    const mixPages = await collectMixPages(extractMixInitialRows(profileHtml), (offset) =>
      fetchMixPageRows(resolvedPlayer, mixPName, offset)
    );
    for (const rows of mixPages) {
      pagesScanned += 1;
      unknownOutcomeRows += appendRows(matches, seen, rows).unknownOutcomeRows;
    }

    // 올해보다 오래된 경기는 기존 파일에서 그대로 받아온다(위에서 POST를 생략한 몫).
    if (womenCurrentYearOnly) {
      mergePriorOlderThan(matches, seen, prior, currentYearStart);
    }
  } else {
    const initial = extractInitialRows(profileHtml, mode);
    // 붙일 과거 기록이 없으면 앵커도 쓰지 않는다. 앵커만 믿고 조기 중단하면 병합할 몸통이
    // 없어 "짧은 전적"을 그대로 써버린다(팀 이동 등으로 prior json이 새 경로일 때 실제로 발생).
    const anchorKey = prior.length && cacheEntry && cacheEntry.latest_key ? cacheEntry.latest_key : null;
    let hitAnchor = false;
    const initAppend = appendRows(matches, seen, initial.rows, anchorKey);
    unknownOutcomeRows += initAppend.unknownOutcomeRows;
    hitAnchor = hitAnchor || initAppend.hitAnchor;

    let lastId = initial.initialLastId;
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

    usedIncrementalCache = hitAnchor && prior.length > 0;
    if (usedIncrementalCache) mergePriorMatches(matches, seen, prior);
  }

  // 강제 페이지네이션까지 다 시도한 뒤에도 0행이면 소스 이상이다. 여기서 끊어야 상위가
  // 0건짜리 결과를 기존 파일 위에 덮어쓰지 않는다(혼성 보드는 위에서 이미 반환됐다).
  if (isSourceAnomaly(displayTotal, matches.length)) {
    const error = new Error(
      `source_anomaly: ${resolvedPlayer.name} display_total=${displayTotal} matches=0`
    );
    error.code = "SOURCE_ANOMALY";
    throw error;
  }

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
    // yearly_full_read = 윈도 연도를 통째로 읽었다 → full_scan과 같은 등급의 "전량 정독"이다.
    // 하류(run-daily-pipeline의 full_scans 집계·회귀 가드 판정)가 이 값을 함께 인정해야 한다.
    // yearly_current_merge = 올해만 읽고 과거는 기존 파일에서 이어 붙였다 → 전량 정독이 아니다.
    // isFullScanStrategy가 이 값을 인정하면 안 된다(과거 연도를 안 봤으니 조용한 삭제를
    // 판정할 근거가 없다 — 그 판정은 순환 전체 정독의 몫이고, full_scans 집계에서도 빠져야 한다).
    scan_strategy: isWomenYearly
      ? womenCurrentYearOnly
        ? "yearly_current_merge"
        : "yearly_full_read"
      : usedIncrementalCache
        ? "incremental_cache_merge"
        : "full_scan",
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
      const code = error && error.code ? String(error.code) : "";
      if (!JSON_ONLY) {
        console.log(`[FAIL] ${player.name} ${error.message}`);
      }
      // 소스 장애는 stderr에도 남긴다. 상위(export)가 자식 프로세스 실패 메시지에서 이 마커로
      // "사이트가 죽었다"를 식별해 회로 차단기를 돌린다(--json-only여도 stdout은 오염되지 않는다).
      if (code === "SOURCE_OUTAGE" || code === "SOURCE_ANOMALY") {
        console.error(`[SOURCE] ${player.name} ${error.message}`);
      }
      return {
        ...player,
        error: error.message,
        ...(code ? { error_code: code } : {}),
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

  // 소스 장애·이상은 종료코드로 알린다. 0으로 끝나면 상위가 "경기 없는 정상 결과"로 알고
  // 멀쩡한 기존 json을 빈 결과로 덮어쓴다(회귀 가드는 total이 둘 다 숫자일 때만 막는다).
  const sourceFailures = outputPlayers.filter(
    (r) => r.error_code === "SOURCE_OUTAGE" || r.error_code === "SOURCE_ANOMALY"
  );
  if (failedValidations.length > 0 || sourceFailures.length > 0) {
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
  parseDisplayStats,
  isSourceOutagePage,
  isSourceAnomaly,
  extractInitialRows,
  extractMixInitialRows,
  collectMixPages,
  parseWomenYearRows,
  windowYears,
  appendRows,
  selectMode,
  playerCacheKey,
  mergePriorMatches,
  mergePriorOlderThan,
  rowKey,
};
