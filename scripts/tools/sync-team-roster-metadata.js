const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORT_DIR = path.join(ROOT, "tmp", "reports");
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
    const profileUrl = historyHref.startsWith("http") ? historyHref : `https://eloboard.com${historyHref}`;
    const wr = profileUrl.match(/wr_id=(\d+)/);
    const wrId = wr ? Number(wr[1]) : null;
    if (!wrId) return;
    const gender = profileUrl.includes("/men/") ? "male" : "female";
    rows.push({
      wr_id: wrId,
      gender,
      name,
      tier,
      race,
      profile_url: profileUrl.replace(/^http:\/\//i, "https://"),
      entity_id: `eloboard:${gender}:${wrId}`,
    });
  });

  const byEntity = new Map();
  for (const r of rows) {
    if (!byEntity.has(r.entity_id)) byEntity.set(r.entity_id, r);
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
  const tags = new Set(Array.isArray(player.meta_tags) ? player.meta_tags : []);
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

function upsertRosterEntry(teamJson, observed, source) {
  const roster = Array.isArray(teamJson.roster) ? teamJson.roster : [];
  const idx = roster.findIndex((p) => String(p.entity_id) === observed.entity_id);
  const base = idx >= 0 ? roster[idx] : {};
  const observedTier = String(observed.tier || "").trim();
  const observedRace = String(observed.race || "").trim();
  const nextTier = observedTier && observedTier !== "미정" ? observedTier : String(base.tier || "미정");
  const nextRace =
    observedRace && observedRace !== "Unknown" ? observedRace : String(base.race || "Unknown");
  const next = {
    ...base,
    team_name: String(teamJson.team_name || ""),
    team_code: String(teamJson.team_code || ""),
    entity_id: observed.entity_id,
    wr_id: observed.wr_id,
    gender: observed.gender,
    name: observed.name,
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

function removeEntityFromAllDocs(docs, entityId, keepTeamCode) {
  for (const d of docs) {
    if (String(d.team.code) === String(keepTeamCode)) continue;
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

async function main() {
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

  for (const t of teams) {
    const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(t.univ)}`;
    const html = await fetchHtml(url);
    const rows = parseRoster(html);
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
  const faObservedEntityIds = new Set();
  for (const faUniv of faUnivCandidates) {
    try {
      const faUrl = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(faUniv)}`;
      const faHtml = await fetchHtml(faUrl);
      const faRows = parseRoster(faHtml);
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
      beforeByEntity.set(String(p.entity_id), { player: p, team_code: d.team.code });
    }
  }

  const manualOverrides = readManualOverrides();
  const appliedManualOverrides = [];
  for (const ov of manualOverrides) {
    if (!ov || !ov.entity_id) continue;
    const entityId = String(ov.entity_id);
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

  const moved = [];
  const added = [];
  const tierChanged = [];
  const raceChanged = [];
  const dedupRemovals = [];

  for (const [entityId, observed] of observedByEntity.entries()) {
    const prev = beforeByEntity.get(entityId);
    const targetDoc = observed.team_code === "fa" ? faDoc : teamDocs.get(observed.team_code);
    if (!targetDoc) continue;

    if (prev && prev.team_code !== observed.team_code) {
      const prevDoc = prev.team_code === "fa" ? faDoc : teamDocs.get(prev.team_code);
      if (prevDoc) removeRosterEntry(prevDoc.json, entityId);
      moved.push({ entity_id: entityId, name: observed.name, from: prev.team_code, to: observed.team_code });
    } else if (!prev) {
      added.push({ entity_id: entityId, name: observed.name, to: observed.team_code });
    }

    const oldTier = prev && prev.player ? String(prev.player.tier || "") : "";
    const oldRace = prev && prev.player ? String(prev.player.race || "") : "";
    const newTier = effectiveTier(observed.tier, prev && prev.player ? prev.player.tier : "");
    const newRace = effectiveRace(observed.race, prev && prev.player ? prev.player.race : "");
    if (oldTier && oldTier !== newTier) {
      tierChanged.push({ entity_id: entityId, name: observed.name, from: oldTier, to: newTier });
    }
    if (oldRace && oldRace !== newRace) {
      raceChanged.push({ entity_id: entityId, name: observed.name, from: oldRace, to: newRace });
    }

    const beforeCounts = allDocs.map((d) => ({
      team_code: d.team.code,
      count: Array.isArray(d.json.roster)
        ? d.json.roster.filter((p) => String(p.entity_id) === String(entityId)).length
        : 0,
    }));
    removeEntityFromAllDocs(allDocs, entityId, observed.team_code);
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

    upsertRosterEntry(targetDoc.json, observed, "roster_sync");
  }

  for (const [entityId, prev] of beforeByEntity.entries()) {
    if (prev.team_code === "fa") continue;
    if (observedByEntity.has(entityId)) continue;
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
    moved.push({ entity_id: entityId, name: prev.player.name, from: prev.team_code, to: "fa" });
  }

  // If FA source page is available, keep FA roster strictly aligned to observed FA entities.
  if (faSourceUniv) {
    const roster = Array.isArray(faDoc.json.roster) ? faDoc.json.roster : [];
    faDoc.json.roster = roster.filter((p) => faObservedEntityIds.has(String(p.entity_id)));
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
    teams: teams.map((t) => t.code),
    fa_source_univ: faSourceUniv,
    fa_observed_count: faObservedCount,
    fa_fetch_error: faFetchError,
    manual_overrides_applied_count: appliedManualOverrides.length,
    manual_overrides_applied: appliedManualOverrides,
    observed_conflicts_count: observedConflicts.length,
    observed_conflicts: observedConflicts,
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
