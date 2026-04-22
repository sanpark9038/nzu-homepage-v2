import fs from "fs";
import path from "path";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/lib/database.types";

export type ManualMode = "temporary" | "fixed";

export type ManualOverrideRow = {
  entity_id: string;
  team_code?: string;
  team_name?: string;
  tier?: string;
  race?: string;
  name?: string;
  manual_lock?: boolean;
  manual_mode?: ManualMode;
  note?: string;
  updated_at?: string;
};

export type ExclusionRow = {
  name?: string;
  wr_id?: number;
  entity_id?: string;
  reason?: string;
  updated_at?: string;
};

export type ResumeRow = {
  name?: string;
  wr_id?: number;
  entity_id?: string;
  requested_at?: string;
};

type ManualOverrideSemantics = Pick<ManualOverrideRow, "manual_lock" | "manual_mode" | "tier" | "race" | "team_code">;

type RosterAdminCorrectionRow = Tables<"roster_admin_corrections">;
type RosterAdminCorrectionInsert = TablesInsert<"roster_admin_corrections">;

const ROOT = process.cwd();
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const RESUMES_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_resumes.v1.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
}

function dedupeKey(entityId?: string | null, wrId?: number | null, name?: string | null) {
  const safeEntityId = String(entityId || "").trim();
  if (safeEntityId) return `entity:${safeEntityId}`;
  const safeWrId = Number(wrId);
  if (Number.isFinite(safeWrId) && safeWrId > 0) return `wr:${safeWrId}`;
  const safeName = String(name || "").trim().toLowerCase();
  if (safeName) return `name:${safeName}`;
  return "";
}

function hasSupabaseAdminEnv() {
  return Boolean(
    String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim()
  );
}

function readLocalOverrides(): ManualOverrideRow[] {
  if (!fs.existsSync(OVERRIDES_PATH)) return [];
  try {
    const doc = readJson<{ overrides?: ManualOverrideRow[] }>(OVERRIDES_PATH);
    return Array.isArray(doc.overrides) ? doc.overrides : [];
  } catch {
    return [];
  }
}

function readLocalExclusions(): ExclusionRow[] {
  if (!fs.existsSync(EXCLUSIONS_PATH)) return [];
  try {
    const doc = readJson<{ players?: ExclusionRow[] }>(EXCLUSIONS_PATH);
    return Array.isArray(doc.players) ? doc.players : [];
  } catch {
    return [];
  }
}

function readLocalResumes(): ResumeRow[] {
  if (!fs.existsSync(RESUMES_PATH)) return [];
  try {
    const doc = readJson<{ players?: ResumeRow[] }>(RESUMES_PATH);
    return Array.isArray(doc.players) ? doc.players : [];
  } catch {
    return [];
  }
}

function remoteRowToOverride(row: RosterAdminCorrectionRow): ManualOverrideRow | null {
  if (
    !String(row.team_code || "").trim() &&
    !String(row.team_name || "").trim() &&
    !String(row.tier || "").trim() &&
    !String(row.race || "").trim() &&
    !String(row.manual_mode || "").trim() &&
    !String(row.note || "").trim() &&
    row.manual_lock !== true
  ) {
    return null;
  }
  return {
    entity_id: String(row.entity_id || "").trim(),
    team_code: String(row.team_code || "").trim() || undefined,
    team_name: String(row.team_name || "").trim() || undefined,
    tier: String(row.tier || "").trim() || undefined,
    race: String(row.race || "").trim() || undefined,
    name: String(row.name || "").trim() || undefined,
    manual_lock: row.manual_lock === true,
    manual_mode:
      row.manual_mode === "fixed" || row.manual_mode === "temporary" ? row.manual_mode : undefined,
    note: String(row.note || "").trim() || undefined,
    updated_at: row.updated_at || undefined,
  };
}

function remoteRowToExclusion(row: RosterAdminCorrectionRow): ExclusionRow | null {
  if (row.excluded !== true) return null;
  return {
    entity_id: String(row.entity_id || "").trim() || undefined,
    wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : undefined,
    name: String(row.name || "").trim() || undefined,
    reason: String(row.exclusion_reason || "").trim() || "user_excluded",
    updated_at: row.updated_at || undefined,
  };
}

function remoteRowToResume(row: RosterAdminCorrectionRow): ResumeRow | null {
  if (!String(row.resume_requested_at || "").trim()) return null;
  return {
    entity_id: String(row.entity_id || "").trim() || undefined,
    wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : undefined,
    name: String(row.name || "").trim() || undefined,
    requested_at: row.resume_requested_at || undefined,
  };
}

