const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const RESUMES_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_resumes.v1.json");

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function hasSupabaseAdminEnv() {
  return Boolean(
    String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim()
  );
}

function createSupabaseAdminClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseServiceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
  ).trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("missing_supabase_admin_env");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function dedupeKey(entityId, wrId, name) {
  const safeEntityId = String(entityId || "").trim();
  if (safeEntityId) return `entity:${safeEntityId}`;
  const safeWrId = Number(wrId);
  if (Number.isFinite(safeWrId) && safeWrId > 0) return `wr:${safeWrId}`;
  const safeName = String(name || "").trim().toLowerCase();
  if (safeName) return `name:${safeName}`;
  return "";
}

function mergeOverrides(localRows, remoteRows) {
  const merged = new Map();
  for (const row of Array.isArray(localRows) ? localRows : []) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    if (!entityId) continue;
    merged.set(entityId, row);
  }
  for (const row of Array.isArray(remoteRows) ? remoteRows : []) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    if (!entityId) continue;
    merged.set(entityId, {
      ...(merged.get(entityId) || {}),
      ...row,
    });
  }
  return [...merged.values()];
}

function mergeMatchRows(localRows, remoteRows) {
  const merged = new Map();
  for (const row of Array.isArray(localRows) ? localRows : []) {
    const key = dedupeKey(row && row.entity_id, row && row.wr_id, row && row.name);
    if (!key) continue;
    merged.set(key, row);
  }
  for (const row of Array.isArray(remoteRows) ? remoteRows : []) {
    const key = dedupeKey(row && row.entity_id, row && row.wr_id, row && row.name);
    if (!key) continue;
    merged.set(key, row);
  }
  return [...merged.values()];
}

function isFixedAffiliationOverride(row) {
  return Boolean(row && row.manual_lock === true && row.manual_mode === "fixed");
}

function shouldApplyManualAffiliationOverride(row) {
  return Boolean(String(row && row.team_code ? row.team_code : "").trim());
}

function shouldApplyManualTierOverride(row) {
  return Boolean(String(row && row.tier ? row.tier : "").trim()) && !isFixedAffiliationOverride(row);
}

function shouldApplyManualRaceOverride(row) {
  return Boolean(String(row && row.race ? row.race : "").trim()) && !isFixedAffiliationOverride(row);
}

function remoteRowToOverride(row) {
  if (
    !String(row && row.team_code ? row.team_code : "").trim() &&
    !String(row && row.team_name ? row.team_name : "").trim() &&
    !String(row && row.tier ? row.tier : "").trim() &&
    !String(row && row.race ? row.race : "").trim() &&
    !String(row && row.manual_mode ? row.manual_mode : "").trim() &&
    !String(row && row.note ? row.note : "").trim() &&
    row?.manual_lock !== true
  ) {
    return null;
  }
  return {
    entity_id: String(row && row.entity_id ? row.entity_id : "").trim(),
    team_code: String(row && row.team_code ? row.team_code : "").trim() || undefined,
    team_name: String(row && row.team_name ? row.team_name : "").trim() || undefined,
    tier: String(row && row.tier ? row.tier : "").trim() || undefined,
    race: String(row && row.race ? row.race : "").trim() || undefined,
    name: String(row && row.name ? row.name : "").trim() || undefined,
    manual_lock: row && row.manual_lock === true,
    manual_mode:
      row && (row.manual_mode === "temporary" || row.manual_mode === "fixed")
        ? row.manual_mode
        : undefined,
    note: String(row && row.note ? row.note : "").trim() || undefined,
    updated_at: row && row.updated_at ? row.updated_at : undefined,
  };
}

function remoteRowToExclusion(row) {
  if (!row || row.excluded !== true) return null;
  return {
    entity_id: String(row.entity_id || "").trim() || undefined,
    wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : undefined,
    name: String(row.name || "").trim() || undefined,
    reason: String(row.exclusion_reason || "").trim() || "user_excluded",
    updated_at: row.updated_at || undefined,
  };
}

function remoteRowToResume(row) {
  if (!row || !String(row.resume_requested_at || "").trim()) return null;
  return {
    entity_id: String(row.entity_id || "").trim() || undefined,
    wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : undefined,
    name: String(row.name || "").trim() || undefined,
    requested_at: row.resume_requested_at || undefined,
  };
}

async function readRemoteCorrections() {
  if (!hasSupabaseAdminEnv()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("roster_admin_corrections")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadMergedRosterAdminState() {
  const localOverridesDoc = readJsonIfExists(OVERRIDES_PATH, { overrides: [] });
  const localExclusionsDoc = readJsonIfExists(EXCLUSIONS_PATH, { players: [] });
  const localResumesDoc = readJsonIfExists(RESUMES_PATH, { players: [] });

  let remoteRows = [];
  try {
    remoteRows = await readRemoteCorrections();
  } catch {
    remoteRows = [];
  }

  const remoteOverrides = remoteRows.map(remoteRowToOverride).filter(Boolean);
  const remoteExclusions = remoteRows.map(remoteRowToExclusion).filter(Boolean);
  const remoteResumes = remoteRows.map(remoteRowToResume).filter(Boolean);

  return {
    overrides: mergeOverrides(
      Array.isArray(localOverridesDoc && localOverridesDoc.overrides) ? localOverridesDoc.overrides : [],
      remoteOverrides
    ),
    exclusions: mergeMatchRows(
      Array.isArray(localExclusionsDoc && localExclusionsDoc.players) ? localExclusionsDoc.players : [],
      remoteExclusions
    ),
    resumes: mergeMatchRows(
      Array.isArray(localResumesDoc && localResumesDoc.players) ? localResumesDoc.players : [],
      remoteResumes
    ),
  };
}

function normalizeNullableString(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function hasMeaningfulCorrection(row) {
  return Boolean(
    normalizeNullableString(row && row.team_code) ||
      normalizeNullableString(row && row.team_name) ||
      normalizeNullableString(row && row.tier) ||
      normalizeNullableString(row && row.race) ||
      normalizeNullableString(row && row.manual_mode) ||
      normalizeNullableString(row && row.note) ||
      (row && row.manual_lock === true) ||
      (row && row.excluded === true) ||
      normalizeNullableString(row && row.resume_requested_at)
  );
}

async function clearRemoteResumeMarker(entityId) {
  if (!hasSupabaseAdminEnv()) return false;
  const safeEntityId = String(entityId || "").trim();
  if (!safeEntityId) return false;

  const supabase = createSupabaseAdminClient();
  const { data: current, error: currentError } = await supabase
    .from("roster_admin_corrections")
    .select("*")
    .eq("entity_id", safeEntityId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) return false;

  const nextRow = {
    ...current,
    resume_requested_at: null,
    updated_at: new Date().toISOString(),
  };

  if (!hasMeaningfulCorrection(nextRow)) {
    const { error } = await supabase.from("roster_admin_corrections").delete().eq("entity_id", safeEntityId);
    if (error) throw error;
    return true;
  }

  const { error } = await supabase.from("roster_admin_corrections").upsert(nextRow, {
    onConflict: "entity_id",
  });
  if (error) throw error;
  return true;
}

module.exports = {
  loadMergedRosterAdminState,
  clearRemoteResumeMarker,
  isFixedAffiliationOverride,
  shouldApplyManualAffiliationOverride,
  shouldApplyManualTierOverride,
  shouldApplyManualRaceOverride,
};
