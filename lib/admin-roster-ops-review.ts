import fs from "fs";
import path from "path";
import {
  loadMergedRosterAdminState,
  type ExclusionRow,
  type ManualOverrideRow,
} from "@/lib/roster-admin-store";
import { readRosterReviewDecisions, rosterReviewDecisionKey } from "@/lib/roster-review-decisions";

const ROOT = process.cwd();
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const OPS_REVIEW_REPORTS_PREFIX = "ops-review";
const REPORT_FETCH_TIMEOUT_MS = 3_000;

type JsonObject = Record<string, unknown>;

type ProjectPlayer = {
  entity_id?: string;
  wr_id?: number | string;
  gender?: string;
  name?: string;
  display_name?: string;
  team_code?: string;
  team_name?: string;
  tier?: string;
  race?: string;
  soop_user_id?: string;
};

type ProjectDoc = {
  project?: string;
  team_code?: string;
  team_name?: string;
  roster?: ProjectPlayer[];
};

export type RosterOpsReviewPlayer = {
  entity_id: string;
  wr_id: number | string | null;
  name: string;
  display_name: string;
  team_code: string;
  team_name: string;
  tier: string;
  race: string;
  gender: string;
  soop_user_id?: string;
  reason?: string;
  source?: string;
  updated_at?: string;
};

export type RosterOpsReviewGroup<T> = {
  key: string;
  title: string;
  count: number;
  items: T[];
  source: string | null;
};

export type RosterOpsReviewReportSource = {
  kind: "remote_public_base" | "local_tmp_reports";
  status: "loaded" | "missing";
  source: string | null;
  generated_at?: string;
  warning?: string;
};

export type RosterOpsReviewPipelineAlert = {
  severity: string;
  rule: string;
  team: string;
  team_code: string;
  message: string;
  names: string[];
  action_url: string;
  source?: string;
};

export type RosterOpsReview = {
  generated_at: string;
  report_source: RosterOpsReviewReportSource;
  groups: {
    missing_soop_ids: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    zero_record_players: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    pipeline_alerts: RosterOpsReviewGroup<RosterOpsReviewPipelineAlert>;
    roster_change_review: RosterOpsReviewGroup<JsonObject>;
    excluded_players: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    new_player_candidates: RosterOpsReviewGroup<JsonObject>;
  };
};

type ReviewReportDocs = {
  dailyAlerts: JsonObject | null;
  rosterChangeReview: JsonObject | null;
  manifest: JsonObject | null;
  source: RosterOpsReviewReportSource;
};

type RosterChangeItem = JsonObject & {
  review_kind?: string;
  entity_id?: string;
  wr_id?: number | string;
  name?: string;
  from?: string;
  to?: string;
  decision_url?: string;
};

type MergedRosterAdminState = Awaited<ReturnType<typeof loadMergedRosterAdminState>>;

type RosterOpsReviewAppliedState = {
  overridesByEntityId: Map<string, ManualOverrideRow>;
  approvedByEntityId: Map<string, RosterOpsReviewPlayer>;
  exclusionKeys: Set<string>;
};

