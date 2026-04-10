const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "soop_fallback_audit_report.json");

function trim(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function extractWrId(eloboardId) {
  const raw = trim(eloboardId);
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : null;
}

function isMixIdentity(eloboardId) {
  return /^eloboard:(male|female):mix:\d+$/i.test(trim(eloboardId));
}

function loadMetadataLookup() {
  if (!fs.existsSync(PLAYER_METADATA_PATH)) {
    throw new Error(`Missing file: ${PLAYER_METADATA_PATH}`);
  }
  const rows = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const byWrId = new Map();
  for (const row of rows) {
    const wrId = trim(row && row.wr_id);
    const soopId = trim(row && row.soop_user_id);
    if (!wrId || !soopId) continue;
    byWrId.set(wrId, {
      wr_id: wrId,
      name: trim(row && row.name),
      gender: trim(row && row.gender).toLowerCase(),
      soop_id: soopId,
    });
  }
  return byWrId;
}

async function main() {
  const supabaseUrl = trim(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials in environment.");
  }

  const metadataByWrId = loadMetadataLookup();
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("players")
    .select("id,name,nickname,eloboard_id,gender,soop_id,is_live,university")
    .is("soop_id", null)
    .order("name");

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const candidates = rows
    .map((row) => {
      const wrId = extractWrId(row.eloboard_id);
      const metadata = wrId ? metadataByWrId.get(wrId) || null : null;
      return {
        id: trim(row.id),
        name: trim(row.name),
        nickname: trim(row.nickname) || null,
        eloboard_id: trim(row.eloboard_id),
        wr_id: wrId ? Number(wrId) : null,
        gender: trim(row.gender).toLowerCase() || null,
        university: trim(row.university) || null,
        is_live: row.is_live === true,
        mix_identity: isMixIdentity(row.eloboard_id),
        metadata_name: metadata ? metadata.name || null : null,
        metadata_gender: metadata ? metadata.gender || null : null,
        inferred_soop_id: metadata ? metadata.soop_id || null : null,
      };
    })
    .filter((row) => row.inferred_soop_id);

  const mixCandidates = candidates.filter((row) => row.mix_identity);
  const nonMixCandidates = candidates.filter((row) => !row.mix_identity);

  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      db_rows_missing_soop_id: rows.length,
      inferred_candidates: candidates.length,
      mix_candidates: mixCandidates.length,
      non_mix_candidates: nonMixCandidates.length,
    },
    mix_candidates: mixCandidates,
    non_mix_candidates: nonMixCandidates,
  };

  writeJson(REPORT_PATH, report);

  console.log("Generated SOOP fallback audit report.");
  console.log(`- db_rows_missing_soop_id: ${rows.length}`);
  console.log(`- inferred_candidates: ${candidates.length}`);
  console.log(`- mix_candidates: ${mixCandidates.length}`);
  console.log(`- non_mix_candidates: ${nonMixCandidates.length}`);
  console.log(`- report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
