import { normalizeUniversityKey } from "./university-config";
import { type Player } from "../types";

type RosterPlayerOverride = {
  university?: string;
  tier?: string;
  race?: string;
  display_name?: string;
  profile_url?: string;
  soop_id?: string;
};

type SoopIdentityOverride = {
  name?: string;
  soop_id?: string;
};

type ServingMetadataPlayer = Partial<Player> & {
  eloboard_id?: string | number | null;
  gender?: string | null;
  university?: string | null;
};

type IdentityResolution = {
  canonicalName: string;
  displayName: string;
  rosterOverride: RosterPlayerOverride | null;
  soopOverride: SoopIdentityOverride | null;
};

function isFixedAffiliationOverride(row?: {
  manual_lock?: boolean;
  manual_mode?: "temporary" | "fixed";
} | null) {
  return Boolean(row?.manual_lock === true && row?.manual_mode === "fixed");
}

function shouldApplyManualAffiliationOverride(row?: { team_code?: string } | null) {
  return Boolean(String(row?.team_code || "").trim());
}

function shouldApplyManualTierOverride(
  row?: {
    tier?: string;
    manual_lock?: boolean;
    manual_mode?: "temporary" | "fixed";
  } | null
) {
  return Boolean(String(row?.tier || "").trim()) && !isFixedAffiliationOverride(row);
}

function shouldApplyManualRaceOverride(
  row?: {
    race?: string;
    manual_lock?: boolean;
    manual_mode?: "temporary" | "fixed";
  } | null
) {
  return Boolean(String(row?.race || "").trim()) && !isFixedAffiliationOverride(row);
}

let cachedSearchAliasesMtimeMs: number | null = null;
let cachedSearchAliases = new Map<string, string[]>();
let cachedDisplayAliasesMtimeMs: number | null = null;
let cachedDisplayAliases = new Map<string, string>();
let cachedManualOverridesMtimeMs: number | null = null;
let cachedManualOverrides = new Map<string, RosterPlayerOverride>();
let cachedRosterOverridesMtimeKey: string | null = null;
let cachedRosterOverrides = new Map<string, RosterPlayerOverride>();
let cachedSoopIdentityOverridesMtimeKey: string | null = null;
let cachedSoopIdentityOverrides = new Map<string, SoopIdentityOverride>();

function readJsonFile<T>(filePath: string): T | null {
  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

function getProjectRosterFiles(
  fs: typeof import("fs"),
  path: typeof import("path"),
  projectsDir: string
) {
  if (!fs.existsSync(projectsDir)) return [];

  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const code = entry.name;
      return path.join(projectsDir, code, `players.${code}.v1.json`);
    })
    .filter((filePath) => fs.existsSync(filePath));
}

function getProjectRosterMtimeKey(fs: typeof import("fs"), filePaths: string[]) {
  try {
    return filePaths.map((filePath) => `${filePath}:${fs.statSync(filePath).mtimeMs}`).join("|");
  } catch {
    return null;
  }
}

function normalizeEntityIdForPlayer(player: ServingMetadataPlayer) {
  const rawEloboardId = String(player.eloboard_id || "").trim();
  if (/^eloboard:(male|female):/i.test(rawEloboardId)) {
    return rawEloboardId.toLowerCase();
  }
  const rawGender = String(player.gender || "").trim().toLowerCase();
  const gender = rawGender === "male" || rawGender === "female" ? rawGender : "";
  const wrId = rawEloboardId;
  if (!gender || !wrId) return null;
  return `eloboard:${gender}:${wrId}`;
}

function extractWrId(player: ServingMetadataPlayer) {
  const rawEloboardId = String(player.eloboard_id || "").trim();
  if (!rawEloboardId) return null;
  if (/^\d+$/.test(rawEloboardId)) return rawEloboardId;
  const match = rawEloboardId.match(/(\d+)$/);
  return match ? match[1] : null;
}

function hasMixedEloboardIdentity(player: ServingMetadataPlayer) {
  return /^eloboard:(male|female):mix:\d+$/i.test(String(player.eloboard_id || "").trim());
}

function registerDisplayAlias(aliases: Map<string, string>, nameValue: string | undefined, displayValue: string | undefined) {
  const name = String(nameValue || "").trim();
  const displayName = String(displayValue || "").trim();
  if (!name || !displayName) return;
  aliases.set(name, displayName);
}

