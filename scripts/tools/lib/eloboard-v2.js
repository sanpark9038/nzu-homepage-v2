// 엘로보드 새 사이트(2026-09 개편) 공개 JSON API 클라이언트 + 선수 식별 해석.
//
// 배경(2026-09-25 실측):
// - eloboard.com이 Next.js 사이트로 통째로 새로 만들어졌다. 옛 게시판 주소(bj_list·view_list.php·
//   ajax_women_record.php·view_mix_list.php·all_bj_list)는 전부 죽었고 홈으로 리다이렉트된다.
//   과거 기록은 새 사이트로 이관됐다. Cloudflare 검문도 사라졌다.
// - 공개 API: /api/players(offset 페이지, limit 최대 200 근처 — 500은 422), /api/players/{id},
//   /api/matches?player_id=…(최신순, 기간 필터 없음 — from/to는 무시된다).
// - 새 사이트의 선수 번호(id)는 옛 wr_id와 무관하다. 그래서 선수는 숲 아이디로 잇는다.
//
// 불변 규칙: 우리 쪽 키는 entity_id(eloboard:female:175 등) 그대로다. 서빙·R2·DB가 전부 이 키를
// 쓰므로 절대 바꾸지 않는다. 새 id는 수집 시점에만 해석해서 쓴다.
// 해석 우선순위: 대장 players[entity_id].eloboard_v2_id(수동 지정) > 숲 아이디 매칭
//   (대장 soop_user_id, 없으면 로스터 soop_user_id ↔ 새 선수 목록 soop_id, 소문자 비교, 1:1일 때만).
// 둘 다 안 되면 "미연결"(null) — 호출자가 실패가 아니라 skipped로 처리한다.
const fs = require("fs");
const path = require("path");
const { loadPlayerRows } = require("./player-ledger");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const BASE_URL = "https://eloboard.com";
const HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };
const PAGE_LIMIT = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const CACHE_DIR = path.join(ROOT, "tmp", ".cache");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceOutage(message) {
  const error = new Error(`source_outage: ${message}`);
  error.code = "SOURCE_OUTAGE";
  return error;
}

