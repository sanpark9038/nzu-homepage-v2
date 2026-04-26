const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({ path: ".env.local", quiet: true });

const { createClient } = require("@supabase/supabase-js");

const REPORTS_DIR = path.join(process.cwd(), "tmp", "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "serving_identity_readiness_latest.json");

function computeServingIdentityKey(row) {
  const eloboardId = String(row && row.eloboard_id ? row.eloboard_id : "").trim();
  const gender = String(row && row.gender ? row.gender : "").trim().toLowerCase();
  const match = eloboardId.match(/^eloboard:(male|female)(:mix)?:(\d+)$/i);

  if (match) {
    return `${gender || match[1].toLowerCase()}:${match[3]}`;
  }

  if (eloboardId) {
    return `entity:${eloboardId.toLowerCase()}`;
  }

  return null;
}

function summarizeServingIdentityRows(rows) {
  const buckets = new Map();
  let missingEloboardIdRows = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.eloboard_id) {
      missingEloboardIdRows += 1;
    }

    const key = computeServingIdentityKey(row);
    if (!key) continue;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({
      name: row.name || null,
      eloboard_id: row.eloboard_id || null,
      gender: row.gender || null,
    });
  }

  const duplicates = Array.from(buckets.entries())
    .filter(([, bucketRows]) => bucketRows.length > 1)
    .map(([servingIdentityKey, bucketRows]) => ({
      serving_identity_key: servingIdentityKey,
      row_count: bucketRows.length,
      rows: bucketRows,
    }));

  return {
    rows: Array.isArray(rows) ? rows.length : 0,
    missing_eloboard_id_rows: missingEloboardIdRows,
    duplicate_serving_identity_buckets: duplicates.length,
    duplicate_samples: duplicates.slice(0, 20),
  };
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY");
  }
  return createClient(url, serviceKey);
}

async function checkServingIdentityColumn(supabase, table) {
  const { error } = await supabase.from(table).select("serving_identity_key").limit(1);
  return error
    ? {
        exists: false,
        code: error.code || null,
        error: error.message,
      }
    : { exists: true };
}

async function fetchServingRows(supabase, table) {
  const { data, error } = await supabase
    .from(table)
    .select("id,name,eloboard_id,gender")
    .limit(1000);

  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function buildReadinessReport() {
  const supabase = createSupabaseClient();
  const report = {
    generated_at: new Date().toISOString(),
    schema_channel: "supabase_rest",
    limitations: [
      "This check cannot verify pg_indexes or table constraints without a Postgres SQL connection.",
      "Run scripts/sql/check-serving-identity-schema.sql before flipping onConflict or stale delete logic.",
    ],
    columns: {},
    tables: {},
  };

  for (const table of ["players", "players_staging"]) {
    report.columns[table] = await checkServingIdentityColumn(supabase, table);
    report.tables[table] = summarizeServingIdentityRows(await fetchServingRows(supabase, table));
  }

  const allColumnsExist = Object.values(report.columns).every((item) => item.exists);
  const noDuplicateBuckets = Object.values(report.tables).every(
    (item) => item.duplicate_serving_identity_buckets === 0
  );
  const noMissingIdentities = Object.values(report.tables).every(
    (item) => item.missing_eloboard_id_rows === 0
  );

  report.summary = {
    all_serving_identity_columns_exist: allColumnsExist,
    no_duplicate_candidate_buckets: noDuplicateBuckets,
    no_missing_eloboard_id_rows: noMissingIdentities,
    ready_for_on_conflict_flip: false,
    blocking_reasons: [
      allColumnsExist ? null : "serving_identity_key column missing on one or more serving tables",
      "unique/index contract not verified by this REST-based check",
    ].filter(Boolean),
  };

  return report;
}

async function main() {
  const report = await buildReadinessReport();
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`[DONE] ${path.relative(process.cwd(), REPORT_PATH)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildReadinessReport,
  computeServingIdentityKey,
  summarizeServingIdentityRows,
};