function isOperatorExcludedReviewItem(row: RosterChangeItem): boolean {
  const excludedKeys = new Set(
    readRosterReviewDecisions()
      .filter((decision) => decision.decision === "excluded")
      .map(rosterReviewDecisionKey)
  );
  return excludedKeys.has(
    rosterReviewDecisionKey({
      review_kind: trim(row.review_kind),
      entity_id: trim(row.entity_id),
      observed_from: trim(row.from),
      observed_to: trim(row.to),
    })
  );
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePrefix(value: unknown, fallback = OPS_REVIEW_REPORTS_PREFIX) {
  return String(value || fallback).trim().replace(/^\/+|\/+$/g, "") || fallback;
}

export function deriveSiblingPublicBaseUrl(value: unknown, sourcePrefix: unknown, targetPrefix: unknown) {
  const baseUrl = normalizeBaseUrl(value);
  if (!baseUrl) return "";

  const normalizedSourcePrefix = normalizePrefix(sourcePrefix, "player-history");
  const normalizedTargetPrefix = normalizePrefix(targetPrefix, OPS_REVIEW_REPORTS_PREFIX);
  const suffix = `/${normalizedSourcePrefix}`;
  const rootBaseUrl = baseUrl.endsWith(suffix) ? baseUrl.slice(0, -suffix.length) : baseUrl;
  return rootBaseUrl ? `${rootBaseUrl}/${normalizedTargetPrefix}` : "";
}

function getOpsReviewReportsPublicBaseUrl(env = process.env) {
  const explicit = normalizeBaseUrl(env.OPS_REVIEW_REPORTS_PUBLIC_BASE_URL);
  if (explicit) return explicit;

  const prefix = normalizePrefix(env.OPS_REVIEW_REPORTS_R2_PREFIX);
  const rootBaseUrl = normalizeBaseUrl(env.OPS_REVIEW_REPORTS_R2_PUBLIC_BASE_URL);
  if (rootBaseUrl) return `${rootBaseUrl}/${prefix}`;

  return deriveSiblingPublicBaseUrl(
    env.PLAYER_HISTORY_PUBLIC_BASE_URL || env.PLAYER_HISTORY_R2_PUBLIC_BASE_URL,
    env.PLAYER_HISTORY_R2_PREFIX || "player-history",
    prefix
  );
}

async function fetchRemoteReport(baseUrl: string, fileName: string): Promise<JsonObject | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/${fileName}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as JsonObject | null;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function newestGeneratedAt(...docs: Array<JsonObject | null>) {
  return docs
    .map((doc) => trim(doc?.generated_at))
    .filter(Boolean)
    .sort()
    .pop();
}

function readLocalReport(fileName: string): { doc: JsonObject | null; source: string | null } {
  const source = latestReportFile(fileName);
  return {
    doc: source ? readJson<JsonObject>(source) : null,
    source: source ? path.relative(ROOT, source) : null,
  };
}

async function loadReviewReportDocs(): Promise<ReviewReportDocs> {
  const remoteBaseUrl = getOpsReviewReportsPublicBaseUrl();
  if (remoteBaseUrl) {
    const [dailyAlerts, rosterChangeReview, manifest] = await Promise.all([
      fetchRemoteReport(remoteBaseUrl, "daily_pipeline_alerts_latest.json"),
      fetchRemoteReport(remoteBaseUrl, "roster_change_review_latest.json"),
      fetchRemoteReport(remoteBaseUrl, "ops_review_reports_manifest.json"),
    ]);

    if (dailyAlerts || rosterChangeReview) {
      return {
        dailyAlerts,
        rosterChangeReview,
        manifest,
        source: {
          kind: "remote_public_base",
          status: "loaded",
          source: remoteBaseUrl,
          generated_at: trim(manifest?.generated_at) || newestGeneratedAt(dailyAlerts, rosterChangeReview),
        },
      };
    }
  }

  const dailyAlerts = readLocalReport("daily_pipeline_alerts_latest.json");
  const rosterChangeReview = readLocalReport("roster_change_review_latest.json");
  const manifest = readLocalReport("ops_review_reports_manifest.json");
  const source = dailyAlerts.source || rosterChangeReview.source || manifest.source;

  return {
    dailyAlerts: dailyAlerts.doc,
    rosterChangeReview: rosterChangeReview.doc,
    manifest: manifest.doc,
    source: {
      kind: "local_tmp_reports",
      status: source ? "loaded" : "missing",
      source,
      generated_at: trim(manifest.doc?.generated_at) || newestGeneratedAt(dailyAlerts.doc, rosterChangeReview.doc),
      warning: remoteBaseUrl && !source ? "remote reports unavailable and local tmp reports missing" : undefined,
    },
  };
}

function listFilesRecursive(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return [fullPath];
  });
}

function latestReportFile(fileName: string): string | null {
  const matches = listFilesRecursive(REPORTS_DIR)
    .filter((filePath) => path.basename(filePath) === fileName)
    .map((filePath) => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.filePath || null;
}

function loadProjectDocs(): Array<{ filePath: string; doc: ProjectDoc }> {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const code = entry.name;
      return path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    })
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({ filePath, doc: readJson<ProjectDoc>(filePath) || {} }));
}

function trim(value: unknown): string {
  return String(value || "").trim();
}

function normalized(value: unknown): string {
  return trim(value).toLowerCase();
}

function exclusionKey(row: Pick<ExclusionRow, "entity_id" | "wr_id" | "name">) {
  const entityId = trim(row.entity_id);
  if (entityId) return `entity:${entityId}`;
  const wrId = trim(row.wr_id);
  if (wrId) return `wr:${wrId}`;
  const name = normalized(row.name);
  return name ? `name:${name}` : "";
}