async function readRemoteCorrections(): Promise<RosterAdminCorrectionRow[]> {
  if (!hasSupabaseAdminEnv()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("roster_admin_corrections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function mergeOverrides(localRows: ManualOverrideRow[], remoteRows: ManualOverrideRow[]) {
  const merged = new Map<string, ManualOverrideRow>();
  for (const row of localRows) {
    const entityId = String(row.entity_id || "").trim();
    if (!entityId) continue;
    merged.set(entityId, row);
  }
  for (const row of remoteRows) {
    const entityId = String(row.entity_id || "").trim();
    if (!entityId) continue;
    merged.set(entityId, {
      ...(merged.get(entityId) || {}),
      ...row,
    });
  }
  return [...merged.values()];
}

function mergeMatchRows<T extends { entity_id?: string; wr_id?: number; name?: string }>(
  localRows: T[],
  remoteRows: T[]
) {
  const merged = new Map<string, T>();
  for (const row of localRows) {
    const key = dedupeKey(row.entity_id, row.wr_id, row.name);
    if (!key) continue;
    merged.set(key, row);
  }
  for (const row of remoteRows) {
    const key = dedupeKey(row.entity_id, row.wr_id, row.name);
    if (!key) continue;
    merged.set(key, row);
  }
  return [...merged.values()];
}

export async function loadMergedRosterAdminState() {
  const localOverrides = readLocalOverrides();
  const localExclusions = readLocalExclusions();
  const localResumes = readLocalResumes();

  let remoteRows: RosterAdminCorrectionRow[] = [];
  try {
    remoteRows = await readRemoteCorrections();
  } catch {
    remoteRows = [];
  }

  const remoteOverrides = remoteRows.map(remoteRowToOverride).filter((row): row is ManualOverrideRow => Boolean(row));
  const remoteExclusions = remoteRows
    .map(remoteRowToExclusion)
    .filter((row): row is ExclusionRow => Boolean(row));
  const remoteResumes = remoteRows.map(remoteRowToResume).filter((row): row is ResumeRow => Boolean(row));

  return {
    overrides: mergeOverrides(localOverrides, remoteOverrides),
    exclusions: mergeMatchRows(localExclusions, remoteExclusions),
    resumes: mergeMatchRows(localResumes, remoteResumes),
    remote_enabled: hasSupabaseAdminEnv(),
  };
}

export function isFixedAffiliationOverride(row?: ManualOverrideSemantics | null) {
  return Boolean(row?.manual_lock === true && row?.manual_mode === "fixed");
}

export function shouldApplyManualAffiliationOverride(row?: ManualOverrideSemantics | null) {
  return Boolean(String(row?.team_code || "").trim());
}

export function shouldApplyManualTierOverride(row?: ManualOverrideSemantics | null) {
  return Boolean(String(row?.tier || "").trim()) && !isFixedAffiliationOverride(row);
}

export function shouldApplyManualRaceOverride(row?: ManualOverrideSemantics | null) {
  return Boolean(String(row?.race || "").trim()) && !isFixedAffiliationOverride(row);
}

function normalizeNullableString(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function normalizeNullableNumber(value?: number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mergeNullableStringField(value: string | null | undefined, currentValue?: string | null) {
  if (value === null) return null;
  return normalizeNullableString(value) ?? normalizeNullableString(currentValue);
}

function hasMeaningfulCorrection(row: Partial<RosterAdminCorrectionInsert>) {
  return Boolean(
    normalizeNullableString(row.team_code) ||
      normalizeNullableString(row.team_name) ||
      normalizeNullableString(row.tier) ||
      normalizeNullableString(row.race) ||
      normalizeNullableString(row.manual_mode) ||
      normalizeNullableString(row.note) ||
      row.manual_lock === true ||
      row.excluded === true ||
      normalizeNullableString(row.resume_requested_at)
  );
}

export async function loadRemoteRosterAdminCorrection(entityId: string) {
  if (!hasSupabaseAdminEnv()) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("roster_admin_corrections")
    .select("*")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveRemoteRosterAdminCorrection(
  entityId: string,
  payload: Partial<RosterAdminCorrectionInsert>
) {
  if (!hasSupabaseAdminEnv()) return false;

  const safeEntityId = String(entityId || "").trim();
  if (!safeEntityId) throw new Error("entity_id_required");

  const current = await loadRemoteRosterAdminCorrection(safeEntityId);
  const nextRow: RosterAdminCorrectionInsert = {
    entity_id: safeEntityId,
    name: mergeNullableStringField(payload.name, current?.name),
    wr_id:
      normalizeNullableNumber(payload.wr_id) ??
      normalizeNullableNumber(current?.wr_id) ??
      null,
    team_code: mergeNullableStringField(payload.team_code, current?.team_code),
    team_name: mergeNullableStringField(payload.team_name, current?.team_name),
    tier: mergeNullableStringField(payload.tier, current?.tier),
    race: mergeNullableStringField(payload.race, current?.race),
    manual_lock:
      typeof payload.manual_lock === "boolean"
        ? payload.manual_lock
        : current?.manual_lock === true,
    manual_mode: mergeNullableStringField(payload.manual_mode, current?.manual_mode),
    note: mergeNullableStringField(payload.note, current?.note),
    excluded:
      typeof payload.excluded === "boolean"
        ? payload.excluded
        : current?.excluded === true,
    exclusion_reason: mergeNullableStringField(payload.exclusion_reason, current?.exclusion_reason),
    resume_requested_at:
      payload.resume_requested_at === null
        ? null
        : normalizeNullableString(payload.resume_requested_at) ??
          normalizeNullableString(current?.resume_requested_at),
    updated_at: new Date().toISOString(),
  };

  if (!hasMeaningfulCorrection(nextRow)) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("roster_admin_corrections").delete().eq("entity_id", safeEntityId);
    if (error) throw error;
    return true;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("roster_admin_corrections").upsert(nextRow, {
    onConflict: "entity_id",
  });
  if (error) throw error;
  return true;
}
