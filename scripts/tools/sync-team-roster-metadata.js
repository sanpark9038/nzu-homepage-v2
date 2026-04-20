const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const {
  buildEloboardCompositeKey,
  buildEloboardEntityId,
  defaultProfileUrlForPlayer,
  getEloboardProfileKind,
  normalizeProfileUrl,
} = require("./lib/eloboard-special-cases");
const { ensureAutoDiscoveredTeamProjects } = require("./lib/team-project-discovery");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORT_DIR = path.join(ROOT, "tmp", "reports");
const MANUAL_REFRESH_BASELINE_PATH = path.join(REPORT_DIR, "manual_refresh_baseline.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const FA_UNIV_FALLBACKS = ["연합팀", "FA", "무소속"];

function argValue(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

function readManualOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return [];
  try {
    const doc = readJson(OVERRIDES_PATH);
    return Array.isArray(doc.overrides) ? doc.overrides : [];
  } catch {
    return [];
  }
}

function buildLegacyEntityIdsBySuccessor(manualOverrides) {
  const lookup = new Map();
  for (const row of Array.isArray(manualOverrides) ? manualOverrides : []) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    if (!entityId) continue;
    const legacyEntityIds = Array.isArray(row && row.legacy_entity_ids)
      ? row.legacy_entity_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (legacyEntityIds.length) lookup.set(entityId, legacyEntityIds);
  }
  return lookup;
}

function buildRetiredEntityIds(manualOverrides) {
  const retired = new Set();
  for (const row of Array.isArray(manualOverrides) ? manualOverrides : []) {
    if (!row || row.retired !== true) continue;
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    if (entityId) retired.add(entityId);
  }
  return retired;
}

function readManualRefreshBaselinePlayers(teamCode) {
  if (!fs.existsSync(MANUAL_REFRESH_BASELINE_PATH)) return [];
  try {
    const doc = readJson(MANUAL_REFRESH_BASELINE_PATH);
    const teams = Array.isArray(doc && doc.teams) ? doc.teams : [];
    const team = teams.find((row) => String(row && row.team_code ? row.team_code : "") === String(teamCode || ""));
    return Array.isArray(team && team.players) ? team.players : [];
  } catch {
    return [];
  }
}

function normalizeName(value) {
  return String(value || "").trim();
}

function resolveOverrideEntityId(overrideRow, observedByEntity, beforeByEntity) {
  const explicitEntityId = String(overrideRow && overrideRow.entity_id ? overrideRow.entity_id : "").trim();
  if (explicitEntityId) return explicitEntityId;

  const targetName = normalizeName(overrideRow && overrideRow.name ? overrideRow.name : "");
  if (!targetName) return "";

  const matches = [];
  for (const [entityId, observed] of observedByEntity.entries()) {
    if (normalizeName(observed && observed.name) === targetName) matches.push(entityId);
  }
  for (const [entityId, prev] of beforeByEntity.entries()) {
    const prevName = normalizeName(prev && prev.player ? prev.player.name : "");
    const prevDisplayName = normalizeName(prev && prev.player ? prev.player.display_name : "");
    if (prevName === targetName || prevDisplayName === targetName) matches.push(entityId);
  }

  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : "";
}

function loadTeamConfig() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((code) => code !== "fa")
    .sort((a, b) => String(a).localeCompare(String(b)));

  const teams = [];
  for (const code of dirs) {
    const p = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(p)) continue;
    const json = readJson(p);
    if (json.manual_managed) continue;
    teams.push({ code, univ: String(json.fetch_univ_name || json.team_name || code) });
  }
  return teams;
}

function decodeHtml(buffer) {
  const utf8 = Buffer.from(buffer).toString("utf8");
  const euc = iconv.decode(Buffer.from(buffer), "euc-kr");
  const brokenUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const brokenEuc = (euc.match(/\uFFFD/g) || []).length;
  return brokenUtf8 <= brokenEuc ? utf8 : euc;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000,
  });
  return decodeHtml(res.data);
}

function normalizeRace(r) {
  const s = String(r || "").trim().toLowerCase();
  if (s === "z" || s.includes("zerg")) return "Zerg";
  if (s === "p" || s.includes("protoss")) return "Protoss";
  if (s === "t" || s.includes("terran")) return "Terran";
  return "Unknown";
}

