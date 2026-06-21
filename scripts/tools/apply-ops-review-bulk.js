// One-time script: apply all pending ops-review items
// - All affiliation changes (소속변동감지)
// - New candidates except 류하 (eloboard:female:390) and 지방시 (eloboard:male:mix:810)
// Run: node -r dotenv/config scripts/tools/apply-ops-review-bulk.js dotenv_config_path=.env.local

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const https = require("https");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const REPORT_URL =
  "https://pub-1f64e268ac864a8cbced80871e7e205e.r2.dev/ops-review/roster_change_review_latest.json";

const SKIP_ENTITY_IDS = new Set(["eloboard:female:390", "eloboard:male:mix:810"]); // 류하, 지방시

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Build team code+name map from filesystem
function loadTeamMap() {
  const projectsDir = path.join(process.cwd(), "data", "metadata", "projects");
  const map = new Map(); // code → { code, name }
  const nameMap = new Map(); // name_lower → { code, name }

  if (!fs.existsSync(projectsDir)) return { map, nameMap };

  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const code = entry.name;
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
      const teamCode = doc.team_code || code;
      const teamName = doc.team_name || teamCode;
      map.set(teamCode, { code: teamCode, name: teamName });
      nameMap.set(teamName.toLowerCase(), { code: teamCode, name: teamName });
    } catch {}
  }
  return { map, nameMap };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function resolveTeam(rawTo, teamMap, nameMap) {
  const lower = (rawTo || "").trim().toLowerCase();
  if (teamMap.has(lower)) return teamMap.get(lower);
  if (nameMap.has(lower)) return nameMap.get(lower);
  // try exact match on code
  for (const [code, team] of teamMap) {
    if (code === lower) return team;
  }
  return null;
}

async function upsertCorrection(entityId, name, teamCode, teamName) {
  // fetch existing
  const { data: current } = await db
    .from("roster_admin_corrections")
    .select("*")
    .eq("entity_id", entityId)
    .maybeSingle();

  const row = {
    entity_id: entityId,
    name: name || (current?.name ?? null),
    wr_id: current?.wr_id ?? null,
    team_code: teamCode,
    team_name: teamName,
    tier: current?.tier ?? null,
    race: current?.race ?? null,
    manual_lock: true,
    manual_mode: "temporary",
    excluded: current?.excluded ?? false,
    exclusion_reason: current?.exclusion_reason ?? null,
    resume_requested_at: current?.resume_requested_at ?? null,
    note: current?.note ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("roster_admin_corrections").upsert(row, { onConflict: "entity_id" });
  if (error) throw error;
}

async function main() {
  console.log("Fetching remote report...");
  const json = await fetchJson(REPORT_URL);
  const review = json.review || json;
  const moved = Array.isArray(review.moved) ? review.moved : [];
  const added = Array.isArray(review.added) ? review.added : [];

  const { map: teamMap, nameMap } = loadTeamMap();
  console.log(`Loaded ${teamMap.size} teams from filesystem`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  // ── Affiliation changes ──────────────────────────────────────────────────
  console.log(`\n=== 소속변동감지 (${moved.length}건) ===`);
  for (const item of moved) {
    const entityId = String(item.entity_id || "").trim();
    const name = String(item.name || "").trim();
    const rawTo = String(item.to || "").trim();
    if (!entityId) { skip++; console.log(`  SKIP (no entity_id): ${name}`); continue; }

    const team = resolveTeam(rawTo, teamMap, nameMap);
    if (!team) {
      fail++;
      console.log(`  FAIL (team not found: "${rawTo}"): ${name} [${entityId}]`);
      continue;
    }
    try {
      await upsertCorrection(entityId, name, team.code, team.name);
      ok++;
      console.log(`  OK  ${name} → ${team.code} (${team.name})`);
    } catch (e) {
      fail++;
      console.log(`  ERR ${name}: ${e.message}`);
    }
  }

  // ── New candidates ────────────────────────────────────────────────────────
  console.log(`\n=== 신규후보 (${added.length}건, 류하·지방시 제외) ===`);
  for (const item of added) {
    const entityId = String(item.entity_id || "").trim();
    const name = String(item.name || "").trim();
    const rawTo = String(item.to || "").trim();

    if (SKIP_ENTITY_IDS.has(entityId)) {
      console.log(`  SKIP (제외 대상): ${name} [${entityId}]`);
      skip++;
      continue;
    }
    if (!entityId) { skip++; console.log(`  SKIP (no entity_id): ${name}`); continue; }

    const team = resolveTeam(rawTo, teamMap, nameMap);
    if (!team) {
      fail++;
      console.log(`  FAIL (team not found: "${rawTo}"): ${name} [${entityId}]`);
      continue;
    }
    try {
      await upsertCorrection(entityId, name, team.code, team.name);
      ok++;
      console.log(`  OK  ${name} → ${team.code} (${team.name})`);
    } catch (e) {
      fail++;
      console.log(`  ERR ${name}: ${e.message}`);
    }
  }

  console.log(`\n✓ 완료: ${ok}건 적용, ${skip}건 제외, ${fail}건 실패`);
}

main().catch((e) => { console.error(e); process.exit(1); });