function registerSearchAlias(aliases: Map<string, Set<string>>, canonicalName: string, aliasName: string) {
  const canonical = String(canonicalName || "").trim();
  const alias = String(aliasName || "").trim();
  if (!canonical || !alias || canonical === alias) return;
  const bucket = aliases.get(canonical) || new Set<string>();
  bucket.add(alias);
  aliases.set(canonical, bucket);
}

function resolveIdentityOverrides(
  player: ServingMetadataPlayer,
  overrides: Map<string, RosterPlayerOverride>,
  soopIdentityOverrides: Map<string, SoopIdentityOverride>,
  displayAliases: Map<string, string>
): IdentityResolution {
  const entityId = normalizeEntityIdForPlayer(player);
  const wrId = extractWrId(player);
  const canonicalName = String(player.name || "").trim();
  const rosterOverride = entityId ? overrides.get(entityId) || null : null;
  const soopOverride = wrId && hasMixedEloboardIdentity(player) ? soopIdentityOverrides.get(wrId) || null : null;
  const displayName = String(
    (entityId ? displayAliases.get(entityId) : "") || rosterOverride?.display_name || ""
  ).trim();

  return {
    canonicalName,
    displayName,
    rosterOverride,
    soopOverride,
  };
}

function loadRosterOverrides(): Map<string, RosterPlayerOverride> {
  const overrides = new Map<string, RosterPlayerOverride>();
  if (typeof window !== "undefined") return overrides;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const projectsDir = path.join(process.cwd(), "data", "metadata", "projects");
  const rosterFiles = getProjectRosterFiles(fs, path, projectsDir);
  const mtimeKey = getProjectRosterMtimeKey(fs, rosterFiles);
  if (mtimeKey !== null && cachedRosterOverridesMtimeKey === mtimeKey) {
    return cachedRosterOverrides;
  }

  for (const filePath of rosterFiles) {
    const doc = readJsonFile<{
      roster?: Array<{
        entity_id?: string;
        team_name?: string;
        tier?: string;
        race?: string;
        display_name?: string;
        profile_url?: string;
        soop_user_id?: string;
      }>;
    }>(filePath);
    const roster = Array.isArray(doc?.roster) ? doc.roster : [];
    for (const player of roster) {
      const entityId = String(player?.entity_id || "").trim();
      if (!entityId) continue;
      overrides.set(entityId, {
        university: String(player?.team_name || "").trim() || undefined,
        tier: String(player?.tier || "").trim() || undefined,
        race: String(player?.race || "").trim() || undefined,
        display_name: String(player?.display_name || "").trim() || undefined,
        profile_url: String(player?.profile_url || "").trim() || undefined,
        soop_id: String(player?.soop_user_id || "").trim() || undefined,
      });
    }
  }

  cachedRosterOverrides = overrides;
  cachedRosterOverridesMtimeKey = mtimeKey;
  return overrides;
}

function loadManualRosterOverrides(): Map<string, RosterPlayerOverride> {
  const overrides = new Map<string, RosterPlayerOverride>();
  if (typeof window !== "undefined") return overrides;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "roster_manual_overrides.v1.json");
  if (!fs.existsSync(filePath)) return overrides;

  try {
    const stat = fs.statSync(filePath);
    if (cachedManualOverridesMtimeMs === stat.mtimeMs) {
      return cachedManualOverrides;
    }
    cachedManualOverridesMtimeMs = stat.mtimeMs;
  } catch {
    cachedManualOverridesMtimeMs = null;
  }

  const doc = readJsonFile<{
    overrides?: Array<{
      entity_id?: string;
      team_code?: string;
      team_name?: string;
      tier?: string;
      race?: string;
      name?: string;
      soop_id?: string;
      manual_lock?: boolean;
      manual_mode?: "temporary" | "fixed";
    }>;
  }>(filePath);

  for (const row of Array.isArray(doc?.overrides) ? doc.overrides : []) {
    const entityId = String(row?.entity_id || "").trim();
    if (!entityId) continue;
    overrides.set(entityId, {
      university: shouldApplyManualAffiliationOverride(row)
        ? String(row?.team_name || row?.team_code || "").trim() || undefined
        : undefined,
      tier: shouldApplyManualTierOverride(row) ? String(row?.tier || "").trim() || undefined : undefined,
      race: shouldApplyManualRaceOverride(row) ? String(row?.race || "").trim() || undefined : undefined,
      display_name: String(row?.name || "").trim() || undefined,
      soop_id: String(row?.soop_id || "").trim() || undefined,
    });
  }

  cachedManualOverrides = overrides;
  return overrides;
}