function slug(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tierKey(tier) {
  const raw = String(tier || "").trim();
  const map = {
    갓: "god",
    킹: "king",
    킹티어: "king",
    잭: "jack",
    잭티어: "jack",
    조커: "joker",
    스페이드: "spade",
    유스: "9",
    베이비: "9",
  };
  if (map[raw]) return map[raw];
  if (/^\d+$/.test(raw)) return raw;
  return "unknown";
}

function tierRank(tier) {
  const key = tierKey(tier);
  const order = ["god", "king", "jack", "joker", "spade", "0", "1", "2", "3"];
  const idx = order.indexOf(key);
  if (idx >= 0) return idx;
  if (/^\d+$/.test(key)) return 100 + Number(key);
  return 999;
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table.table tbody tr").each((_, tr) => {
    const row = $(tr);
    const pName = row.find("a.p_name").first();
    if (!pName.length) return;
    const full = pName.text().trim();
    const name = full.replace(/\([^)]*\)\s*$/, "").trim();
    const tierMatch = full.match(/\(([^)]+)\)\s*$/);
    const tier = tierMatch ? tierMatch[1].trim() : "";

    const tds = row.find("td");
    const raceCell = $(tds[1]).text().trim();
    const raceMatch = raceCell.match(/(Zerg|Protoss|Terran|Z|P|T)/i);
    const race = normalizeRace(raceMatch ? raceMatch[1] : "Unknown");

    const historyHref = row.find('a[target="_blank"]').attr("href") || "";
    if (!historyHref) return;
    const profileUrlRaw = historyHref.startsWith("http") ? historyHref : `https://eloboard.com${historyHref}`;
    const profileUrl = normalizeProfileUrl(profileUrlRaw);
    const wr = profileUrl.match(/wr_id=(\d+)/);
    const wrId = wr ? Number(wr[1]) : null;
    if (!wrId) return;
    const boardMatch = profileUrl.match(/[?&]bo_table=([^&]+)/i);
    const board = boardMatch ? String(boardMatch[1]).toLowerCase() : "";
    // women/bj_m_list entries are "female site male roster", so treat as male to avoid wr_id collisions.
    const gender =
      profileUrl.includes("/men/") || board === "bj_m_list" ? "male" : "female";
    rows.push({
      wr_id: wrId,
      gender,
      name,
      tier,
      race,
      profile_url: profileUrl,
      profile_kind: getEloboardProfileKind(profileUrl),
      entity_id: buildEloboardEntityId({
        wr_id: wrId,
        gender,
        name,
        profile_url: profileUrl,
      }),
    });
  });

  const byEntity = new Map();
  for (const r of rows) {
    const key = buildEloboardCompositeKey(r);
    if (key && !byEntity.has(key)) byEntity.set(key, r);
  }
  return [...byEntity.values()];
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2), "utf8");
}

function projectPath(code) {
  return path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
}

function ensureFaProject() {
  const code = "fa";
  const p = projectPath(code);
  if (fs.existsSync(p)) {
    const json = readJson(p);
    if (!json.fetch_univ_name) json.fetch_univ_name = "연합팀";
    if (json.fetch_univ_name !== "연합팀") json.fetch_univ_name = "연합팀";
    writeJson(p, json);
    return { code, path: p, json };
  }
  const json = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    project: "fa",
    team_name: "무소속",
    team_code: "fa",
    team_name_en: "FA",
    fetch_univ_name: "연합팀",
    team_aliases: ["무소속", "FA"],
    roster_count: 0,
    roster: [],
  };
  writeJson(p, json);
  return { code, path: p, json };
}

function ensureTags(player, teamCode, teamName, teamEn) {
  const tags = new Set(
    (Array.isArray(player.meta_tags) ? player.meta_tags : []).filter(
      (tag) => !/^(team:|team_code:|team_ko:|team_en:|race:|tier:)/.test(String(tag || ""))
    )
  );
  tags.add("domain:player");
  tags.add(`team:${teamCode}`);
  tags.add(`team_code:${teamCode}`);
  tags.add(`team_ko:${teamName}`);
  tags.add(`team_en:${slug(teamEn || teamCode) || teamCode}`);
  if (player.gender) tags.add(`gender:${player.gender}`);
  tags.add(`race:${slug(String(player.race || "")) || "unknown"}`);
  tags.add(`tier:${tierKey(player.tier)}`);
  player.meta_tags = [...tags];
}

function fallbackValue(primary, secondary, tertiary, emptyValue) {
  const values = [primary, secondary, tertiary];
  for (const value of values) {
    const s = String(value || "").trim();
    if (s && s !== emptyValue) return s;
  }
  return emptyValue;
}

function upsertRosterEntry(teamJson, observed, source, fallbackPlayer = null) {
  const roster = Array.isArray(teamJson.roster) ? teamJson.roster : [];
  const idx = roster.findIndex((p) => String(p.entity_id) === observed.entity_id);
  const base = idx >= 0 ? roster[idx] : {};
  const observedTier = String(observed.tier || "").trim();
  const observedRace = String(observed.race || "").trim();
  const profileUrl = normalizeProfileUrl(
    observed.profile_url ||
      base.profile_url ||
      (fallbackPlayer && fallbackPlayer.profile_url) ||
      defaultProfileUrlForPlayer({
        wr_id: observed.wr_id,
        gender: observed.gender,
        name: observed.name,
      })
  ) || "";
  const nextTier = fallbackValue(observedTier, base.tier, fallbackPlayer && fallbackPlayer.tier, "미정");
  const nextRace = fallbackValue(observedRace, base.race, fallbackPlayer && fallbackPlayer.race, "Unknown");
  const next = {
    ...base,
    team_name: String(teamJson.team_name || ""),
    team_code: String(teamJson.team_code || ""),
    entity_id: observed.entity_id,
    wr_id: observed.wr_id,
    gender: observed.gender,
    name: observed.name,
    display_name: String(base.display_name || observed.name || ""),
    profile_url: profileUrl,
    profile_kind: observed.profile_kind || base.profile_kind || getEloboardProfileKind(profileUrl),
    tier: nextTier,
    race: nextRace,
    source: source || base.source || "roster_sync",
    missing_in_master: false,
  };
  ensureTags(next, teamJson.team_code, teamJson.team_name, teamJson.team_name_en);
  if (!("role_title" in next)) next.role_title = "";
  if (!("role_priority" in next)) next.role_priority = null;
  next.tier_key = tierKey(next.tier);
  if (idx >= 0) roster[idx] = next;
  else roster.push(next);
  teamJson.roster = roster;
}