function buildAppliedReviewState(
  approvedPlayers: RosterOpsReviewPlayer[],
  adminState: MergedRosterAdminState
): RosterOpsReviewAppliedState {
  const overridesByEntityId = new Map<string, ManualOverrideRow>();
  for (const row of adminState.overrides) {
    const entityId = trim(row.entity_id);
    if (entityId) overridesByEntityId.set(entityId, row);
  }

  const approvedByEntityId = new Map<string, RosterOpsReviewPlayer>();
  for (const player of approvedPlayers) {
    if (player.entity_id) approvedByEntityId.set(player.entity_id, player);
  }

  const exclusionKeys = new Set(
    adminState.exclusions.map(exclusionKey).filter(Boolean)
  );

  return { overridesByEntityId, approvedByEntityId, exclusionKeys };
}

function rowExclusionKey(row: RosterChangeItem) {
  return exclusionKey({
    entity_id: trim(row.entity_id),
    wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : undefined,
    name: trim(row.name),
  });
}

function matchesCurrentOrOverride(
  row: RosterChangeItem,
  state: RosterOpsReviewAppliedState | undefined,
  field: "team_code" | "tier" | "race"
) {
  if (!state) return false;
  const entityId = trim(row.entity_id);
  const target = normalized(row.to);
  if (!entityId || !target) return false;

  const override = state.overridesByEntityId.get(entityId);
  if (normalized(override?.[field]) === target) return true;

  const approved = state.approvedByEntityId.get(entityId);
  return normalized(approved?.[field]) === target;
}

function isAlreadyAppliedReviewItem(
  row: RosterChangeItem,
  state?: RosterOpsReviewAppliedState
): boolean {
  const kind = trim(row.review_kind);
  if (kind === "affiliation_change" || kind === "new_candidate") {
    return matchesCurrentOrOverride(row, state, "team_code");
  }
  if (kind === "tier_change") {
    return matchesCurrentOrOverride(row, state, "tier");
  }
  if (kind === "race_change") {
    return matchesCurrentOrOverride(row, state, "race");
  }
  if (kind === "excluded_candidate" && state) {
    const key = rowExclusionKey(row);
    return Boolean(key && state.exclusionKeys.has(key));
  }
  return false;
}

function normalizePlayer(player: ProjectPlayer, doc: ProjectDoc, reason?: string, source?: string): RosterOpsReviewPlayer {
  const teamCode = trim(player.team_code) || trim(doc.team_code) || trim(doc.project);
  const teamName = trim(player.team_name) || trim(doc.team_name) || teamCode;
  const name = trim(player.name);
  return {
    entity_id: trim(player.entity_id),
    wr_id: player.wr_id ?? null,
    name,
    display_name: trim(player.display_name) || name,
    team_code: teamCode,
    team_name: teamName,
    tier: trim(player.tier),
    race: trim(player.race),
    gender: trim(player.gender),
    soop_user_id: trim(player.soop_user_id) || undefined,
    reason,
    source,
  };
}

function loadApprovedPlayers(): RosterOpsReviewPlayer[] {
  return loadProjectDocs().flatMap(({ filePath, doc }) => {
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    return roster.map((player) => normalizePlayer(player, doc, undefined, path.relative(ROOT, filePath)));
  });
}

function indexPlayers(players: RosterOpsReviewPlayer[]) {
  const byEntityId = new Map<string, RosterOpsReviewPlayer>();
  const byWrId = new Map<string, RosterOpsReviewPlayer>();
  const byName = new Map<string, RosterOpsReviewPlayer>();

  for (const player of players) {
    if (player.entity_id) byEntityId.set(player.entity_id, player);
    if (player.wr_id !== null && player.wr_id !== undefined) byWrId.set(String(player.wr_id), player);
    if (player.name) byName.set(player.name, player);
  }

  return { byEntityId, byWrId, byName };
}

function toArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object")) : [];
}

function pickReportRows(doc: JsonObject | null, keys: string[]): JsonObject[] {
  if (!doc) return [];
  for (const key of keys) {
    const rows = toArray(doc[key]);
    if (rows.length > 0) return rows;
  }
  return [];
}

