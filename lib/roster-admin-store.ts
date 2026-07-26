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
  soop_user_id?: string;
  updated_at?: string;
  legacy_entity_ids?: string[];
};

export type ExclusionRow = {
  name?: string;
  wr_id?: number;
  entity_id?: string;
  reason?: string;
  note?: string;
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

const ROSTER_ADMIN_CORRECTION_COLUMNS =
  "entity_id,excluded,exclusion_reason,manual_lock,manual_mode,name,note,race,resume_requested_at,soop_user_id,team_code,team_name,tier,updated_at,wr_id" as const;

const ROOT = process.cwd();
const LEDGER_PATH = path.join(ROOT, "data", "metadata", "player_ledger.v1.json");
const RESUMES_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_resumes.v1.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
}

type LedgerExcluded = { name?: string; wr_id?: number; reason?: string; note?: string; updated_at?: string };
type LedgerPlayerRow = {
  excluded?: LedgerExcluded;
  correction?: Record<string, unknown>;
  legacy_entity_ids?: string[];
} & Record<string, unknown>;
type LedgerDoc = {
  players?: Record<string, LedgerPlayerRow> | ExclusionRow[];
  collection_exclusions_without_entity?: Array<{ name?: string; wr_id?: number; reason?: string; updated_at?: string }>;
} & Record<string, unknown>;

function readLedgerPlayers(): Record<string, LedgerPlayerRow> {
  if (!fs.existsSync(LEDGER_PATH)) return {};
  try {
    const doc = readJson<LedgerDoc>(LEDGER_PATH);
    const players = doc?.players;
    return players && typeof players === "object" && !Array.isArray(players) ? players : {};
  } catch {
    return {};
  }
}

// 로컬 수동 교정을 대장(players[].correction + 행 레벨 legacy_entity_ids)에서
// 옛 수동 교정 파일의 overrides[] 행 형태로 복원한다.
// 승계(legacy_entity_ids)는 교정이 아니라 신원 속성이라 correction 밖에 산다.
export function loadRosterManualOverridesFromLedger(): ManualOverrideRow[] {
  const rows: ManualOverrideRow[] = [];
  for (const [entityId, row] of Object.entries(readLedgerPlayers())) {
    const correction = row?.correction;
    const legacyEntityIds = Array.isArray(row?.legacy_entity_ids) ? row.legacy_entity_ids : null;
    if ((!correction || typeof correction !== "object") && !legacyEntityIds?.length) continue;
    const out: ManualOverrideRow = { entity_id: entityId };
    if (legacyEntityIds?.length) out.legacy_entity_ids = legacyEntityIds;
    rows.push(Object.assign(out, correction || {}));
  }
  return rows;
}

// 관리자 API의 로컬 폴백(원격 Supabase 저장 실패 시)만 이 경로로 대장에 되쓴다.
// 교정 필드만 갈아끼우고 표시명·숲ID·수집 제외 등 다른 행 필드는 건드리지 않는다.
export function writeManualOverridesToLedger(rows: ManualOverrideRow[]): void {
  const doc = readJson<Record<string, unknown>>(LEDGER_PATH);
  const rawPlayers = doc.players;
  const players =
    rawPlayers && typeof rawPlayers === "object" && !Array.isArray(rawPlayers)
      ? (rawPlayers as Record<string, Record<string, unknown>>)
      : {};
  for (const key of Object.keys(players)) {
    if (players[key] && typeof players[key] === "object") {
      delete players[key].correction;
      delete players[key].legacy_entity_ids;
    }
  }
  for (const row of rows) {
    const entityId = String(row.entity_id || "").trim();
    if (!entityId) continue;
    if (!players[entityId]) players[entityId] = {};
    const correction: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === "entity_id" || key === "legacy_entity_ids") continue;
      if (value === undefined) continue;
      correction[key] = value;
    }
    if (Array.isArray(row.legacy_entity_ids) && row.legacy_entity_ids.length) {
      players[entityId].legacy_entity_ids = row.legacy_entity_ids;
    }
    players[entityId].correction = correction;
  }
  for (const key of Object.keys(players)) {
    if (players[key] && typeof players[key] === "object" && Object.keys(players[key]).length === 0) {
      delete players[key];
    }
  }
  doc.players = players;
  doc.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