function removeRosterEntry(teamJson, entityId) {
  const roster = Array.isArray(teamJson.roster) ? teamJson.roster : [];
  teamJson.roster = roster.filter((p) => String(p.entity_id) !== entityId);
}

function buildRetainedFaEntityIds(faObservedEntityIds, observedByEntity, fallbackEntityIds = []) {
  const retained = new Set(
    Array.isArray(fallbackEntityIds) ? fallbackEntityIds.map((value) => String(value)) : []
  );
  for (const entityId of faObservedEntityIds || []) {
    retained.add(String(entityId));
  }
  if (observedByEntity && typeof observedByEntity.entries === "function") {
    for (const [entityId, observed] of observedByEntity.entries()) {
      if (String(observed && observed.team_code ? observed.team_code : "") === "fa") {
        retained.add(String(entityId));
      }
    }
  }
  return retained;
}

function shouldRetainPreviousAffiliation(entityId, prev, observedByEntity, collapsedLegacyEntityIds, guardedTeamCodes) {
  if (!prev || String(prev.team_code || "") === "fa") return false;
  if (observedByEntity.has(entityId)) return false;
  if (collapsedLegacyEntityIds.has(String(entityId))) return false;
  if (guardedTeamCodes.has(String(prev.team_code))) return false;
  return true;
}

function restoreMissingFaBaselinePlayers(faDoc, baselinePlayers, observedByEntity, beforeByEntity, guardedTeamCodes) {
  const restored = [];
  const currentFaIds = new Set(
    (Array.isArray(faDoc && faDoc.json && faDoc.json.roster) ? faDoc.json.roster : []).map((row) =>
      String(row && row.entity_id ? row.entity_id : "")
    )
  );

  for (const baselinePlayer of Array.isArray(baselinePlayers) ? baselinePlayers : []) {
    const entityId = String(baselinePlayer && baselinePlayer.entity_id ? baselinePlayer.entity_id : "").trim();
    if (!entityId || currentFaIds.has(entityId)) continue;
    const observed = observedByEntity.get(entityId);
    if (observed) continue;
    const prev = beforeByEntity.get(entityId);
    if (prev && prev.team_code && prev.team_code !== "fa" && !guardedTeamCodes.has(String(prev.team_code))) {
      continue;
    }

    upsertRosterEntry(
      faDoc.json,
      {
        entity_id: entityId,
        wr_id: Number(baselinePlayer && baselinePlayer.wr_id ? baselinePlayer.wr_id : 0),
        gender: String(baselinePlayer && baselinePlayer.gender ? baselinePlayer.gender : ""),
        name: String(
          baselinePlayer && (baselinePlayer.name || baselinePlayer.display_name)
            ? baselinePlayer.name || baselinePlayer.display_name
            : ""
        ),
        tier: String(baselinePlayer && baselinePlayer.tier ? baselinePlayer.tier : "미정"),
        race: String(baselinePlayer && baselinePlayer.race ? baselinePlayer.race : "Unknown"),
        profile_url: String(baselinePlayer && baselinePlayer.profile_url ? baselinePlayer.profile_url : ""),
      },
      "roster_sync_fa_baseline",
      prev && prev.player ? prev.player : baselinePlayer
    );
    currentFaIds.add(entityId);
    restored.push({
      entity_id: entityId,
      name: String(
        baselinePlayer && (baselinePlayer.display_name || baselinePlayer.name)
          ? baselinePlayer.display_name || baselinePlayer.name
          : ""
      ),
    });
  }

  return restored;
}

function effectiveTier(observedTier, baseTier) {
  const o = String(observedTier || "").trim();
  if (o && o !== "미정") return o;
  return String(baseTier || "미정");
}

function effectiveRace(observedRace, baseRace) {
  const o = String(observedRace || "").trim();
  if (o && o !== "Unknown") return o;
  return String(baseRace || "Unknown");
}

function normalizePlayerNameForIdentity(value) {
  return String(value || "").trim();
}

