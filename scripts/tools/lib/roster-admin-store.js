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

function isIdentityMappingOverride(row) {
  return Array.isArray(row && row.legacy_entity_ids) && row.legacy_entity_ids.length > 0;
}

function isReleasableTemporaryOverride(row) {
  return Boolean(
    row &&
      row.manual_mode === "temporary" &&
      row.retired !== true &&
      !isIdentityMappingOverride(row)
  );
}

function normalizeCompareValue(value) {
  return String(value || "").trim().toLowerCase();
}

// 임시(temporary) 교정을 엘로보드 관측값과 비교한다.
// 반환: null(검사 대상 아님) | {action:"release"} | {action:"mismatch", reason, fields}
function evaluateTemporaryOverrideAgainstObserved(overrideRow, observed) {
  if (!isReleasableTemporaryOverride(overrideRow)) return null;
  const checks = [];
  if (shouldApplyManualAffiliationOverride(overrideRow)) {
    checks.push(["team_code", overrideRow.team_code, observed && observed.team_code]);
  }
  if (shouldApplyManualTierOverride(overrideRow)) {
    checks.push(["tier", overrideRow.tier, observed && observed.tier]);
  }
  if (shouldApplyManualRaceOverride(overrideRow)) {
    checks.push(["race", overrideRow.race, observed && observed.race]);
  }
  if (!checks.length) return null;
  if (!observed) {
    return {
      action: "mismatch",
      reason: "not_on_eloboard",
      fields: checks.map(([field, manual]) => ({ field, manual: String(manual), observed: null })),
    };
  }
  const diffs = checks
    .filter(([, manual, observedValue]) => normalizeCompareValue(manual) !== normalizeCompareValue(observedValue))
    .map(([field, manual, observedValue]) => ({
      field,
      manual: String(manual),
      observed: String(observedValue || ""),
    }));
  if (!diffs.length) return { action: "release", reason: "eloboard_match", fields: [] };
  return { action: "mismatch", reason: "eloboard_differs", fields: diffs };
}

// 해제 = Supabase에 교정 필드가 비워진 행을 upsert. 병합 시 remote가 local 파일 위에
// 덮이므로, 파일을 커밋 없이도 (CI에서도) 못이 영구히 빠진다. soop_id 등 교정 외
// 필드는 remote 행에 키가 없어 local 값이 그대로 보존된다.
async function markOverrideReleasedRemote(overrideRow) {
  const entityId = String(overrideRow && overrideRow.entity_id ? overrideRow.entity_id : "").trim();
  if (!entityId) return { ok: false, reason: "missing_entity_id" };
  if (!hasSupabaseAdminEnv()) return { ok: false, reason: "missing_supabase_admin_env" };

  const released = {
    team_code: String(overrideRow.team_code || "").trim(),
    tier: String(overrideRow.tier || "").trim(),
    race: String(overrideRow.race || "").trim(),
  };
  const note =
    `[auto-released ${new Date().toISOString().slice(0, 10)}] ` +
    `eloboard matched manual correction (team=${released.team_code || "-"}, tier=${released.tier || "-"}, race=${released.race || "-"}); ` +
    `correction cleared automatically.`;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("roster_admin_corrections").upsert(
    {
      entity_id: entityId,
      name: String(overrideRow.name || "").trim() || null,
      team_code: null,
      team_name: null,
      tier: null,
      race: null,
      manual_lock: false,
      manual_mode: null,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity_id" }
  );
  if (error) return { ok: false, reason: String(error.message || error) };
  return { ok: true };
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
  isReleasableTemporaryOverride,
  evaluateTemporaryOverrideAgainstObserved,
  markOverrideReleasedRemote,
  shouldApplyManualAffiliationOverride,
  shouldApplyManualTierOverride,
  shouldApplyManualRaceOverride,
};
