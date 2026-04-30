import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const SOOP_BROAD_LIST_URL = "https://openapi.sooplive.co.kr/broad/list";
const DEFAULT_BROAD_LIST_PAGE_LIMIT = 200;
const DEFAULT_SYNC_HEARTBEAT_MINUTES = 10;
const FETCH_TIMEOUT_MS = 10000;
const MAX_SCAN_MS = 120000;
const LIVE_FIELDS = "id,name,soop_id,is_live,broadcast_title,live_thumbnail_url,last_checked_at";

function trim(value) {
  return String(value || "").trim();
}

function env(name) {
  return trim(Deno.env.get(name));
}

function envFirst(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeUrl(url) {
  const raw = trim(url).replace(/^http:\/\//i, "https://");
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

function normalizeNullableText(value) {
  return trim(value) || null;
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (!row || typeof row !== "object") continue;
    const value = trim(row[key]);
    if (value) return value;
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
    thumbnail: normalizeUrl(pickFirst(row, ["broad_thumb", "thumbnail", "broadThumb", "thumb"])),
  };
}

async function fetchBroadListPage({ clientId, pageNo, orderType = "broad_start" }) {
  const url = new URL(SOOP_BROAD_LIST_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("order_type", orderType);
  url.searchParams.set("page_no", String(pageNo));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" },
      signal: controller.signal,
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
    if (jsonpMatch) return JSON.parse(jsonpMatch[1]);

    throw new Error("SOOP broad/list returned an unexpected payload.");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLiveRowsByIds({ clientId, targetIds, pageLimit, startedAtMs }) {
  const remaining = new Set((targetIds || []).map((id) => trim(id).toLowerCase()).filter(Boolean));
  const found = new Map();
  let pagesScanned = 0;
  let scanCompleted = false;

  for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
    if (Date.now() - startedAtMs > MAX_SCAN_MS) {
      throw new Error(`SOOP broad/list scan exceeded ${MAX_SCAN_MS}ms before page ${pageNo}.`);
    }

    const payload = await fetchBroadListPage({ clientId, pageNo });
    pagesScanned = pageNo;
    const rows = collectBroadcastRows(payload).map(normalizeBroadcastRow).filter(Boolean);
    if (!rows.length) {
      scanCompleted = true;
      break;
    }

    for (const row of rows) {
      const key = trim(row.soopId).toLowerCase();
      if (!remaining.has(key)) continue;
      found.set(key, row);
      remaining.delete(key);
    }

    if (!remaining.size) {
      scanCompleted = true;
      break;
    }
  }

  const unresolvedTargetIds = scanCompleted ? [] : Array.from(remaining);
  return {
    liveById: found,
    pagesScanned,
    scanCompleted,
    unresolvedTargetIds,
  };
}

function isOlderThanHeartbeat(lastCheckedAt, checkedAtMs, heartbeatMs) {
  const lastCheckedMs = Date.parse(trim(lastCheckedAt));
  if (!Number.isFinite(lastCheckedMs)) return true;
  return checkedAtMs - lastCheckedMs >= heartbeatMs;
}

function buildChangedPlayerPatches(
  players,
  liveById,
  checkedAt,
  heartbeatMinutes = DEFAULT_SYNC_HEARTBEAT_MINUTES,
  unresolvedSoopIds = new Set()
) {
  const checkedAtMs = Date.parse(checkedAt);
  const heartbeatMs = Math.max(1, Number(heartbeatMinutes)) * 60 * 1000;
  const patches = [];
  let liveCount = 0;
  let offlineCount = 0;

  for (const player of Array.isArray(players) ? players : []) {
    const id = trim(player && player.id);
    const soopId = trim(player && player.soop_id);
    if (!id || !soopId) continue;

    const soopKey = soopId.toLowerCase();
    const live = liveById.get(soopKey) || null;
    if (!live && unresolvedSoopIds.has(soopKey)) continue;

    const nextIsLive = Boolean(live);
    const nextTitle = nextIsLive ? normalizeNullableText(live.title) : null;
    const nextThumbnail = nextIsLive ? normalizeNullableText(live.thumbnail) : null;
    const currentIsLive = player.is_live === true;
    const currentTitle = normalizeNullableText(player.broadcast_title);
    const currentThumbnail = normalizeNullableText(player.live_thumbnail_url);

    if (nextIsLive) liveCount += 1;
    else offlineCount += 1;

    const changed =
      currentIsLive !== nextIsLive ||
      currentTitle !== nextTitle ||
      currentThumbnail !== nextThumbnail ||
      (nextIsLive && isOlderThanHeartbeat(player.last_checked_at, checkedAtMs, heartbeatMs));

    if (!changed) continue;

    patches.push({
      id,
      is_live: nextIsLive,
      broadcast_title: nextTitle,
      live_thumbnail_url: nextThumbnail,
      last_checked_at: checkedAt,
    });
  }

  return { patches, liveCount, offlineCount };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function validateRequest(request, anonKey, syncSecret) {
  const authorization = trim(request.headers.get("authorization"));
  const apikey = trim(request.headers.get("apikey"));
  const providedSecret = trim(request.headers.get("x-sync-secret"));

  if (!anonKey || !syncSecret) return { ok: false, error: "missing_edge_auth_env" };
  if (!authorization.startsWith("Bearer ")) return { ok: false, error: "invalid_authorization" };
  if (!apikey) return { ok: false, error: "missing_apikey" };
  if (providedSecret !== syncSecret) return { ok: false, error: "invalid_sync_secret" };
  return { ok: true };
}

function createSupabaseAdminClient() {
  const supabaseUrl = envFirst(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = envFirst(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
  if (!supabaseUrl || !serviceKey) {
    throw new Error("missing_supabase_service_env");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function insertSyncRun(supabase, row) {
  const { data, error } = await supabase
    .from("soop_live_sync_runs")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data && data.id ? data.id : null;
}

async function finishSyncRun(supabase, id, patch) {
  if (!id) return;
  const { error } = await supabase
    .from("soop_live_sync_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function cleanupOldSyncRuns(supabase) {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("soop_live_sync_runs").delete().lt("started_at", cutoff);
}

async function fetchServingPlayers(supabase) {
  const { data, error } = await supabase
    .from("players")
    .select(LIVE_FIELDS)
    .not("soop_id", "is", null);
  if (error) throw error;
  return Array.isArray(data) ? data.filter((row) => trim(row && row.soop_id)) : [];
}

async function applyPlayerPatches(supabase, patches) {
  for (const patch of patches) {
    const { id, ...values } = patch;
    const { error } = await supabase.from("players").update(values).eq("id", id);
    if (error) throw error;
  }
}

function resolveRevalidateBaseUrl() {
  const raw = envFirst([
    "SERVING_REVALIDATE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
  ]);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/\/+$/, "")}`;
}

async function revalidatePublicPlayersCache() {
  const baseUrl = resolveRevalidateBaseUrl();
  const secret = env("SERVING_REVALIDATE_SECRET");
  if (!baseUrl || !secret) {
    if (env("SOOP_SYNC_ALLOW_REVALIDATION_SKIP").toLowerCase() === "true") {
      return { status: "skipped", reason: !baseUrl ? "missing_base_url" : "missing_secret" };
    }
    throw new Error(
      `missing_serving_revalidate_env: ${!baseUrl ? "SERVING_REVALIDATE_URL" : "SERVING_REVALIDATE_SECRET"}`
    );
  }

  const response = await fetch(`${baseUrl}/api/admin/revalidate-serving`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      tags: ["public-players-list"],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`revalidate_public_cache failed (${response.status}): ${text}`);
  }
  return { status: "completed", response: text };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const anonKey = envFirst(["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  const syncSecret = env("SOOP_SYNC_SECRET");
  const auth = validateRequest(request, anonKey, syncSecret);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, 401);

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const body = await readJsonBody(request);
  const source = trim(body && body.source) || "unknown";
  const pageLimit = toPositiveInteger(env("SOOP_BROAD_LIST_PAGE_LIMIT"), DEFAULT_BROAD_LIST_PAGE_LIMIT);
  const heartbeatMinutes = toPositiveInteger(env("SOOP_SYNC_HEARTBEAT_MINUTES"), DEFAULT_SYNC_HEARTBEAT_MINUTES);
  const clientId = env("SOOP_CLIENT_ID");
  if (!clientId) return jsonResponse({ ok: false, error: "missing_soop_client_id" }, 503);

  const supabase = createSupabaseAdminClient();
  let runId = null;

  try {
    runId = await insertSyncRun(supabase, {
      started_at: startedAt,
      status: "running",
      source,
      page_limit: pageLimit,
      details: { heartbeat_minutes: heartbeatMinutes },
    });

    const players = await fetchServingPlayers(supabase);
    const targetIds = players.map((player) => trim(player.soop_id));
    const { liveById, pagesScanned, scanCompleted, unresolvedTargetIds } = await fetchLiveRowsByIds({
      clientId,
      targetIds,
      pageLimit,
      startedAtMs,
    });
    const checkedAt = new Date().toISOString();
    const unresolvedSoopIds = new Set(unresolvedTargetIds);
    const { patches, liveCount, offlineCount } = buildChangedPlayerPatches(
      players,
      liveById,
      checkedAt,
      heartbeatMinutes,
      unresolvedSoopIds
    );

    await applyPlayerPatches(supabase, patches);
    const revalidation = await revalidatePublicPlayersCache();
    await cleanupOldSyncRuns(supabase);

    const summary = {
      ok: true,
      status: "success",
      source,
      checked_at: checkedAt,
      players_total: players.length,
      live_count: liveCount,
      offline_count: offlineCount,
      changed_count: patches.length,
      unresolved_count: unresolvedTargetIds.length,
      page_limit: pageLimit,
      pages_scanned: pagesScanned,
      scan_completed: scanCompleted,
      revalidation,
    };

    await finishSyncRun(supabase, runId, {
      status: "success",
      players_total: players.length,
      live_count: liveCount,
      offline_count: offlineCount,
      changed_count: patches.length,
      unresolved_count: unresolvedTargetIds.length,
      pages_scanned: pagesScanned,
      details: { revalidation, scan_completed: scanCompleted },
    });

    return jsonResponse(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await finishSyncRun(supabase, runId, {
        status: "error",
        error_message: message,
      });
    } catch (logError) {
      console.error("failed to log SOOP sync error", logError);
    }
    return jsonResponse({ ok: false, status: "error", error: message }, 500);
  }
});