// 표시명(방송명)은 선수 대장이 유일한 출처다. 이름이 아니라 entity_id로 묶으므로
// 엘로보드가 이름을 본명으로 바꾸거나 선수가 팀을 옮겨도 방송명이 날아가지 않는다.
function loadDisplayAliases(): Map<string, string> {
  const aliases = new Map<string, string>();
  if (typeof window !== "undefined") return aliases;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const filePath = path.join(process.cwd(), "data", "metadata", "player_ledger.v1.json");
  if (!fs.existsSync(filePath)) return aliases;

  try {
    const stat = fs.statSync(filePath);
    if (cachedDisplayAliasesMtimeMs === stat.mtimeMs) {
      return cachedDisplayAliases;
    }
    cachedDisplayAliasesMtimeMs = stat.mtimeMs;
  } catch {
    cachedDisplayAliasesMtimeMs = null;
  }

  try {
    const doc = readJsonFile<{
      players?: Record<string, { display_name?: string }>;
    }>(filePath);

    for (const [entityId, row] of Object.entries(doc?.players || {})) {
      registerDisplayAlias(aliases, entityId, row?.display_name);
    }
  } catch {
    return aliases;
  }

  cachedDisplayAliases = aliases;
  return aliases;
}

function loadSoopIdentityOverrides(): Map<string, SoopIdentityOverride> {
  const overrides = new Map<string, SoopIdentityOverride>();
  if (typeof window !== "undefined") return overrides;

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const projectsDir = path.join(process.cwd(), "data", "metadata", "projects");
  const rosterFiles = getProjectRosterFiles(fs, path, projectsDir);
  const mtimeKey = getProjectRosterMtimeKey(fs, rosterFiles);
  if (mtimeKey !== null && cachedSoopIdentityOverridesMtimeKey === mtimeKey) {
    return cachedSoopIdentityOverrides;
  }

  for (const filePath of rosterFiles) {
    const doc = readJsonFile<{
      roster?: Array<{
        name?: string;
        display_name?: string;
        wr_id?: string | number;
        soop_user_id?: string;
      }>;
    }>(filePath);
    const roster = Array.isArray(doc?.roster) ? doc.roster : [];
    for (const row of roster) {
      const wrId = String(row?.wr_id || "").trim();
      const soopId = String(row?.soop_user_id || "").trim();
      if (!wrId || !soopId) continue;
      overrides.set(wrId, {
        name: String(row?.display_name || row?.name || "").trim() || undefined,
        soop_id: soopId,
      });
    }
  }

  cachedSoopIdentityOverrides = overrides;
  cachedSoopIdentityOverridesMtimeKey = mtimeKey;
  return overrides;
}

function applyUniversityNormalization<T extends ServingMetadataPlayer>(player: T): T {
  const normalizedUniversity = normalizeUniversityKey(player.university);
  if (!normalizedUniversity) return player;
  return {
    ...player,
    university: normalizedUniversity,
  };
}

function applyIdentityOverride<T extends ServingMetadataPlayer>(
  player: T,
  overrides: Map<string, RosterPlayerOverride>,
  soopIdentityOverrides: Map<string, SoopIdentityOverride>,
  displayAliases: Map<string, string>
): T {
  const resolved = resolveIdentityOverrides(player, overrides, soopIdentityOverrides, displayAliases);
  if (!resolved.rosterOverride && !resolved.soopOverride && !resolved.displayName) return player;

  // Serving semantics:
  // - `name` is the homepage-facing label after display alias resolution.
  // - `nickname` stores the canonical source name when `name` is replaced.
  // - roster fields from Supabase (`university`, `tier`, `race`) are the public
  //   truth after sync; local project metadata can be stale during roster moves.
  // - `soop_id` only accepts the explicit metadata override for mix identities.
  return {
    ...player,
    name: resolved.displayName || player.name,
    nickname:
      resolved.displayName && resolved.canonicalName && resolved.displayName !== resolved.canonicalName
        ? resolved.canonicalName
        : player.nickname,
    soop_id: resolved.rosterOverride?.soop_id ?? resolved.soopOverride?.soop_id ?? player.soop_id,
    profile_url: resolved.rosterOverride?.profile_url ?? player.profile_url,
  };
}