// \uC218\uC9D1 \uC81C\uC678\uB97C \uC120\uC218 \uB300\uC7A5(players[].excluded + collection_exclusions_without_entity)\uC5D0\uC11C
// \uC61B \uC218\uC9D1 \uC81C\uC678 \uD30C\uC77C\uC758 players[] \uD589 \uD615\uD0DC\uB85C \uBCF5\uC6D0\uD55C\uB2E4.
// dual-shape: players \uAC00 \uBC30\uC5F4(\uB808\uAC70\uC2DC \uD30C\uC77C)\uC774\uBA74 \uADF8\uB300\uB85C \uBC18\uD658.
export function loadCollectionExclusionsFromLedger(): ExclusionRow[] {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  let doc: LedgerDoc | null = null;
  try {
    doc = readJson<LedgerDoc>(LEDGER_PATH);
  } catch {
    return [];
  }
  if (!doc) return [];
  if (Array.isArray(doc.players)) return doc.players;
  const rows: ExclusionRow[] = [];
  for (const [entityId, row] of Object.entries(doc.players || {})) {
    const ex = row?.excluded;
    if (!ex || typeof ex !== "object") continue;
    const out: ExclusionRow = { entity_id: entityId, reason: ex.reason };
    if (ex.wr_id !== undefined && ex.wr_id !== null) out.wr_id = ex.wr_id;
    if (ex.name !== undefined && ex.name !== null) out.name = ex.name;
    if (ex.note !== undefined && ex.note !== null) out.note = ex.note;
    if (ex.updated_at !== undefined && ex.updated_at !== null) out.updated_at = ex.updated_at;
    rows.push(out);
  }
  for (const row of Array.isArray(doc.collection_exclusions_without_entity)
    ? doc.collection_exclusions_without_entity
    : []) {
    rows.push({ ...row });
  }
  return rows;
}

// \uAD00\uB9AC\uC790 API\uC758 \uB85C\uCEEC \uD3F4\uBC31(\uC6D0\uACA9 Supabase \uC800\uC7A5 \uC2E4\uD328 \uC2DC)\uB9CC \uC774 \uACBD\uB85C\uB85C \uB300\uC7A5\uC5D0 \uB418\uC4F4\uB2E4.
// ponytail: \uC804\uCCB4 \uC7AC\uC9C1\uB82C\uD654 \u2014 \uB85C\uCEEC dev \uD3F4\uBC31 \uC804\uC6A9\uC774\uB77C \uC131\uB2A5/\uD3EC\uB9F7 \uCD5C\uC801\uD654 \uBD88\uD544\uC694. curated note\uB294 \uBCF4\uC874\uD55C\uB2E4.
export function writeCollectionExclusionsToLedger(rows: ExclusionRow[]): void {
  const doc = readJson<Record<string, unknown>>(LEDGER_PATH);
  const rawPlayers = doc.players;
  const players =
    rawPlayers && typeof rawPlayers === "object" && !Array.isArray(rawPlayers)
      ? (rawPlayers as Record<string, Record<string, unknown>>)
      : {};
  for (const key of Object.keys(players)) {
    if (players[key] && typeof players[key] === "object") delete players[key].excluded;
  }
  const withoutEntity: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const entityId = String(row.entity_id || "").trim();
    if (entityId) {
      const excluded: Record<string, unknown> = { name: row.name, wr_id: row.wr_id, reason: row.reason };
      if (row.note !== undefined) excluded.note = row.note;
      if (row.updated_at !== undefined) excluded.updated_at = row.updated_at;
      if (!players[entityId]) players[entityId] = {};
      players[entityId].excluded = excluded;
    } else {
      const out: Record<string, unknown> = { name: row.name, wr_id: row.wr_id, reason: row.reason };
      if (row.updated_at !== undefined) out.updated_at = row.updated_at;
      withoutEntity.push(out);
    }
  }
  for (const key of Object.keys(players)) {
    if (players[key] && typeof players[key] === "object" && Object.keys(players[key]).length === 0) {
      delete players[key];
    }
  }
  doc.players = players;
  doc.collection_exclusions_without_entity = withoutEntity;
  doc.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(doc, null, 2) + "\n", "utf8");
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

export function isRemoteRosterAdminCorrectionStoreEnabled() {
  return hasSupabaseAdminEnv();
}

function readLocalOverrides(): ManualOverrideRow[] {
  return loadRosterManualOverridesFromLedger();
}

function readLocalExclusions(): ExclusionRow[] {
  return loadCollectionExclusionsFromLedger();
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
    soop_user_id: String(row.soop_user_id || "").trim() || undefined,
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
    .select(ROSTER_ADMIN_CORRECTION_COLUMNS)
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
    .select(ROSTER_ADMIN_CORRECTION_COLUMNS)
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
    soop_user_id: mergeNullableStringField(payload.soop_user_id, current?.soop_user_id),
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