function buildIdentitySignature(teamCode, player) {
  const safeTeamCode = String(teamCode || "").trim();
  const safeGender = String(player && player.gender ? player.gender : "").trim();
  const safeWrId = Number(player && player.wr_id ? player.wr_id : 0);
  const safeName = normalizePlayerNameForIdentity(
    player && (player.name || player.display_name) ? player.name || player.display_name : ""
  );
  if (!safeTeamCode || !safeGender || !Number.isFinite(safeWrId) || safeWrId <= 0 || !safeName) {
    return "";
  }
  return `${safeTeamCode}::${safeGender}::${safeWrId}::${safeName}`;
}

function findBaselineIdentityMigrationCandidate(beforeByEntity, observed, claimedEntityIds = new Set()) {
  if (!beforeByEntity || !observed) return null;
  const observedTeamCode = String(observed.team_code || "").trim();
  const observedGender = String(observed.gender || "").trim();
  const observedWrId = Number(observed.wr_id || 0);
  const observedName = normalizePlayerNameForIdentity(observed.name);
  if (!observedTeamCode || !observedGender || !Number.isFinite(observedWrId) || observedWrId <= 0 || !observedName) {
    return null;
  }

  const matches = [];
  for (const [entityId, prev] of beforeByEntity.entries()) {
    if (claimedEntityIds.has(String(entityId))) continue;
    const prevPlayer = prev && prev.player ? prev.player : null;
    if (!prevPlayer) continue;
    if (String(prev && prev.team_code ? prev.team_code : "").trim() !== observedTeamCode) continue;
    if (String(prevPlayer.gender || "").trim() !== observedGender) continue;
    if (Number(prevPlayer.wr_id || 0) !== observedWrId) continue;
    const prevName = normalizePlayerNameForIdentity(prevPlayer.name || prevPlayer.display_name);
    const prevDisplayName = normalizePlayerNameForIdentity(prevPlayer.display_name || prevPlayer.name);
    if (prevName !== observedName && prevDisplayName !== observedName) continue;
    matches.push({ entity_id: String(entityId), prev });
  }

  return matches.length === 1 ? matches[0] : null;
}

function reconcileObservedIdentityMigrations(observedByEntity, beforeByEntity) {
  const reconciled = new Map();
  const migrations = [];
  const claimedEntityIds = new Set();

  for (const [entityId, observed] of observedByEntity.entries()) {
    if (beforeByEntity.has(entityId) || reconciled.has(entityId)) {
      reconciled.set(entityId, observed);
      claimedEntityIds.add(String(entityId));
      continue;
    }

    const candidate = findBaselineIdentityMigrationCandidate(beforeByEntity, observed, claimedEntityIds);
    if (!candidate) {
      reconciled.set(entityId, observed);
      claimedEntityIds.add(String(entityId));
      continue;
    }

    const nextEntityId = String(candidate.entity_id);
    reconciled.set(nextEntityId, { ...observed, entity_id: nextEntityId });
    claimedEntityIds.add(nextEntityId);
    migrations.push({
      name: String(observed && observed.name ? observed.name : ""),
      team_code: String(observed && observed.team_code ? observed.team_code : ""),
      previous_entity_id: nextEntityId,
      observed_entity_id: String(entityId),
    });
  }

  return { observedByEntity: reconciled, migrations };
}

function canCollapseManualLegacyDuplicate(canonicalObserved, legacyObserved) {
  if (!canonicalObserved || !legacyObserved) return false;
  const canonicalTeam = String(canonicalObserved.team_code || "").trim();
  const legacyTeam = String(legacyObserved.team_code || "").trim();
  if (!canonicalTeam || canonicalTeam !== legacyTeam) return false;

  const canonicalGender = String(canonicalObserved.gender || "").trim();
  const legacyGender = String(legacyObserved.gender || "").trim();
  if (!canonicalGender || canonicalGender !== legacyGender) return false;

  const canonicalWrId = Number(canonicalObserved.wr_id || 0);
  const legacyWrId = Number(legacyObserved.wr_id || 0);
  if (!Number.isFinite(canonicalWrId) || canonicalWrId <= 0 || canonicalWrId !== legacyWrId) return false;

  return true;
}

function collapseObservedLegacyDuplicates(observedByEntity, legacyEntityIdsBySuccessor) {
  const collapsed = new Map(observedByEntity);
  const deduped = [];

  for (const [canonicalEntityId, legacyEntityIds] of legacyEntityIdsBySuccessor.entries()) {
    const canonicalObserved = collapsed.get(canonicalEntityId);
    if (!canonicalObserved) continue;
    for (const legacyEntityId of legacyEntityIds) {
      if (!collapsed.has(legacyEntityId)) continue;
      const legacyObserved = collapsed.get(legacyEntityId);
      if (!canCollapseManualLegacyDuplicate(canonicalObserved, legacyObserved)) continue;
      collapsed.delete(legacyEntityId);
      deduped.push({
        canonical_entity_id: String(canonicalEntityId),
        legacy_entity_id: String(legacyEntityId),
        name: String(canonicalObserved.name || canonicalObserved.display_name || ""),
        team_code: String(canonicalObserved.team_code || ""),
      });
    }
  }

  return { observedByEntity: collapsed, deduped };
}