export function applyPlayerServingMetadata<T extends ServingMetadataPlayer>(players: T[]) {
  const overrides = loadRosterOverrides();
  const manualOverrides = loadManualRosterOverrides();
  const mergedOverrides = new Map(overrides);
  for (const [entityId, override] of manualOverrides.entries()) {
    mergedOverrides.set(entityId, {
      ...(mergedOverrides.get(entityId) || {}),
      ...override,
    });
  }
  const soopIdentityOverrides = loadSoopIdentityOverrides();
  const displayAliases = loadDisplayAliases();
  return players.map((player) =>
    applyUniversityNormalization(applyIdentityOverride(player, mergedOverrides, soopIdentityOverrides, displayAliases))
  );
}

export function applyPlayerServingMetadataToOne<T extends ServingMetadataPlayer>(player: T) {
  const [resolved] = applyPlayerServingMetadata([player]);
  return resolved;
}

export function normalizeSearchText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function loadSearchAliases(): Map<string, string[]> {
  const aliases = new Map<string, Set<string>>();
  if (typeof window !== "undefined") return new Map();

  const req = eval("require") as NodeRequire;
  const fs = req("fs") as typeof import("fs");
  const path = req("path") as typeof import("path");
  const mappingPath = path.join(process.cwd(), "data", "metadata", "soop_channel_mappings.v1.json");
  const displayAliasPath = path.join(process.cwd(), "data", "metadata", "player_ledger.v1.json");

  const existingFiles = [mappingPath, displayAliasPath].filter((filePath) => fs.existsSync(filePath));
  if (!existingFiles.length) return new Map();

  try {
    const mtimeKey = existingFiles
      .map((filePath) => `${filePath}:${fs.statSync(filePath).mtimeMs}`)
      .join("|");
    const numericKey = Array.from(mtimeKey).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    if (cachedSearchAliasesMtimeMs === numericKey) {
      return cachedSearchAliases;
    }
    cachedSearchAliasesMtimeMs = numericKey;
  } catch {
    cachedSearchAliasesMtimeMs = null;
  }

  const mappingDoc = readJsonFile<{ aliases?: Record<string, string> }>(mappingPath);
  const mappingAliases = mappingDoc && typeof mappingDoc.aliases === "object" ? mappingDoc.aliases : {};
  for (const [aliasName, canonicalName] of Object.entries(mappingAliases)) {
    registerSearchAlias(aliases, String(canonicalName || ""), String(aliasName || ""));
    registerSearchAlias(aliases, String(aliasName || ""), String(canonicalName || ""));
  }

  // 대장의 선수 행: 표시명(방송명)과 다른 표기(본명 등)를 서로 검색어로 잇는다.
  const displayDoc = readJsonFile<{
    players?: Record<string, { display_name?: string; also_known_as?: string[] }>;
  }>(displayAliasPath);
  for (const row of Object.values(displayDoc?.players || {})) {
    const displayName = String(row?.display_name || "");
    for (const aka of Array.isArray(row?.also_known_as) ? row.also_known_as : []) {
      registerSearchAlias(aliases, displayName, String(aka || ""));
      registerSearchAlias(aliases, String(aka || ""), displayName);
    }
  }

  cachedSearchAliases = new Map(
    Array.from(aliases.entries()).map(([canonicalName, values]) => [canonicalName, Array.from(values)])
  );
  return cachedSearchAliases;
}

export function getPlayerSearchAliases(player: Partial<Player>) {
  const canonicalName = String(player?.nickname || "").trim() || String(player?.name || "").trim();
  if (!canonicalName) return [];
  const aliases = loadSearchAliases();
  return aliases.get(canonicalName) || [];
}

export function isExactPlayerSearchMatch(player: Partial<Player>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  if (normalizeSearchText(player?.name) === normalizedQuery) return true;
  if (normalizeSearchText(player?.nickname) === normalizedQuery) return true;
  return getPlayerSearchAliases(player).some((alias) => normalizeSearchText(alias) === normalizedQuery);
}