function namesFromMessage(message: string): string[] {
  const match = message.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1]
    .split(/[,/]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function extractZeroRecordAlertNames(alert: JsonObject, message: string): string[] {
  const directNames = [alert.name, alert.player_name, alert.display_name].map(trim).filter(Boolean);
  return [...new Set([...directNames, ...namesFromMessage(message)])];
}

function formatZeroRecordReason(message: string): string {
  const names = namesFromMessage(message);
  if (names.length > 0) return `전적 0건 감지: ${names.join(", ")}`;
  return "전적 0건 감지";
}

function withDecisionUrl(kind: string, row: JsonObject): RosterChangeItem {
  const params = new URLSearchParams();
  params.set("review", kind);
  const entityId = trim(row.entity_id);
  const to = trim(row.to);
  if (entityId) params.set("entity_id", entityId);
  if ((kind === "affiliation_change" || kind === "new_candidate") && to) params.set("team_code", to);
  if (kind === "tier_change" && to) params.set("tier", to);
  if (kind === "race_change" && to) params.set("race", to);
  return {
    ...row,
    review_kind: kind,
    operator_status: trim(row.operator_status) || "pending",
    decision_url: trim(row.decision_url) || `/admin/roster?${params.toString()}`,
  };
}

function buildRosterChangeItems(
  doc: JsonObject | null,
  kinds?: string[],
  appliedState?: RosterOpsReviewAppliedState
): RosterChangeItem[] {
  if (!doc) return [];
  const directRows = pickReportRows(doc, ["items", "review_items", "changes"]).map((row) =>
    withDecisionUrl(trim(row.review_kind) || "roster_change", row)
  );
  const review = doc.review && typeof doc.review === "object" ? (doc.review as JsonObject) : doc;
  const rows = directRows.length
    ? directRows
    : [
        ...toArray(review.moved).map((row) => withDecisionUrl("affiliation_change", row)),
        ...toArray(review.tier_changed).map((row) => withDecisionUrl("tier_change", row)),
        ...toArray(review.race_changed).map((row) => withDecisionUrl("race_change", row)),
        ...toArray(review.added).map((row) => withDecisionUrl("new_candidate", row)),
        ...toArray(review.conflicts).map((row) => withDecisionUrl("conflict", row)),
      ];
  const selectedRows =
    !kinds || kinds.length === 0
      ? rows
      : rows.filter((row) => kinds.includes(trim(row.review_kind)));
  return selectedRows.filter(
    (row) => !isOperatorExcludedReviewItem(row) && !isAlreadyAppliedReviewItem(row, appliedState)
  );
}

function buildZeroRecordPlayers(
  players: RosterOpsReviewPlayer[],
  reports: ReviewReportDocs
): RosterOpsReviewGroup<RosterOpsReviewPlayer> {
  const doc = reports.dailyAlerts;
  const alerts = pickReportRows(doc, ["alerts"]);
  const index = indexPlayers(players);
  const rows: RosterOpsReviewPlayer[] = [];

  for (const alert of alerts) {
    const rule = trim(alert.rule);
    const message = trim(alert.message);
    if (rule !== "zero_record_players" && !message.includes("zero")) continue;

    const candidates = toArray(alert.players).concat(toArray(alert.items));
    const reason = formatZeroRecordReason(message);
    for (const candidate of candidates) {
      const entityId = trim(candidate.entity_id);
      const wrId = trim(candidate.wr_id);
      const name = trim(candidate.name);
      const known =
        (entityId && index.byEntityId.get(entityId)) ||
        (wrId && index.byWrId.get(wrId)) ||
        (name && index.byName.get(name));
      if (known) rows.push({ ...known, reason, source: reports.source.source || undefined });
    }

    if (candidates.length === 0) {
      for (const name of extractZeroRecordAlertNames(alert, message)) {
        const known = index.byName.get(name);
        if (known) rows.push({ ...known, reason, source: reports.source.source || undefined });
      }
    }
  }

  const unique = uniquePlayers(rows);
  return {
    key: "zero_record_players",
    title: "Zero-record players",
    count: unique.length,
    items: unique,
    source: reports.source.source,
  };
}

function buildPipelineAlerts(reports: ReviewReportDocs): RosterOpsReviewGroup<RosterOpsReviewPipelineAlert> {
  const alerts = pickReportRows(reports.dailyAlerts, ["alerts"]);
  const rows = alerts.map((alert) => {
    const teamCode = trim(alert.team_code);
    const params = new URLSearchParams();
    if (teamCode) params.set("team_code", teamCode);
    const names = extractZeroRecordAlertNames(alert, trim(alert.message));
    if (names.length === 1) params.set("q", names[0]);

    return {
      severity: trim(alert.severity) || "info",
      rule: trim(alert.rule) || "pipeline_alert",
      team: trim(alert.team),
      team_code: teamCode,
      message: trim(alert.message),
      names,
      action_url: params.toString() ? `/admin/roster?${params.toString()}` : "/admin/roster",
      source: reports.source.source || undefined,
    };
  });

  return {
    key: "pipeline_alerts",
    title: "Pipeline alerts",
    count: rows.length,
    items: rows,
    source: reports.source.source,
  };
}

function uniquePlayers(players: RosterOpsReviewPlayer[]): RosterOpsReviewPlayer[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    const key = player.entity_id || String(player.wr_id || "") || `${player.team_code}:${player.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRosterChangeReview(
  reports: ReviewReportDocs,
  appliedState: RosterOpsReviewAppliedState
): RosterOpsReviewGroup<JsonObject> {
  const doc = reports.rosterChangeReview;
  const rows = buildRosterChangeItems(doc, [
    "affiliation_change",
    "tier_change",
    "excluded_candidate",
    "race_change",
    "conflict",
  ], appliedState);
  return {
    key: "roster_change_review",
    title: "Roster change review",
    count: rows.length,
    items: rows,
    source: reports.source.source,
  };
}

function buildNewPlayerCandidates(
  reports: ReviewReportDocs,
  appliedState: RosterOpsReviewAppliedState
): RosterOpsReviewGroup<JsonObject> {
  const doc = reports.rosterChangeReview;
  const rows = buildRosterChangeItems(doc, ["new_candidate"], appliedState);
  return {
    key: "new_player_candidates",
    title: "New player candidates",
    count: rows.length,
    items: rows,
    source: reports.source.source,
  };
}

function buildExcludedPlayers(players: RosterOpsReviewPlayer[]): RosterOpsReviewGroup<RosterOpsReviewPlayer> {
  const doc = readJson<JsonObject>(EXCLUSIONS_PATH);
  const rows = pickReportRows(doc, ["players"]);
  const index = indexPlayers(players);
  const items = rows.map((row) => {
    const entityId = trim(row.entity_id);
    const wrId = trim(row.wr_id);
    const name = trim(row.name);
    const known =
      (entityId && index.byEntityId.get(entityId)) ||
      (wrId && index.byWrId.get(wrId)) ||
      (name && index.byName.get(name));
    if (known) {
      return {
        ...known,
        reason: trim(row.reason) || "user_excluded",
        updated_at: trim(row.updated_at) || undefined,
        source: path.relative(ROOT, EXCLUSIONS_PATH),
      };
    }
    return {
      entity_id: entityId,
      wr_id: row.wr_id === undefined ? null : String(row.wr_id),
      name,
      display_name: name,
      team_code: "",
      team_name: "",
      tier: "",
      race: "",
      gender: "",
      reason: trim(row.reason) || "user_excluded",
      updated_at: trim(row.updated_at) || undefined,
      source: path.relative(ROOT, EXCLUSIONS_PATH),
    };
  });

  return {
    key: "excluded_players",
    title: "Excluded players",
    count: items.length,
    items,
    source: fs.existsSync(EXCLUSIONS_PATH) ? path.relative(ROOT, EXCLUSIONS_PATH) : null,
  };
}

export async function buildRosterOpsReview(): Promise<RosterOpsReview> {
  const approvedPlayers = loadApprovedPlayers();
  const adminState = await loadMergedRosterAdminState();
  const appliedState = buildAppliedReviewState(approvedPlayers, adminState);
  const reports = await loadReviewReportDocs();
  const missingSoopIds = approvedPlayers.filter((player) => !trim(player.soop_user_id));

  return {
    generated_at: new Date().toISOString(),
    report_source: reports.source,
    groups: {
      missing_soop_ids: {
        key: "missing_soop_ids",
        title: "Missing SOOP IDs",
        count: missingSoopIds.length,
        items: missingSoopIds,
        source: path.relative(ROOT, PROJECTS_DIR),
      },
      zero_record_players: buildZeroRecordPlayers(approvedPlayers, reports),
      pipeline_alerts: buildPipelineAlerts(reports),
      roster_change_review: buildRosterChangeReview(reports, appliedState),
      excluded_players: buildExcludedPlayers(approvedPlayers),
      new_player_candidates: buildNewPlayerCandidates(reports, appliedState),
    },
  };
}