function collapseStalePreviousDuplicateEntities(beforeByEntity, observedByEntity) {
  const previousBySignature = new Map();
  for (const [entityId, prev] of beforeByEntity.entries()) {
    const player = prev && prev.player ? prev.player : null;
    const signature = buildIdentitySignature(prev && prev.team_code ? prev.team_code : "", player);
    if (!signature) continue;
    if (!previousBySignature.has(signature)) previousBySignature.set(signature, []);
    previousBySignature.get(signature).push({
      entity_id: String(entityId),
      team_code: String(prev && prev.team_code ? prev.team_code : ""),
      name: String(
        player && (player.name || player.display_name) ? player.name || player.display_name : ""
      ),
    });
  }

  const observedBySignature = new Map();
  for (const [entityId, observed] of observedByEntity.entries()) {
    const signature = buildIdentitySignature(observed && observed.team_code ? observed.team_code : "", observed);
    if (!signature) continue;
    if (!observedBySignature.has(signature)) observedBySignature.set(signature, []);
    observedBySignature.get(signature).push(String(entityId));
  }

  const deduped = [];
  for (const [signature, previousRows] of previousBySignature.entries()) {
    if (previousRows.length < 2) continue;
    const observedIds = observedBySignature.get(signature) || [];
    if (observedIds.length !== 1) continue;
    const canonicalEntityId = observedIds[0];
    if (!previousRows.some((row) => row.entity_id === canonicalEntityId)) continue;
    for (const row of previousRows) {
      if (row.entity_id === canonicalEntityId) continue;
      deduped.push({
        canonical_entity_id: canonicalEntityId,
        legacy_entity_id: row.entity_id,
        name: row.name,
        team_code: row.team_code,
      });
    }
  }

  return deduped;
}

function removeEntityFromAllDocs(docs, entityId, keepTeamCode, skipTeamCodes = new Set()) {
  for (const d of docs) {
    if (String(d.team.code) === String(keepTeamCode)) continue;
    if (skipTeamCodes.has(String(d.team.code))) continue;
    removeRosterEntry(d.json, entityId);
  }
}

function sortRoster(teamJson) {
  const roster = Array.isArray(teamJson.roster) ? teamJson.roster : [];
  roster.sort((a, b) => {
    const ap = Number.isFinite(Number(a.role_priority)) ? Number(a.role_priority) : 9999;
    const bp = Number.isFinite(Number(b.role_priority)) ? Number(b.role_priority) : 9999;
    if (ap !== bp) return ap - bp;
    const at = tierRank(a.tier);
    const bt = tierRank(b.tier);
    if (at !== bt) return at - bt;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });
  teamJson.roster = roster;
}

function shouldGuardObservedRoster(existingCount, observedCount) {
  const safeExisting = Number(existingCount || 0);
  const safeObserved = Number(observedCount || 0);
  const suspiciousDrop =
    safeExisting >= 10 && safeObserved > 0 && safeObserved < Math.ceil(safeExisting * 0.5);
  const emptyUnexpected = safeExisting > 0 && safeObserved === 0;
  return {
    guarded: suspiciousDrop || emptyUnexpected,
    reason: suspiciousDrop ? "suspicious_drop" : emptyUnexpected ? "empty_observed" : "",
  };
}

