const SOOP_BROAD_LIST_URL = "https://openapi.sooplive.co.kr/broad/list";
const DEFAULT_BROAD_LIST_PAGE_LIMIT = 200;

function trim(value) {
  return String(value || "").trim();
}

function normalizeUrl(url) {
  return trim(url).replace(/^http:\/\//i, "https://");
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (!row || typeof row !== "object") continue;
    const value = row[key];
    const text = trim(value);
    if (text) return text;
  }
  return "";
}

function looksLikeBroadcastRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  return Boolean(
    pickFirst(row, ["user_id", "bj_id", "userId", "bjId"]) &&
      pickFirst(row, ["broad_title", "title", "broadTitle"])
  );
}

function collectBroadcastRows(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectBroadcastRows(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;

  if (looksLikeBroadcastRow(value)) {
    out.push(value);
    return out;
  }

  for (const child of Object.values(value)) {
    collectBroadcastRows(child, out);
  }
  return out;
}

function normalizeBroadcastRow(row) {
  const userId = pickFirst(row, ["user_id", "bj_id", "userId", "bjId"]);
  if (!userId) return null;

  return {
    soopId: userId,
    nickname: pickFirst(row, ["user_nick", "bj_nick", "userNick", "bjNickname", "nickname"]),
    title: pickFirst(row, ["broad_title", "title", "broadTitle"]),
    viewers: pickFirst(row, ["total_view_cnt", "view_cnt", "current_sum_viewer", "viewCnt"]),
    broadStart: pickFirst(row, ["broad_start", "start_time", "startTime", "broadStart"]),
    thumbnail: normalizeUrl(
      pickFirst(row, ["broad_thumb", "thumbnail", "broadThumb", "thumb"])
    ),
  };
}

async function fetchBroadListPage({ clientId, pageNo, orderType = "broad_start" }) {
  const safeClientId = trim(clientId);
  if (!safeClientId) {
    throw new Error("Missing SOOP client id.");
  }

  const url = new URL(SOOP_BROAD_LIST_URL);
  url.searchParams.set("client_id", safeClientId);
  url.searchParams.set("order_type", orderType);
  url.searchParams.set("page_no", String(pageNo));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`SOOP broad/list failed: ${response.status} ${response.statusText}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const raw = await response.text();
  if (!raw.trim()) return {};

  if (contentType.includes("application/json") || raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }

  const jsonpMatch = raw.match(/^[^(]+\((.*)\)\s*;?\s*$/s);
  if (jsonpMatch) {
    return JSON.parse(jsonpMatch[1]);
  }

  throw new Error("SOOP broad/list returned an unexpected payload.");
}

async function fetchLiveRowsByIds({ clientId, targetIds, pageLimit = DEFAULT_BROAD_LIST_PAGE_LIMIT, orderType = "broad_start" }) {
  const remaining = new Set((targetIds || []).map((id) => trim(id).toLowerCase()).filter(Boolean));
  const found = new Map();

  for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
    const payload = await fetchBroadListPage({ clientId, pageNo, orderType });
    const rows = collectBroadcastRows(payload).map(normalizeBroadcastRow).filter(Boolean);
    if (!rows.length) break;

    for (const row of rows) {
      const key = trim(row.soopId).toLowerCase();
      if (!remaining.has(key)) continue;
      found.set(key, row);
      remaining.delete(key);
    }

    if (!remaining.size) break;
  }

  return found;
}

async function fetchAllLiveRows({ clientId, pageLimit = DEFAULT_BROAD_LIST_PAGE_LIMIT, orderType = "broad_start" }) {
  const rows = [];
  const seen = new Set();

  for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
    const payload = await fetchBroadListPage({ clientId, pageNo, orderType });
    const pageRows = collectBroadcastRows(payload).map(normalizeBroadcastRow).filter(Boolean);
    if (!pageRows.length) break;

    let addedThisPage = 0;
    for (const row of pageRows) {
      const key = trim(row.soopId).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      addedThisPage += 1;
    }

    if (!addedThisPage) break;
  }

  return rows;
}

module.exports = {
  SOOP_BROAD_LIST_URL,
  DEFAULT_BROAD_LIST_PAGE_LIMIT,
  trim,
  fetchLiveRowsByIds,
  fetchAllLiveRows,
};