// HTTP 오류·JSON 아님·재시도 소진은 전부 SOURCE_OUTAGE다. 상위(export)가 이 표식으로 회로 차단기를
// 돌리고, 0건을 "경기 없음"으로 오독해 기존 파일을 덮는 일을 막는다(2026-08-22~25 사고의 교훈).
async function fetchJson(pathname, { fetchImpl = fetch, retries = MAX_RETRIES } = {}) {
  const url = `${BASE_URL}${pathname}`;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      const type = String(res.headers.get("content-type") || "");
      if (!res.ok) throw sourceOutage(`HTTP ${res.status} on GET ${url}`);
      if (!type.includes("application/json")) throw sourceOutage(`non-JSON (${type || "none"}) on GET ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  if (lastError && lastError.code === "SOURCE_OUTAGE") throw lastError;
  throw sourceOutage(`${lastError && lastError.message ? lastError.message : "fetch failed"} on GET ${url}`);
}

function expectArray(value, label) {
  if (!Array.isArray(value)) throw sourceOutage(`unexpected shape (not an array) from ${label}`);
  return value;
}

async function fetchAllPlayers(options = {}) {
  const all = [];
  // ponytail: 페이지 상한 50(=1만 명) — 선수 수가 그 이상이 되면 늘린다.
  for (let page = 0; page < 50; page += 1) {
    const label = `/api/players?limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`;
    const rows = expectArray(await fetchJson(label, options), label);
    for (const row of rows) {
      if (!row || !Number.isFinite(Number(row.id))) throw sourceOutage(`player row without id from ${label}`);
    }
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
  }
  if (!all.length) throw sourceOutage("empty player list from /api/players");
  return all;
}

async function fetchPlayer(id, options = {}) {
  const label = `/api/players/${encodeURIComponent(id)}`;
  const doc = await fetchJson(label, options);
  if (!doc || typeof doc !== "object" || !Number.isFinite(Number(doc.id))) {
    throw sourceOutage(`unexpected shape from ${label}`);
  }
  return doc;
}

// 최신순으로 넘기다가 startDate보다 오래된 행이 보이면 멈춘다(그 뒤는 전부 더 오래됐다).
// 반환값에는 윈도 밖 행이 섞일 수 있다 — 거르는 건 호출자 몫이다.
async function fetchPlayerMatchesSince(id, startDate, options = {}) {
  const all = [];
  let pages = 0;
  for (let offset = 0; pages < 500; offset += PAGE_LIMIT) {
    const label = `/api/matches?player_id=${encodeURIComponent(id)}&limit=${PAGE_LIMIT}&offset=${offset}`;
    const rows = expectArray(await fetchJson(label, options), label);
    pages += 1;
    for (const m of rows) {
      if (!m || !m.played_on || !Array.isArray(m.participants)) {
        throw sourceOutage(`unexpected match shape from ${label}`);
      }
    }
    all.push(...rows);
    if (rows.length < PAGE_LIMIT || rows.some((m) => String(m.played_on) < startDate)) break;
  }
  return { matches: all, pages };
}

// 서울 달력 날짜. 캐시 파일 키로 쓴다 — tmp/는 Actions 캐시로 다음 날 밤까지 살아남으므로
// 날짜 없는 캐시는 어제 목록으로 오늘을 해석하게 된다(과거 source_outage 마커 사고와 같은 함정).
function seoulDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function playersCachePath(date, cacheDir = CACHE_DIR) {
  return path.join(cacheDir, `eloboard_v2_players_${date}.json`);
}

// 선수 목록 전체 조회는 run(=날짜)당 한 번. 수집기는 선수마다 별도 프로세스로 뜨므로 파일로 공유한다.
async function loadPlayersCached({ date = seoulDate(), cacheDir = CACHE_DIR, ...options } = {}) {
  const filePath = playersCachePath(date, cacheDir);
  try {
    const cached = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(cached) && cached.length) return cached;
  } catch {
    // 없거나 깨졌으면 새로 받는다.
  }
  const players = await fetchAllPlayers(options);
  fs.mkdirSync(cacheDir, { recursive: true });
  // 원자적 쓰기: 동시에 뜬 다른 수집기가 반쯤 쓴 파일을 읽지 않게 한다.
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(players), "utf8");
  fs.renameSync(tmpPath, filePath);
  for (const name of fs.readdirSync(cacheDir)) {
    if (/^eloboard_v2_players_\d{4}-\d{2}-\d{2}\.json$/.test(name) && name !== path.basename(filePath)) {
      try {
        fs.unlinkSync(path.join(cacheDir, name));
      } catch {
        // 지워지지 않아도 날짜 키가 달라 읽히지 않는다.
      }
    }
  }
  return players;
}

// 대장에 숲 ID가 없는 선수는 로스터 파일의 soop_user_id로 보충한다.
function loadRosterSoopIds(projectsDir = PROJECTS_DIR) {
  const map = new Map();
  if (!fs.existsSync(projectsDir)) return map;
  for (const code of fs.readdirSync(projectsDir)) {
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
      for (const row of Array.isArray(doc.roster) ? doc.roster : []) {
        const entityId = String((row && row.entity_id) || "").trim();
        const soop = String((row && row.soop_user_id) || "").trim();
        if (entityId && soop && !map.has(entityId)) map.set(entityId, soop);
      }
    } catch {
      // 깨진 로스터 하나 때문에 전체 해석을 멈추지 않는다.
    }
  }
  return map;
}

// 순수 함수: 입력만으로 entity_id → { id, via, player } | null.
function buildV2Resolver({ players = [], ledgerRows = {}, rosterSoopIds = new Map() } = {}) {
  const byId = new Map();
  const bySoop = new Map();
  for (const p of players) {
    byId.set(Number(p.id), p);
    const soop = String((p && p.soop_id) || "").trim().toLowerCase();
    if (!soop) continue;
    if (!bySoop.has(soop)) bySoop.set(soop, []);
    bySoop.get(soop).push(p);
  }
  return function resolve(entityId) {
    const key = String(entityId || "").trim();
    if (!key) return null;
    const row = ledgerRows[key] || {};
    const manual = Number(row.eloboard_v2_id);
    if (Number.isFinite(manual) && manual > 0) {
      return { id: manual, via: "ledger_eloboard_v2_id", player: byId.get(manual) || null };
    }
    const soop = String(row.soop_user_id || rosterSoopIds.get(key) || "").trim().toLowerCase();
    const hits = soop ? bySoop.get(soop) || [] : [];
    // 동명이인·중복 계정 가능성: 후보가 둘 이상이면 연결하지 않는다(엉뚱한 사람 기록이 섞이는 것보다 미연결이 낫다).
    if (hits.length !== 1) return null;
    return { id: Number(hits[0].id), via: "soop_id", player: hits[0] };
  };
}

async function loadV2Resolver(options = {}) {
  const players = await loadPlayersCached(options);
  return buildV2Resolver({
    players,
    ledgerRows: loadPlayerRows(),
    rosterSoopIds: loadRosterSoopIds(),
  });
}

module.exports = {
  BASE_URL,
  fetchJson,
  fetchAllPlayers,
  fetchPlayer,
  fetchPlayerMatchesSince,
  seoulDate,
  playersCachePath,
  loadPlayersCached,
  loadRosterSoopIds,
  buildV2Resolver,
  loadV2Resolver,
};
