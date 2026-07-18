// 승인됐지만 로스터 베이스라인에 없는 선수를 실제 등록하는 스크립트.
//
// 배경: /admin/roster/ops-review 의 승인 버튼은 Supabase roster_admin_corrections 에
// 기록만 남기고 선수를 생성하지 않는다. 일일 파이프라인은 --report-only 라 베이스라인을
// 쓰지 않으므로, 승인된 신규후보는 "페이지에서 사라짐 + 사이트엔 없음" 상태로 남는다.
// 이 스크립트가 그 간극을 메운다: 승인 기록 중 어느 팀 베이스라인에도 없는 선수를 찾아
// eloboard 관측 데이터(티어/종족/프로필)로 projects 파일에 등록한다.
// Supabase players 반영은 커밋 후 파이프라인 sync가 처리한다(직접 insert 안 함 —
// prod-sync 의 stale-delete 가 베이스라인 기준이므로 베이스라인이 유일한 진입점).
//
// Run: node -r dotenv/config scripts/tools/materialize-approved-candidates.js dotenv_config_path=.env.local [--apply]
//   기본은 드라이런(계획만 출력). --apply 를 줘야 파일을 쓴다.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { fetchHtml, parseRoster, upsertRosterEntry } = require("./sync-team-roster-metadata");
const { defaultProfileUrlForPlayer, getEloboardProfileKind, normalizeProfileUrl } = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const APPLY = process.argv.includes("--apply");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
}

function loadProjects() {
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const filePath = path.join(PROJECTS_DIR, e.name, `players.${e.name}.v1.json`);
      return fs.existsSync(filePath) ? { code: e.name, filePath, json: readJson(filePath) } : null;
    })
    .filter(Boolean);
}

// eloboard:female:538 / eloboard:male:mix:810 → { gender, wr_id }
function parseEntityId(entityId) {
  const m = String(entityId).match(/^eloboard:(male|female)(?::mix)?:(\d+)$/);
  return m ? { gender: m[1], wr_id: Number(m[2]) } : null;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );

  const { data: corrections, error } = await supabase
    .from("roster_admin_corrections")
    .select("entity_id, name, team_code, team_name, tier, race, soop_user_id, excluded, updated_at");
  if (error) throw new Error(`corrections read failed: ${error.message}`);

  const projects = loadProjects();
  const registeredEntityIds = new Set(
    projects.flatMap((p) => (p.json.roster || []).map((r) => String(r.entity_id || "")))
  );
  // 동명이 다른 entity 로 이미 등록돼 있으면 자동 등록하지 않는다 —
  // eloboard 재등록(동일인 신규 id)일 가능성이 높아 identity migration 판단이 먼저 필요함
  const registeredNames = new Map(
    projects.flatMap((p) =>
      (p.json.roster || []).map((r) => [String(r.name || "").trim(), { team: p.code, entity_id: String(r.entity_id || "") }])
    )
  );
  const projectByCode = new Map(projects.map((p) => [p.code, p]));

  const targets = corrections.filter((c) => {
    const entityId = String(c.entity_id || "").trim();
    const teamCode = String(c.team_code || "").trim().toLowerCase();
    if (!entityId || !teamCode || c.excluded === true) return false;
    if (registeredEntityIds.has(entityId)) return false;
    return projectByCode.has(teamCode);
  });

  const skippedNoTeam = corrections.filter(
    (c) =>
      String(c.entity_id || "").trim() &&
      c.excluded !== true &&
      !registeredEntityIds.has(String(c.entity_id).trim()) &&
      String(c.team_code || "").trim() &&
      !projectByCode.has(String(c.team_code).trim().toLowerCase())
  );

  const plan = [];
  const observedCache = new Map();

  for (const c of targets) {
    const entityId = String(c.entity_id).trim();
    const teamCode = String(c.team_code).trim().toLowerCase();
    const project = projectByCode.get(teamCode);
    const univName = String(project.json.fetch_univ_name || project.json.team_name || teamCode);

    if (!observedCache.has(teamCode)) {
      try {
        const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(univName)}`;
        observedCache.set(teamCode, parseRoster(await fetchHtml(url)));
      } catch {
        observedCache.set(teamCode, []);
      }
    }
    const observed = observedCache.get(teamCode).find((r) => r.entity_id === entityId) || null;
    const parsed = parseEntityId(entityId);
    if (!observed && !parsed) {
      plan.push({ entity_id: entityId, name: c.name, team: teamCode, action: "skip_unparsable_entity" });
      continue;
    }

    const nameConflict = registeredNames.get(String((observed ? observed.name : c.name) || "").trim());
    if (nameConflict && nameConflict.entity_id !== entityId) {
      plan.push({
        entity_id: entityId,
        name: c.name,
        team: teamCode,
        action: "skip_name_conflict",
        existing: nameConflict,
      });
      continue;
    }

    const profileUrl = observed
      ? observed.profile_url
      : normalizeProfileUrl(defaultProfileUrlForPlayer({ wr_id: parsed.wr_id, gender: parsed.gender, name: c.name }));
    const entry = observed || {
      entity_id: entityId,
      wr_id: parsed.wr_id,
      gender: parsed.gender,
      name: String(c.name || "").trim(),
      tier: String(c.tier || "").trim() || "미정",
      race: String(c.race || "").trim() || "Unknown",
      profile_url: profileUrl,
      profile_kind: getEloboardProfileKind(profileUrl),
    };

    plan.push({
      entity_id: entityId,
      name: entry.name,
      team: teamCode,
      tier: entry.tier,
      race: entry.race,
      observed_on_team_page: Boolean(observed),
      approved_at: c.updated_at,
      action: "register",
    });

    if (APPLY) {
      upsertRosterEntry(project.json, entry, "manual_override");
      const row = project.json.roster.find((r) => String(r.entity_id) === entityId);
      if (row && String(c.soop_user_id || "").trim()) row.soop_user_id = String(c.soop_user_id).trim();
      project.dirty = true;
    }
  }

  if (APPLY) {
    for (const project of projects) {
      if (!project.dirty) continue;
      project.json.roster_count = project.json.roster.length;
      project.json.generated_at = new Date().toISOString();
      fs.writeFileSync(project.filePath, JSON.stringify(project.json, null, 2), "utf8");
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry_run",
        corrections_total: corrections.length,
        register_count: plan.filter((p) => p.action === "register").length,
        plan,
        skipped_team_not_in_projects: skippedNoTeam.map((c) => ({
          entity_id: c.entity_id,
          name: c.name,
          team_code: c.team_code,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