async function main() {
  let autoDiscovery = {
    created_projects_count: 0,
    created_projects: [],
  };
  try {
    autoDiscovery = await ensureAutoDiscoveredTeamProjects({
      projectsDir: PROJECTS_DIR,
      reportDir: REPORT_DIR,
    });
  } catch (error) {
    console.error(`[WARN] team auto discovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const teamsArg = argValue("--teams", "");
  const faUnivArg = argValue("--fa-univ", "");
  const allowPartial = hasFlag("--allow-partial");
  const teamConfig = loadTeamConfig();
  const enabledCodes = teamsArg
    ? teamsArg.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : teamConfig.map((t) => t.code);
  const teams = teamConfig.filter((t) => enabledCodes.includes(t.code));
  if (!teams.length) throw new Error("No teams selected.");
  if (teamsArg && !allowPartial) {
    throw new Error(
      "Partial team sync is blocked by default for safety. Run without --teams, or add --allow-partial explicitly."
    );
  }

  const teamDocs = new Map();
  for (const t of teams) {
    const p = projectPath(t.code);
    if (!fs.existsSync(p)) throw new Error(`Missing metadata file: ${p}`);
    teamDocs.set(t.code, { path: p, json: readJson(p), team: t });
  }
  const faDoc = ensureFaProject();
  const observedByEntity = new Map();
  const observedConflicts = [];
  const guardedTeamCodes = new Set();
  const guardedTeams = [];

  for (const t of teams) {
    const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(t.univ)}`;
    const existingCount = Array.isArray(teamDocs.get(t.code)?.json?.roster)
      ? teamDocs.get(t.code).json.roster.length
      : 0;
    let rows = [];
    try {
      const html = await fetchHtml(url);
      rows = parseRoster(html);
    } catch (err) {
      guardedTeamCodes.add(String(t.code));
      guardedTeams.push({
        team_code: t.code,
        team_name: t.univ,
        existing_count: existingCount,
        observed_count: 0,
        reason: "fetch_error",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    // Safety guard: if source result collapses unexpectedly, do not mutate this team.
    const suspiciousDrop =
      existingCount >= 10 && rows.length > 0 && rows.length < Math.ceil(existingCount * 0.5);
    const emptyUnexpected = existingCount > 0 && rows.length === 0;
    if (suspiciousDrop || emptyUnexpected) {
      guardedTeamCodes.add(String(t.code));
      guardedTeams.push({
        team_code: t.code,
        team_name: t.univ,
        existing_count: existingCount,
        observed_count: rows.length,
        reason: suspiciousDrop ? "suspicious_drop" : "empty_observed",
      });
      continue;
    }
    for (const r of rows) {
      const prevObserved = observedByEntity.get(r.entity_id);
      if (prevObserved && String(prevObserved.team_code) !== String(t.code)) {
        observedConflicts.push({
          entity_id: r.entity_id,
          name_prev: prevObserved.name,
          team_prev: prevObserved.team_code,
          name_next: r.name,
          team_next: t.code,
        });
      }
      observedByEntity.set(r.entity_id, { ...r, team_code: t.code });
    }
  }

  // FA roster is authoritative for FA assignments when available.
  const faUnivCandidates = faUnivArg
    ? [faUnivArg]
    : [String(faDoc.json.fetch_univ_name || "").trim(), ...FA_UNIV_FALLBACKS].filter(Boolean);
  let faSourceUniv = null;
  let faObservedCount = 0;
  let faFetchError = null;
  const existingFaCount = Array.isArray(faDoc.json.roster) ? faDoc.json.roster.length : 0;
  const faBaselinePlayers = readManualRefreshBaselinePlayers("fa");
  const faObservedEntityIds = new Set();
  for (const faUniv of faUnivCandidates) {
    try {
      const faUrl = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(faUniv)}`;
      const faHtml = await fetchHtml(faUrl);
      const faRows = parseRoster(faHtml);
      const faGuard = shouldGuardObservedRoster(existingFaCount, faRows.length);
      if (faGuard.guarded) {
        faFetchError = `guarded:${faGuard.reason}:existing=${existingFaCount}:observed=${faRows.length}`;
        continue;
      }
      if (!faRows.length) continue;
      for (const r of faRows) {
        const prevObserved = observedByEntity.get(r.entity_id);
        if (prevObserved && String(prevObserved.team_code) !== "fa") {
          observedConflicts.push({
            entity_id: r.entity_id,
            name_prev: prevObserved.name,
            team_prev: prevObserved.team_code,
            name_next: r.name,
            team_next: "fa",
          });
        }
        observedByEntity.set(r.entity_id, { ...r, team_code: "fa" });
        faObservedEntityIds.add(String(r.entity_id));
      }
      faSourceUniv = faUniv;
      faObservedCount = faRows.length;
      break;
    } catch (err) {
      faFetchError = err instanceof Error ? err.message : String(err);
    }
  }

  const allDocs = [...teamDocs.values(), { path: faDoc.path, json: faDoc.json, team: { code: "fa", univ: "무소속" } }];
  const beforeByEntity = new Map();
  for (const d of allDocs) {
    for (const p of d.json.roster || []) {
      const key = buildEloboardCompositeKey(p);
      if (!key) continue;
      beforeByEntity.set(key, { player: p, team_code: d.team.code });
    }
  }

  const manualOverrides = readManualOverrides();
  const retiredEntityIds = buildRetiredEntityIds(manualOverrides);
  const legacyEntityIdsBySuccessor = buildLegacyEntityIdsBySuccessor(manualOverrides);
  const appliedManualOverrides = [];
  for (const retiredEntityId of retiredEntityIds) {
    for (const d of allDocs) {
      removeRosterEntry(d.json, retiredEntityId);
    }
    observedByEntity.delete(retiredEntityId);
  }
  for (const ov of manualOverrides) {
    if (!ov) continue;
    if (ov.retired === true) continue;
    const entityId = resolveOverrideEntityId(ov, observedByEntity, beforeByEntity);
    if (!entityId) continue;
    const prev = beforeByEntity.get(entityId);
    const current = observedByEntity.get(entityId);
    const base = current || (prev ? { ...prev.player, team_code: prev.team_code } : null);
    if (!base) continue;

    const next = { ...base };
    if (ov.team_code) next.team_code = String(ov.team_code).toLowerCase();
    if (ov.tier) next.tier = String(ov.tier);
    if (ov.race) next.race = String(ov.race);
    if (ov.name) next.name = String(ov.name);
    observedByEntity.set(entityId, next);
    appliedManualOverrides.push({
      entity_id: entityId,
      team_code: next.team_code,
      tier: next.tier || "",
    });
  }

  const identityReconciliation = reconcileObservedIdentityMigrations(observedByEntity, beforeByEntity);
  observedByEntity.clear();
  for (const [entityId, observed] of identityReconciliation.observedByEntity.entries()) {
    observedByEntity.set(entityId, observed);
  }
  const manualLegacyCollapse = collapseObservedLegacyDuplicates(observedByEntity, legacyEntityIdsBySuccessor);
  observedByEntity.clear();
  for (const [entityId, observed] of manualLegacyCollapse.observedByEntity.entries()) {
    observedByEntity.set(entityId, observed);
  }
  const stalePreviousDuplicateCollapse = collapseStalePreviousDuplicateEntities(beforeByEntity, observedByEntity);

  const moved = [];
  const added = [];
  const tierChanged = [];
  const raceChanged = [];
  const dedupRemovals = [];
  const faFallbackEntityIds = new Set();
  const collapsedLegacyRows = [...manualLegacyCollapse.deduped, ...stalePreviousDuplicateCollapse];
  const collapsedLegacyEntityIds = new Set(
    collapsedLegacyRows.map((row) => String(row.legacy_entity_id || "")).filter(Boolean)
  );

  for (const collapsedRow of collapsedLegacyRows) {
    for (const d of allDocs) {
      removeRosterEntry(d.json, collapsedRow.legacy_entity_id);
    }
    dedupRemovals.push({
      entity_id: collapsedRow.canonical_entity_id,
      name: collapsedRow.name,
      kept_team: collapsedRow.team_code,
      removed_from_teams: [collapsedRow.team_code],
    });
  }

  for (const [entityId, observed] of observedByEntity.entries()) {
    const prev = beforeByEntity.get(entityId);
    const legacyEntityId =
      !prev && legacyEntityIdsBySuccessor.has(entityId)
        ? legacyEntityIdsBySuccessor.get(entityId).find((legacyId) => beforeByEntity.has(String(legacyId))) || null
        : null;
    const prevEntityId = legacyEntityId || entityId;
    const prevInfo = prev || (legacyEntityId ? beforeByEntity.get(String(legacyEntityId)) : null);
    const targetDoc = observed.team_code === "fa" ? faDoc : teamDocs.get(observed.team_code);
    if (!targetDoc) continue;

    if (prevInfo && prevInfo.team_code !== observed.team_code) {
      const prevDoc = prevInfo.team_code === "fa" ? faDoc : teamDocs.get(prevInfo.team_code);
      if (prevDoc) removeRosterEntry(prevDoc.json, prevEntityId);
      moved.push({
        entity_id: entityId,
        name: observed.name,
        from: prevInfo.team_code,
        to: observed.team_code,
        change_confidence: "confirmed",
      });
    } else if (!prevInfo) {
      added.push({
        entity_id: entityId,
        name: observed.name,
        to: observed.team_code,
        change_confidence: "confirmed",
      });
    }

    const oldTier = prevInfo && prevInfo.player ? String(prevInfo.player.tier || "") : "";
    const oldRace = prevInfo && prevInfo.player ? String(prevInfo.player.race || "") : "";
    const newTier = effectiveTier(observed.tier, prevInfo && prevInfo.player ? prevInfo.player.tier : "");
    const newRace = effectiveRace(observed.race, prevInfo && prevInfo.player ? prevInfo.player.race : "");
    if (oldTier && oldTier !== newTier) {
      tierChanged.push({ entity_id: entityId, name: observed.name, from: oldTier, to: newTier });
    }
    if (oldRace && oldRace !== newRace) {
      raceChanged.push({ entity_id: entityId, name: observed.name, from: oldRace, to: newRace });
    }

    const beforeCounts = allDocs.map((d) => ({
      team_code: d.team.code,
      count: Array.isArray(d.json.roster)
        ? d.json.roster.filter((p) => {
            const candidateId = String(p.entity_id || "");
            return candidateId === String(entityId) || candidateId === String(prevEntityId);
          }).length
        : 0,
    }));
    removeEntityFromAllDocs(allDocs, entityId, observed.team_code, guardedTeamCodes);
    if (legacyEntityId && legacyEntityId !== entityId) {
      for (const d of allDocs) {
        removeRosterEntry(d.json, legacyEntityId);
      }
    }
    const removedFrom = beforeCounts
      .filter((x) => x.team_code !== observed.team_code && x.count > 0)
      .map((x) => x.team_code);
    if (removedFrom.length > 0) {
      dedupRemovals.push({
        entity_id: entityId,
        name: observed.name,
        kept_team: observed.team_code,
        removed_from_teams: removedFrom,
      });
    }

    upsertRosterEntry(targetDoc.json, observed, "roster_sync", prevInfo && prevInfo.player ? prevInfo.player : null);
  }

  const faFallbackAllowed = Boolean(faSourceUniv);
  if (faFallbackAllowed) {
    for (const [entityId, prev] of beforeByEntity.entries()) {
      if (
        shouldRetainPreviousAffiliation(
          entityId,
          prev,
          observedByEntity,
          collapsedLegacyEntityIds,
          guardedTeamCodes
        )
      ) {
        // Missing from the current scrape is not enough evidence to convert a rostered player into FA.
        // Keep the prior team assignment until a later run directly observes the affiliation change.
        continue;
      }
      if (prev.team_code === "fa") continue;
      if (observedByEntity.has(entityId)) continue;
      if (collapsedLegacyEntityIds.has(String(entityId))) continue;
      if (guardedTeamCodes.has(String(prev.team_code))) continue;
      const prevDoc = teamDocs.get(prev.team_code);
      if (!prevDoc) continue;
      removeRosterEntry(prevDoc.json, entityId);
      upsertRosterEntry(faDoc.json, {
        entity_id: entityId,
        wr_id: Number(prev.player.wr_id),
        gender: String(prev.player.gender || ""),
        name: String(prev.player.name || ""),
        tier: String(prev.player.tier || "미정"),
        race: String(prev.player.race || "Unknown"),
        profile_url: String(prev.player.profile_url || ""),
      }, "roster_sync_fa");
      moved.push({
        entity_id: entityId,
        name: prev.player.name,
        from: prev.team_code,
        to: "fa",
        change_confidence: "fallback",
      });
      faFallbackEntityIds.add(String(entityId));
    }
  }

  // If FA source page is available, keep FA roster strictly aligned to observed FA entities.
  if (faSourceUniv) {
    const roster = Array.isArray(faDoc.json.roster) ? faDoc.json.roster : [];
    const retainedFaEntityIds = buildRetainedFaEntityIds(
      faObservedEntityIds,
      observedByEntity,
      [...faFallbackEntityIds]
    );
    faDoc.json.roster = roster.filter((p) => retainedFaEntityIds.has(String(p.entity_id)));
  } else {
    restoreMissingFaBaselinePlayers(faDoc, faBaselinePlayers, observedByEntity, beforeByEntity, guardedTeamCodes);
  }

  const changedTeams = [];
  for (const d of allDocs) {
    sortRoster(d.json);
    d.json.generated_at = new Date().toISOString();
    d.json.roster_count = Array.isArray(d.json.roster) ? d.json.roster.length : 0;
    writeJson(d.path, d.json);
    changedTeams.push({ team_code: d.team.code, roster_count: d.json.roster_count, file: path.relative(ROOT, d.path).replace(/\\/g, "/") });
  }

  const report = {
    generated_at: new Date().toISOString(),
    auto_discovery: autoDiscovery,
    teams: teams.map((t) => t.code),
    fa_source_univ: faSourceUniv,
    fa_observed_count: faObservedCount,
    fa_fetch_error: faFetchError,
    fa_fallback_allowed: faFallbackAllowed,
    manual_overrides_applied_count: appliedManualOverrides.length,
    manual_overrides_applied: appliedManualOverrides,
    guarded_teams_count: guardedTeams.length,
    guarded_teams: guardedTeams,
    observed_conflicts_count: observedConflicts.length,
    observed_conflicts: observedConflicts,
    identity_migrations_count: identityReconciliation.migrations.length + manualLegacyCollapse.deduped.length,
    identity_migrations: [
      ...identityReconciliation.migrations,
      ...manualLegacyCollapse.deduped.map((row) => ({
        name: row.name,
        team_code: row.team_code,
        previous_entity_id: row.canonical_entity_id,
        observed_entity_id: row.legacy_entity_id,
        reason: "manual_legacy_collapse",
      })),
    ],
    dedup_removals_count: dedupRemovals.length,
    dedup_removals: dedupRemovals,
    changed_teams: changedTeams,
    moved_count: moved.length,
    added_count: added.length,
    tier_changed_count: tierChanged.length,
    race_changed_count: raceChanged.length,
    moved,
    added,
    tier_changed: tierChanged,
    race_changed: raceChanged,
  };
  const reportPath = path.join(REPORT_DIR, "team_roster_sync_report.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, report_path: path.relative(ROOT, reportPath).replace(/\\/g, "/"), ...report }, null, 2));
}

module.exports = {
  buildLegacyEntityIdsBySuccessor,
  buildRetainedFaEntityIds,
  collapseObservedLegacyDuplicates,
  collapseStalePreviousDuplicateEntities,
  effectiveRace,
  effectiveTier,
  fallbackValue,
  findBaselineIdentityMigrationCandidate,
  reconcileObservedIdentityMigrations,
  restoreMissingFaBaselinePlayers,
  readManualRefreshBaselinePlayers,
  shouldRetainPreviousAffiliation,
  shouldGuardObservedRoster,
  tierKey,
  upsertRosterEntry,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
