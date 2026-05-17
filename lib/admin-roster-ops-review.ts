import fs from "fs";
import path from "path";
import { readRosterReviewDecisions, rosterReviewDecisionKey } from "@/lib/roster-review-decisions";

const ROOT = process.cwd();
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

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

export type RosterOpsReview = {
  generated_at: string;
  groups: {
    missing_soop_ids: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    zero_record_players: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    roster_change_review: RosterOpsReviewGroup<JsonObject>;
    excluded_players: RosterOpsReviewGroup<RosterOpsReviewPlayer>;
    new_player_candidates: RosterOpsReviewGroup<JsonObject>;
  };
};

type RosterChangeItem = JsonObject & {
  review_kind?: string;
  entity_id?: string;
  name?: string;
  from?: string;
  to?: string;
  decision_url?: string;
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

function buildRosterChangeItems(doc: JsonObject | null, kinds?: string[]): RosterChangeItem[] {
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
  if (!kinds || kinds.length === 0) return rows;
  return rows.filter((row) => kinds.includes(trim(row.review_kind)) && !isOperatorExcludedReviewItem(row));
}

function buildZeroRecordPlayers(players: RosterOpsReviewPlayer[]): RosterOpsReviewGroup<RosterOpsReviewPlayer> {
  const source = latestReportFile("daily_pipeline_alerts_latest.json");
  const doc = source ? readJson<JsonObject>(source) : null;
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
      if (known) rows.push({ ...known, reason, source: source ? path.relative(ROOT, source) : undefined });
    }

    if (candidates.length === 0) {
      for (const name of extractZeroRecordAlertNames(alert, message)) {
        const known = index.byName.get(name);
        if (known) rows.push({ ...known, reason, source: source ? path.relative(ROOT, source) : undefined });
      }
    }
  }

  const unique = uniquePlayers(rows);
  return {
    key: "zero_record_players",
    title: "Zero-record players",
    count: unique.length,
    items: unique,
    source: source ? path.relative(ROOT, source) : null,
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

function buildRosterChangeReview(): RosterOpsReviewGroup<JsonObject> {
  const source = latestReportFile("roster_change_review_latest.json");
  const doc = source ? readJson<JsonObject>(source) : null;
  const rows = buildRosterChangeItems(doc, ["affiliation_change", "tier_change", "race_change", "conflict"]);
  return {
    key: "roster_change_review",
    title: "Roster change review",
    count: rows.length,
    items: rows,
    source: source ? path.relative(ROOT, source) : null,
  };
}

function buildNewPlayerCandidates(): RosterOpsReviewGroup<JsonObject> {
  const source = latestReportFile("roster_change_review_latest.json");
  const doc = source ? readJson<JsonObject>(source) : null;
  const rows = buildRosterChangeItems(doc, ["new_candidate"]);
  return {
    key: "new_player_candidates",
    title: "New player candidates",
    count: rows.length,
    items: rows,
    source: source ? path.relative(ROOT, source) : null,
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
  const missingSoopIds = approvedPlayers.filter((player) => !trim(player.soop_user_id));

  return {
    generated_at: new Date().toISOString(),
    groups: {
      missing_soop_ids: {
        key: "missing_soop_ids",
        title: "Missing SOOP IDs",
        count: missingSoopIds.length,
        items: missingSoopIds,
        source: path.relative(ROOT, PROJECTS_DIR),
      },
      zero_record_players: buildZeroRecordPlayers(approvedPlayers),
      roster_change_review: buildRosterChangeReview(),
      excluded_players: buildExcludedPlayers(approvedPlayers),
      new_player_candidates: buildNewPlayerCandidates(),
    },
  };
}
