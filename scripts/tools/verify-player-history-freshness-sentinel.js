const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-records.js");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "player_history_freshness_sentinel_latest.json");

function buildDefaultSentinels() {
  return [
    {
      name: "FM-009 sentinel",
      team_name: "c9",
      player_name: "Kim Taek Yong",
      profile_url: "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=37",
      wr_id: 37,
      gender: "male",
      tier: "god",
      serving_identity_key: "male:37",
      eloboard_id: "eloboard:male:37",
    },
  ];
}

function buildSourceReportArgs(sentinel) {
  return [
    "--json-only",
    "--include-matches",
    "--no-cache",
    "--univ",
    String(sentinel.team_name || "sentinel"),
    "--player",
    String(sentinel.player_name || sentinel.name || "sentinel"),
    "--profile-url",
    String(sentinel.profile_url || ""),
    "--wr-id",
    String(sentinel.wr_id || ""),
    "--gender",
    String(sentinel.gender || ""),
    "--tier",
    String(sentinel.tier || ""),
  ];
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function parseSourceLatestDate(doc) {
  const players = Array.isArray(doc && doc.players) ? doc.players : [];
  const first = players[0] || null;
  return normalizeDate(first && first.period_max_date);
}

function latestServingHistoryDate(row) {
  let latest = normalizeDate(row && row.last_match_at);
  const history = Array.isArray(row && row.match_history) ? row.match_history : [];
  for (const item of history) {
    const date = normalizeDate(item && item.match_date);
    if (date && date > latest) latest = date;
  }
  return latest;
}

function compareFreshness({ sourceLatestDate, servingLatestDate }) {
  const source = normalizeDate(sourceLatestDate);
  const serving = normalizeDate(servingLatestDate);
  if (!source) {
    return { ok: false, reason: "missing_source_latest_date" };
  }
  if (!serving) {
    return { ok: false, reason: "missing_serving_latest_date" };
  }
  if (serving < source) {
    return {
      ok: false,
      reason: `serving_older_than_source:${serving}<${source}`,
    };
  }
  return { ok: true, reason: null };
}

function resolveSupabaseEnv(env = process.env) {
  return {
    supabaseUrl: String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "").trim(),
  };
}

function readSourceReport(sentinel) {
  const result = spawnSync(process.execPath, [REPORT_SCRIPT, ...buildSourceReportArgs(sentinel)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(
      `source sentinel read failed for ${sentinel.serving_identity_key || sentinel.eloboard_id}: ${String(
        result.stderr || result.stdout || ""
      )
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-5)
        .join(" ")}`
    );
  }
  return JSON.parse(String(result.stdout || "").replace(/^\uFEFF/, ""));
}

async function readServingRow(client, sentinel) {
  let query = client
    .from("players")
    .select("id,name,eloboard_id,serving_identity_key,last_match_at,match_history,last_synced_at")
    .limit(1);

  if (sentinel.serving_identity_key) {
    query = query.eq("serving_identity_key", sentinel.serving_identity_key);
  } else {
    query = query.eq("eloboard_id", sentinel.eloboard_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function runSentinels({ sentinels = buildDefaultSentinels(), client = null, env = process.env } = {}) {
  const { supabaseUrl, serviceKey } = resolveSupabaseEnv(env);
  if (!client && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing Supabase env for player-history freshness sentinel.");
  }
  const supabase =
    client ||
    createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

  const rows = [];
  for (const sentinel of sentinels) {
    const sourceDoc = readSourceReport(sentinel);
    const sourceLatestDate = parseSourceLatestDate(sourceDoc);
    const servingRow = await readServingRow(supabase, sentinel);
    const servingLatestDate = latestServingHistoryDate(servingRow);
    const comparison = compareFreshness({ sourceLatestDate, servingLatestDate });
    rows.push({
      name: sentinel.name,
      serving_identity_key: sentinel.serving_identity_key || null,
      eloboard_id: sentinel.eloboard_id || null,
      source_latest_date: sourceLatestDate || null,
      serving_latest_date: servingLatestDate || null,
      serving_last_synced_at: servingRow && servingRow.last_synced_at ? servingRow.last_synced_at : null,
      ok: comparison.ok,
      reason: comparison.reason,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: rows.every((row) => row.ok),
    sentinels: rows,
  };
  writeReport(report);
  return report;
}

async function main() {
  const report = await runSentinels();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildDefaultSentinels,
  buildSourceReportArgs,
  compareFreshness,
  latestServingHistoryDate,
  parseSourceLatestDate,
  runSentinels,
};
